import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui";
import Pagination from "@/components/ui/Pagination";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { parsePageParam, getTotalPages } from "@/lib/pagination";
import RestoreDeletionButton from "./restore-deletion-button";

export default async function AdminDeletionsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : undefined;
  const postPageParam = params?.postPage;
  const commentPageParam = params?.commentPage;
  const requestedPostPage = parsePageParam(Array.isArray(postPageParam) ? postPageParam[0] : postPageParam, 1);
  const requestedCommentPage = parsePageParam(Array.isArray(commentPageParam) ? commentPageParam[0] : commentPageParam, 1);
  const PAGE_SIZE = 20;

  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound();
  }

  const [postCount, commentCount] = await Promise.all([
    db.post.count({ where: { isDeleted: true } }),
    db.comment.count({ where: { isDeleted: true } }),
  ]);

  const postTotalPages = getTotalPages(postCount, PAGE_SIZE);
  const commentTotalPages = getTotalPages(commentCount, PAGE_SIZE);
  const postPage = Math.min(requestedPostPage, postTotalPages);
  const commentPage = Math.min(requestedCommentPage, commentTotalPages);

  const [posts, comments] = await Promise.all([
    db.post.findMany({
      where: { isDeleted: true },
      orderBy: { updatedAt: "desc" },
      include: {
        author: { select: { id: true, name: true, email: true } },
        category: { select: { name: true } },
      },
      skip: (postPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.comment.findMany({
      where: { isDeleted: true },
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
    const suffix = qs.toString();
    return suffix ? `/admin/deletions?${suffix}` : "/admin/deletions";
  };

  const buildCommentPageHref = (page: number) => {
    const qs = new URLSearchParams();
    if (postPage > 1) qs.set("postPage", String(postPage));
    if (page > 1) qs.set("commentPage", String(page));
    const suffix = qs.toString();
    return suffix ? `/admin/deletions?${suffix}` : "/admin/deletions";
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm uppercase tracking-[0.3em] text-white/40">Admin</p>
        <h1 className="text-3xl font-semibold text-white">Deletion flags</h1>
        <p className="text-sm text-white/60">
          Review content that was flagged as deleted. You can reinstate posts or comments after verifying they are safe.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="space-y-1 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Posts</p>
          <p className="text-2xl font-semibold text-white">{postCount}</p>
          <p className="text-xs text-white/60">Flagged posts hidden from the public feed.</p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Comments</p>
          <p className="text-2xl font-semibold text-white">{commentCount}</p>
          <p className="text-xs text-white/60">Comments removed by moderators.</p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Total</p>
          <p className="text-2xl font-semibold text-white">{postCount + commentCount}</p>
          <p className="text-xs text-white/60">All content currently carrying a deletion flag.</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">Posts</p>
              <h2 className="text-lg font-semibold text-white">Flagged posts</h2>
              <p className="text-sm text-white/60">Restore posts after confirming their content is safe.</p>
            </div>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
              {postCount} items
            </span>
          </div>

          <div className="space-y-3">
            {posts.length === 0 && <p className="text-sm text-white/60">No flagged posts.</p>}
            {posts.map(post => (
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
                      Flagged {formatDistanceToNow(post.updatedAt ?? post.uploadDate, { addSuffix: true })}
                    </p>
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
            ))}
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
              <h2 className="text-lg font-semibold text-white">Flagged comments</h2>
              <p className="text-sm text-white/60">Unhide comment threads after issues are resolved.</p>
            </div>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
              {commentCount} items
            </span>
          </div>

          <div className="space-y-3">
            {comments.length === 0 && <p className="text-sm text-white/60">No flagged comments.</p>}
            {comments.map(comment => (
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
                      Flagged {formatDistanceToNow(comment.updatedAt, { addSuffix: true })}
                    </p>
                  </div>
                  <RestoreDeletionButton type="comment" targetId={comment.id} label="Reinstate" />
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-white/70">{comment.content}</p>
              </div>
            ))}
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
