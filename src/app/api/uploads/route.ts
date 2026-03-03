import { NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { MAX_POST_IMAGES } from "@/lib/images";
import { uploadImageVariant } from "@/lib/blob";
import {
  MAX_UPLOAD_IMAGE_PIXELS,
  validateUploadBatch,
} from "@/lib/upload-security";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/request-security";

export const runtime = "nodejs";

const UPLOAD_WINDOW_MS = 10 * 60 * 1000;
const UPLOAD_LIMIT_PER_USER = 40;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientKey = getClientRateLimitKey(req.headers);
  const uploadLimit = await checkRateLimit(
    `upload:images:${session.user.email.toLowerCase()}:${clientKey}`,
    {
      windowMs: UPLOAD_WINDOW_MS,
      limit: UPLOAD_LIMIT_PER_USER,
    },
  );
  if (!uploadLimit.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(uploadLimit.retryAfterSeconds) } },
    );
  }

  const form = await req.formData();
  const files: File[] = [];

  for (const [, value] of form.entries()) {
    if (value instanceof File) {
      files.push(value);
    }
  }

  if (files.length > MAX_POST_IMAGES) {
    return NextResponse.json(
      { error: `You can upload up to ${MAX_POST_IMAGES} images.` },
      { status: 400 },
    );
  }

  const validation = validateUploadBatch(files);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const normalizedImages = await Promise.all(
      files.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        const metadata = await sharp(buffer, { limitInputPixels: MAX_UPLOAD_IMAGE_PIXELS }).metadata();
        if (!metadata.width || !metadata.height) {
          throw new Error("Unsupported image format.");
        }

        return { buffer };
      }),
    );

    const uploads = await Promise.all(
      normalizedImages.map(async ({ buffer }) => {
        const base = sharp(buffer, { limitInputPixels: MAX_UPLOAD_IMAGE_PIXELS }).jpeg({ quality: 90 });
        const original = await base.toBuffer();
        const originalUrl = await uploadImageVariant("uploads/original", original, "image/jpeg");

        async function make(width: number, prefix: string) {
          const resized = await sharp(buffer, { limitInputPixels: MAX_UPLOAD_IMAGE_PIXELS })
            .resize({ width })
            .jpeg({ quality: 80 })
            .toBuffer();
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
    const lowered = message.toLowerCase();
    const status = lowered.includes("unsafe") || lowered.includes("image") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
