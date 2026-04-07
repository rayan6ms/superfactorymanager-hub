import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui";
import PostCard from "@/components/posts/PostCard";
import BuildCard from "@/components/builds/BuildCard";
import { db } from "@/lib/db";
import { POST_CARD_SELECT, serializePost, type SerializedPost } from "@/lib/posts";
import { getPublicProfileOverview } from "@/lib/public-profile";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
  }).format(value);
}

function getInitial(name: string | null | undefined) {
  const base = name?.trim();
  if (!base) return "?";
  return base.charAt(0).toUpperCase();
}

export default async function PublicProfilePage(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params;
  const PREVIEW_LIMIT = 4;
  const normalized = username.toLowerCase();

  const session = await auth();
  const publicOverview = await getPublicProfileOverview(normalized);
  const ownerId = publicOverview?.user.id
    ?? (await db.user.findUnique({
      where: { name: normalized },
      select: { id: true },
    }))?.id
    ?? null;

  if (!ownerId) {
    notFound();
  }

  const isOwnerView = session?.user?.id === ownerId;

  let user = publicOverview?.user ?? null;
  let recentBuilds = publicOverview?.recentBuilds ?? [];
  let totalBuilds = publicOverview?.totalBuilds ?? 0;
  let totalPosts = publicOverview?.totalPosts ?? 0;
  let serializedPosts: SerializedPost[] = publicOverview?.recentPosts ?? [];

  if (isOwnerView) {
    const [ownerViewData, totalBuildCount, totalPostCount] = await Promise.all([
      db.user.findUnique({
        where: { id: ownerId },
        select: {
          id: true,
          name: true,
          image: true,
          bio: true,
          createdAt: true,
          builds: {
            orderBy: { createdAt: "desc" },
            take: PREVIEW_LIMIT,
            select: {
              slug: true,
              nameOriginal: true,
              tag: true,
              visibility: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          posts: {
            where: { isDeleted: false },
            orderBy: { uploadDate: "desc" },
            select: POST_CARD_SELECT,
            take: PREVIEW_LIMIT,
          },
        },
      }),
      db.build.count({ where: { userId: ownerId } }),
      db.post.count({ where: { authorId: ownerId, isDeleted: false } }),
    ]);

    if (!ownerViewData?.name) {
      notFound();
    }
    const ownerName = ownerViewData.name;

    user = {
      id: ownerViewData.id,
      name: ownerName,
      image: ownerViewData.image,
      bio: ownerViewData.bio,
      createdAt: ownerViewData.createdAt,
    };
    recentBuilds = ownerViewData.builds.map((build) => ({
      username: ownerName,
      slug: build.slug,
      nameOriginal: build.nameOriginal,
      tag: build.tag,
      visibility: build.visibility,
      createdAt: build.createdAt,
      updatedAt: build.updatedAt,
    }));
    totalBuilds = totalBuildCount;
    totalPosts = totalPostCount;
    serializedPosts = ownerViewData.posts.map(serializePost);
  }

  if (!user) {
    notFound();
  }

  const profileUsername = user.name;
  const joined = formatDate(user.createdAt);
  const bio = user.bio?.trim();
  const buildsSectionTitle = isOwnerView ? "Your builds" : "Shared builds";
  const emptyBuildsMessage = isOwnerView ? "You haven't saved any builds yet." : "No builds published yet.";

  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-4 p-6 backdrop-blur-none sm:flex-row sm:items-center sm:backdrop-blur-sm">
        {user.image ? (
          <span
            className="h-20 w-20 shrink-0 rounded-full border border-white/10 bg-cover bg-center"
            style={{ backgroundImage: `url(${user.image})` }}
            aria-hidden="true"
          />
        ) : (
          <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-2xl font-semibold text-white">
            {getInitial(user.name)}
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold text-white">{user.name}</h1>
          <p className="text-sm text-white/60">Joined {joined}</p>
          {bio ? (
            <p className="text-sm italic text-white/70">“{bio}”</p>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-4 p-6 backdrop-blur-none sm:backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{buildsSectionTitle}</h2>
          <div className="flex items-center gap-4">
            <span className="text-xs uppercase tracking-[0.3em] text-white/40">{totalBuilds} builds</span>
            <Link
              href={`/profile/${encodeURIComponent(user.name)}/builds`}
              className="text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline"
            >
              View all
            </Link>
          </div>
        </div>
        {recentBuilds.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {recentBuilds.map((build) => (
              <li key={`${profileUsername}:${build.slug}`}>
                <BuildCard
                  username={profileUsername}
                  slug={build.slug}
                  name={build.nameOriginal ?? build.slug}
                  tag={build.tag}
                  visibility={build.visibility}
                  createdAt={build.createdAt}
                  updatedAt={build.updatedAt}
                  showVisibility={isOwnerView}
                  backTo="profile"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/60">{emptyBuildsMessage}</p>
        )}
      </Card>

      <Card className="space-y-4 p-6 backdrop-blur-none sm:backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{isOwnerView ? "Your posts" : "Shared posts"}</h2>
          <div className="flex items-center gap-4">
            <span className="text-xs uppercase tracking-[0.3em] text-white/40">{totalPosts} posts</span>
            <Link
              href={`/profile/${encodeURIComponent(profileUsername)}/posts`}
              className="text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline"
            >
              View all
            </Link>
          </div>
        </div>
        {serializedPosts.length ? (
          <ul className="grid gap-5 md:grid-cols-2">
            {serializedPosts.map(post => (
              <PostCard key={post.id} post={post} compact />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/60">No posts published yet.</p>
        )}
      </Card>
    </div>
  );
}
