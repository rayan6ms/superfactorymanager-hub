import { validateSyntax, type SyntaxErrorItem } from "./syntax";
import { collectWarnings, type WarningItem } from "./warnings";

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

  const syntax = validateSyntax(trimmed);
  if (!syntax.ok) {
    const first = syntax.errors[0];
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
      syntaxErrors: syntax.errors,
      warnings: [],
    };
  }

  const warnings = collectWarnings(trimmed);
  return {
    status: "ok",
    message: null,
    syntaxErrors: [],
    warnings,
  };
}
