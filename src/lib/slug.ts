import slugify from "slugify";
export const makeSlug = (s: string) =>
  slugify(s, { lower: true, strict: true, trim: true }).slice(0, 100);
