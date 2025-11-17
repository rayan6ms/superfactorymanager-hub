import HideHeaderSearch from "@/components/layout/HideHeaderSearch";
import PostCard from "@/components/posts/PostCard";
import PostsFilterBar from "@/components/posts/PostsFilterBar";
import Card from "@/components/ui/Card";
import { db } from "@/lib/db";
import { searchPostsWithFilters, type PostsFilterOptions } from "@/lib/posts";
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

type Props = {
  searchParams?: Record<string, string | string[]>;
};

function getParam(searchParams: Props["searchParams"], key: string) {
  const value = searchParams?.[key];
  return typeof value === "string" ? value : "";
}

export default async function PostsPage({ searchParams }: Props) {
  const q = getParam(searchParams, "q");
  const orderParam = getParam(searchParams, "order");
  const minRatingParam = getParam(searchParams, "minRating");
  const category = getParam(searchParams, "category");
  const gameVersion = getParam(searchParams, "gameVersion");
  const sfmVersion = getParam(searchParams, "sfmVersion");

  const order = (ORDER_VALUES.includes(orderParam as PostsFilterOptions["order"])
    ? (orderParam as PostsFilterOptions["order"])
    : "most-views");
  const minRatingNumber = Number(minRatingParam) || undefined;

  const [categories, sfmMatrix, posts] = await Promise.all([
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, key: true, name: true } }),
    getSfmMatrix(false),
    searchPostsWithFilters({
      q: q || undefined,
      order,
      minRating: minRatingNumber,
      categoryKey: category || undefined,
      gameVersion: gameVersion || undefined,
      sfmVersion: sfmVersion || undefined,
      limit: 30,
    }),
  ]);

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
      </section>
    </div>
  );
}
