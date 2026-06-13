export const SITE_NAME = "SFMHub";
export const SITE_TAGLINE = "Super Factory Manager code, builds, and guides";

export const CORE_SEO_KEYWORDS = [
  "SFMHub",
  "Super Factory Manager",
  "SuperFactoryManager",
  "Super Factory Manager code",
  "SuperFactoryManager code",
  "SFM code",
  "SFM builds",
  "SFML code",
  "Minecraft automation",
  "Minecraft factory automation",
  "Minecraft modded builds",
  "Mekanism automation",
  "Applied Energistics 2 automation",
  "AE2 automation",
  "Super Factory Manager Mekanism",
];

export function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function truncateMetaDescription(value: string, maxLength = 155) {
  const compact = compactText(value);
  if (compact.length <= maxLength) return compact;
  const clipped = compact.slice(0, maxLength - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 80 ? clipped.slice(0, lastSpace) : clipped).trim()}...`;
}

export function uniqueKeywords(values: Array<string | null | undefined>) {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function safeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
