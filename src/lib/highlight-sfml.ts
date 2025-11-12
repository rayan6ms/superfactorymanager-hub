import { createHighlighter, type Highlighter, type LanguageInput } from "shiki";

import sfmlTmLanguage from "@/lib/syntax/sfml.tmLanguage.json" assert { type: "json" };

const sfmlLang: LanguageInput = {
  ...(sfmlTmLanguage as any),
  name: "sfml",
  aliases: ["super-factory-manager-language", "sfm"],
};

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["dracula", "dracula-soft"],
      langs: [sfmlLang],
    });
  }
  return highlighterPromise;
}

export async function highlightSFML(
  code: string,
  theme: "dracula" | "dracula-soft" = "dracula"
) {
  const h = await getHighlighter();
  return h.codeToHtml(code, { lang: "sfml", theme });
}
