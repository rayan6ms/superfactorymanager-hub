export const WILSON_Z_80 = 1.2815515655446004 as const;

export type WilsonInterval = {
  lower: number;
  upper: number;
  center: number;
  n: number;
};

export function wilsonInterval(
  upvotes: number,
  downvotes: number,
  z: number = WILSON_Z_80,
): WilsonInterval {
  const u = Math.max(0, Math.floor(upvotes));
  const d = Math.max(0, Math.floor(downvotes));
  const n = u + d;

  if (n <= 0) {
    return { lower: 0, upper: 0, center: 0, n: 0 };
  }

  const p = u / n;
  const z2 = z * z;

  const denom = 1 + z2 / n;
  const centerAdj = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);

  const lower = Math.max(0, (centerAdj - margin) / denom);
  const upper = Math.min(1, (centerAdj + margin) / denom);

  return { lower, upper, center: p, n };
}

export function wilsonScore(
  upvotes: number,
  downvotes: number,
  z: number = WILSON_Z_80,
): number {
  return wilsonInterval(upvotes, downvotes, z).lower;
}

export function splitVotesFromScore(score: number, totalVotes: number) {
  const safeTotal = Math.max(0, Math.round(totalVotes));
  const safeScore = Math.round(score);

  const clampedScore = Math.max(-safeTotal, Math.min(safeTotal, safeScore));

  const upvotes = Math.max(0, Math.round((safeTotal + clampedScore) / 2));
  const downvotes = Math.max(0, safeTotal - upvotes);

  return { upvotes, downvotes, totalVotes: safeTotal };
}
