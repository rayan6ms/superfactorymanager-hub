"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button, Card } from "@/components/ui";
import AdminFlagPostButton from "@/components/posts/AdminFlagPostButton";

type SessionUser = {
  id?: string;
  isAdmin?: boolean;
};

function getViewer(sessionUser: SessionUser | undefined, authorId: string) {
  const viewerId = sessionUser?.id ?? null;
  const isAuthor = viewerId === authorId;
  const isAdmin = sessionUser?.isAdmin === true;
  return { isAuthor, isAdmin, isAuthenticated: Boolean(viewerId) };
}

export function PostHeroAdminAction({ slug, title }: { slug: string; title: string }) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin === true;

  if (!isAdmin) return null;
  return <AdminFlagPostButton slug={slug} title={title} />;
}

export function PostEditLink({ slug, authorId }: { slug: string; authorId: string }) {
  const { data: session } = useSession();
  const { isAdmin, isAuthor } = getViewer(session?.user, authorId);

  if (!isAdmin && !isAuthor) return null;

  return (
    <Link
      href={`/posts/${slug}/edit`}
      className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:text-white"
    >
      Edit post
    </Link>
  );
}

export function PostCollaborationCard({
  slug,
  authorId,
  openForImprovement,
}: {
  slug: string;
  authorId: string;
  openForImprovement: boolean;
}) {
  const { data: session } = useSession();
  const { isAuthor, isAuthenticated } = getViewer(session?.user, authorId);

  if (!openForImprovement || isAuthor) return null;

  const href = isAuthenticated ? `/posts/${slug}/edit` : `/login?from=/posts/${slug}/edit`;
  const cta = isAuthenticated ? "Suggest an improvement" : "Log in to collaborate";

  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-white/50">Collaborate</p>
        <h2 className="text-lg font-semibold text-white">Share an improvement</h2>
        <p className="text-sm text-white/65">
          Paste your revised code and send it to the author for review. We&apos;ll keep the edit history for them.
        </p>
      </div>
      <Link href={href} className="inline-flex">
        <Button className="w-full justify-center">{cta}</Button>
      </Link>
    </Card>
  );
}
