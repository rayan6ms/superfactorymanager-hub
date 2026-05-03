import "server-only";

import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { BUILD_CARD_SELECT, type SerializedBuild } from "@/lib/builds/search";
import { db } from "@/lib/db";
import {
  POST_CARD_SELECT,
  serializePost,
  type SerializedPost,
} from "@/lib/posts";

const PREVIEW_LIMIT = 4;

type PublicProfileIdentity = {
  id: string;
  name: string;
};

type PublicProfileUser = {
  id: string;
  name: string;
  image: string | null;
  bio: string | null;
  createdAt: Date;
};

type PublicProfileOverview = {
  user: PublicProfileUser;
  recentBuilds: SerializedBuild[];
  totalBuilds: number;
  totalPosts: number;
  recentPosts: SerializedPost[];
};

type CachedSerializedBuild = Omit<SerializedBuild, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

type CachedSerializedPost = Omit<SerializedPost, "uploadDate"> & {
  uploadDate: string;
};

type CachedPublicProfileOverview = {
  user: Omit<PublicProfileUser, "createdAt"> & {
    createdAt: string;
  };
  recentBuilds: CachedSerializedBuild[];
  totalBuilds: number;
  totalPosts: number;
  recentPosts: CachedSerializedPost[];
};

type BuildWithUser = Prisma.BuildGetPayload<{ select: typeof BUILD_CARD_SELECT }>;

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function serializeBuild(build: BuildWithUser): SerializedBuild | null {
  const username = build.user.name?.trim();
  if (!username) return null;

  return {
    username,
    authorImage: build.user.image,
    slug: build.slug,
    nameOriginal: build.nameOriginal,
    tag: build.tag,
    visibility: build.visibility,
    createdAt: build.createdAt,
    updatedAt: build.updatedAt,
  };
}

function toCachedBuild(build: SerializedBuild): CachedSerializedBuild {
  return {
    ...build,
    createdAt: build.createdAt.toISOString(),
    updatedAt: build.updatedAt.toISOString(),
  };
}

function fromCachedBuild(build: CachedSerializedBuild): SerializedBuild {
  return {
    ...build,
    createdAt: new Date(build.createdAt),
    updatedAt: new Date(build.updatedAt),
  };
}

function toCachedPost(post: SerializedPost): CachedSerializedPost {
  return {
    ...post,
    uploadDate: post.uploadDate.toISOString(),
  };
}

function fromCachedPost(post: CachedSerializedPost): SerializedPost {
  return {
    ...post,
    uploadDate: new Date(post.uploadDate),
  };
}

const getCachedPublicProfileIdentity = unstable_cache(
  async (username: string): Promise<PublicProfileIdentity | null> => {
    const user = await db.user.findUnique({
      where: { name: username },
      select: { id: true, name: true },
    });

    return user?.name
      ? { id: user.id, name: user.name }
      : null;
  },
  ["public-profile-identity"],
  { revalidate: 60 },
);

const getCachedPublicProfileOverview = unstable_cache(
  async (username: string): Promise<CachedPublicProfileOverview | null> => {
    const user = await db.user.findUnique({
      where: { name: username },
      select: {
        id: true,
        name: true,
        image: true,
        bio: true,
        createdAt: true,
      },
    });

    if (!user?.name) {
      return null;
    }

    const profileName = user.name;

    const [recentBuilds, totalBuilds, totalPosts, posts] = await Promise.all([
      db.build.findMany({
        where: {
          userId: user.id,
          visibility: "PUBLIC",
        },
        orderBy: { createdAt: "desc" },
        take: PREVIEW_LIMIT,
        select: BUILD_CARD_SELECT,
      }),
      db.build.count({
        where: {
          userId: user.id,
          visibility: "PUBLIC",
        },
      }),
      db.post.count({ where: { authorId: user.id, isDeleted: false } }),
      db.post.findMany({
        where: { authorId: user.id, isDeleted: false },
        orderBy: { uploadDate: "desc" },
        select: POST_CARD_SELECT,
        take: PREVIEW_LIMIT,
      }),
    ]);

    return {
      user: {
        id: user.id,
        name: profileName,
        image: user.image,
        bio: user.bio,
        createdAt: user.createdAt.toISOString(),
      },
      recentBuilds: recentBuilds
        .map(serializeBuild)
        .filter((build): build is SerializedBuild => Boolean(build))
        .map(toCachedBuild),
      totalBuilds,
      totalPosts,
      recentPosts: posts.map((post) => toCachedPost(serializePost(post))),
    };
  },
  ["public-profile-overview"],
  { revalidate: 60 },
);

export async function getPublicProfileIdentity(username: string) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  return getCachedPublicProfileIdentity(normalized);
}

export async function getPublicProfileOverview(username: string): Promise<PublicProfileOverview | null> {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  const result = await getCachedPublicProfileOverview(normalized);
  if (!result) return null;

  return {
    user: {
      ...result.user,
      createdAt: new Date(result.user.createdAt),
    },
    recentBuilds: result.recentBuilds.map(fromCachedBuild),
    totalBuilds: result.totalBuilds,
    totalPosts: result.totalPosts,
    recentPosts: result.recentPosts.map(fromCachedPost),
  };
}
