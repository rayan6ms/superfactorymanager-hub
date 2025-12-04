import { del, put } from "@vercel/blob";
import { randomUUID } from "crypto";

function requireBlobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error("Missing BLOB_READ_WRITE_TOKEN environment variable");
  }
  return token;
}

export async function uploadImageVariant(
  prefix: string,
  buffer: Buffer,
  contentType: string,
) {
  const token = requireBlobToken();
  const key = `${prefix}/${randomUUID()}.jpg`;
  const res = await put(key, buffer, {
    access: "public",
    contentType,
    token,
  });
  return res.url;
}

export async function deleteBlobs(urls: Array<string | null | undefined>) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.warn("[blob] Missing BLOB_READ_WRITE_TOKEN, skipping deletions");
    return;
  }

  await Promise.all(
    urls.map(async url => {
      if (!url) return;
      try {
        await del(url, { token });
      } catch (error) {
        console.warn("[blob] Failed to delete blob", { url, error });
      }
    }),
  );
}
