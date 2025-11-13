export const MAX_POST_IMAGES = 4;

type InImage =
  | string
  | { original: string; thumbSm?: string; thumbMd?: string; thumbLg?: string };

export function normalizeImages(arr: InImage[]) {
  return (arr || []).slice(0, MAX_POST_IMAGES).map((item) => {
    if (typeof item === "string") {
      return { original: item, thumbSm: item, thumbMd: item, thumbLg: item };
    }
    const { original, thumbSm, thumbMd, thumbLg } = item;
    return {
      original,
      thumbSm: thumbSm ?? original,
      thumbMd: thumbMd ?? original,
      thumbLg: thumbLg ?? original,
    };
  });
}
