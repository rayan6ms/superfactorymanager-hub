import { CharStreams, CommonTokenStream } from "antlr4ts";
import { ANTLRErrorListener, RecognitionException, Recognizer } from "antlr4ts";
import type { Token } from "antlr4ts/Token";
import { ATNSimulator } from "antlr4ts/atn/ATNSimulator";
import { SFMLLexer } from "@/generated/SFMLLexer";
import { SFMLParser } from "@/generated/SFMLParser";

export type SyntaxErrorItem = {
  lineStart: number;
  columnStart: number;
  lineEnd: number;
  columnEnd: number;
  message: string;
};

export type ParsedSfmlSyntax = {
  ok: boolean;
  errors: SyntaxErrorItem[];
  tree: ReturnType<SFMLParser["program"]>;
};

class CollectingErrorListener implements ANTLRErrorListener<Token | undefined> {
  public errors: SyntaxErrorItem[] = [];
  syntaxError<T>(
    _recognizer: Recognizer<T, ATNSimulator>,
    _offendingSymbol: T,
    lineStart: number,
    columnStart: number,
    msg: string,
    e: RecognitionException | undefined
  ) {
    const offendingToken = e?.getOffendingToken?.();
    const fallbackLength = Math.max(1, msg?.length ? Math.min(msg.length, 4) : 1);
    const lineEnd = offendingToken?.line ?? lineStart;
    const columnEnd = offendingToken
      ? offendingToken.charPositionInLine + (offendingToken.text?.length || 0)
      : columnStart + fallbackLength;

    this.errors.push({
      lineStart,
      columnStart,
      lineEnd,
      columnEnd,
      message: msg,
    });
  }
}

export function parseSfmlSyntax(code: string): ParsedSfmlSyntax {
  const input = CharStreams.fromString(code);
  const lexer = new SFMLLexer(input);
  const tokens = new CommonTokenStream(lexer);
  const parser = new SFMLParser(tokens);

  const listener = new CollectingErrorListener();
  lexer.removeErrorListeners();
  parser.removeErrorListeners();
  lexer.addErrorListener(listener);
  parser.addErrorListener(listener);

  const tree = parser.program();
  const ok = parser.numberOfSyntaxErrors === 0 && listener.errors.length === 0;

  return { ok, errors: listener.errors, tree };
}

export function validateSyntax(code: string): { ok: boolean; errors: SyntaxErrorItem[] } {
  const parsed = parseSfmlSyntax(code);
  return {
    ok: parsed.ok,
    errors: parsed.errors,
  };
}
