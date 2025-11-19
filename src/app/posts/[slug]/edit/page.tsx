import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import PostComposer from "@/components/posts/PostComposer";
import CodeHistoryPanel from "@/components/posts/CodeHistoryPanel";
import CodeImprovementForm from "@/components/posts/CodeImprovementForm";
import type { CommitForHistory, ContributorSummary } from "@/components/posts/CodeHistoryPanel";
import type { Tag as TagModel } from "@prisma/client";

export default async function EditPostPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const session = await auth();
  if (!session?.user?.email) {
    redirect(`/login?from=/posts/${slug}/edit`);
  }

  const user = await db.user.findUnique({ where: { email: session.user.email! } });
  if (!user) redirect(`/login?from=/posts/${slug}/edit`);

  const post = await db.post.findUnique({
    where: { slug },
    include: {
      category: true,
      images: true,
      dependencies: true,
      tags: { include: { tag: true } },
      commits: {
        include: { author: true },
        orderBy: { createdAt: "desc" },
      },
      contributors: {
        include: { user: true },
        orderBy: { mergedCommits: "desc" },
      },
    },
  });

  if (!post) notFound();

  const isAuthor = post.authorId === user.id;
  if (!isAuthor && !post.openForImprovement) {
    redirect(`/posts/${slug}`);
  }

  const initialData = {
    title: post.title,
    gameVersion: post.gameVersion,
    modVersion: post.modVersion,
    categoryKey: post.category?.key ?? "",
    description: post.description,
    code: post.code,
    youtubeUrl: post.youtubeUrl ?? "",
    tags: post.tags
      .map(tag => tag.tag)
      .filter((tag): tag is TagModel => Boolean(tag?.slug))
      .map(tag => ({ slug: tag.slug, name: tag.name })),
    dependencies: post.dependencies.map(dep => ({ url: dep.url, name: dep.name })),
    existingImages: post.images.map(image => ({
      id: image.id,
      original: image.original,
      thumbSm: image.thumbSm,
      thumbMd: image.thumbMd,
      thumbLg: image.thumbLg,
    })),
    openForImprovement: post.openForImprovement,
  };

  const commits: CommitForHistory[] = post.commits.map(commit => ({
    id: commit.id,
    title: commit.title ?? null,
    message: commit.message,
    status: commit.status,
    createdAt: commit.createdAt.toISOString(),
    mergedAt: commit.mergedAt ? commit.mergedAt.toISOString() : null,
    rejectedAt: commit.rejectedAt ? commit.rejectedAt.toISOString() : null,
    author: { id: commit.authorId, name: commit.author?.name ?? commit.author?.email ?? "Anonymous" },
    code: commit.code,
    baseCommitId: commit.baseCommitId,
  }));

  const contributors: ContributorSummary[] = post.contributors.map(contributor => ({
    id: contributor.userId,
    name: contributor.user?.name ?? contributor.user?.email ?? "Contributor",
    mergedCommits: contributor.mergedCommits,
  }));

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.3em] text-white/40">Manage post</p>
        <h1 className="text-3xl font-semibold text-white">{post.title}</h1>
        <p className="text-sm text-white/65">
          Update your blueprint, review community pull requests, and keep {post.title} in top shape.
        </p>
      </div>

      {isAuthor && (
        <PostComposer mode="edit" slug={slug} initialData={initialData} />
      )}

      <CodeHistoryPanel
        slug={slug}
        commits={commits}
        currentCommitId={post.currentCommitId}
        isAuthor={isAuthor}
        contributors={contributors}
      />

      {!isAuthor && post.openForImprovement && (
        <CodeImprovementForm slug={slug} baseCommitId={post.currentCommitId} initialCode={post.code} />
      )}
    </div>
  );
}
