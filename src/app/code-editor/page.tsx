import type { Metadata } from "next";
import CodeEditorPageClient from "@/components/code-editor/CodeEditorPageClient";
import { auth } from "@/lib/auth";
import { CORE_SEO_KEYWORDS, uniqueKeywords } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Super Factory Manager Code Editor",
  description:
    "Write, validate, and share Super Factory Manager SFML code for Minecraft automation builds directly in SFMHub.",
  keywords: uniqueKeywords([...CORE_SEO_KEYWORDS, "Super Factory Manager editor", "SFML editor", "SFM code editor"]),
  alternates: { canonical: "/code-editor" },
};

export default async function CodeEditorPage() {
  const session = await auth();

  return (
    <CodeEditorPageClient
      initialIsAuthenticated={Boolean(session?.user?.email)}
    />
  );
}
