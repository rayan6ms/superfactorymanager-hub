import Link from "next/link";
import type { Metadata } from "next";
import DatabaseUnavailableNotice from "@/components/layout/DatabaseUnavailableNotice";
import HideHeaderSearch from "@/components/layout/HideHeaderSearch";
import BuildCard from "@/components/builds/BuildCard";
import BuildsFilterBar from "@/components/builds/BuildsFilterBar";
import Card from "@/components/ui/Card";
import Pagination from "@/components/ui/Pagination";
import { parseBuildPageSize } from "@/lib/builds/profile-list-shared";
import { searchPublicBuildsWithFilters, type BuildFilterOptions } from "@/lib/builds/search";
import { hasRecentDatabaseFallback } from "@/lib/db-availability";
import { getTotalPages, parsePageParam } from "@/lib/pagination";
import { CORE_SEO_KEYWORDS, uniqueKeywords } from "@/lib/seo";

export const revalidate = 60;

const ORDER_VALUES: BuildFilterOptions["order"][] = [
  "best",
  "newest",
  "oldest",
  "recently-updated",
  "least-recently-updated",
  "name-asc",
  "name-desc",
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  searchParams?: SearchParams;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = searchParams ? await searchParams : undefined;
  const q = getParam(params, "q").trim();
  const username = getParam(params, "username").trim();
  const page = parsePageParam(getParam(params, "page"), 1);
  const hasFilters = Boolean(q || username || page > 1);

  return {
    title: q ? `${q} SFM Builds` : "Super Factory Manager Builds",
    description: q
      ? `Explore public SFM builds matching ${q}: Super Factory Manager code snapshots, SFML examples, and Minecraft automation ideas.`
      : "Explore public Super Factory Manager builds, SFM code snapshots, SFML examples, and Minecraft automation ideas from the SFMHub community.",
    keywords: uniqueKeywords([...CORE_SEO_KEYWORDS, q, username, "Super Factory Manager builds", "SFM build code"]),
    alternates: { canonical: "/builds" },
    robots: {
      index: !hasFilters,
      follow: true,
    },
  };
}

function getParam(
  params: Record<string, string | string[] | undefined> | undefined,
  key: string,
) {
  const value = params?.[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

export default async function BuildsPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : undefined;

  const q = getParam(params, "q");
  const orderParam = getParam(params, "order");
  const username = getParam(params, "username");
  const pageParam = getParam(params, "page");
  const pageSizeParam = getParam(params, "pageSize");

  const order = ORDER_VALUES.includes(orderParam as BuildFilterOptions["order"])
    ? (orderParam as BuildFilterOptions["order"])
    : "best";

  const requestedPage = parsePageParam(pageParam, 1);
  const pageSize = parseBuildPageSize(pageSizeParam || undefined, 24);

  const fetchPage = (page: number) =>
    searchPublicBuildsWithFilters({
      q: q.trim() || undefined,
      order,
      username: username.trim() || undefined,
      limit: pageSize,
      page,
    });

  const initialResult = await fetchPage(requestedPage);
  const isDegraded = hasRecentDatabaseFallback();
  const totalPages = getTotalPages(initialResult.total, pageSize);
  const activePage = Math.min(requestedPage, totalPages);
  const finalResult = activePage === requestedPage ? initialResult : await fetchPage(activePage);
  const builds = finalResult.builds;

  const buildPageHref = (page: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (order) query.set("order", order);
    if (username) query.set("username", username);
    if (pageSize !== 24) query.set("pageSize", String(pageSize));
    if (page > 1) query.set("page", String(page));
    const suffix = query.toString();
    return suffix ? `/builds?${suffix}` : "/builds";
  };
  const currentPageHref = buildPageHref(activePage);

  return (
    <div className="space-y-8">
      <HideHeaderSearch />
      {isDegraded ? <DatabaseUnavailableNotice /> : null}

      <div className="space-y-3">
        <p className="eyebrow">Builds</p>
        <h1 className="text-3xl font-semibold text-white">Explore builds</h1>
        <p className="text-white/70">Search community builds by name, tag, author, or date.</p>
        <Card className="border-white/10 bg-white/5 p-4 text-sm text-white/75">
          Builds listed here do not necessarily work. They are publicly saved code snapshots.
          For tested builds with more detail and explanation, check the{" "}
          <Link href="/posts" className="font-semibold text-brand-300 underline-offset-4 transition hover:underline">
            posts
          </Link>
          .
        </Card>
        <Link
          href="/"
          className="inline-flex text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline"
        >
          ← Back to home
        </Link>
      </div>

      <BuildsFilterBar
        initialQuery={q}
        initialOrder={order}
        initialUsername={username}
        hiddenParams={pageSize !== 24 ? { pageSize: String(pageSize) } : undefined}
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-white">
            Showing {builds.length} {builds.length === 1 ? "build" : "builds"}
          </h2>
          {q && <p className="text-sm text-white/60">for “{q}”</p>}
        </div>

        {builds.length ? (
          <ul className="grid gap-5 md:grid-cols-2">
            {builds.map((build) => (
              <li key={`${build.username}:${build.slug}`}>
                <BuildCard
                  username={build.username}
                  authorImage={build.authorImage}
                  slug={build.slug}
                  name={build.nameOriginal}
                  tag={build.tag}
                  visibility={build.visibility}
                  createdAt={build.createdAt}
                  updatedAt={build.updatedAt}
                  backTo="explore-builds"
                  backHref={currentPageHref}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Card className="p-8 text-center text-white/70">No builds match the selected filters.</Card>
        )}

        <Pagination
          currentPage={activePage}
          pageSize={pageSize}
          total={finalResult.total}
          buildHref={buildPageHref}
          className="pt-2"
        />
      </section>
    </div>
  );
}
