import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const BUILD_NAME_MIN_LENGTH = 3;
export const BUILD_NAME_MAX_LENGTH = 80;
export const BUILD_TAG_MIN_LENGTH = 2;
export const BUILD_TAG_MAX_LENGTH = 24;
export const BUILD_CODE_MIN_NON_WHITESPACE = 51;

export const buildNameSchema = z
  .string()
  .trim()
  .min(BUILD_NAME_MIN_LENGTH, `Name must be at least ${BUILD_NAME_MIN_LENGTH} characters.`)
  .max(BUILD_NAME_MAX_LENGTH, `Name must be at most ${BUILD_NAME_MAX_LENGTH} characters.`)
  .refine((value) => !(/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)), {
    message: "Name contains invalid control characters.",
  });

export const buildVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);

export const buildTagSchema = z
  .string()
  .trim()
  .min(BUILD_TAG_MIN_LENGTH, `Tag must be at least ${BUILD_TAG_MIN_LENGTH} characters.`)
  .max(BUILD_TAG_MAX_LENGTH, `Tag must be at most ${BUILD_TAG_MAX_LENGTH} characters.`)
  .refine((value) => !(/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)), {
    message: "Tag contains invalid control characters.",
  });

export const buildReferenceSchema = z.object({
  username: z.string().trim().min(1, "Username is required."),
  slug: z.string().trim().min(1, "Slug is required."),
});

export const createBuildSchema = z.object({
  name: buildNameSchema,
  tag: buildTagSchema,
  code: z.string(),
  visibility: buildVisibilitySchema.optional().default("PUBLIC"),
  forkedFrom: buildReferenceSchema.nullable().optional(),
});

export const updateBuildSchema = z.object({
  tag: buildTagSchema.optional(),
  code: z.string(),
  visibility: buildVisibilitySchema.optional(),
  createCommit: z.boolean().optional().default(false),
  commitMessage: z.string().trim().max(280).nullable().optional(),
});

export const forkBuildSchema = z.object({
  name: buildNameSchema.optional(),
  tag: buildTagSchema.optional(),
  visibility: buildVisibilitySchema.optional().default("PUBLIC"),
});

export function normalizeBuildName(raw: string) {
  const nameOriginal = raw.trim();
  const nameLower = nameOriginal.toLowerCase();
  return { nameOriginal, nameLower };
}

export function normalizeBuildTag(raw: string) {
  const tag = raw.trim().replace(/\s+/g, " ");
  const tagLower = tag.toLowerCase();
  return { tag, tagLower };
}

export function getCodeContentStats(rawCode: string) {
  const trimmedCode = rawCode.trim();
  const nonWhitespaceCount = trimmedCode.replace(/\s+/g, "").length;
  return { trimmedCode, nonWhitespaceCount };
}

function forkNameForAttempt(sourceNameOriginal: string, attempt: number) {
  const suffix = attempt === 1 ? " (fork)" : ` (fork ${attempt})`;
  const maxBaseLength = Math.max(0, BUILD_NAME_MAX_LENGTH - suffix.length);
  const baseTrimmed = sourceNameOriginal.trim();
  const safeBase = (baseTrimmed || "build").slice(0, maxBaseLength).trim() || "build";
  return `${safeBase}${suffix}`;
}

export async function getNextForkNameForUser(
  tx: Prisma.TransactionClient,
  userId: string,
  sourceNameOriginal: string,
) {
  for (let attempt = 1; attempt < 10_000; attempt += 1) {
    const candidate = forkNameForAttempt(sourceNameOriginal, attempt);
    const parsed = buildNameSchema.safeParse(candidate);
    if (!parsed.success) {
      continue;
    }
    const { nameLower } = normalizeBuildName(parsed.data);
    const existing = await tx.build.findUnique({
      where: { userId_nameLower: { userId, nameLower } },
      select: { id: true },
    });
    if (!existing) {
      return parsed.data;
    }
  }

  throw new Error("UNABLE_TO_GENERATE_FORK_NAME");
}
