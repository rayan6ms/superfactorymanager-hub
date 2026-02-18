import CodeEditorPageClient from "@/components/code-editor/CodeEditorPageClient";
import { auth } from "@/lib/auth";

export default async function CodeEditorPage() {
  const session = await auth();

  return (
    <CodeEditorPageClient
      initialIsAuthenticated={Boolean(session?.user?.email)}
    />
  );
}
