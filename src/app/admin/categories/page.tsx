import { notFound } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { Card } from "@/components/ui";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import CategoryManager from "./CategoryManager";

export default async function AdminCategoriesPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound();
  }

  const categories = await db.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { posts: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm uppercase tracking-[0.3em] text-white/40">Admin</p>
        <h1 className="text-3xl font-semibold text-white">Categories</h1>
        <p className="text-sm text-white/60">
          Create and manage categories for new posts. Categories are maintained by moderators and cannot be edited by users.
        </p>
      </div>

      <Card className="flex items-center gap-3 border border-green-500/30 bg-green-500/10 p-4 text-sm text-white/80">
        <PlusCircle className="h-5 w-5 text-green-200" />
        <p>
          To delete a category, make sure no posts are assigned to it. Categories with existing posts are protected from removal.
        </p>
      </Card>

      <CategoryManager
        initialCategories={categories.map(category => ({
          id: category.id,
          key: category.key,
          name: category.name,
          postCount: category._count.posts,
        }))}
      />
    </div>
  );
}
