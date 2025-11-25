import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";

const categorySchema = z.object({
  key: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(100),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return null;
  }
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const categories = await db.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { posts: true } } },
  });

  return NextResponse.json({
    categories: categories.map(category => ({
      id: category.id,
      key: category.key,
      name: category.name,
      postCount: category._count.posts,
    })),
  });
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const parsed = categorySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a key and name for the category." }, { status: 400 });
  }

  const key = parsed.data.key.trim().toLowerCase();
  const name = parsed.data.name.trim();

  const existing = await db.category.findFirst({ where: { OR: [{ key }, { name }] } });
  if (existing) {
    return NextResponse.json({ error: "A category with that key or name already exists." }, { status: 409 });
  }

  const category = await db.category.create({ data: { key, name } });

  return NextResponse.json({ category: { id: category.id, key: category.key, name: category.name, postCount: 0 } });
}

export async function DELETE(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const parsed = z.object({ key: z.string().trim().min(1) }).safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Include the category key to delete." }, { status: 400 });
  }

  const key = parsed.data.key.trim().toLowerCase();
  const category = await db.category.findUnique({
    where: { key },
    include: { _count: { select: { posts: true } } },
  });

  if (!category) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }

  if (category._count.posts > 0) {
    return NextResponse.json({ error: "Cannot delete a category that is assigned to existing posts." }, { status: 400 });
  }

  await db.category.delete({ where: { id: category.id } });

  return NextResponse.json({ success: true });
}
