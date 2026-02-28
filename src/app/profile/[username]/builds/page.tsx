import Link from "next/link";
import { notFound } from "next/navigation";
import BuildCard from "@/components/builds/BuildCard";
import Pagination from "@/components/ui/Pagination";
import { Card } from "@/components/ui";
import { auth } from "@/lib/auth";
import { getProfileBuildList, parseBuildPageSize } from "@/lib/builds/profile-list";
import { getTotalPages, parsePageParam } from "@/lib/pagination";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  params: Promise<{ username: string }>;
  searchParams?: SearchParams;
};

export default async function UserBuildsPage({ params, searchParams }: Props) {
  const { username } = await params;
  const resolved = searchParams ? await searchParams : undefined;
  const session = await auth();
  const viewerName = session?.user?.name?.trim().toLowerCase() ?? null;
  const isOwnerView = viewerName !== null && viewerName === username.trim().toLowerCase();
  const pageTitle = isOwnerView ? "Your builds" : "Shared builds";
  const loadingErrorTitle = isOwnerView ? "Your builds" : "Shared builds";
  const pageParam = resolved?.page;
  const pageSizeParam = resolved?.pageSize;
  const requestedPage = parsePageParam(Array.isArray(pageParam) ? pageParam[0] : pageParam, 1);
  const requestedPageSize = parseBuildPageSize(pageSizeParam, 20);

  let result = await getProfileBuildList(username, {
    page: requestedPage,
    pageSize: requestedPageSize,
    viewerEmail: session?.user?.email ?? null,
  });

  if (result.status === 404) {
    notFound();
  }

  if (!result.data) {
    return (
      <main className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold text-white">{loadingErrorTitle}</h1>
        </div>
        <Card className="p-6 text-sm text-white/70">Unable to load builds right now.</Card>
      </main>
    );
  }

  let payload = result.data;
  const totalPages = getTotalPages(payload.total, payload.pageSize);
  const currentPage = Math.min(requestedPage, totalPages);

  if (currentPage !== requestedPage) {
    result = await getProfileBuildList(username, {
      page: currentPage,
      pageSize: payload.pageSize,
      viewerEmail: session?.user?.email ?? null,
    });

    if (result.status === 404) {
      notFound();
    }
    if (!result.data) {
      return (
        <main className="flex flex-col gap-6">
          <div>
            <h1 className="text-3xl font-semibold text-white">{loadingErrorTitle}</h1>
          </div>
          <Card className="p-6 text-sm text-white/70">Unable to load builds right now.</Card>
        </main>
      );
    }
    payload = result.data;
  }

  const profileUsername = payload.items[0]?.username ?? username;
  const buildPageHref = (page: number) => {
    const query = new URLSearchParams();
    for (const [key, rawValue] of Object.entries(resolved ?? {})) {
      const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
      if (typeof value !== "string") continue;
      if (key === "page" || key === "pageSize") continue;
      query.set(key, value);
    }

    if (page > 1) {
      query.set("page", String(page));
    } else {
      query.delete("page");
    }
    if (payload.pageSize !== 20) {
      query.set("pageSize", String(payload.pageSize));
    } else {
      query.delete("pageSize");
    }

    const suffix = query.toString();
    return suffix ? `/profile/${encodeURIComponent(username)}/builds?${suffix}` : `/profile/${encodeURIComponent(username)}/builds`;
  };

  return (
    <main className="flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">{pageTitle}</h1>
        <p className="text-sm text-white/60">
          {isOwnerView
            ? "All your builds, including private ones."
            : `Browse shared builds by ${profileUsername}.`}
        </p>
        <Link
          href={`/profile/${encodeURIComponent(profileUsername)}`}
          className="inline-flex text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline"
        >
          ← Back to profile
        </Link>
      </div>

      {payload.items.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {payload.items.map((build) => (
            <li key={`${build.username}:${build.slug}`}>
              <BuildCard
                username={build.username}
                slug={build.slug}
                name={build.nameOriginal}
                tag={build.tag}
                visibility={build.visibility}
                createdAt={build.createdAt}
                updatedAt={build.updatedAt}
                backTo="builds"
              />
            </li>
          ))}
        </ul>
      ) : (
        <Card className="p-6 text-sm text-white/70">
          {isOwnerView ? "You haven't saved any builds yet." : "No public builds."}
        </Card>
      )}

      <Pagination
        currentPage={currentPage}
        pageSize={payload.pageSize}
        total={payload.total}
        buildHref={buildPageHref}
      />
    </main>
  );
}
