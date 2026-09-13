export type { SyntaxErrorItem } from "./lexer";
export type { ParsedSfmlSyntax } from "./parser";
export { parseSfml as parseSfmlSyntax } from "./parser";

import { parseSfml } from "./parser";

export function validateSyntax(code: string) {
  const { ok, errors } = parseSfml(code);
  return { ok, errors };
}
