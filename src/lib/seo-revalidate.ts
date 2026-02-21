import "server-only";
import { revalidatePath } from "next/cache";

export const SEO_REVALIDATE_PATHS = ["/sitemap.xml", "/robots.txt"] as const;

export function revalidateSeoPaths() {
  for (const path of SEO_REVALIDATE_PATHS) {
    revalidatePath(path);
  }
  return [...SEO_REVALIDATE_PATHS];
}
