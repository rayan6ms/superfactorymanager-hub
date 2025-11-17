import type { ThemeRegistration } from "shiki";
import dracula from "@shikijs/themes/dracula";
import draculaSoft from "@shikijs/themes/dracula-soft";

export const CODE_CANVAS_BG = "(0,0,0,0)";

const extendTheme = (theme: ThemeRegistration, name: string): ThemeRegistration => ({
  ...theme,
  name,
  bg: CODE_CANVAS_BG,
  colors: {
    ...(theme.colors || {}),
    "editor.background": CODE_CANVAS_BG,
  },
});

export const sfmDracula = extendTheme(dracula, "sfm-dracula");
export const sfmDraculaSoft = extendTheme(draculaSoft, "sfm-dracula-soft");
export type SfmThemeName = "sfm-dracula" | "sfm-dracula-soft";
