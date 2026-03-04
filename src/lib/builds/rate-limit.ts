import { checkRateLimit, hashRateLimitIdentifier } from "@/lib/request-security";

type BuildRateLimitAction = "create" | "update" | "fork";

type BuildRateLimitRule = {
  windowMs: number;
  limit: number;
  message: string;
};

const hour = 60 * 60 * 1000;

const rules: Record<BuildRateLimitAction, BuildRateLimitRule> = {
  create: {
    windowMs: hour,
    limit: 20,
    message: "You can only create 20 builds per hour.",
  },
  update: {
    windowMs: hour,
    limit: 120,
    message: "You can only update builds 120 times per hour.",
  },
  fork: {
    windowMs: hour,
    limit: 40,
    message: "You can only fork 40 builds per hour.",
  },
};

export class BuildRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "BuildRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function buildRateLimitKey(userId: string, action: BuildRateLimitAction) {
  const userHash = hashRateLimitIdentifier(userId, `build:${action}`);
  return `build:${action}:user:${userHash}`;
}

export async function assertBuildRateLimit(userId: string, action: BuildRateLimitAction) {
  const rule = rules[action];
  const result = await checkRateLimit(buildRateLimitKey(userId, action), {
    windowMs: rule.windowMs,
    limit: rule.limit,
  });

  if (result.allowed) return;

  throw new BuildRateLimitError(rule.message, result.retryAfterSeconds);
}
