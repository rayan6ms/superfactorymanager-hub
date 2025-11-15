/* eslint-disable @next/next/no-img-element */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import ViewBeacon from "@/components/ViewBeacon";
import { Card } from "@/components/ui";
import ImageGallery from "@/components/ImageGallery";
import HighlightedCode from "@/components/HighlightedCode";
import CodeVerification from "@/components/CodeVerification";

type VoteValue = "up" | "down" | null;

type VerificationSummary = {
  worked: number;
  broken: number;
  my: VoteValue;
  isAuthor: boolean;
};

function buildVerificationSummary(
  votes: { value: number; _count: { value: number } }[],
  myVote: number | null,
  isAuthor: boolean,
): VerificationSummary {
  let worked = 0;
  let broken = 0;
  for (const item of votes) {
    if (item.value > 0) {
      worked += item._count.value;
    } else if (item.value < 0) {
      broken += item._count.value;
    }
  }
  const my: VoteValue = myVote == null ? null : myVote > 0 ? "up" : "down";
  return { worked, broken, my, isAuthor };
}

function formatUploadDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export default async function PostPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const session = await auth();

  const post = await db.post.findUnique({
    where: { slug },
    include: {
      category: true,
      images: true,
      dependencies: true,
      author: true,
      tags: { include: { tag: true } },
    },
  });

  if (!post) {
    return <div className="opacity-70">Not found</div>;
  }

  const groups = await db.rating.groupBy({
    where: { postId: post.id },
    by: ["value"],
    _count: { value: true },
  });

  let myVoteValue: number | null = null;
  let isAuthor = false;

  if (session?.user?.email) {
    const me = await db.user.findUnique({ where: { email: session.user.email } });
    if (me) {
      isAuthor = me.id === post.authorId;
      const vote = await db.rating.findUnique({ where: { userId_postId: { userId: me.id, postId: post.id } } });
      myVoteValue = vote?.value ?? null;
    }
  }

  const verification = buildVerificationSummary(groups, myVoteValue, isAuthor);

  const views = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(post.views ?? 0);
  const uploadDate = formatUploadDate(post.uploadDate);
  const heroImage = post.images?.[0] ?? null;
  const heroSrc = heroImage?.thumbLg || heroImage?.original || heroImage?.thumbMd || heroImage?.thumbSm || null;
  const tags = post.tags?.map(t => t.tag).filter(Boolean) ?? [];

  return (
    <div className="space-y-8">
      <ViewBeacon slug={slug} />

      <Card className="overflow-hidden p-0">
        {heroSrc && (
          <div className="relative h-64 w-full overflow-hidden border-b border-white/10 bg-black/40">
            <img src={heroSrc} alt={post.title} className="h-full w-full object-cover" />
          </div>
        )}
        <div className="space-y-6 px-6 py-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.4em] text-white/40">{post.category?.name ?? "Post"}</p>
                <h1 className="text-3xl font-semibold text-white">{post.title}</h1>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
                <div>Minecraft {post.gameVersion}</div>
                <div>SFM {post.modVersion}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-white/60">
              <span>Uploaded {uploadDate}</span>
              <span>{views} views</span>
              <span>Author: {post.author?.name ?? post.authorName}</span>
            </div>
          </div>

          <p className="whitespace-pre-wrap text-base text-white/85">{post.description}</p>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <span
                  key={tag.slug}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-wide text-white/70"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {post.youtubeUrl && (
            <Card className="overflow-hidden">
              <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10">
                <iframe
                  src={post.youtubeUrl}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Post video"
                />
              </div>
            </Card>
          )}

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Code</h2>
              <span className="text-xs text-white/50">Copy &amp; paste into SuperFactoryManager</span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20">
              <HighlightedCode code={post.code} />
            </div>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Dependencies</h2>
            {post.dependencies?.length ? (
              <ul className="list-disc space-y-2 pl-5 text-sm text-white/80">
                {post.dependencies.map(dep => (
                  <li key={dep.id}>{dep.name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-white/60">No external dependencies listed.</p>
            )}
          </Card>

          {post.images?.length ? (
            <Card className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Gallery</h2>
              <ImageGallery imgs={post.images} />
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <CodeVerification
            slug={post.slug}
            initialVote={verification.my}
            worked={verification.worked}
            broken={verification.broken}
            isAuthor={verification.isAuthor}
            codeStatus={post.codeStatus}
            codeNote={post.codeNote}
          />

          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Post details</h2>
            <dl className="grid gap-3 text-sm text-white/70">
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-white">Category</dt>
                <dd>{post.category?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-white">Minecraft version</dt>
                <dd>{post.gameVersion}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-white">SFM version</dt>
                <dd>{post.modVersion}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-white">Views</dt>
                <dd>{views}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-white">Uploaded</dt>
                <dd>{uploadDate}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
