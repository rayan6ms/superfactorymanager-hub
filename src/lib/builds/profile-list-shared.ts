const DEFAULT_PAGE_SIZE = 20;

export type BuildVisibility = "PUBLIC" | "PRIVATE";

export type ProfileBuildItem = {
  username: string;
  slug: string;
  nameOriginal: string;
  tag: string;
  visibility: BuildVisibility;
  createdAt: string;
  updatedAt: string;
};

export type ProfileBuildListResponse = {
  items: ProfileBuildItem[];
  page: number;
  pageSize: number;
  total: number;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseBuildPageSize(value: string | string[] | undefined, fallback = DEFAULT_PAGE_SIZE) {
  const raw = firstValue(value);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

export function formatBuildDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
