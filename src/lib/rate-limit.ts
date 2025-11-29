import { db } from "./db";

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
  count: (userId: string, since: Date) => Promise<number>;
  oldest: (userId: string, since: Date) => Promise<Date | null>;
  message: string;
};

const hour = 60 * 60 * 1000;

const rules: Record<RateLimitAction, Rule> = {
  "post:create": {
    windowMs: hour,
    limit: 5,
    message: "You can only publish 5 posts per hour.",
    count: (userId, since) =>
      db.post.count({ where: { authorId: userId, uploadDate: { gte: since } } }),
    oldest: async (userId, since) => {
      const first = await db.post.findFirst({
        where: { authorId: userId, uploadDate: { gte: since } },
        orderBy: { uploadDate: "asc" },
        select: { uploadDate: true },
      });
      return first?.uploadDate ?? null;
    },
  },
  "comment:create": {
    windowMs: hour,
    limit: 30,
    message: "You can only add 30 comments per hour.",
    count: (userId, since) =>
      db.comment.count({ where: { authorId: userId, createdAt: { gte: since } } }),
    oldest: async (userId, since) => {
      const first = await db.comment.findFirst({
        where: { authorId: userId, createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      return first?.createdAt ?? null;
    },
  },
  "report:create": {
    windowMs: hour,
    limit: 10,
    message: "You can only submit 10 reports per hour.",
    count: (userId, since) =>
      db.report.count({ where: { reporterId: userId, createdAt: { gte: since } } }),
    oldest: async (userId, since) => {
      const first = await db.report.findFirst({
        where: { reporterId: userId, createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      return first?.createdAt ?? null;
    },
  },
  "post:vote": {
    windowMs: hour,
    limit: 120,
    message: "You can only vote on 120 posts per hour.",
    count: (userId, since) =>
      db.rating.count({ where: { userId, ratedAt: { gte: since } } }),
    oldest: async (userId, since) => {
      const first = await db.rating.findFirst({
        where: { userId, ratedAt: { gte: since } },
        orderBy: { ratedAt: "asc" },
        select: { ratedAt: true },
      });
      return first?.ratedAt ?? null;
    },
  },
  "comment:vote": {
    windowMs: hour,
    limit: 200,
    message: "You can only vote on 200 comments per hour.",
    count: (userId, since) =>
      db.commentVote.count({ where: { userId, updatedAt: { gte: since } } }),
    oldest: async (userId, since) => {
      const first = await db.commentVote.findFirst({
        where: { userId, updatedAt: { gte: since } },
        orderBy: { updatedAt: "asc" },
        select: { updatedAt: true },
      });
      return first?.updatedAt ?? null;
    },
  },
  "commit:create": {
    windowMs: hour,
    limit: 15,
    message: "You can only propose 15 code improvements per hour.",
    count: (userId, since) =>
      db.postCommit.count({ where: { authorId: userId, createdAt: { gte: since } } }),
    oldest: async (userId, since) => {
      const first = await db.postCommit.findFirst({
        where: { authorId: userId, createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      return first?.createdAt ?? null;
    },
  },
};

export async function assertRateLimit(userId: string, action: RateLimitAction) {
  const rule = rules[action];
  const since = new Date(Date.now() - rule.windowMs);
  const total = await rule.count(userId, since);

  if (total < rule.limit) return;

  const oldest = await rule.oldest(userId, since);
  const remainingMs = oldest ? rule.windowMs - (Date.now() - oldest.getTime()) : rule.windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

  throw new RateLimitError(rule.message, retryAfterSeconds);
}
