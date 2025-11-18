import { z } from "zod";
import { MAX_POST_IMAGES } from "./images";
import { COMMENT_MAX_LENGTH, COMMENT_MIN_LENGTH } from "./comment-constants";

export const TAG_MIN_COUNT = 2;
export const TAG_MAX_COUNT = 6;
export const MAX_TAG_LENGTH = 32;

export const tagSchema = z
  .string()
  .trim()
  .min(2, { message: "Tags must be at least 2 characters long." })
  .max(MAX_TAG_LENGTH, { message: `Tags must be ${MAX_TAG_LENGTH} characters or fewer.` })
  .regex(/^[\p{L}\p{N}\s\-_/]+$/u, {
    message: "Tags may include letters, numbers, spaces, hyphens, underscores, and slashes.",
  });

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
  tags: z
    .array(tagSchema)
    .max(TAG_MAX_COUNT, { message: `Use up to ${TAG_MAX_COUNT} tags.` })
    .transform(values => {
      const seen = new Set<string>();
      return values
        .map(value => value.trim().replace(/\s+/g, " "))
        .filter(value => {
          const lower = value.toLowerCase();
          if (seen.has(lower)) return false;
          seen.add(lower);
          return true;
        });
    })
    .refine(values => values.length >= TAG_MIN_COUNT, {
      message: `Add at least ${TAG_MIN_COUNT} tags.`,
    }),

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
  openForImprovement: z.boolean().optional().default(false),
});

export const searchQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  version: z.string().optional(),
  page: z.coerce.number().optional().default(1),
  perPage: z.coerce.number().optional().default(20),
});

export const commentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(COMMENT_MIN_LENGTH, { message: `Comments must be at least ${COMMENT_MIN_LENGTH} characters long.` })
    .max(COMMENT_MAX_LENGTH, { message: `Comments must be ${COMMENT_MAX_LENGTH} characters or fewer.` }),
});
