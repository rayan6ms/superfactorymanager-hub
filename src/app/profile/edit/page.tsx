import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import ProfileSettings from "@/components/profile/ProfileSettings";
import { Card } from "@/components/ui";
import Pagination from "@/components/ui/Pagination";
import { parsePageParam, getTotalPages } from "@/lib/pagination";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  searchParams?: SearchParams;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default async function ProfilePage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : undefined;
  const pageParam = params?.page;
  const requestedPage = parsePageParam(Array.isArray(pageParam) ? pageParam[0] : pageParam, 1);
  const PAGE_SIZE = 8;

  const session = await auth();

  if (!session?.user?.email) {
    redirect(`/login?next=${encodeURIComponent("/profile/edit")}`);
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email! },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      bio: true,
      emailNotificationsEnabled: true,
      emailNotifyPost: true,
      emailNotifySystem: true,
      emailNotifyReport: true,
    },
  });

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/profile/edit")}`);
  }

  const totalPosts = await db.post.count({ where: { authorId: user.id } });
  const totalPages = getTotalPages(totalPosts, PAGE_SIZE);
  const currentPage = Math.min(requestedPage, totalPages);
  const posts = await db.post.findMany({
    where: { authorId: user.id },
    orderBy: { uploadDate: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      uploadDate: true,
      rating: true,
      ratingCount: true,
    },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    const suffix = params.toString();
    return suffix ? `/profile/edit?${suffix}` : "/profile/edit";
  };

  return (
    <main className="container-max flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Edit profile</h1>
        <p className="text-sm text-white/60">Manage your account details and see your recent posts.</p>
      </div>

      <ProfileSettings
        initialUser={{
          name: user.name,
          email: user.email,
          image: user.image,
          bio: user.bio,
          emailNotificationsEnabled: user.emailNotificationsEnabled,
          emailNotifyPost: user.emailNotifyPost,
          emailNotifySystem: user.emailNotifySystem,
          emailNotifyReport: user.emailNotifyReport,
        }}
      />

      <Card className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-white">Your posts</h2>
          <Link href="/posts/new" className="text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline">
            Create new post
          </Link>
        </div>
        {posts.length === 0 ? (
          <p className="text-sm text-white/60">You haven’t published any posts yet.</p>
        ) : (
          <ul className="divide-y divide-white/10 text-sm text-white/80">
            {posts.map(post => (
              <li key={post.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/posts/${post.slug}`} className="text-base font-semibold text-white transition hover:text-brand-300">
                    {post.title}
                  </Link>
                  <p className="text-xs text-white/50">
                    Published {formatDate(post.uploadDate)} · {(() => {
                      const total = Math.max(post.ratingCount ?? 0, 0);
                      if (total === 0) {
                        return "No verification votes yet";
                      }
                      const confidence = Math.round(Math.max(0, Math.min(1, post.rating ?? 0)) * 100);
                      return `${confidence}% confidence (${total} vote${total === 1 ? "" : "s"})`;
                    })()}
                  </p>
                </div>
                <Link
                  href={`/posts/${post.slug}`}
                  className="text-xs font-medium text-brand-300 underline-offset-4 transition hover:underline"
                >
                  View post
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Pagination
          currentPage={currentPage}
          pageSize={PAGE_SIZE}
          total={totalPosts}
          buildHref={buildPageHref}
          className="pt-2"
        />
      </Card>
    </main>
  );
}
