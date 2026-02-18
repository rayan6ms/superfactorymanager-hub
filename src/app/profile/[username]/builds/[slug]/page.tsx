import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import BuildDetailPageClient from "@/components/builds/BuildDetailPageClient";
import { Card } from "@/components/ui";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { BuildDetailPayload } from "@/lib/builds/types";
import { getBaseUrl } from "@/lib/urls";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  params: Promise<{ username: string; slug: string }>;
  searchParams?: SearchParams;
};

async function getRequestOrigin() {
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");

  if (host) {
    const protocol = forwardedProto ?? (process.env.NODE_ENV === "development" ? "http" : "https");
    return `${protocol}://${host}`;
  }

  return getBaseUrl();
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PublicBuildDetailPage({ params, searchParams }: Props) {
  const [{ username, slug }, resolvedSearchParams, session] = await Promise.all([
    params,
    searchParams ? searchParams : Promise.resolve(undefined),
    auth(),
  ]);

  const commitId = firstValue(resolvedSearchParams?.commitId);

  let viewerUsername: string | null = null;
  if (session?.user?.email) {
    const viewer = await db.user.findUnique({
      where: { email: session.user.email },
      select: { name: true },
    });
    viewerUsername = viewer?.name?.toLowerCase() ?? null;
  }

  const search = new URLSearchParams();
  if (commitId) search.set("commitId", commitId);

  const origin = await getRequestOrigin();
  const fetchHeaders = new Headers();
  if (session?.user?.email) {
    const cookieHeader = (await cookies()).toString();
    if (cookieHeader) fetchHeaders.set("cookie", cookieHeader);
  }

  const response = await fetch(
    `${origin}/api/builds/${encodeURIComponent(username)}/${encodeURIComponent(slug)}${search.size ? `?${search.toString()}` : ""}`,
    {
      method: "GET",
      headers: fetchHeaders,
      ...(session?.user?.email || commitId
        ? { cache: "no-store" as const }
        : { next: { revalidate: 120 } }),
    },
  );

  if (response.status === 404) {
    notFound();
  }

  let payload: BuildDetailPayload | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload) {
    return (
      <main className="container-max flex flex-col gap-6 pb-12 pt-8">
        <div>
          <h1 className="text-3xl font-semibold text-white">Build</h1>
        </div>
        <Card className="p-6 text-sm text-white/70">Unable to load this build right now.</Card>
      </main>
    );
  }

  const isAuthor = viewerUsername !== null && viewerUsername === payload.build.username.toLowerCase();

  return (
    <BuildDetailPageClient
      initialData={payload}
      initialIsAuthenticated={Boolean(session?.user?.email)}
      isAuthor={isAuthor}
    />
  );
}
