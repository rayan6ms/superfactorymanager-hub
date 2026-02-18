import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
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

export default async function ProfileBuildsRedirectPage({ searchParams }: Props) {
  const resolved = searchParams ? await searchParams : undefined;
  const query = buildQueryString(resolved);
  const requestedPath = query ? `/profile/builds?${query}` : "/profile/builds";

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

  const destinationBase = `/profile/${encodeURIComponent(user.name)}/builds`;
  redirect(query ? `${destinationBase}?${query}` : destinationBase);
}
