import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { buildPublicBuildPath } from "@/lib/builds/links";
import { db } from "@/lib/db";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: SearchParams;
};

function buildQueryString(params: Record<string, string | string[] | undefined> | undefined) {
  const query = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params ?? {})) {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (typeof value !== "string") continue;
    query.set(key, value);
  }

  return query.toString();
}

export default async function CurrentUserBuildRedirectPage({ params, searchParams }: Props) {
  const [{ slug }, resolved] = await Promise.all([params, searchParams ? searchParams : Promise.resolve(undefined)]);
  const query = buildQueryString(resolved);
  const requestedPath = query
    ? `/profile/builds/${encodeURIComponent(slug)}?${query}`
    : `/profile/builds/${encodeURIComponent(slug)}`;

  const session = await auth();
  if (!session?.user?.email) {
    redirect(`/login?next=${encodeURIComponent(requestedPath)}`);
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { name: true },
  });

  if (!user?.name) {
    redirect("/");
  }

  const destination = buildPublicBuildPath(user.name, slug);
  redirect(query ? `${destination}?${query}` : destination);
}
