import type { Metadata } from "next";
import { CORE_SEO_KEYWORDS, uniqueKeywords } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Super Factory Manager Guide",
  description:
    "Learn Super Factory Manager and SFML with examples for item movement, fluids, redstone signals, AE2 inscribers, and Minecraft automation.",
  keywords: uniqueKeywords([
    ...CORE_SEO_KEYWORDS,
    "Super Factory Manager guide",
    "SFML guide",
    "Super Factory Manager examples",
    "SFM examples",
  ]),
  alternates: { canonical: "/guide" },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
