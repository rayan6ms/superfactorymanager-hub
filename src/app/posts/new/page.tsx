import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PostComposer from "@/components/posts/PostComposer";

export default async function NewPostPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/posts/new");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 lg:space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Create a new post</h1>
        <p className="text-sm text-white/60">
          Share your blueprint with the community by filling out the details below.
        </p>
      </div>
      <PostComposer mode="create" />
    </div>
  );
}