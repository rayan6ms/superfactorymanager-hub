export type NormalizedTag = { name: string; slug: string };

const SLUG_SANITIZE = /[^a-z0-9]+/g;

export function normalizeTag(input: string): NormalizedTag {
  const collapsed = input.trim().replace(/\s+/g, " ");
  const lower = collapsed.toLowerCase();
  const slug = lower.replace(SLUG_SANITIZE, "-").replace(/^-+|-+$/g, "");
  return { name: collapsed, slug };
}

export function normalizeTags(inputs: string[]): NormalizedTag[] {
  const seen = new Set<string>();
  const result: NormalizedTag[] = [];
  for (const value of inputs) {
    const normalized = normalizeTag(value);
    if (!normalized.slug) continue;
    if (seen.has(normalized.slug)) continue;
    seen.add(normalized.slug);
    result.push(normalized);
  }
  return result;
}
