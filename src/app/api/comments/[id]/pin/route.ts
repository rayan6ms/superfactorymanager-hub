import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCommentById } from "@/lib/comments";

async function getCurrentUser(email: string) {
  return db.user.findUnique({
    where: { email },
    select: { id: true },
  });
}

async function getPinnableComment(id: string) {
  return db.comment.findUnique({
    where: { id },
    select: {
      id: true,
      postId: true,
      authorId: true,
      isDeleted: true,
      pinnedAt: true,
      post: {
        select: {
          authorId: true,
          isDeleted: true,
        },
      },
    },
  });
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user, comment] = await Promise.all([
    getCurrentUser(session.user.email),
    getPinnableComment(id),
  ]);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!comment || comment.isDeleted || comment.post.isDeleted) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  if (comment.post.authorId !== user.id) {
    return NextResponse.json({ error: "Only the post author can pin comments" }, { status: 403 });
  }

  await db.$transaction(async tx => {
    await tx.comment.updateMany({
      where: { postId: comment.postId, pinnedAt: { not: null } },
      data: { pinnedAt: null },
    });
    await tx.comment.update({
      where: { id: comment.id },
      data: { pinnedAt: new Date() },
    });
  });

  const updatedComment = await getCommentById(comment.id, null, user.id);
  return NextResponse.json({ comment: updatedComment });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user, comment] = await Promise.all([
    getCurrentUser(session.user.email),
    getPinnableComment(id),
  ]);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!comment || comment.isDeleted || comment.post.isDeleted) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  if (comment.post.authorId !== user.id) {
    return NextResponse.json({ error: "Only the post author can pin comments" }, { status: 403 });
  }

  await db.comment.update({
    where: { id: comment.id },
    data: { pinnedAt: null },
  });

  const updatedComment = await getCommentById(comment.id, null, user.id);
  return NextResponse.json({ comment: updatedComment });
}
