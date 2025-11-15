import { MeiliSearch } from "meilisearch";
import { db } from "./db";

const client = new MeiliSearch({
  host: process.env.MEILI_HOST!,
  apiKey: process.env.MEILI_API_KEY!,
});

export const postsIndex = () => client.index("posts");

export async function ensureIndexes() {
  const index = postsIndex();
  await index.updateSettings({
    searchableAttributes: [
      "title",
      "description",
      "code",
      "dependencies",
      "authorName",
      "modVersion",
      "categoryKey",
      "tags",
    ],
    filterableAttributes: ["modVersion", "categoryKey", "tags"],
    sortableAttributes: ["uploadDate", "views", "rating"],
  });
}

export async function indexPost(p: any) {
  const doc = {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    code: p.code,
    dependencies: p.dependencies?.map((d: any) => d.name) ?? [],
    tags: p.tags?.map((t: any) => t.tag?.name ?? t.tagName ?? "")?.filter(Boolean) ?? [],
    authorName: p.authorName,
    modVersion: p.modVersion,
    categoryKey: p.category?.key ?? null,
    uploadDate: p.uploadDate,
    views: p.views,
    rating: p.rating,
  };
  await postsIndex().addDocuments([doc]);
}

export async function removePost(id: string) {
  await postsIndex().deleteDocument(id);
}

export async function reindexAll() {
  const items = await db.post.findMany({
    include: { dependencies: true, category: true, tags: { include: { tag: true } } },
  });
  await postsIndex().deleteAllDocuments();
  await postsIndex().addDocuments(items.map(p => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    code: p.code,
    dependencies: p.dependencies.map(d => d.name),
    tags: p.tags.map(t => t.tag.name),
    authorName: p.authorName,
    modVersion: p.modVersion,
    categoryKey: p.category?.key ?? null,
    uploadDate: p.uploadDate,
    views: p.views,
    rating: p.rating,
  })));
}
