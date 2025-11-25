"use client";

import { useRouter } from "next/navigation";
import DeletionFlagDialog from "@/components/admin/DeletionFlagDialog";

export default function AdminFlagPostButton({ slug, title }: { slug: string; title: string }) {
  const router = useRouter();

  return (
    <DeletionFlagDialog
      type="post"
      targetId={slug}
      targetLabel={`post "${title}"`}
      onFlagged={() => router.refresh()}
      className="w-full justify-center border-rose-400/60 px-4 py-2 text-xs font-semibold sm:w-auto"
    >
      Flag as deleted
    </DeletionFlagDialog>
  );
}
