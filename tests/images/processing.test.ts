import { describe, expect, mock, spyOn, test } from "bun:test";
import dns from "node:dns/promises";
import sharp from "sharp";

mock.module("server-only", () => ({}));
const { prepareAvatarImage, preparePostImage } = await import("../../src/lib/image-processing");
const { resolveProfileImage } = await import("../../src/lib/avatar");

sharp.concurrency(1);

const screenshot = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="1440">
  <defs><linearGradient id="bg"><stop stop-color="#46378e"/><stop offset="1" stop-color="#172a41"/></linearGradient></defs>
  <rect width="2560" height="1440" fill="url(#bg)"/>
  ${Array.from({ length: 30 }, (_, i) => `<text x="40" y="${40 + i * 45}" font-size="26" fill="white">EVERY 20 TICKS DO INPUT FROM chest_${i} OUTPUT TO machine_${i} END</text>`).join("")}
</svg>`);

describe("image delivery sizes", () => {
  test("a preview is smaller while the original keeps its full dimensions and pixels", async () => {
    // Texture approximates detailed screenshots better than a flat SVG, which can
    // already compress more efficiently as a lossless original than as a preview.
    const pixels = Buffer.alloc(1280 * 720 * 3);
    let seed = 12345;
    for (let index = 0; index < pixels.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels[index] = seed >>> 24;
    }
    const input = await sharp(pixels, { raw: { width: 1280, height: 720, channels: 3 } })
      .png()
      .toBuffer();
    const { original, preview } = await preparePostImage(input);
    expect(await sharp(original).metadata()).toMatchObject({
      format: "webp",
      width: 1280,
      height: 720,
    });
    const originalPixels = await sharp(original).ensureAlpha().raw().toBuffer();
    const inputPixels = await sharp(input).ensureAlpha().raw().toBuffer();
    expect(originalPixels.equals(inputPixels)).toBe(true);
    const metadata = await sharp(preview).metadata();
    expect(metadata.width).toBeLessThanOrEqual(960);
    expect(metadata.height).toBeLessThanOrEqual(960);
    expect(preview.length).toBeLessThan(original.length);
  });

  test("small originals are reused when another preview would add bytes", async () => {
    const input = await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const { original, preview } = await preparePostImage(input);
    expect(preview).toBe(original);
    expect(await sharp(preview).metadata()).toMatchObject({
      width: 16,
      height: 16,
      hasAlpha: true,
    });
  });

  test("avatars are bounded, keep their aspect ratio, and small ones are not enlarged", async () => {
    expect(await sharp(await prepareAvatarImage(screenshot)).metadata()).toMatchObject({
      format: "webp",
      width: 256,
      height: 144,
    });
    const small = await sharp(screenshot).resize(64, 36).png().toBuffer();
    expect(await sharp(await prepareAvatarImage(small)).metadata()).toMatchObject({
      width: 64,
      height: 36,
    });
  });

  test("EXIF orientation is applied before metadata is stripped", async () => {
    const rotated = await sharp(screenshot)
      .resize(80, 40)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect(await sharp(await prepareAvatarImage(rotated)).metadata()).toMatchObject({
      width: 40,
      height: 80,
    });
  });

  test("invalid images are rejected", async () => {
    await expect(preparePostImage(Buffer.from("not an image"))).rejects.toThrow();
    await expect(prepareAvatarImage(Buffer.from("not an image"))).rejects.toThrow();
  });
});

test("saving an uploaded avatar reuses its URL without DNS, reads, or copies", async () => {
  const lookup = spyOn(dns, "lookup").mockRejectedValue(new Error("Unexpected DNS request"));
  const fetch = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected fetch"));
  try {
    const image = "https://existing.public.blob.vercel-storage.com/avatars/example.webp";
    expect(await resolveProfileImage({ image, name: "Example" })).toBe(image);
    expect(lookup).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    lookup.mockRestore();
    fetch.mockRestore();
  }
});
