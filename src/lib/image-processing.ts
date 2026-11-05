import "server-only";

import sharp from "sharp";
import { MAX_UPLOAD_IMAGE_PIXELS } from "./upload-security";

// Use one shared preview instead of uploading and caching three separate sizes.
const POST_PREVIEW_MAX_SIZE = 960;
const AVATAR_MAX_SIZE = 256;
const PREVIEW_QUALITY = 82;

export async function preparePostImage(buffer: Buffer) {
  const image = sharp(buffer, { limitInputPixels: MAX_UPLOAD_IMAGE_PIXELS }).rotate();
  // Keep the full-resolution image lossless for the gallery's zoom and download.
  const original = await image.clone().webp({ lossless: true }).toBuffer();
  const resized = await image
    .clone()
    .resize({
      width: POST_PREVIEW_MAX_SIZE,
      height: POST_PREVIEW_MAX_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: PREVIEW_QUALITY })
    .toBuffer();

  // Small or simple originals may already cost fewer bytes than a new preview.
  return { original, preview: resized.length < original.length ? resized : original };
}

export async function prepareAvatarImage(buffer: Buffer) {
  return sharp(buffer, { limitInputPixels: MAX_UPLOAD_IMAGE_PIXELS })
    .rotate()
    .resize({
      width: AVATAR_MAX_SIZE,
      height: AVATAR_MAX_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: PREVIEW_QUALITY })
    .toBuffer();
}
