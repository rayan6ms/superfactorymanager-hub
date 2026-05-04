import Link from "next/link";
import { notFound } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { Card } from "@/components/ui";
import Pagination from "@/components/ui/Pagination";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { parsePageParam, getTotalPages } from "@/lib/pagination";
import CategoryManager from "./CategoryManager";

type CategoryRow = {
  id: string;
  key: string;
  name: string;
  _count: {
    posts: number;
  };
};

export default async function AdminCategoriesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : undefined;
  const pageParam = params?.page;
  const requestedPage = parsePageParam(Array.isArray(pageParam) ? pageParam[0] : pageParam, 1);
  const PAGE_SIZE = 25;

  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound();
  }

  const totalCount = await db.category.count();
  const totalPages = getTotalPages(totalCount, PAGE_SIZE);
  const currentPage = Math.min(requestedPage, totalPages);

  const categories = await db.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { posts: true } } },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams();
    if (page > 1) qs.set("page", String(page));
    const suffix = qs.toString();
    return suffix ? `/admin/categories?${suffix}` : "/admin/categories";
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm uppercase tracking-[0.3em] text-white/40">Admin</p>
        <h1 className="text-3xl font-semibold text-white">Categories</h1>
        <p className="text-sm text-white/60">
          Create and manage categories for new posts. Categories are maintained by moderators and cannot be edited by users.
        </p>
        <Link
          href="/admin"
          className="inline-flex text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline"
        >
          ← Back to admin
        </Link>
      </div>

      <Card className="flex items-center gap-3 border border-green-500/30 bg-green-500/10 p-4 text-sm text-white/80">
        <PlusCircle className="h-5 w-5 text-green-200" />
        <p>
          To delete a category, make sure no posts are assigned to it. Categories with existing posts are protected from removal.
        </p>
      </Card>

      <CategoryManager
        initialCategories={categories.map((category: CategoryRow) => ({
          id: category.id,
          key: category.key,
          name: category.name,
          postCount: category._count.posts,
        }))}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={PAGE_SIZE}
      />

      <Pagination
        currentPage={currentPage}
        pageSize={PAGE_SIZE}
        total={totalCount}
        buildHref={buildPageHref}
      />
    </div>
  );
}
