import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { detectNsfwInBuffer } from "@/lib/nsfw";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();

  const files: File[] = [];
  for (const [, value] of form.entries()) {
    if (value instanceof File) {
      files.push(value);
    }
  }

  if (!files.length) {
    return NextResponse.json(
      { error: "No files provided for NSFW check." },
      { status: 400 },
    );
  }

  console.log("[nsfw-check] Checking", { count: files.length });

  for (const file of files) {
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const nsfw = await detectNsfwInBuffer(bytes, 0.5);

      if (nsfw) {
        return NextResponse.json(
          {
            error: `One of your images looks unsafe to share (${nsfw.label} ${Math.round(
              nsfw.probability * 100,
            )}% confidence). Please choose a different image.`,
            fileName: file.name,
            label: nsfw.label,
            probability: nsfw.probability,
          },
          { status: 400 },
        );
      }
    } catch (error) {
      console.warn("[nsfw-check] Failed to inspect image", {
        fileName: file.name,
        error,
      });
      return NextResponse.json(
        {
          error:
            "We couldn't analyze one of your images for safety. Please try again or use a different image.",
        },
        { status: 500 },
      );
    }
  }

  console.log("[nsfw-check] All images passed");
  return NextResponse.json({ ok: true });
}
