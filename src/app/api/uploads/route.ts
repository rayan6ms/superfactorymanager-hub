import { NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { MAX_POST_IMAGES } from "@/lib/images";
import { detectNsfwInBuffer } from "@/lib/nsfw";
import { uploadImageVariant } from "@/lib/blob";

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
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  if (files.length > MAX_POST_IMAGES) {
    return NextResponse.json(
      { error: `You can upload up to ${MAX_POST_IMAGES} images.` },
      { status: 400 },
    );
  }

  try {
    const uploads = await Promise.all(
      files.map(async file => {
        const buffer = Buffer.from(await file.arrayBuffer());

        const nsfw = await detectNsfwInBuffer(buffer, 0.5);
        if (nsfw) {
          throw new Error(
            `"${file.name}" looks unsafe to share (${nsfw.label} ${Math.round(
              nsfw.probability * 100,
            )}% confidence). Choose a different image.`,
          );
        }

        const base = sharp(buffer).jpeg({ quality: 90 });
        const original = await base.toBuffer();
        const originalUrl = await uploadImageVariant("uploads/original", original, "image/jpeg");

        async function make(width: number, prefix: string) {
          const resized = await sharp(buffer).resize({ width }).jpeg({ quality: 80 }).toBuffer();
          return uploadImageVariant(`uploads/${prefix}`, resized, "image/jpeg");
        }

        const [thumbSm, thumbMd, thumbLg] = await Promise.all([
          make(320, "sm"),
          make(640, "md"),
          make(1024, "lg"),
        ]);

        return { original: originalUrl, thumbSm, thumbMd, thumbLg };
      }),
    );

    return NextResponse.json(uploads, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload images.";
    const status = message.includes("unsafe") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
