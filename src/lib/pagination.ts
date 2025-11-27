export function parsePageParam(value: string | string[] | undefined, defaultPage = 1): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultPage;
  const page = Math.max(Math.floor(parsed), 1);
  return page || defaultPage;
}

export function getTotalPages(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}
