import { parseSfmlSyntax, type SyntaxErrorItem } from "./syntax";
import { collectWarningsFromTree, type WarningItem } from "./warnings";

export const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

export type CodeFeedbackStatus = "idle" | "ok" | "error";

export type CodeFeedback = {
  status: CodeFeedbackStatus;
  message: string | null;
  syntaxErrors: SyntaxErrorItem[];
  warnings: WarningItem[];
};

export type AnalyzeOptions = {
  /**
   * If true, empty/whitespace-only code is treated as an error with `emptyMessage`.
   * If false (default), empty code returns an "idle" feedback (no error).
   */
  required?: boolean;
  /** Minimum length (after trimming) before we consider the code “valid-ish”. */
  minLength?: number;
  /** Custom message when `required` and the code is empty. */
  emptyMessage?: string;
};

const ANALYZE_DEBOUNCE_BASE_MS = 350;
const ANALYZE_DEBOUNCE_MEDIUM_MS = 700;
const ANALYZE_DEBOUNCE_LARGE_MS = 1200;
const ANALYZE_MEDIUM_LENGTH = 6000;
const ANALYZE_LARGE_LENGTH = 12000;

export function getSfmlAnalyzeDebounceMs(code: string): number {
  const length = code.length;
  if (length >= ANALYZE_LARGE_LENGTH) return ANALYZE_DEBOUNCE_LARGE_MS;
  if (length >= ANALYZE_MEDIUM_LENGTH) return ANALYZE_DEBOUNCE_MEDIUM_MS;
  return ANALYZE_DEBOUNCE_BASE_MS;
}

export function analyzeSfmlCode(
  code: string,
  opts: AnalyzeOptions = {}
): CodeFeedback {
  const { required = false, minLength = 3, emptyMessage } = opts;
  const trimmed = code.trim();

  if (!trimmed) {
    if (!required) {
      return {
        status: "idle",
        message: null,
        syntaxErrors: [],
        warnings: [],
      };
    }

    return {
      status: "error",
      message: emptyMessage ?? "Code is required.",
      syntaxErrors: [],
      warnings: [],
    };
  }

  if (trimmed.length < minLength) {
    return {
      status: "error",
      message: `Code must be at least ${minLength} characters long (currently ${trimmed.length}).`,
      syntaxErrors: [],
      warnings: [],
    };
  }

  if (CONTROL_CHAR_REGEX.test(trimmed)) {
    return {
      status: "error",
      message: "Code contains invalid control characters.",
      syntaxErrors: [],
      warnings: [],
    };
  }

  const parsed = parseSfmlSyntax(trimmed);
  if (!parsed.ok) {
    const first = parsed.errors[0];
    const location = first
      ? `line ${first.lineStart}${typeof first.columnStart === "number"
        ? `, column ${first.columnStart + 1}`
        : ""
      }`
      : "the script";

    return {
      status: "error",
      message: first
        ? `Syntax error on ${location}: ${first.message}`
        : "Syntax error in script.",
      syntaxErrors: parsed.errors,
      warnings: [],
    };
  }

  const warnings = collectWarningsFromTree(parsed.tree);
  return {
    status: "ok",
    message: null,
    syntaxErrors: [],
    warnings,
  };
}
