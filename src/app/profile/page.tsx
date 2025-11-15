import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import ProfileSettings from "@/components/profile/ProfileSettings";
import { Card } from "@/components/ui";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect(`/login?next=${encodeURIComponent("/profile")}`);
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email! },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      posts: {
        orderBy: { uploadDate: "desc" },
        select: {
          id: true,
          title: true,
          slug: true,
          uploadDate: true,
          rating: true,
          ratingCount: true,
        },
      },
    },
  });

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/profile")}`);
  }

  return (
    <main className="container-max flex flex-col gap-6 pb-12 pt-8">
      <div>
        <h1 className="text-3xl font-semibold text-white">Your profile</h1>
        <p className="text-sm text-white/60">Manage your account details and see your recent posts.</p>
      </div>

      <ProfileSettings initialUser={{ name: user.name, email: user.email, image: user.image }} />

      <Card className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-white">Your posts</h2>
          <Link href="/posts/new" className="text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline">
            Create new post
          </Link>
        </div>
        {user.posts.length === 0 ? (
          <p className="text-sm text-white/60">You haven’t published any posts yet.</p>
        ) : (
          <ul className="divide-y divide-white/10 text-sm text-white/80">
            {user.posts.map(post => (
              <li key={post.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/posts/${post.slug}`} className="text-base font-semibold text-white transition hover:text-brand-300">
                    {post.title}
                  </Link>
                  <p className="text-xs text-white/50">
                    Published {formatDate(post.uploadDate)} · {(() => {
                      const worked = Math.max(Math.round(post.rating ?? 0), 0);
                      const total = Math.max(post.ratingCount ?? 0, 0);
                      const broken = Math.max(total - worked, 0);
                      if (total === 0) {
                        return "No verification votes yet";
                      }
                      const success = Math.round((worked / total) * 100);
                      return `${success}% success (${worked}✓ / ${broken}✕)`;
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
      </Card>
    </main>
  );
}
