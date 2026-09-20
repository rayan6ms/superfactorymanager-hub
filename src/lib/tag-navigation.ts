export const TAG_PAGE_SIZE = 30;
export const MAX_SELECTED_TAGS = 3;
export type TagSearchParams = Record<string, string | string[] | undefined>;

export function tagPageHref(slugs: string[] = [], page = 1) {
  const query = new URLSearchParams();
  if (slugs.length) query.set("tags", [...new Set(slugs)].sort().join(","));
  if (page > 1) query.set("page", String(page));
  return query.size ? `/tags?${query}` : "/tags";
}

/** Normalize before querying posts: only existing tags and real directory pages survive. */
export function resolveTagNavigation(params: TagSearchParams, knownSlugs: string[]) {
  const known = new Set(knownSlugs);
  const rawTags = Array.isArray(params.tags) ? params.tags[0] : params.tags;
  const slugs = [...new Set((rawTags ?? "").split(",").map((tag) => tag.trim().toLowerCase()))]
    .filter((tag) => known.has(tag))
    .sort()
    .slice(0, MAX_SELECTED_TAGS);
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const totalPages = Math.max(1, Math.ceil(knownSlugs.length / TAG_PAGE_SIZE));
  const parsed = Number(rawPage);
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, totalPages) : 1;
  const needsRedirect =
    Object.keys(params).some((key) => key !== "tags" && key !== "page" && key !== "_rsc") ||
    Array.isArray(params.tags) ||
    Array.isArray(params.page) ||
    rawTags !== (slugs.length ? slugs.join(",") : undefined) ||
    rawPage !== (page > 1 ? String(page) : undefined);
  return { slugs, page, href: tagPageHref(slugs, page), needsRedirect };
}

/** Union of each tag's newest results equals the newest results of the OR filter. */
export function mergeTaggedPosts<T extends { id: string; uploadDate: Date | string }>(
  groups: T[][],
  limit = 30,
) {
  const unique = new Map(groups.flat().map((post) => [post.id, post]));
  return [...unique.values()]
    .sort(
      (a, b) =>
        new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime() ||
        b.id.localeCompare(a.id),
    )
    .slice(0, limit);
}
