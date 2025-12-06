import HideHeaderSearch from "@/components/layout/HideHeaderSearch";
import PostCard from "@/components/posts/PostCard";
import PostsFilterBar from "@/components/posts/PostsFilterBar";
import Card from "@/components/ui/Card";
import Pagination from "@/components/ui/Pagination";
import { db } from "@/lib/db";
import {
  POST_CARD_INCLUDE,
  searchPostsWithFilters,
  serializePost,
  type PostWithRelations,
  type PostsFilterOptions,
} from "@/lib/posts";
import { parsePageParam, getTotalPages } from "@/lib/pagination";
import { getSfmMatrix } from "@/lib/sfm";
import { searchPostsHybrid } from "@/lib/search-db";

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
  searchParams?: SearchParams;
};

function getParam(
  params: Record<string, string | string[] | undefined> | undefined,
  key: string
) {
  const value = params?.[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

export default async function PostsPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : undefined;

  const q = getParam(params, "q");
  const orderParam = getParam(params, "order");
  const minRatingParam = getParam(params, "minRating");
  const category = getParam(params, "category");
  const gameVersion = getParam(params, "gameVersion");
  const sfmVersion = getParam(params, "sfmVersion");
  const pageParam = getParam(params, "page");

  const order = ORDER_VALUES.includes(orderParam as PostsFilterOptions["order"])
    ? (orderParam as PostsFilterOptions["order"])
    : "most-views";

  const minRatingNumber = Number(minRatingParam) || undefined;
  const requestedPage = parsePageParam(pageParam, 1);
  const PAGE_SIZE = 30;
  const trimmedQuery = q.trim();
  const hasQuery = Boolean(trimmedQuery);

  const [categories, sfmMatrix] = await Promise.all([
    db.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, key: true, name: true },
    }),
    getSfmMatrix(false),
  ]);

  const fetchSearchPage = async (pageNumber: number) => {
    const { results, total } = await searchPostsHybrid({
      q: trimmedQuery,
      limit: PAGE_SIZE,
      offset: (pageNumber - 1) * PAGE_SIZE,
      filters: {
        minRating: minRatingNumber,
        categoryKey: category || undefined,
        gameVersion: gameVersion || undefined,
        sfmVersion: sfmVersion || undefined,
      },
    });

    const ids = results.map(result => result.id);
    const posts = ids.length
      ? await db.post.findMany({ where: { id: { in: ids } }, include: POST_CARD_INCLUDE })
      : [];
    const map = new Map(posts.map(post => [post.id, post]));
    const ordered = ids
      .map(id => map.get(id))
      .filter((post): post is PostWithRelations => Boolean(post))
      .map(serializePost);

    return { posts: ordered, total };
  };

  const fetchFilteredPage = (pageNumber: number) =>
    searchPostsWithFilters({
      q: hasQuery ? trimmedQuery : undefined,
      order,
      minRating: minRatingNumber,
      categoryKey: category || undefined,
      gameVersion: gameVersion || undefined,
      sfmVersion: sfmVersion || undefined,
      limit: PAGE_SIZE,
      page: pageNumber,
    });

  const initialResult = hasQuery ? await fetchSearchPage(requestedPage) : await fetchFilteredPage(requestedPage);

  const totalPages = getTotalPages(initialResult.total, PAGE_SIZE);
  const activePage = Math.min(requestedPage, totalPages);
  const needsRefetch = activePage !== requestedPage;
  const finalResult = needsRefetch
    ? hasQuery
      ? await fetchSearchPage(activePage)
      : await fetchFilteredPage(activePage)
    : initialResult;

  const posts = finalResult.posts;
  const buildPageHref = (page: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (order) query.set("order", order);
    if (minRatingParam) query.set("minRating", minRatingParam);
    if (category) query.set("category", category);
    if (gameVersion) query.set("gameVersion", gameVersion);
    if (sfmVersion) query.set("sfmVersion", sfmVersion);
    if (page > 1) query.set("page", String(page));
    const suffix = query.toString();
    return suffix ? `/posts?${suffix}` : "/posts";
  };

  return (
    <div className="space-y-8">
      <HideHeaderSearch />
      <div className="space-y-3">
        <p className="eyebrow">Posts</p>
        <h1 className="text-3xl font-semibold text-white">Explore posts</h1>
        <p className="text-white/70">Dial in your search using the filters below.</p>
      </div>

      <PostsFilterBar
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-white">
            Showing {posts.length} {posts.length === 1 ? "post" : "posts"}
          </h2>
          {q && <p className="text-sm text-white/60">for “{q}”</p>}
        </div>
        {posts.length ? (
          <ul className="grid gap-5 md:grid-cols-2">
            {posts.map(post => (
              <PostCard key={post.id} post={post} />
            ))}
          </ul>
        ) : (
          <Card className="p-8 text-center text-white/70">No posts match the selected filters.</Card>
        )}

        <Pagination
          currentPage={activePage}
          pageSize={PAGE_SIZE}
          total={finalResult.total}
          buildHref={buildPageHref}
          className="pt-2"
        />
      </section>
    </div>
  );
}
