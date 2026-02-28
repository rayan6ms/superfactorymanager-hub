import { notFound } from "next/navigation";
import BuildDetailPageClient from "@/components/builds/BuildDetailPageClient";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBuildDetail } from "@/lib/builds/detail";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  params: Promise<{ username: string; slug: string }>;
  searchParams?: SearchParams;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeBackHref(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  return trimmed;
}

export default async function PublicBuildDetailPage({ params, searchParams }: Props) {
  const [{ username, slug }, resolvedSearchParams, session] = await Promise.all([
    params,
    searchParams ? searchParams : Promise.resolve(undefined),
    auth(),
  ]);

  const commitId = firstValue(resolvedSearchParams?.commitId);
  const from = firstValue(resolvedSearchParams?.from);
  const back = firstValue(resolvedSearchParams?.back);
  const backHref = normalizeBackHref(back);
  const backTo = from === "home"
    || from === "profile"
    || from === "builds"
    || from === "explore-builds"
    || from === "search"
    ? from
    : null;

  let viewerUsername: string | null = null;
  if (session?.user?.email) {
    const viewer = await db.user.findUnique({
      where: { email: session.user.email },
      select: { name: true },
    });
    viewerUsername = viewer?.name?.toLowerCase() ?? null;
  }

  const result = await getBuildDetail({
    username,
    slug,
    commitId,
    viewerEmail: session?.user?.email ?? null,
  });

  if (result.status === 404 || !result.payload) {
    notFound();
  }
  const payload = result.payload;

  const isAuthor = viewerUsername !== null && viewerUsername === payload.build.username.toLowerCase();

  return (
    <BuildDetailPageClient
      initialData={payload}
      initialIsAuthenticated={Boolean(session?.user?.email)}
      isAuthor={isAuthor}
      initialBackTo={backTo}
      initialBackHref={backHref}
    />
  );
}
