import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hash } from "bcrypt";
import { z } from "zod";

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "EMAIL_REQUIRED")
    .email("INVALID_EMAIL"),
  name: z
    .string()
    .trim()
    .min(1, "NAME_REQUIRED"),
  password: z
    .string()
    .min(1, "PASSWORD_REQUIRED")
    .min(8, "PASSWORD_TOO_SHORT"),
});

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const parsed = schema.parse(data);
    const existing = await db.user.findUnique({ where: { email: parsed.email } });
    if (existing) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    const passwordHash = await hash(parsed.password, 10);
    const user = await db.user.create({
      data: { email: parsed.email, name: parsed.name, passwordHash },
    });
    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (e: any) {
    console.error("Signup error:", e);
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten().fieldErrors }, { status: 400 });
    }
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 400 });
  }
}
