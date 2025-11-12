// src/lib/sfml/syntax.ts
import { CharStreams, CommonTokenStream } from "antlr4ts";
import { ANTLRErrorListener, RecognitionException, Recognizer } from "antlr4ts";
import { SFMLLexer } from "@/generated/SFMLLexer";
import { SFMLParser } from "@/generated/SFMLParser";

export type SyntaxErrorItem = {
  lineStart: number;
  columnStart: number;
  lineEnd: number;
  columnEnd: number;
  message: string;
};

class CollectingErrorListener implements ANTLRErrorListener<any> {
  public errors: SyntaxErrorItem[] = [];
  syntaxError<T>(
    _recognizer: Recognizer<T, any>,
    _offendingSymbol: T,
    lineStart: number,
    columnStart: number,
    msg: string,
    e: RecognitionException | undefined
  ) {
    const offendingToken: any = (e as any)?.getOffendingToken?.();
    const lineEnd = offendingToken?.line ?? lineStart;
    const columnEnd = offendingToken
      ? offendingToken.charPositionInLine + (offendingToken.text?.length || 0)
      : columnStart;

    this.errors.push({
      lineStart,
      columnStart,
      lineEnd,
      columnEnd,
      message: msg,
    });
  }
}

/** Parse & return ANTLR syntax errors (no VS Code deps) */
export function validateSyntax(code: string): { ok: boolean; errors: SyntaxErrorItem[] } {
  const input = CharStreams.fromString(code);
  const lexer = new SFMLLexer(input);
  const tokens = new CommonTokenStream(lexer);
  const parser = new SFMLParser(tokens);

  const listener = new CollectingErrorListener();
  parser.removeErrorListeners();
  parser.addErrorListener(listener);

  // entry rule in the grammar
  parser.program();

  return { ok: parser.numberOfSyntaxErrors === 0, errors: listener.errors };
}
