import { z } from "zod";
import { MAX_POST_IMAGES } from "./images";

export const dependencyUrl = z.url().refine((u) => {
  try {
    const url = new URL(u);
    return url.hostname.includes("curseforge.com") || url.hostname.includes("modrinth.com");
  } catch { return false; }
}, "Must be a CurseForge or Modrinth URL");

export const postSchema = z.object({
  title: z.string().min(1),
  gameVersion: z.string().min(1),
  modVersion: z.string().min(1),
  categoryKey: z.string().min(1),

  images: z.array(
    z.union([
      z.url(),
      z.object({
        original: z.url(),
        thumbSm: z.url().optional(),
        thumbMd: z.url().optional(),
        thumbLg: z.url().optional(),
      })
    ])
  )
    .max(MAX_POST_IMAGES, { message: `You can upload up to ${MAX_POST_IMAGES} images.` })
    .default([]),

  dependencies: z.array(dependencyUrl).optional().default([]),

  code: z.string().min(1),
  description: z.string().min(1),
  youtubeUrl: z.url().optional().or(z.literal("").optional()),
});

export const searchQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  version: z.string().optional(),
  page: z.coerce.number().optional().default(1),
  perPage: z.coerce.number().optional().default(20),
});
