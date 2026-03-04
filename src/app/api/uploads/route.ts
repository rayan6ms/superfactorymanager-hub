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

function getOriginalUploadExtension(contentType: string) {
  switch (contentType) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/jpeg":
    default:
      return ".jpg";
  }
}

function mapUploadFailure(error: unknown): { status: number; message: string } {
  const lowered = error instanceof Error ? error.message.toLowerCase() : "";

  if (
    lowered.includes("unsupported image") ||
    lowered.includes("input buffer") ||
    lowered.includes("invalid image") ||
    lowered.includes("pixel limit") ||
    lowered.includes("corrupt")
  ) {
    return { status: 400, message: "One or more files could not be processed as valid images." };
  }

  if (
    lowered.includes("blob") ||
    lowered.includes("token") ||
    lowered.includes("network") ||
    lowered.includes("fetch failed")
  ) {
    return { status: 503, message: "Upload service is temporarily unavailable. Please try again." };
  }

  return { status: 500, message: "Failed to upload images." };
}

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
      normalizedImages.map(async ({ buffer }, index) => {
        const file = files[index];
        const originalUrl = await uploadImageVariant(
          "uploads/original",
          buffer,
          file.type || "image/jpeg",
          getOriginalUploadExtension(file.type),
        );

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
    console.error("Upload processing failed:", error);
    const mapped = mapUploadFailure(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
