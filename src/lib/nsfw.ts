import * as nsfwjs from "nsfwjs";
import * as tf from "@tensorflow/tfjs";
import crypto from "crypto";
import sharp from "sharp";

const FLAGGED_CLASSES = new Set(["Porn", "Hentai", "Sexy"]);

let modelPromise: Promise<nsfwjs.NSFWJS> | null = null;
const nsfwCache = new Map<string, { label: string; probability: number } | null>();

function hashBuffer(buffer: Buffer) {
  const hash = crypto.createHash("sha256");
  hash.update(buffer);
  return hash.digest("hex");
}

async function loadModel() {
  if (!modelPromise) {
    console.log("[nsfw] Loading NSFW model...");
    modelPromise = nsfwjs.load();
    modelPromise
      .then(() => console.log("[nsfw] Model loaded"))
      .catch((err) => {
        console.error("[nsfw] Failed to load model", err);
        modelPromise = null;
      });
  }
  return modelPromise;
}

export type NsfwDetection = {
  url: string;
  label: string;
  probability: number;
};

async function bufferToImageTensor(buffer: Buffer): Promise<tf.Tensor3D> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const numChannels = 3;
  const numPixels = width * height;
  const values = new Int32Array(numPixels * numChannels);

  for (let i = 0; i < numPixels; i++) {
    const offset = i * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];

    const j = i * numChannels;
    values[j] = r;
    values[j + 1] = g;
    values[j + 2] = b;
  }

  return tf.tensor3d(values, [height, width, numChannels], "int32");
}

export async function detectNsfwInBuffer(
  buffer: Buffer,
  threshold = 0.5,
): Promise<{ label: string; probability: number } | null> {
  const model = await loadModel();
  if (!model) {
    console.error("[nsfw] Model not available, skipping scan");
    return null;
  }

  const image = await bufferToImageTensor(buffer);
  const predictions = await model.classify(image);
  image.dispose();

  console.log("[nsfw] Predictions (buffer)", { predictions });

  const flagged = predictions.find(
    (pred) =>
      FLAGGED_CLASSES.has(pred.className) &&
      pred.probability >= threshold,
  );

  if (flagged) {
    console.warn("[nsfw] Buffer image flagged as NSFW", { flagged });
    return {
      label: flagged.className,
      probability: flagged.probability,
    };
  }

  return null;
}

export async function detectNsfwInBufferCached(
  buffer: Buffer,
  threshold = 0.5,
): Promise<{ label: string; probability: number } | null> {
  const hash = hashBuffer(buffer);

  if (nsfwCache.has(hash)) {
    console.log("[nsfw] Cache hit", { hash });
    return nsfwCache.get(hash) ?? null;
  }

  console.log("[nsfw] Cache miss", { hash });
  const result = await detectNsfwInBuffer(buffer, threshold);
  nsfwCache.set(hash, result);
  return result;
}

export async function detectNsfwInImages(
  urls: string[],
  threshold = 0.5,
): Promise<NsfwDetection | null> {
  if (!urls.length) {
    console.log("[nsfw] No image URLs to scan");
    return null;
  }

  console.log("[nsfw] Starting scan", { count: urls.length });

  const model = await loadModel();
  if (!model) {
    console.error("[nsfw] Model not available, skipping scan");
    return null;
  }

  for (const url of urls) {
    try {
      console.log("[nsfw] Fetching image", { url });

      const response = await fetch(url);
      if (!response.ok) {
        console.warn("[nsfw] Failed to fetch image", {
          url,
          status: response.status,
          statusText: response.statusText,
        });
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "unknown";
      const buffer = Buffer.from(await response.arrayBuffer());
      const image = await bufferToImageTensor(buffer);

      const predictions = await model.classify(image);
      image.dispose();

      console.log("[nsfw] Predictions", {
        url,
        contentType,
        predictions,
      });

      const flagged = predictions.find(
        (pred) =>
          FLAGGED_CLASSES.has(pred.className) &&
          pred.probability >= threshold,
      );

      if (flagged) {
        console.warn("[nsfw] Image flagged as NSFW", {
          url,
          contentType,
          flagged,
        });

        return {
          url,
          label: flagged.className,
          probability: flagged.probability,
        };
      }
    } catch (error) {
      console.warn("[nsfw] Unable to inspect image", { url, error });
    }
  }

  console.log("[nsfw] No images flagged");
  return null;
}
