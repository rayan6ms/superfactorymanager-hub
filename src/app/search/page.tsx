import Link from "next/link";
import HideHeaderSearch from "@/components/layout/HideHeaderSearch";
import BuildCard from "@/components/builds/BuildCard";
import PostCard from "@/components/posts/PostCard";
import SearchBar from "@/components/ui/Search";
import Card from "@/components/ui/Card";
import { searchPublicBuildsWithFilters } from "@/lib/builds/search";
import { searchPostsWithFilters } from "@/lib/posts";

const DEFAULT_SECTION_LIMIT = 12;
const MAX_SECTION_LIMIT = 60;
const LIMIT_STEP = 12;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
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

function parseSectionLimit(value: string) {
  if (!value.trim()) return DEFAULT_SECTION_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SECTION_LIMIT;
  return Math.max(1, Math.min(MAX_SECTION_LIMIT, Math.floor(parsed)));
}

export default async function SearchPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : undefined;
  const q = getParam(params, "q");
  const trimmedQuery = q.trim();
  const postsLimit = parseSectionLimit(getParam(params, "postsLimit"));
  const buildsLimit = parseSectionLimit(getParam(params, "buildsLimit"));

  const [postResult, buildResult] = trimmedQuery
    ? await Promise.all([
      searchPostsWithFilters({ q: trimmedQuery, order: "best", limit: postsLimit, page: 1 }),
      searchPublicBuildsWithFilters({ q: trimmedQuery, order: "best", limit: buildsLimit, page: 1 }),
    ])
    : [{ posts: [], total: 0 }, { builds: [], total: 0 }];

  const buildSearchHref = (opts?: {
    postsLimit?: number;
    buildsLimit?: number;
    anchor?: "#posts-results" | "#builds-results";
  }) => {
    const query = new URLSearchParams();
    if (trimmedQuery) query.set("q", trimmedQuery);

    const nextPostsLimit = opts?.postsLimit ?? postsLimit;
    const nextBuildsLimit = opts?.buildsLimit ?? buildsLimit;

    if (nextPostsLimit !== DEFAULT_SECTION_LIMIT) query.set("postsLimit", String(nextPostsLimit));
    if (nextBuildsLimit !== DEFAULT_SECTION_LIMIT) query.set("buildsLimit", String(nextBuildsLimit));

    const suffix = query.toString();
    const base = suffix ? `/search?${suffix}` : "/search";
    return opts?.anchor ? `${base}${opts.anchor}` : base;
  };

  const postsHref = trimmedQuery
    ? `/posts?${new URLSearchParams({ q: trimmedQuery }).toString()}`
    : "/posts";
  const buildsHref = trimmedQuery
    ? `/builds?${new URLSearchParams({ q: trimmedQuery }).toString()}`
    : "/builds";

  const showMorePosts = postResult.total > postResult.posts.length && postsLimit < MAX_SECTION_LIMIT;
  const showMoreBuilds = buildResult.total > buildResult.builds.length && buildsLimit < MAX_SECTION_LIMIT;

  const showMorePostsHref = buildSearchHref({
    postsLimit: Math.min(postsLimit + LIMIT_STEP, MAX_SECTION_LIMIT),
    anchor: "#posts-results",
  });
  const showMoreBuildsHref = buildSearchHref({
    buildsLimit: Math.min(buildsLimit + LIMIT_STEP, MAX_SECTION_LIMIT),
    anchor: "#builds-results",
  });

  const currentSearchHref = buildSearchHref();

  return (
    <div className="space-y-8">
      <HideHeaderSearch />

      <div className="space-y-3">
        <p className="eyebrow">Search</p>
        <h1 className="text-3xl font-semibold text-white">Find posts and builds</h1>
        <p className="text-white/70">Search once and browse both content types below.</p>
      </div>

      <SearchBar
        action="/search"
        placeholder="Search posts and builds"
        defaultValue={q}
      />

      {!trimmedQuery ? (
        <Card className="p-8 text-center text-white/70">Enter a search term to see posts and builds.</Card>
      ) : (
        <>
          <section id="posts-results" className="space-y-4 scroll-mt-24">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-white">Posts ({postResult.total})</h2>
              <Link href={postsHref} className="text-sm font-semibold text-brand-300">
                View all matching posts →
              </Link>
            </div>

            {postResult.posts.length ? (
              <>
                <p className="text-sm text-white/60">Showing {postResult.posts.length} of {postResult.total} posts</p>
                <ul className="grid gap-5 md:grid-cols-2">
                  {postResult.posts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </ul>
                {showMorePosts ? (
                  <div>
                    <Link href={showMorePostsHref} className="inline-flex rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85 transition hover:border-white/35 hover:text-white">
                      Show more posts
                    </Link>
                  </div>
                ) : null}
              </>
            ) : (
              <Card className="p-8 text-center text-white/70">No posts found for “{trimmedQuery}”.</Card>
            )}
          </section>

          <section id="builds-results" className="space-y-4 scroll-mt-24">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-white">Builds ({buildResult.total})</h2>
              <Link href={buildsHref} className="text-sm font-semibold text-brand-300">
                View all matching builds →
              </Link>
            </div>

            {buildResult.builds.length ? (
              <>
                <p className="text-sm text-white/60">Showing {buildResult.builds.length} of {buildResult.total} builds</p>
                <ul className="grid gap-5 md:grid-cols-2">
                  {buildResult.builds.map((build) => (
                    <li key={`${build.username}:${build.slug}`}>
                      <BuildCard
                        username={build.username}
                        slug={build.slug}
                        name={build.nameOriginal}
                        visibility={build.visibility}
                        createdAt={build.createdAt}
                        updatedAt={build.updatedAt}
                        backTo="search"
                        backHref={`${currentSearchHref}#builds-results`}
                      />
                    </li>
                  ))}
                </ul>
                {showMoreBuilds ? (
                  <div>
                    <Link href={showMoreBuildsHref} className="inline-flex rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85 transition hover:border-white/35 hover:text-white">
                      Show more builds
                    </Link>
                  </div>
                ) : null}
              </>
            ) : (
              <Card className="p-8 text-center text-white/70">No builds found for “{trimmedQuery}”.</Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
