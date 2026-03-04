import Link from "next/link";
import { notFound } from "next/navigation";
import PostCard from "@/components/posts/PostCard";
import PostsFilterBar from "@/components/posts/PostsFilterBar";
import Card from "@/components/ui/Card";
import Pagination from "@/components/ui/Pagination";
import { getCategoryOptions } from "@/lib/categories";
import { db } from "@/lib/db";
import { searchPostsWithFilters, type PostsFilterOptions } from "@/lib/posts";
import { parsePageParam } from "@/lib/pagination";
import { getSfmMatrix } from "@/lib/sfm";

const ORDER_VALUES: PostsFilterOptions["order"][] = [
  "best",
  "newest",
  "oldest",
  "highest-rating",
  "lowest-rating",
  "most-views",
  "least-views",
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  params: Promise<{ username: string }>;
  searchParams?: SearchParams;
};

function getParam(
  params: Record<string, string | string[] | undefined> | undefined,
  key: string,
) {
  const value = params?.[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function parsePageSizeParam(value: string) {
  if (!value.trim()) return 6;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 6;
  return Math.max(1, Math.min(Math.floor(parsed), 50));
}

export default async function UserPostsPage({ params, searchParams }: Props) {
  const { username } = await params;
  const resolved = searchParams ? await searchParams : undefined;

  const q = getParam(resolved, "q");
  const orderParam = getParam(resolved, "order");
  const minRatingParam = getParam(resolved, "minRating");
  const category = getParam(resolved, "category");
  const gameVersion = getParam(resolved, "gameVersion");
  const sfmVersion = getParam(resolved, "sfmVersion");
  const pageParam = getParam(resolved, "page");
  const pageSizeParam = getParam(resolved, "pageSize");

  const order = ORDER_VALUES.includes(orderParam as PostsFilterOptions["order"])
    ? (orderParam as PostsFilterOptions["order"])
    : "most-views";
  const minRatingNumber = Number(minRatingParam) || undefined;
  const requestedPage = parsePageParam(pageParam, 1);
  const pageSize = parsePageSizeParam(pageSizeParam);

  const user = await db.user.findUnique({
    where: { name: username.trim().toLowerCase() },
    select: { id: true, name: true },
  });

  if (!user?.name) {
    notFound();
  }

  const [categories, sfmMatrix] = await Promise.all([
    getCategoryOptions(),
    getSfmMatrix(false),
  ]);

  const fetchPage = (page: number) =>
    searchPostsWithFilters({
      q: q.trim() || undefined,
      order,
      minRating: minRatingNumber,
      categoryKey: category || undefined,
      gameVersion: gameVersion || undefined,
      sfmVersion: sfmVersion || undefined,
      authorId: user.id,
      limit: pageSize,
      page,
    });

  const initialResult = await fetchPage(requestedPage);
  const totalPages = Math.max(1, Math.ceil(initialResult.total / pageSize));
  const activePage = Math.min(requestedPage, totalPages);
  const finalResult = activePage === requestedPage ? initialResult : await fetchPage(activePage);
  const posts = finalResult.posts;

  const profilePath = `/profile/${encodeURIComponent(user.name)}/posts`;
  const buildPageHref = (page: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (order) query.set("order", order);
    if (minRatingParam) query.set("minRating", minRatingParam);
    if (category) query.set("category", category);
    if (gameVersion) query.set("gameVersion", gameVersion);
    if (sfmVersion) query.set("sfmVersion", sfmVersion);
    if (pageSize !== 6) query.set("pageSize", String(pageSize));
    if (page > 1) query.set("page", String(page));
    const suffix = query.toString();
    return suffix ? `${profilePath}?${suffix}` : profilePath;
  };

  return (
    <main className="flex flex-col gap-6 pb-12 pt-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Shared posts</h1>
        <p className="text-sm text-white/60">Posts by {user.name}</p>
        <Link
          href={`/profile/${encodeURIComponent(user.name)}`}
          className="inline-flex text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline"
        >
          ← Back to profile
        </Link>
      </div>

      <PostsFilterBar
        action={profilePath}
        hiddenParams={pageSize !== 6 ? { pageSize: String(pageSize) } : undefined}
        categories={categories}
        gameVersions={sfmMatrix.gameVersions}
        sfmByGame={sfmMatrix.byGame}
        initialQuery={q}
        initialOrder={order}
        initialMinRating={minRatingParam}
        initialCategory={category}
        initialGameVersion={gameVersion}
        initialSfmVersion={sfmVersion}
      />

      <section className="space-y-4">
        {posts.length ? (
          <ul className="grid gap-5 md:grid-cols-2">
            {posts.map(post => (
              <PostCard key={post.id} post={post} />
            ))}
          </ul>
        ) : (
          <Card className="p-8 text-center text-white/70">No posts yet.</Card>
        )}

        <Pagination
          currentPage={activePage}
          pageSize={pageSize}
          total={finalResult.total}
          buildHref={buildPageHref}
        />
      </section>
    </main>
  );
}
