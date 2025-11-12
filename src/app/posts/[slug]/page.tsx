import { db } from "@/lib/db";
import ImageGallery from "@/components/ImageGallery";
import StarRating from "@/components/StarRating";
import HighlightedCode from "@/components/HighlightedCode";
import { auth } from "@/lib/auth";
import ViewBeacon from "@/components/ViewBeacon";
import { Card } from "@/components/ui";

export default async function PostPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const session = await auth();

  const post = await db.post.findUnique({
    where: { slug },
    include: { category: true, images: true, dependencies: true, author: true },
  });

  if (!post) return <div className="opacity-70">Not found</div>;

  let myRating = 0;
  let isAuthor = false;
  if (session?.user?.email) {
    const me = await db.user.findUnique({ where: { email: session.user.email } });
    if (me) {
      isAuthor = me.id === post.authorId;
      const r = await db.rating.findUnique({ where: { userId_postId: { userId: me.id, postId: post.id } } });
      myRating = r?.value ?? 0;
    }
  }

  return (
    <div className="space-y-4">
      <ViewBeacon slug={slug} />

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{post.title}</h1>
            <div className="text-xs opacity-70">
              Minecraft {post.gameVersion} · SFM {post.modVersion} · {post.category?.name} · {post.views} views
            </div>
          </div>
          <StarRating slug={post.slug} initial={myRating} avg={post.rating || 0} count={post.ratingCount || 0} isAuthor={isAuthor} />
        </div>

        <p className="whitespace-pre-wrap mt-3 text-white/85">{post.description}</p>
      </Card>

      {post.youtubeUrl ? (
        <Card>
          <iframe
            src={post.youtubeUrl}
            className="w-full aspect-video rounded-xl border border-base-700/60"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </Card>
      ) : null}

      {post.codeStatus !== "VERIFIED" && (
        <Card className="bg-yellow-500/10 border-yellow-400/30 text-yellow-200 text-sm">
          ⚠️ This code may not work as expected{post.codeNote ? `: ${post.codeNote}` : "."}
        </Card>
      )}

      <section className="grid md:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-semibold mb-2">Dependencies</h2>
          <ul className="list-disc ml-5 space-y-1 text-white/80">
            {post.dependencies?.map((d) => <li key={d.id}>{d.name}</li>)}
          </ul>
        </Card>

        <Card>
          <h2 className="font-semibold mb-2">Code</h2>
          <div className="rounded-xl overflow-hidden border border-base-700/60">
            <HighlightedCode code={post.code} />
          </div>
        </Card>
      </section>

      <Card>
        <h2 className="font-semibold mb-2">Images</h2>
        <ImageGallery imgs={post.images || []} />
      </Card>
    </div>
  );
}
