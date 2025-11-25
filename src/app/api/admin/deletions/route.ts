import { NextResponse } from "next/server";
import { makeSlug } from "@/lib/slug";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";

async function resolveUniqueSlug(postId: string, desired: string, fallbackTitle: string) {
  const base = makeSlug(fallbackTitle || desired || `post-${postId.slice(0, 6)}`) || `post-${postId.slice(0, 8)}`;
  let candidate = base || desired || `post-${postId.slice(0, 8)}`;
  let attempt = 1;

  while (true) {
    const existing = await db.post.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === postId) {
      return candidate;
    }
    candidate = `${base}-${attempt++}`;
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, targetId, action } = (body as Record<string, unknown>) ?? {};

  if (type !== "post" && type !== "comment") {
    return NextResponse.json({ error: "Unsupported target type" }, { status: 400 });
  }

  if (action !== "flag" && action !== "restore") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  if (!targetId || typeof targetId !== "string") {
    return NextResponse.json({ error: "Missing target id" }, { status: 400 });
  }

  if (type === "post") {
    const post = await db.post.findFirst({ where: { OR: [{ id: targetId }, { slug: targetId }] } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (action === "flag") {
      await db.post.update({ where: { id: post.id }, data: { isDeleted: true } });
      return NextResponse.json({ success: true, slug: post.slug, action: "flag" });
    }

    const nextSlug = await resolveUniqueSlug(post.id, post.slug, post.title);
    await db.post.update({ where: { id: post.id }, data: { isDeleted: false, slug: nextSlug } });
    return NextResponse.json({ success: true, slug: nextSlug, action: "restore" });
  }

  const comment = await db.comment.findUnique({ where: { id: targetId } });
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  await db.comment.update({ where: { id: targetId }, data: { isDeleted: action === "flag" } });
  return NextResponse.json({ success: true, action });
}
