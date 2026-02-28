import { NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { detectNsfwInBufferCached } from "@/lib/nsfw";
import {
  MAX_UPLOAD_IMAGE_PIXELS,
  validateUploadBatch,
} from "@/lib/upload-security";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/request-security";

export const runtime = "nodejs";

const NSFW_CHECK_WINDOW_MS = 10 * 60 * 1000;
const NSFW_CHECK_LIMIT_PER_USER = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientKey = getClientRateLimitKey(req.headers);
  const nsfwCheckLimit = await checkRateLimit(
    `upload:nsfw-check:${session.user.email.toLowerCase()}:${clientKey}`,
    {
      windowMs: NSFW_CHECK_WINDOW_MS,
      limit: NSFW_CHECK_LIMIT_PER_USER,
    },
  );
  if (!nsfwCheckLimit.allowed) {
    return NextResponse.json(
      { error: "Too many checks. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(nsfwCheckLimit.retryAfterSeconds) } },
    );
  }

  const form = await req.formData();

  const files: File[] = [];
  for (const [, value] of form.entries()) {
    if (value instanceof File) {
      files.push(value);
    }
  }

  const validation = validateUploadBatch(files);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 },
    );
  }

  console.log("[nsfw-check] Checking", { count: files.length });

  for (const file of files) {
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const metadata = await sharp(bytes, { limitInputPixels: MAX_UPLOAD_IMAGE_PIXELS }).metadata();
      if (!metadata.width || !metadata.height) {
        return NextResponse.json(
          {
            error: "Unsupported image format.",
            fileName: file.name,
          },
          { status: 400 },
        );
      }
      const nsfw = await detectNsfwInBufferCached(bytes, 0.5);

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
