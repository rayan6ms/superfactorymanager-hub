import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { del, put } from "@vercel/blob";
import sharp from "sharp";

const WEBP_CONTENT_TYPE = "image/webp";
const POST_WEBP_QUALITY = 86;
const AVATAR_WEBP_QUALITY = 82;
const AVATAR_SIZE = 256;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 24_000_000;
const CONCURRENCY = 2;
const ALLOWED_AVATAR_HOSTS = [
  "avatars.githubusercontent.com",
  "lh3.googleusercontent.com",
  "googleusercontent.com",
];

const token = process.env.BLOB_READ_WRITE_TOKEN;
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!token) throw new Error("Missing BLOB_READ_WRITE_TOKEN environment variable");
if (!connectionString) throw new Error("Missing POSTGRES_URL or DATABASE_URL environment variable");

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 300_000,
  }),
});

function isWebpUrl(url) {
  return /\.webp($|[?#])/i.test(url);
}

function isManagedBlobUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function isAllowedAvatarRemoteUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_AVATAR_HOSTS.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

async function uploadWebp(prefix, buffer) {
  const key = `${prefix}/${randomUUID()}.webp`;
  const res = await put(key, buffer, {
    access: "public",
    contentType: WEBP_CONTENT_TYPE,
    token,
  });
  return res.url;
}

async function downloadImage(url) {
  const response = await fetch(url, { headers: { accept: "image/*" } });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("image/")) {
    throw new Error(`URL is not an image: ${url}`);
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (!Number.isNaN(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large: ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large: ${url}`);
  }
  return buffer;
}

async function mapWithConcurrency(values, maxConcurrency, mapper) {
  const results = new Array(values.length);
  const safeConcurrency = Math.max(1, Math.min(maxConcurrency, values.length || 1));
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= values.length) return;
      results[currentIndex] = await mapper(values[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, worker));
  return results;
}

async function deleteManagedBlobs(urls) {
  const uniqueUrls = Array.from(new Set(urls.filter(isManagedBlobUrl)));
  await Promise.all(
    uniqueUrls.map(async url => {
      try {
        await del(url, { token });
      } catch (error) {
        console.warn("Failed to delete old blob", { url, error });
      }
    }),
  );
}

async function normalizePostImage(image) {
  const urls = [image.original, image.thumbSm, image.thumbMd, image.thumbLg];

  if (isWebpUrl(image.original) && urls.every(url => url === image.original)) {
    return { changed: false, id: image.id };
  }

  let original = image.original;
  const uploadedUrls = [];

  try {
    if (!isWebpUrl(original)) {
      const input = await downloadImage(original);
      const webp = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS })
        .webp({ quality: POST_WEBP_QUALITY })
        .toBuffer();
      original = await uploadWebp("uploads/original", webp);
      uploadedUrls.push(original);
    }

    await prisma.postImage.update({
      where: { id: image.id },
      data: { original, thumbSm: original, thumbMd: original, thumbLg: original },
    });

    await deleteManagedBlobs(urls.filter(url => url !== original));
    return { changed: true, id: image.id };
  } catch (error) {
    await deleteManagedBlobs(uploadedUrls);
    throw error;
  }
}

async function normalizeUserAvatar(user) {
  if (!user.image || user.image.startsWith("data:")) {
    return { changed: false, id: user.id };
  }
  if (isManagedBlobUrl(user.image) && isWebpUrl(user.image)) {
    return { changed: false, id: user.id };
  }
  if (!isManagedBlobUrl(user.image) && !isAllowedAvatarRemoteUrl(user.image)) {
    return { changed: false, id: user.id };
  }

  const input = await downloadImage(user.image);
  const webp = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
    .webp({ quality: AVATAR_WEBP_QUALITY })
    .toBuffer();
  const image = await uploadWebp("avatars", webp);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { image },
    });
    await deleteManagedBlobs([user.image]);
    return { changed: true, id: user.id };
  } catch (error) {
    await deleteManagedBlobs([image]);
    throw error;
  }
}

try {
  const postImages = await prisma.postImage.findMany({
    select: { id: true, original: true, thumbSm: true, thumbMd: true, thumbLg: true },
    orderBy: { id: "asc" },
  });
  const postCandidates = postImages.filter(image => {
    const urls = [image.original, image.thumbSm, image.thumbMd, image.thumbLg];
    return !isWebpUrl(image.original) || urls.some(url => url !== image.original);
  });
  console.log(`Found ${postImages.length} post images, normalizing ${postCandidates.length}.`);
  let normalizedPosts = 0;
  await mapWithConcurrency(postCandidates, CONCURRENCY, async image => {
    const result = await normalizePostImage(image);
    if (result.changed) normalizedPosts += 1;
    console.log(`${result.changed ? "Normalized" : "Skipped"} post image ${image.id}`);
  });

  const users = await prisma.user.findMany({
    select: { id: true, image: true },
    orderBy: { id: "asc" },
  });
  const userCandidates = users.filter(user => {
    if (!user.image || user.image.startsWith("data:")) return false;
    if (isManagedBlobUrl(user.image)) return !isWebpUrl(user.image);
    return isAllowedAvatarRemoteUrl(user.image);
  });
  console.log(`Found ${users.length} users, normalizing ${userCandidates.length} avatars.`);
  let normalizedUsers = 0;
  await mapWithConcurrency(userCandidates, CONCURRENCY, async user => {
    const result = await normalizeUserAvatar(user);
    if (result.changed) normalizedUsers += 1;
    console.log(`${result.changed ? "Normalized" : "Skipped"} avatar ${user.id}`);
  });

  console.log(`Done. Normalized ${normalizedPosts} post images and ${normalizedUsers} avatars.`);
} finally {
  await prisma.$disconnect();
}
