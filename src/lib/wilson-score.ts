export function wilsonScore(upvotes: number, downvotes: number, z = 1.96): number {
  const total = Math.max(0, upvotes) + Math.max(0, downvotes);
  if (total === 0) return 0;

  const p = Math.max(0, Math.min(1, upvotes / total));
  const zSquared = z * z;
  const numerator =
    p + zSquared / (2 * total) - z * Math.sqrt((p * (1 - p) + zSquared / (4 * total)) / total);
  const denominator = 1 + zSquared / total;

  return Math.max(0, numerator / denominator);
}

export function splitVotesFromScore(score: number, totalVotes: number) {
  const safeTotal = Math.max(0, totalVotes);
  const safeScore = Math.trunc(score);
  const upvotes = Math.max(0, Math.round((safeTotal + safeScore) / 2));
  const downvotes = Math.max(0, safeTotal - upvotes);
  return { upvotes, downvotes, totalVotes: safeTotal };
}
