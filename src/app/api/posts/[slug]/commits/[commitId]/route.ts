import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { indexPost } from "@/lib/search";
import { recordPostContributor, resetPostRatings } from "@/lib/posts";
import { createNotification } from "@/lib/notifications";
import { NotificationOrigin } from "@prisma/client";

const actionSchema = z.object({
  action: z.enum(["merge", "reject", "revert"]),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ slug: string; commitId: string }> },
) {
  const { slug, commitId } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const post = await db.post.findUnique({ where: { slug } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.authorId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const commit = await db.postCommit.findUnique({ where: { id: commitId } });
  if (!commit || commit.postId !== post.id) {
    return NextResponse.json({ error: "Commit not found" }, { status: 404 });
  }

  const now = new Date();

  if (parsed.data.action === "merge") {
    if (commit.status !== "PENDING") {
      return NextResponse.json({ error: "Only pending contributions can be merged." }, { status: 400 });
    }
    if (commit.baseCommitId && post.currentCommitId && commit.baseCommitId !== post.currentCommitId) {
      return NextResponse.json({ error: "This contribution is out of date. Ask the author to resubmit." }, { status: 409 });
    }

    await db.$transaction(async tx => {
      await tx.postCommit.update({ where: { id: commit.id }, data: { status: "MERGED", mergedAt: now } });
      await tx.post.update({ where: { id: post.id }, data: { code: commit.code, currentCommitId: commit.id } });
      await resetPostRatings(tx, post.id);
      await recordPostContributor(tx, post.id, commit.authorId);
    });

    await indexPost(
      await db.post.findUniqueOrThrow({
        where: { id: post.id },
        include: { category: true, dependencies: true, tags: { include: { tag: true } } },
      }),
    );

    if (commit.authorId !== post.authorId) {
      await createNotification({
        userId: commit.authorId,
        origin: NotificationOrigin.POST,
        title: `Your contribution to ${post.title} was merged`,
        message: "Thanks for improving this build!",
        link: `/posts/${slug}`,
      });
    }

    return NextResponse.json({ status: "merged" });
  }

  if (parsed.data.action === "reject") {
    if (commit.status !== "PENDING") {
      return NextResponse.json({ error: "Only pending contributions can be rejected." }, { status: 400 });
    }

    await db.postCommit.update({ where: { id: commit.id }, data: { status: "REJECTED", rejectedAt: now } });

    if (commit.authorId !== post.authorId) {
      await createNotification({
        userId: commit.authorId,
        origin: NotificationOrigin.POST,
        title: `Your contribution to ${post.title} was rejected`,
        message: "Thanks for the effort! Feel free to submit another update.",
        link: `/posts/${slug}/edit`,
      });
    }

    return NextResponse.json({ status: "rejected" });
  }

  // revert
  if (commit.status !== "MERGED") {
    return NextResponse.json({ error: "You can only revert merged commits." }, { status: 400 });
  }
  if (!post.currentCommitId) {
    return NextResponse.json({ error: "This post does not have a current commit." }, { status: 409 });
  }

  await db.$transaction(async tx => {
    const revertTitle = commit.title ? `Revert ${commit.title}` : `Revert to ${commit.id.slice(0, 6)}`;
    const revertCommit = await tx.postCommit.create({
      data: {
        postId: post.id,
        authorId: user.id,
        title: revertTitle,
        message: `Revert to commit ${commit.id.slice(0, 6)}`,
        code: commit.code,
        status: "MERGED",
        mergedAt: now,
        baseCommitId: post.currentCommitId,
      },
    });
    await tx.post.update({ where: { id: post.id }, data: { code: commit.code, currentCommitId: revertCommit.id } });
    await resetPostRatings(tx, post.id);
    await recordPostContributor(tx, post.id, user.id);
  });

  await indexPost(
    await db.post.findUniqueOrThrow({
      where: { id: post.id },
      include: { category: true, dependencies: true, tags: { include: { tag: true } } },
    }),
  );

  return NextResponse.json({ status: "reverted" });
}
