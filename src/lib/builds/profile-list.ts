import { cookies, headers } from "next/headers";
import { getBaseUrl } from "@/lib/urls";

const DEFAULT_PAGE_SIZE = 20;

export type BuildVisibility = "PUBLIC" | "PRIVATE";

export type ProfileBuildItem = {
  username: string;
  slug: string;
  nameOriginal: string;
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

type ProfileBuildListResult = {
  status: number;
  data: ProfileBuildListResponse | null;
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

function isBuildVisibility(value: unknown): value is BuildVisibility {
  return value === "PUBLIC" || value === "PRIVATE";
}

function asBuildListResponse(payload: unknown): ProfileBuildListResponse | null {
  if (!payload || typeof payload !== "object") return null;

  const raw = payload as Partial<ProfileBuildListResponse>;
  if (!Array.isArray(raw.items)) return null;
  if (typeof raw.page !== "number" || typeof raw.pageSize !== "number" || typeof raw.total !== "number") {
    return null;
  }

  const items = raw.items
    .filter((item): item is ProfileBuildItem => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<ProfileBuildItem>;
      return (
        typeof candidate.username === "string"
        && typeof candidate.slug === "string"
        && typeof candidate.nameOriginal === "string"
        && isBuildVisibility(candidate.visibility)
        && typeof candidate.createdAt === "string"
        && typeof candidate.updatedAt === "string"
      );
    });

  return {
    items,
    page: raw.page,
    pageSize: raw.pageSize,
    total: raw.total,
  };
}

async function getRequestOrigin() {
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");

  if (host) {
    const protocol = forwardedProto ?? (process.env.NODE_ENV === "development" ? "http" : "https");
    return `${protocol}://${host}`;
  }

  return getBaseUrl();
}

export async function fetchProfileBuildList(
  pathname: string,
  options: { page: number; pageSize: number; includeAuthCookie?: boolean },
): Promise<ProfileBuildListResult> {
  const searchParams = new URLSearchParams({
    page: String(options.page),
    pageSize: String(options.pageSize),
  });
  const origin = await getRequestOrigin();
  const url = `${origin}${pathname}?${searchParams.toString()}`;

  const requestHeaders = new Headers();
  if (options.includeAuthCookie) {
    const cookieHeader = (await cookies()).toString();
    if (cookieHeader) {
      requestHeaders.set("cookie", cookieHeader);
    }
  }

  const response = await fetch(url, {
    method: "GET",
    headers: requestHeaders,
    cache: "no-store",
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return {
    status: response.status,
    data: asBuildListResponse(payload),
  };
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
