import { db } from "@/lib/db";

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

export async function getProfileBuildList(
  username: string,
  options: { page: number; pageSize: number; viewerEmail?: string | null },
): Promise<ProfileBuildListResult> {
  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername) {
    return { status: 404, data: null };
  }

  const profile = await db.user.findUnique({
    where: { name: normalizedUsername },
    select: { id: true, name: true },
  });

  if (!profile?.name) {
    return { status: 404, data: null };
  }
  const profileName = profile.name;

  const viewer = options.viewerEmail
    ? await db.user.findUnique({
      where: { email: options.viewerEmail },
      select: { id: true },
    })
    : null;
  const isOwner = viewer?.id === profile.id;

  const where = {
    userId: profile.id,
    ...(isOwner ? {} : { visibility: "PUBLIC" as const }),
  };

  const [items, total] = await Promise.all([
    db.build.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      select: {
        slug: true,
        nameOriginal: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.build.count({ where }),
  ]);

  const payload: ProfileBuildListResponse = {
    items: items.map((item) => ({
      username: profileName,
      slug: item.slug,
      nameOriginal: item.nameOriginal,
      visibility: item.visibility,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    page: options.page,
    pageSize: options.pageSize,
    total,
  };

  return {
    status: 200,
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
