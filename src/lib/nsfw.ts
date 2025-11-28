import * as nsfwjs from "nsfwjs";
import * as tf from "@tensorflow/tfjs-node";

const FLAGGED_CLASSES = new Set(["Porn", "Hentai", "Sexy"]);

let modelPromise: Promise<nsfwjs.NSFWJS> | null = null;

async function loadModel() {
  if (!modelPromise) {
    modelPromise = nsfwjs.load();
  }
  return modelPromise;
}

export type NsfwDetection = {
  url: string;
  label: string;
  probability: number;
};

export async function detectNsfwInImages(
  urls: string[],
  threshold = 0.7,
): Promise<NsfwDetection | null> {
  if (!urls.length) return null;
  const model = await loadModel();

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      const image = tf.node.decodeImage(buffer, 3);
      const predictions = await model.classify(image);
      image.dispose();

      const flagged = predictions.find(pred => FLAGGED_CLASSES.has(pred.className) && pred.probability >= threshold);
      if (flagged) {
        return { url, label: flagged.className, probability: flagged.probability };
      }
    } catch (error) {
      console.warn("[nsfw] Unable to inspect image", { url, error });
    }
  }

  return null;
}
