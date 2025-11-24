import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import PostCard from "@/components/posts/PostCard";
import { db } from "@/lib/db";
import { POST_CARD_INCLUDE, serializePost, type SerializedPost } from "@/lib/posts";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
  }).format(value);
}

function getInitial(name: string | null | undefined) {
  const base = name?.trim();
  if (!base) return "?";
  return base.charAt(0).toUpperCase();
}

export default async function PublicProfilePage(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params;
  const normalized = username.toLowerCase();

  const user = await db.user.findUnique({
    where: { name: normalized },
    select: {
      id: true,
      name: true,
      image: true,
      bio: true,
      createdAt: true,
    },
  });

  if (!user) {
    notFound();
  }

  const posts = await db.post.findMany({
    where: { authorId: user.id },
    orderBy: { uploadDate: "desc" },
    include: POST_CARD_INCLUDE,
  });

  const serializedPosts: SerializedPost[] = posts.map(serializePost);
  const joined = formatDate(user.createdAt);
  const bio = user.bio?.trim();

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        {user.image ? (
          <span
            className="h-20 w-20 shrink-0 rounded-full border border-white/10 bg-cover bg-center"
            style={{ backgroundImage: `url(${user.image})` }}
            aria-hidden="true"
          />
        ) : (
          <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-2xl font-semibold text-white">
            {getInitial(user.name)}
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold text-white">{user.name}</h1>
          <p className="text-sm text-white/60">Joined {joined}</p>
          {bio ? (
            <p className="text-sm italic text-white/70">“{bio}”</p>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Shared builds</h2>
          <span className="text-xs uppercase tracking-[0.3em] text-white/40">{serializedPosts.length} posts</span>
        </div>
        {serializedPosts.length ? (
          <ul className="grid gap-5 md:grid-cols-2">
            {serializedPosts.map(post => (
              <PostCard key={post.id} post={post} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/60">No posts published yet.</p>
        )}
      </Card>
    </div>
  );
}
