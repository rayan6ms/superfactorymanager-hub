import DatabaseUnavailableNotice from "@/components/layout/DatabaseUnavailableNotice";
import ChangelogList from "@/components/changelog/ChangelogList";
import Pagination from "@/components/ui/Pagination";
import { getChangelogEntries, refreshChangelog } from "@/lib/changelog";
import { hasRecentDatabaseFallback } from "@/lib/db-availability";
import { parsePageParam, getTotalPages } from "@/lib/pagination";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  searchParams?: SearchParams;
};

export default async function ChangelogPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : undefined;
  const pageParam = params?.page;
  const requestedPage = parsePageParam(Array.isArray(pageParam) ? pageParam[0] : pageParam, 1);
  const PAGE_SIZE = 10;

  await refreshChangelog();
  const initial = await getChangelogEntries({ page: requestedPage, limit: PAGE_SIZE });
  const isDegraded = hasRecentDatabaseFallback();
  const totalPages = getTotalPages(initial.total, PAGE_SIZE);
  const currentPage = Math.min(requestedPage, totalPages);
  const result = currentPage === requestedPage
    ? initial
    : await getChangelogEntries({ page: currentPage, limit: PAGE_SIZE });

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    const suffix = params.toString();
    return suffix ? `/changelog?${suffix}` : "/changelog";
  };

  return (
    <main className="space-y-6 px-2">
      {isDegraded ? <DatabaseUnavailableNotice /> : null}
      <div className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-white/50">Releases</p>
        <h1 className="text-3xl font-semibold text-white">Changelog</h1>
        <p className="text-sm text-white/70">
          Release notes collected directly from GitHub. Newest versions appear first and are marked as latest.
        </p>
      </div>

      <ChangelogList entries={result.entries} />

      <Pagination
        currentPage={currentPage}
        pageSize={PAGE_SIZE}
        total={result.total}
        buildHref={buildPageHref}
      />
    </main>
  );
}
