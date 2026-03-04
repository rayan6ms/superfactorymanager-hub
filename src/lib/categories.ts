import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

export type CategoryOption = {
  key: string;
  name: string;
};

const getCachedCategoryOptions = unstable_cache(
  async (): Promise<CategoryOption[]> => db.category.findMany({
    orderBy: { name: "asc" },
    select: { key: true, name: true },
  }),
  ["public-category-options"],
  {
    revalidate: 60 * 60,
    tags: ["public-category-options"],
  },
);

export async function getCategoryOptions() {
  return getCachedCategoryOptions();
}
