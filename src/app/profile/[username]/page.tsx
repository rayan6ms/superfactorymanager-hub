import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui";
import PostCard from "@/components/posts/PostCard";
import BuildCard from "@/components/builds/BuildCard";
import { db } from "@/lib/db";
import { fetchProfileBuildList } from "@/lib/builds/profile-list";
import { POST_CARD_INCLUDE, serializePost, type SerializedPost } from "@/lib/posts";

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

  const user = await db.user.findUnique({
    where: { name: normalized },
    select: {
      id: true,
      name: true,
      image: true,
      bio: true,
      createdAt: true,
    },
  });

  if (!user) {
    notFound();
  }
  if (!user.name) {
    notFound();
  }

  const session = await auth();
  const isOwnerView = session?.user?.id === user.id;

  const buildsResult = await fetchProfileBuildList(`/api/profile/${encodeURIComponent(user.name)}/builds`, {
    page: 1,
    pageSize: PREVIEW_LIMIT,
    includeAuthCookie: true,
  });
  const recentBuilds = buildsResult.data?.items ?? [];
  const hasBuildsError = !buildsResult.data;

  const totalPosts = await db.post.count({ where: { authorId: user.id, isDeleted: false } });
  const posts = await db.post.findMany({
    where: { authorId: user.id, isDeleted: false },
    orderBy: { uploadDate: "desc" },
    include: POST_CARD_INCLUDE,
    take: PREVIEW_LIMIT,
  });

  const serializedPosts: SerializedPost[] = posts.map(serializePost);
  const joined = formatDate(user.createdAt);
  const bio = user.bio?.trim();

  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
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

      <Card className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Shared builds</h2>
          <Link
            href={`/profile/${encodeURIComponent(user.name)}/builds`}
            className="text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline"
          >
            View all
          </Link>
        </div>
        {hasBuildsError ? (
          <p className="text-sm text-white/60">Unable to load builds right now.</p>
        ) : recentBuilds.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {recentBuilds.map((build) => (
              <li key={`${build.username}:${build.slug}`}>
                <BuildCard
                  username={build.username}
                  slug={build.slug}
                  name={build.nameOriginal}
                  visibility={build.visibility}
                  createdAt={build.createdAt}
                  updatedAt={build.updatedAt}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/60">No builds published yet.</p>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{isOwnerView ? "Your posts" : "Shared posts"}</h2>
          <div className="flex items-center gap-4">
            <span className="text-xs uppercase tracking-[0.3em] text-white/40">{totalPosts} posts</span>
            <Link
              href={`/profile/${encodeURIComponent(user.name)}/posts`}
              className="text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline"
            >
              View all
            </Link>
          </div>
        </div>
        {serializedPosts.length ? (
          <ul className="grid gap-5 md:grid-cols-2">
            {serializedPosts.map(post => (
              <PostCard key={post.id} post={post} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/60">No posts published yet.</p>
        )}
      </Card>
    </div>
  );
}
