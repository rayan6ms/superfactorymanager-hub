import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";
import { Card } from "@/components/ui";
import Pagination from "@/components/ui/Pagination";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { parsePageParam, getTotalPages } from "@/lib/pagination";
import RestoreDeletionButton from "./restore-deletion-button";
import { purgeExpiredDeletionsIfNeeded } from "@/lib/deletions";

type TabKey = "manual" | "auto";

function buildTabHref(tab: TabKey) {
  return tab === "manual" ? "/admin/deletions" : `/admin/deletions?tab=${tab}`;
}

export default async function AdminDeletionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const postPageParam = params?.postPage;
  const commentPageParam = params?.commentPage;
  const tabParam = params?.tab;
  const requestedPostPage = parsePageParam(Array.isArray(postPageParam) ? postPageParam[0] : postPageParam, 1);
  const requestedCommentPage = parsePageParam(Array.isArray(commentPageParam) ? commentPageParam[0] : commentPageParam, 1);
  const activeTab: TabKey = tabParam === "auto" ? "auto" : "manual";
  const PAGE_SIZE = 20;

  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound();
  }

  await purgeExpiredDeletionsIfNeeded();

  const whereClause = { isDeleted: true, deletionFlaggedByAuto: activeTab === "auto" } as const;

  const [postCount, commentCount] = await Promise.all([
    db.post.count({ where: whereClause }),
    db.comment.count({ where: whereClause }),
  ]);

  const postTotalPages = getTotalPages(postCount, PAGE_SIZE);
  const commentTotalPages = getTotalPages(commentCount, PAGE_SIZE);
  const postPage = Math.min(requestedPostPage, postTotalPages);
  const commentPage = Math.min(requestedCommentPage, commentTotalPages);

  const [posts, comments] = await Promise.all([
    db.post.findMany({
      where: whereClause,
      orderBy: { updatedAt: "desc" },
      include: {
        author: { select: { id: true, name: true, email: true } },
        category: { select: { name: true } },
      },
      skip: (postPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.comment.findMany({
      where: whereClause,
      orderBy: { updatedAt: "desc" },
      include: {
        author: { select: { id: true, name: true, email: true } },
        post: { select: { slug: true, title: true } },
      },
      skip: (commentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const buildPostPageHref = (page: number) => {
    const qs = new URLSearchParams();
    if (page > 1) qs.set("postPage", String(page));
    if (commentPage > 1) qs.set("commentPage", String(commentPage));
    if (activeTab !== "manual") qs.set("tab", activeTab);
    const suffix = qs.toString();
    return suffix ? `/admin/deletions?${suffix}` : "/admin/deletions";
  };

  const buildCommentPageHref = (page: number) => {
    const qs = new URLSearchParams();
    if (postPage > 1) qs.set("postPage", String(postPage));
    if (page > 1) qs.set("commentPage", String(page));
    if (activeTab !== "manual") qs.set("tab", activeTab);
    const suffix = qs.toString();
    return suffix ? `/admin/deletions?${suffix}` : "/admin/deletions";
  };

  const flaggedLabel = activeTab === "auto" ? "Auto-deleted" : "Manual flags";
  const flaggedDescription =
    activeTab === "auto"
      ? "Posts hidden automatically after repeated reports."
      : "Content hidden by moderators with a 15-day deletion timer.";
  const commentDescription =
    activeTab === "auto"
      ? "Comments hidden automatically after repeated reports."
      : "Comments removed by moderators.";
  const tabs: { key: TabKey; label: string }[] = [
    { key: "manual", label: "Manual flags" },
    { key: "auto", label: "Auto-deleted" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm uppercase tracking-[0.3em] text-white/40">Admin</p>
        <h1 className="text-3xl font-semibold text-white">Deletion flags</h1>
        <p className="text-sm text-white/60">
          Review content that was flagged as deleted. You can reinstate posts or comments after verifying they are safe.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {tabs.map(tab => (
          <Link
            key={tab.key}
            href={buildTabHref(tab.key)}
            className={clsx(
              "rounded-full border px-4 py-2 text-sm font-semibold transition",
              activeTab === tab.key
                ? "border-white/50 bg-white/10 text-white"
                : "border-white/15 bg-white/5 text-white/70 hover:border-white/30 hover:text-white"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="space-y-1 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Posts</p>
          <p className="text-2xl font-semibold text-white">{postCount}</p>
          <p className="text-xs text-white/60">{flaggedDescription}</p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Comments</p>
          <p className="text-2xl font-semibold text-white">{commentCount}</p>
          <p className="text-xs text-white/60">{commentDescription}</p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Total</p>
          <p className="text-2xl font-semibold text-white">{postCount + commentCount}</p>
          <p className="text-xs text-white/60">All content currently carrying a {flaggedLabel.toLowerCase()}.</p>
        </Card>
      </div>

      {activeTab === "manual" && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-50">
          <p className="text-sm font-semibold">Manually flagged content will be deleted after 15 days.</p>
          <p className="text-sm text-amber-100/80">Restoring an item stops the countdown.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">Posts</p>
              <h2 className="text-lg font-semibold text-white">{flaggedLabel} posts</h2>
              <p className="text-sm text-white/60">Restore posts after confirming their content is safe.</p>
            </div>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
              {postCount} items
            </span>
          </div>

          <div className="space-y-3">
            {posts.length === 0 && <p className="text-sm text-white/60">No flagged posts.</p>}
            {posts.map(post => {
              const flaggedAt = post.deletionFlaggedAt ?? post.updatedAt ?? post.uploadDate;
              const purgeAt = post.deletionPurgeAt;
              return (
                <div
                  key={post.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <Link href={`/posts/${post.slug}`} className="text-lg font-semibold text-white underline-offset-4 hover:underline">
                        {post.title}
                      </Link>
                      <p className="text-sm text-white/60">Category: {post.category?.name ?? "—"}</p>
                      <p className="text-xs text-white/50">
                        Flagged {formatDistanceToNow(flaggedAt, { addSuffix: true })}
                      </p>
                      {activeTab === "manual" && purgeAt && (
                        <p className="text-xs text-amber-200">Permanent deletion {formatDistanceToNow(purgeAt, { addSuffix: true })}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 text-right text-xs text-white/60">
                      <span>Author: {post.author?.name ?? post.author?.email ?? "Unknown"}</span>
                      <RestoreDeletionButton type="post" targetId={post.id} label="Reinstate" />
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-white/70">
                    Slugs are updated automatically when a newer post uses the same slug.
                  </p>
                </div>
              );
            })}
          </div>

          <Pagination
            currentPage={postPage}
            pageSize={PAGE_SIZE}
            total={postCount}
            buildHref={buildPostPageHref}
          />
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">Comments</p>
              <h2 className="text-lg font-semibold text-white">{flaggedLabel} comments</h2>
              <p className="text-sm text-white/60">Unhide comment threads after issues are resolved.</p>
            </div>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
              {commentCount} items
            </span>
          </div>

          <div className="space-y-3">
            {comments.length === 0 && <p className="text-sm text-white/60">No flagged comments.</p>}
            {comments.map(comment => {
              const flaggedAt = comment.deletionFlaggedAt ?? comment.updatedAt;
              const purgeAt = comment.deletionPurgeAt;
              return (
                <div
                  key={comment.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-white">{comment.author?.name ?? comment.author?.email ?? "Unknown user"}</p>
                      <Link
                        href={`/posts/${comment.post?.slug ?? ""}#comment-${comment.id}`}
                        className="text-sm text-brand-200 underline-offset-4 hover:underline"
                      >
                        View thread on “{comment.post?.title ?? "Unknown post"}”
                      </Link>
                      <p className="text-xs text-white/50">
                        Flagged {formatDistanceToNow(flaggedAt, { addSuffix: true })}
                      </p>
                      {activeTab === "manual" && purgeAt && (
                        <p className="text-xs text-amber-200">Permanent deletion {formatDistanceToNow(purgeAt, { addSuffix: true })}</p>
                      )}
                    </div>
                    <RestoreDeletionButton type="comment" targetId={comment.id} label="Reinstate" />
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm text-white/70">{comment.content}</p>
                </div>
              );
            })}
          </div>

          <Pagination
            currentPage={commentPage}
            pageSize={PAGE_SIZE}
            total={commentCount}
            buildHref={buildCommentPageHref}
          />
        </Card>
      </div>
    </div>
  );
}
