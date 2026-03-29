import { hashRateLimitIdentifier } from "./request-security";

export class RateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type RateLimitAction =
  | "post:create"
  | "comment:create"
  | "report:create"
  | "commit:create"
  | "post:vote"
  | "comment:vote";

type Rule = {
  windowMs: number;
  limit: number;
  message: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const hour = 60 * 60 * 1000;
const MAX_BUCKETS = 20_000;
const buckets = new Map<string, Bucket>();

const rules: Record<RateLimitAction, Rule> = {
  "post:create": {
    windowMs: hour,
    limit: 5,
    message: "You can only publish 5 posts per hour.",
  },
  "comment:create": {
    windowMs: hour,
    limit: 30,
    message: "You can only add 30 comments per hour.",
  },
  "report:create": {
    windowMs: hour,
    limit: 10,
    message: "You can only submit 10 reports per hour.",
  },
  "post:vote": {
    windowMs: hour,
    limit: 120,
    message: "You can only vote on 120 posts per hour.",
  },
  "comment:vote": {
    windowMs: hour,
    limit: 200,
    message: "You can only vote on 200 comments per hour.",
  },
  "commit:create": {
    windowMs: hour,
    limit: 15,
    message: "You can only propose 15 code improvements per hour.",
  },
};

function trimBuckets(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  if (buckets.size <= MAX_BUCKETS) return;

  const overflow = buckets.size - MAX_BUCKETS;
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

function buildRateLimitKey(userId: string, action: RateLimitAction) {
  const userHash = hashRateLimitIdentifier(userId, `community:${action}`);
  return `community:${action}:user:${userHash}`;
}

function consumeRateLimit(key: string, rule: Rule) {
  const now = Date.now();
  trimBuckets(now);

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= rule.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  buckets.set(key, current);
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function assertRateLimit(userId: string, action: RateLimitAction) {
  const rule = rules[action];
  const result = consumeRateLimit(buildRateLimitKey(userId, action), rule);

  if (result.allowed) return;

  throw new RateLimitError(rule.message, result.retryAfterSeconds);
}
