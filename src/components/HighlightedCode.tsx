import { highlightSFML } from "@/lib/highlight-sfml";

export default async function HighlightedCode({
  code,
}: { code: string; theme?: string }) {
  const html = await highlightSFML(code);
  return (
    <div
      className="p-2 rounded overflow-auto dark-scrollbar"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
