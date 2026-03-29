import { z } from "zod";
import { MAX_POST_IMAGES } from "./images";
import { COMMENT_MAX_LENGTH, COMMENT_MIN_LENGTH } from "./comment-constants";
import { normalizePostDescription } from "./post-description";
import { parseDependency } from "./deps";

export const TAG_MIN_COUNT = 2;
export const TAG_MAX_COUNT = 6;
export const MAX_TAG_LENGTH = 32;
export const POST_DESCRIPTION_MIN_LENGTH = 50;
export const POST_DESCRIPTION_MAX_LENGTH = 2000;
export const POSTS_PAGE_MIN = 1;
export const POSTS_PER_PAGE_DEFAULT = 20;
export const POSTS_PER_PAGE_MAX = 100;

function isAllowedHost(hostname: string, domain: string) {
  const host = hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

const TRUSTED_POST_IMAGE_HOST_SUFFIXES = [
  "public.blob.vercel-storage.com",
];

function toConfiguredHost(value: string | undefined): string | null {
  if (!value) return null;
  const withProtocol = value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;
  try {
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getConfiguredAppHosts() {
  const hosts = new Set<string>();
  const appHost = toConfiguredHost(process.env.APP_URL);
  const publicAppHost = toConfiguredHost(process.env.NEXT_PUBLIC_APP_URL);
  const authHost = toConfiguredHost(process.env.NEXTAUTH_URL);
  const vercelHost = toConfiguredHost(process.env.VERCEL_URL);

  if (appHost) hosts.add(appHost);
  if (publicAppHost) hosts.add(publicAppHost);
  if (authHost) hosts.add(authHost);
  if (vercelHost) hosts.add(vercelHost);

  return hosts;
}

const configuredAppHosts = getConfiguredAppHosts();

function isTrustedPostImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("/")) {
    return trimmed.startsWith("/uploads/");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  const host = url.hostname.toLowerCase();
  if (TRUSTED_POST_IMAGE_HOST_SUFFIXES.some(domain => isAllowedHost(host, domain))) {
    return true;
  }

  if (url.pathname.startsWith("/uploads/")) {
    return configuredAppHosts.has(host);
  }

  return false;
}

const postImageUrlSchema = z.string().trim().refine(isTrustedPostImageUrl, {
  message: "Images must be HTTPS URLs from trusted storage or site-local /uploads paths.",
});

export const tagSchema = z
  .string()
  .trim()
  .min(2, { message: "Tags must be at least 2 characters long." })
  .max(MAX_TAG_LENGTH, { message: `Tags must be ${MAX_TAG_LENGTH} characters or fewer.` })
  .regex(/^[\p{L}\p{N}\s\-_/]+$/u, {
    message: "Tags may include letters, numbers, spaces, hyphens, underscores, and slashes.",
  });

export const dependencyUrl = z.string().trim().refine((value) => Boolean(parseDependency(value)), {
  message: "Must be an HTTPS CurseForge or Modrinth mod URL.",
});

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
      postImageUrlSchema,
      z.object({
        original: postImageUrlSchema,
        thumbSm: postImageUrlSchema.optional(),
        thumbMd: postImageUrlSchema.optional(),
        thumbLg: postImageUrlSchema.optional(),
      }),
    ]),
  )
    .max(MAX_POST_IMAGES, { message: `You can upload up to ${MAX_POST_IMAGES} images.` })
    .default([]),

  keepImageIds: z.array(z.string().min(1)).optional().default([]),
  imageOrder: z.array(
    z.union([
      z.object({ existingId: z.string().min(1) }),
      z.object({ uploadIndex: z.number().int().min(0) }),
    ]),
  ).optional().default([]),

  dependencies: z.array(dependencyUrl).optional().default([]),

  code: z.string().min(1),
  description: z
    .string()
    .transform(normalizePostDescription)
    .pipe(
      z
        .string()
        .min(POST_DESCRIPTION_MIN_LENGTH, {
          message: `Description must be at least ${POST_DESCRIPTION_MIN_LENGTH} characters long.`,
        })
        .max(POST_DESCRIPTION_MAX_LENGTH, {
          message: `Description must be at most ${POST_DESCRIPTION_MAX_LENGTH} characters long.`,
        }),
    ),
  youtubeUrl: z.url().optional().or(z.literal("").optional()),
  openForImprovement: z.boolean().optional().default(false),
});

export const searchQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  version: z.string().optional(),
  page: z.coerce.number().int().min(POSTS_PAGE_MIN).default(POSTS_PAGE_MIN),
  perPage: z.coerce.number().int().min(1).max(POSTS_PER_PAGE_MAX).default(POSTS_PER_PAGE_DEFAULT),
});

export const commentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(COMMENT_MIN_LENGTH, { message: `Comments must be at least ${COMMENT_MIN_LENGTH} characters long.` })
    .max(COMMENT_MAX_LENGTH, { message: `Comments must be ${COMMENT_MAX_LENGTH} characters or fewer.` }),
  parentId: z.string().cuid().optional().nullable(),
});
