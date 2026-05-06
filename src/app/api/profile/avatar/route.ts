import { NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { uploadImageVariant } from "@/lib/blob";
import {
  MAX_UPLOAD_IMAGE_PIXELS,
  validateUploadBatch,
} from "@/lib/upload-security";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/request-security";

export const runtime = "nodejs";

const AVATAR_UPLOAD_WINDOW_MS = 10 * 60 * 1000;
const AVATAR_UPLOAD_LIMIT_PER_USER = 10;

function mapAvatarUploadFailure(error: unknown): { status: number; message: string } {
  const lowered = error instanceof Error ? error.message.toLowerCase() : "";

  if (
    lowered.includes("unsupported image") ||
    lowered.includes("input buffer") ||
    lowered.includes("invalid image") ||
    lowered.includes("pixel limit") ||
    lowered.includes("corrupt")
  ) {
    return { status: 400, message: "The selected file is not a valid image." };
  }

  if (
    lowered.includes("blob") ||
    lowered.includes("token") ||
    lowered.includes("network") ||
    lowered.includes("fetch failed")
  ) {
    return { status: 503, message: "Avatar uploads are temporarily unavailable. Please try again." };
  }

  return { status: 500, message: "Failed to upload avatar." };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientKey = getClientRateLimitKey(request.headers);
  const uploadLimit = await checkRateLimit(
    `upload:avatar:${session.user.email.toLowerCase()}:${clientKey}`,
    {
      windowMs: AVATAR_UPLOAD_WINDOW_MS,
      limit: AVATAR_UPLOAD_LIMIT_PER_USER,
    },
  );
  if (!uploadLimit.allowed) {
    return NextResponse.json(
      { error: "Too many avatar uploads. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(uploadLimit.retryAfterSeconds) } },
    );
  }

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No avatar file was uploaded." }, { status: 400 });
  }

  const validation = validateUploadBatch([file]);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(buffer, { limitInputPixels: MAX_UPLOAD_IMAGE_PIXELS }).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Unsupported image format.");
    }

    const avatarBuffer = await sharp(buffer, { limitInputPixels: MAX_UPLOAD_IMAGE_PIXELS })
      .rotate()
      .webp({ lossless: true })
      .toBuffer();

    const url = await uploadImageVariant("avatars", avatarBuffer, "image/webp", ".webp");
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    console.error("Avatar upload failed:", error);
    const mapped = mapAvatarUploadFailure(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
