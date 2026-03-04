import Link from "next/link";
import Card from "@/components/ui/Card";
import PostCard from "@/components/posts/PostCard";
import BuildCard from "@/components/builds/BuildCard";
import HomeQuickLinks from "@/components/home/HomeQuickLinks";
import { db } from "@/lib/db";
import {
  searchPublicBuildsWithFilters,
  type SerializedBuild,
} from "@/lib/builds/search";
import {
  getPopularTags,
  getTrendingPosts,
  getRecentPosts,
  getRecommendedPosts,
  type SerializedPost,
} from "@/lib/posts";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  searchParams?: SearchParams;
};

const HOME_SECTION_LIMIT = 4;

function PostSection({
  title,
  posts,
  total,
}: {
  title: string;
  posts: SerializedPost[];
  total: number;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <span className="text-xs uppercase tracking-[0.35em] text-white/40">{total} posts</span>
      </div>
      {posts.length ? (
        <ul className="grid gap-5 md:grid-cols-2">
          {posts.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </ul>
      ) : (
        <Card className="p-6 text-center text-white/70">No posts yet.</Card>
      )}
    </section>
  );
}

function BuildSection({
  title,
  builds,
  total,
  backHref,
}: {
  title: string;
  builds: SerializedBuild[];
  total: number;
  backHref?: string;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <span className="text-xs uppercase tracking-[0.35em] text-white/40">{total} builds</span>
      </div>
      {builds.length ? (
        <ul className="grid gap-5 md:grid-cols-2">
          {builds.map((build) => (
            <li key={`${build.username}:${build.slug}`}>
              <BuildCard
                username={build.username}
                slug={build.slug}
                name={build.nameOriginal}
                tag={build.tag}
                visibility={build.visibility}
                createdAt={build.createdAt}
                updatedAt={build.updatedAt}
                backTo="home"
                backHref={backHref}
              />
            </li>
          ))}
        </ul>
      ) : (
        <Card className="p-6 text-center text-white/70">No builds yet.</Card>
      )}
    </section>
  );
}

export default async function Home({ searchParams }: Props) {
  const params = searchParams ? await searchParams : undefined;
  const rawQ = params?.q;
  const q = Array.isArray(rawQ) ? rawQ[0] : rawQ;

  const currentHomeHref = q?.trim()
    ? `/?${new URLSearchParams({ q: q.trim() }).toString()}`
    : "/";

  const [popularTags, totalPosts, trendingPosts, recentPosts, recommendedPosts, recentBuildsResult, updatedBuildsResult] = await Promise.all([
    getPopularTags(12),
    db.post.count({ where: { isDeleted: false } }),
    getTrendingPosts(HOME_SECTION_LIMIT),
    getRecentPosts(HOME_SECTION_LIMIT),
    getRecommendedPosts({ searchTerm: q, limit: HOME_SECTION_LIMIT }),
    searchPublicBuildsWithFilters({ order: "newest", limit: HOME_SECTION_LIMIT, page: 1 }),
    searchPublicBuildsWithFilters({ order: "recently-updated", limit: HOME_SECTION_LIMIT, page: 1 }),
  ]);

  return (
    <div className="space-y-12">
      <HomeQuickLinks />

      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Tags</p>
            <h2 className="text-3xl font-semibold text-white">Popular tags</h2>
            <p className="text-white/70">Jump into the topics builders are exploring right now.</p>
          </div>
          <Link href="/tags" className="text-sm font-semibold text-brand-300">
            Browse all tags →
          </Link>
        </div>
        <Card className="p-6">
          {popularTags.length ? (
            <div className="flex flex-wrap gap-2">
              {popularTags.map(tag => (
                <Link
                  key={tag.id}
                  href={`/tags?tags=${encodeURIComponent(tag.slug)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10"
                >
                  <span className="font-medium">#{tag.name}</span>
                  <span className="text-xs text-white/50">{tag._count.posts}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center text-white/70">No tags yet.</p>
          )}
        </Card>
      </section>

      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Posts</p>
            <h2 className="text-3xl font-semibold text-white">What builders are sharing</h2>
            <p className="text-white/70">Browse trending, recent and recommended posts.</p>
          </div>
          <Link href="/posts" className="text-sm font-semibold text-brand-300">
            View all posts →
          </Link>
        </div>

        <div className="space-y-10">
          <PostSection title="Trending posts" posts={trendingPosts} total={totalPosts} />
          <PostSection title="Recent posts" posts={recentPosts} total={totalPosts} />
          <PostSection title="Recommended posts" posts={recommendedPosts} total={totalPosts} />
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Builds</p>
            <h2 className="text-3xl font-semibold text-white">Community code builds</h2>
            <p className="text-white/70">Explore recently created and recently updated builds.</p>
          </div>
          <Link href="/builds" className="text-sm font-semibold text-brand-300">
            View all builds →
          </Link>
        </div>

        <div className="space-y-10">
          <BuildSection
            title="Recent builds"
            builds={recentBuildsResult.builds}
            total={recentBuildsResult.total}
            backHref={currentHomeHref}
          />
          <BuildSection
            title="Recently updated builds"
            builds={updatedBuildsResult.builds}
            total={updatedBuildsResult.total}
            backHref={currentHomeHref}
          />
        </div>
      </section>
    </div>
  );
}
