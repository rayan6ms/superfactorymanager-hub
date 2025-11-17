import { NextResponse } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { MAX_POST_IMAGES } from "@/lib/images";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ postId: string }> }
) {
  const { postId } = await ctx.params;

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const post = await db.post.findUnique({
    where: { id: postId },
    include: { author: true },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.author.email !== session.user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existingCount = await db.postImage.count({ where: { postId } });
  if (existingCount >= MAX_POST_IMAGES) {
    return NextResponse.json(
      { error: `You can upload up to ${MAX_POST_IMAGES} images per post.` },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  const baseDir = path.join(process.cwd(), "public", "uploads", postId);
  await mkdir(baseDir, { recursive: true });

  const originalName = `${id}-orig.jpg`;
  const originalPath = path.join(baseDir, originalName);
  const originalJpg = await sharp(bytes).jpeg({ quality: 90 }).toBuffer();
  await writeFile(originalPath, originalJpg);
  const originalUrl = `/uploads/${postId}/${originalName}`;

  async function make(width: number, suffix: string) {
    const name = `${id}-${suffix}.jpg`;
    const p = path.join(baseDir, name);
    const buf = await sharp(bytes).resize({ width }).jpeg({ quality: 80 }).toBuffer();
    await writeFile(p, buf);
    return `/uploads/${postId}/${name}`;
  }

  const sm = await make(320, "sm");
  const md = await make(640, "md");
  const lg = await make(1024, "lg");

  const rec = await db.postImage.create({
    data: { postId, original: originalUrl, thumbSm: sm, thumbMd: md, thumbLg: lg },
  });

  return NextResponse.json(rec, { status: 201 });
}
