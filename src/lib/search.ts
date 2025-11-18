import { MeiliSearch } from "meilisearch";
import { db } from "./db";
import type {
  Post,
  Dependency,
  PostTag,
  Category,
  Tag,
} from "@prisma/client";

const meiliHost = process.env.MEILI_HOST;
if (!meiliHost) {
  throw new Error("MEILI_HOST environment variable is not set");
}

const meiliApiKey = process.env.MEILI_API_KEY;

const client = new MeiliSearch({
  host: meiliHost,
  apiKey: meiliApiKey,
});

type PostForIndex = Post & {
  dependencies: Dependency[];
  tags: (PostTag & { tag: Tag | null })[];
  category: Category | null;
};

export type PostDocument = {
  id: string;
  slug: string;
  title: string;
  description: string;
  code: string;
  dependencies: string[];
  tags: string[];
  authorName: string;
  modVersion: string;
  categoryKey: string | null;
  uploadDate: string;
  views: number;
  rating: number;
};

export const postsIndex = () => client.index<PostDocument>("posts");

export async function ensureIndexes(): Promise<void> {
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

function toDocument(p: PostForIndex): PostDocument {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    code: p.code,
    dependencies: p.dependencies.map(d => d.name),
    tags:
      p.tags
        .map(t => t.tag?.name ?? null)
        .filter((name): name is string => Boolean(name)) ?? [],
    authorName: p.authorName,
    modVersion: p.modVersion,
    categoryKey: p.category?.key ?? null,
    uploadDate: p.uploadDate.toISOString(),
    views: p.views,
    rating: p.rating,
  };
}

export async function indexPost(p: PostForIndex): Promise<void> {
  const doc = toDocument(p);
  await postsIndex().addDocuments([doc]);
}

export async function removePost(id: string): Promise<void> {
  await postsIndex().deleteDocument(id);
}

export async function reindexAll(): Promise<void> {
  const items = await db.post.findMany({
    include: {
      dependencies: true,
      category: true,
      tags: { include: { tag: true } },
    },
  });

  await postsIndex().deleteAllDocuments();
  await postsIndex().addDocuments(items.map(toDocument));
}
