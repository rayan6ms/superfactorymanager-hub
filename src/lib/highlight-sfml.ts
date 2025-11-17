import { createHighlighter, type Highlighter, type LanguageRegistration } from "shiki";

import sfmlTmLanguage from "@/lib/syntax/sfml.tmLanguage.json" assert { type: "json" };
import { CODE_CANVAS_BG, sfmDracula, sfmDraculaSoft, type SfmThemeName } from "@/lib/syntax/sfm-themes";

const sfmlLang: LanguageRegistration = {
  ...(sfmlTmLanguage as LanguageRegistration),
  name: "sfml",
  aliases: ["super-factory-manager-language", "sfm"],
};

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [sfmDracula, sfmDraculaSoft],
      langs: [sfmlLang],
    });
  }
  return highlighterPromise;
}

export async function highlightSFML(
  code: string,
  theme: SfmThemeName = "sfm-dracula"
) {
  const h = await getHighlighter();
  return h.codeToHtml(code, { lang: "sfml", theme });
}

export { CODE_CANVAS_BG };
