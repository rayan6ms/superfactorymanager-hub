import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import NewPostForm from "./NewPostForm";

export default async function NewPostPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/posts/new");

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">New Post</h1>
      <NewPostForm />
    </div>
  );
}