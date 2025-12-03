import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import ViewBeacon from "@/components/ViewBeacon";
import { Card, Button } from "@/components/ui";
import ImageGallery from "@/components/ImageGallery";
import PostCodePanel from "@/components/posts/PostCodePanel";
import CodeVerification from "@/components/CodeVerification";
import CommentsSection from "@/components/posts/CommentsSection";
import { getPostComments } from "@/lib/comments";
import ReportButton from "@/components/ReportButton";
import { isAdminEmail } from "@/lib/admin";
import AdminFlagPostButton from "@/components/posts/AdminFlagPostButton";
import { Eye } from 'lucide-react';
import { getBaseUrl } from "@/lib/urls";

type VoteValue = "up" | "down" | null;

type VerificationSummary = {
  worked: number;
  broken: number;
  my: VoteValue;
  isAuthor: boolean;
};

const baseUrl = getBaseUrl();

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

function getInitial(name: string | null | undefined) {
  const base = name?.trim();
  if (!base) return "?";
  return base.charAt(0).toUpperCase();
}

function buildDescriptionCopy(body: string) {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.slice(0, 155) || undefined;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await db.post.findUnique({
    where: { slug },
    include: { images: true, author: true },
  });

  if (!post || post.isDeleted) {
    return {
      title: "Post not found | superfactorymanager",
      description: "The requested SuperFactoryManager build could not be found.",
    };
  }

  const description =
    buildDescriptionCopy(post.description) ?? `Explore ${post.title} for SuperFactoryManager.`;
  const heroImage = post.images?.[0] ?? null;
  const heroSrc = heroImage?.thumbLg || heroImage?.original || heroImage?.thumbMd || heroImage?.thumbSm || null;
  const canonical = `${baseUrl}/posts/${post.slug}`;

  return {
    title: `${post.title} | superfactorymanager`,
    description,
    alternates: { canonical },
    openGraph: {
      title: post.title,
      description,
      url: canonical,
      siteName: "superfactorymanager",
      type: "article",
      images: heroSrc ? [{ url: heroSrc, alt: post.title }] : undefined,
    },
    twitter: {
      card: heroSrc ? "summary_large_image" : "summary",
      title: post.title,
      description,
      images: heroSrc ? [heroSrc] : undefined,
    },
  };
}

export default async function PostPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const session = await auth();
  const isAdmin = isAdminEmail(session?.user?.email);

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

  if (post.isDeleted) {
    return (
      <Card className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold text-white">Post removed</h1>
        <p className="text-white/70">
          This post has been removed by the moderation team and is no longer available.
        </p>
        <Link href="/" className="text-brand-200 hover:text-brand-100 hover:underline">
          Return to the homepage
        </Link>
      </Card>
    );
  }

  const groups = await db.rating.groupBy({
    where: { postId: post.id },
    by: ["value"],
    _count: { value: true },
  });

  let myVoteValue: number | null = null;
  let isAuthor = false;
  let me: { id: string; name: string | null; image: string | null } | null = null;

  if (session?.user?.email) {
    const meResult = await db.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true, image: true },
    });
    if (meResult) {
      me = meResult;
      isAuthor = meResult.id === post.authorId;
      const vote = await db.rating.findUnique({ where: { userId_postId: { userId: meResult.id, postId: post.id } } });
      myVoteValue = vote?.value ?? null;
    }
  }

  const verification = buildVerificationSummary(groups, myVoteValue, isAuthor);

  const views = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(post.views ?? 0);
  const uploadDate = formatUploadDate(post.uploadDate);
  const moderationDate = post.moderationEditedAt ? formatUploadDate(post.moderationEditedAt) : null;
  const heroImage = post.images?.[0] ?? null;
  const heroSrc = heroImage?.thumbLg || heroImage?.original || heroImage?.thumbMd || heroImage?.thumbSm || null;
  const tags = post.tags?.map(t => t.tag).filter(Boolean) ?? [];
  const authorDisplayName = post.author?.name ?? post.authorName;
  const authorImage = post.author?.image ?? null;
  const authorProfile = post.author?.name ? `/profile/${post.author.name}` : null;
  const authorBio = post.author?.bio?.trim() ?? null;

  const commentData = await getPostComments(post.id, { viewerId: me?.id ?? null });

  const improvementHref = me ? `/posts/${post.slug}/edit` : `/login?from=/posts/${post.slug}/edit`;
  const improvementCta = me ? "Suggest an improvement" : "Log in to collaborate";
  const reportLoginHref = `/login?from=/posts/${post.slug}`;

  return (
    <div className="space-y-8">
      <ViewBeacon slug={slug} />

      <Card className="overflow-hidden p-0">
        {heroSrc && (
          <div className="relative h-64 w-full rounded-t-lg rounded-b-xs overflow-hidden border-b border-white/10 bg-black/40">
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
              <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
                  <div>Minecraft {post.gameVersion}</div>
                  <div>SFM {post.modVersion}</div>
                </div>
                {isAdmin && (
                  <AdminFlagPostButton slug={post.slug} title={post.title} />
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
              <span>Uploaded {uploadDate}</span>
              <div className="flex items-center gap-1">
                <Eye className="flex h-4 w-4" aria-hidden="true" />
                <span>{views} views</span>
              </div>
              {(isAdmin || verification.isAuthor) && (
                <Link
                  href={`/posts/${slug}/edit`}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:text-white"
                >
                  Edit post
                </Link>
              )}
            </div>

            {post.moderationEditedNote && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-50">
                <span className="font-semibold">{post.moderationEditedNote}</span>
                {moderationDate ? <span className="text-amber-100/80">Updated {moderationDate}</span> : null}
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3 min-w-0">
                {authorImage ? (
                  <span
                    className="h-12 w-12 rounded-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${authorImage})` }}
                    aria-hidden="true"
                  />
                ) : (
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-lg font-semibold text-white">
                    {getInitial(authorDisplayName)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Author</p>
                  {authorProfile ? (
                    <Link href={authorProfile} className="text-lg font-semibold text-white underline-offset-4 hover:underline">
                      {authorDisplayName}
                    </Link>
                  ) : (
                    <p className="text-lg font-semibold text-white">{authorDisplayName}</p>
                  )}
                </div>
              </div>
              {authorBio ? (
                <p className="text-sm italic text-white/70 sm:max-w-md sm:text-right sm:pl-4">“{authorBio}”</p>
              ) : null}
            </div>
          </div>

          <p className="whitespace-pre-wrap text-base text-white/85">{post.description}</p>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <Link
                  key={tag.slug}
                  href={`/tags?tags=${encodeURIComponent(tag.slug)}`}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-wide text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  #{tag.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
            <PostCodePanel initialCode={post.code} />
          </Card>

          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Dependencies</h2>
            {post.dependencies?.length ? (
              <ul className="list-disc space-y-2 pl-5 text-sm text-white/80">
                {post.dependencies.map(dep => (
                  <li key={dep.id} className="wrap-break-word">
                    <a
                      href={dep.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-200 underline-offset-4 transition hover:text-brand-100 hover:underline"
                    >
                      {dep.name || dep.url}
                    </a>
                  </li>
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

          {!isAuthor && post.openForImprovement && (
            <Card className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">Collaborate</p>
                <h2 className="text-lg font-semibold text-white">Share an improvement</h2>
                <p className="text-sm text-white/65">
                  Paste your revised code and send it to the author for review. We’ll keep the edit history for them.
                </p>
              </div>
              <Link href={improvementHref} className="inline-flex">
                <Button className="w-full justify-center">{improvementCta}</Button>
              </Link>
            </Card>
          )}

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
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3">
              <p className="text-sm text-white/80">Spotted spam or outdated info?</p>
              <ReportButton
                type="post"
                targetId={post.slug}
                targetLabel={`post "${post.title}"`}
                canReport={Boolean(me)}
                loginHref={reportLoginHref}
                className="mt-3 w-full justify-center rounded-2xl border border-red-400/40 px-4 py-2 text-sm text-red-100"
              >
                Report post
              </ReportButton>
            </div>
          </Card>
        </div>
      </div>

      <CommentsSection
        postSlug={post.slug}
        initialComments={commentData.comments}
        initialCursor={commentData.nextCursor}
        initialTotal={commentData.total}
        currentUser={me}
        postAuthorId={post.authorId}
        isAdmin={isAdmin}
      />
    </div>
  );
}
