import "server-only";

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const MAX_UPLOAD_BYTES_PER_FILE = 8 * 1024 * 1024; // 8 MB
export const MAX_UPLOAD_TOTAL_BYTES = 24 * 1024 * 1024; // 24 MB
export const MAX_UPLOAD_IMAGE_PIXELS = 24_000_000; // 24 MP

export function validateUploadBatch(files: File[]) {
  if (!files.length) {
    return { ok: false as const, error: "No files uploaded" };
  }

  let totalBytes = 0;
  for (const file of files) {
    if (file.size <= 0) {
      return { ok: false as const, error: "One of the files is empty." };
    }

    if (file.size > MAX_UPLOAD_BYTES_PER_FILE) {
      return {
        ok: false as const,
        error: `Each image must be ${Math.floor(MAX_UPLOAD_BYTES_PER_FILE / (1024 * 1024))} MB or smaller.`,
      };
    }

    totalBytes += file.size;
    if (totalBytes > MAX_UPLOAD_TOTAL_BYTES) {
      return {
        ok: false as const,
        error: `Combined upload size must stay under ${Math.floor(MAX_UPLOAD_TOTAL_BYTES / (1024 * 1024))} MB.`,
      };
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
      return { ok: false as const, error: "Only JPG, PNG, WEBP, and GIF images are allowed." };
    }
  }

  return { ok: true as const };
}
