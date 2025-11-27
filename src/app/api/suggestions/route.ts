import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const SuggestionSchema = z.object({
  message: z.string().min(10).max(5000),
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().email().max(254).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  const json = await req.json().catch(() => null);
  const parse = SuggestionSchema.safeParse(json);

  if (!parse.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { message, contactEmail, contactName } = parse.data;

  await db.suggestion.create({
      data: {
        message,
        contactName: contactName?.trim() || null,
        contactEmail: contactEmail?.trim() || null,
        authorId: session?.user?.id ?? null,
      },
  });

  return NextResponse.json({ ok: true });
}
