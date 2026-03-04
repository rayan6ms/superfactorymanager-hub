import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PostComposer from "@/components/posts/PostComposer";
import { getCategoryOptions } from "@/lib/categories";
import { getSfmMatrix } from "@/lib/sfm";

export default async function NewPostPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/posts/new");

  const [categories, matrix] = await Promise.all([
    getCategoryOptions(),
    getSfmMatrix(false),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 lg:space-y-8">
      <div className="space-y-2">
        <p className="eyebrow">Create</p>
        <h1 className="text-3xl font-semibold tracking-tight">Create a new post</h1>
        <p className="text-sm text-white/60">
          Share your blueprint with the community by filling out the details below.
        </p>
      </div>
      <PostComposer mode="create" initialCategories={categories} initialMatrix={matrix} />
    </div>
  );
}
