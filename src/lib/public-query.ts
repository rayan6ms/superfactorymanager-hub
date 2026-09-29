/**
 * Keep public listing/search requests bounded so malformed crawler URLs cannot
 * create unbounded cache keys or force expensive database offsets.
 */
export const MAX_PUBLIC_QUERY_LENGTH = 100;
export const MAX_PUBLIC_PAGE = 100;

export function normalizePublicQuery(value: string | null | undefined) {
  return value?.trim().slice(0, MAX_PUBLIC_QUERY_LENGTH) ?? "";
}

export function normalizePublicPage(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_PUBLIC_PAGE, Math.max(1, Math.floor(value)));
}
