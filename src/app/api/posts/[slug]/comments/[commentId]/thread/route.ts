import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCommentThread } from "@/lib/comments";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string; commentId: string }> },
) {
  const { slug, commentId } = await ctx.params;
  const session = await auth();
  const url = new URL(req.url);
  const sortParam = url.searchParams.get("sort");
  const sort = sortParam === "top" ? "top" : "recent";

  const post = await db.post.findFirst({
    where: { slug, isDeleted: false },
    select: { id: true },
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const comment = await getCommentThread(commentId, {
    postId: post.id,
    viewerId: session?.user?.id ?? null,
    sort,
  });
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  return NextResponse.json({ comment });
}
