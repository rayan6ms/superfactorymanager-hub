import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import {
  type BuildVisibility,
  type ProfileBuildItem,
  type ProfileBuildListResponse,
} from "./profile-list-shared";

export { formatBuildDate, parseBuildPageSize } from "./profile-list-shared";

type ProfileBuildListResult = {
  status: number;
  data: ProfileBuildListResponse | null;
};

type CachedPublicProfileBuildListInput = {
  username: string;
  page: number;
  pageSize: number;
};

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
        && typeof candidate.tag === "string"
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

const getCachedPublicProfileBuildList = unstable_cache(
  async (options: CachedPublicProfileBuildListInput): Promise<ProfileBuildListResponse | null> => {
    const profile = await db.user.findUnique({
      where: { name: options.username },
      select: { id: true, name: true },
    });

    if (!profile?.name) {
      return null;
    }

    const where = {
      userId: profile.id,
      visibility: "PUBLIC" as const,
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
          tag: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.build.count({ where }),
    ]);

    return asBuildListResponse({
      items: items.map((item) => ({
        username: profile.name,
        slug: item.slug,
        nameOriginal: item.nameOriginal,
        tag: item.tag,
        visibility: item.visibility,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      page: options.page,
      pageSize: options.pageSize,
      total,
    });
  },
  ["public-profile-build-list"],
  { revalidate: 60 },
);

export async function getProfileBuildList(
  username: string,
  options: { page: number; pageSize: number; viewerEmail?: string | null },
): Promise<ProfileBuildListResult> {
  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername) {
    return { status: 404, data: null };
  }

  if (!options.viewerEmail) {
    const data = await getCachedPublicProfileBuildList({
      username: normalizedUsername,
      page: options.page,
      pageSize: options.pageSize,
    });

    return data
      ? { status: 200, data }
      : { status: 404, data: null };
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
        tag: true,
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
      tag: item.tag,
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
