"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { CodeBox } from "@/components/CodeBox";
import CopyCodeButton from "@/components/CopyCodeButton";
import { analyzeSfmlCode, getSfmlAnalyzeDebounceMs, type CodeFeedback } from "@/lib/sfml/analysis";

type PostCodePanelProps = {
  initialCode: string;
};

export default function PostCodePanel({ initialCode }: PostCodePanelProps) {
  const [code, setCode] = useState(initialCode);
  const [wrapLines, setWrapLines] = useState(true);
  const analyzeDebounceMs = useMemo(() => getSfmlAnalyzeDebounceMs(code), [code]);

  const [codeFeedback, setCodeFeedback] = useState<CodeFeedback>(() =>
    analyzeSfmlCode(initialCode)
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setCodeFeedback(analyzeSfmlCode(code));
    }, analyzeDebounceMs);

    return () => clearTimeout(timer);
  }, [analyzeDebounceMs, code]);

  const errorMarkers = useMemo(
    () =>
      codeFeedback.syntaxErrors.map(err => ({
        line: err.lineStart,
        message: err.message,
      })),
    [codeFeedback.syntaxErrors],
  );

  const warningRanges = useMemo(
    () =>
      codeFeedback.warnings.map(warning => ({
        startLine: warning.lineStart,
        endLine: warning.lineEnd ?? warning.lineStart,
        message: warning.message,
      })),
    [codeFeedback.warnings],
  );

  const hasError = codeFeedback.status === "error";
  const hasWarnings = codeFeedback.status === "ok" && codeFeedback.warnings.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Code</h2>
          <span className="text-xs text-white/50">
            Edit &amp; paste into SuperFactoryManager
          </span>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1 text-xs font-semibold">
            <button
              type="button"
              aria-pressed={wrapLines}
              onClick={() => setWrapLines(true)}
              className={clsx(
                "rounded-full px-3 py-1.5 transition",
                wrapLines
                  ? "bg-brand-500 text-white shadow-soft"
                  : "text-white/70 hover:text-white",
              )}
            >
              Wrap lines
            </button>
            <button
              type="button"
              aria-pressed={!wrapLines}
              onClick={() => setWrapLines(false)}
              className={clsx(
                "rounded-full px-3 py-1.5 transition",
                !wrapLines
                  ? "bg-brand-500 text-white shadow-soft"
                  : "text-white/70 hover:text-white",
              )}
            >
              Horizontal scroll
            </button>
          </div>

          <CopyCodeButton value={code} />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20">
        <CodeBox
          value={code}
          onChange={setCode}
          wrapLines={wrapLines}
          isInvalid={hasError}
          errorMarkers={errorMarkers}
          warningRanges={warningRanges}
        />
      </div>

      {(hasError || hasWarnings) && (
        <div className="space-y-2 text-xs text-white/80">
          {hasError && codeFeedback.message && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-100">
              <p className="font-semibold">Syntax issues</p>
              <p className="mt-1">{codeFeedback.message}</p>
              {codeFeedback.syntaxErrors.length > 0 && (
                <ul className="mt-1 list-disc space-y-1 pl-4 text-[0.78rem]">
                  {codeFeedback.syntaxErrors.map((err, idx) => (
                    <li key={`${err.lineStart}-${err.columnStart}-${idx}`}>
                      Line {err.lineStart}
                      {typeof err.columnStart === "number"
                        ? `, column ${err.columnStart + 1}`
                        : ""}
                      {" – "}
                      {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {hasWarnings && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-amber-100">
              <p className="font-semibold">Warnings</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[0.78rem]">
                {codeFeedback.warnings.map((warning, idx) => (
                  <li key={`${warning.lineStart}-${warning.lineEnd}-${idx}`}>
                    Line {warning.lineStart}
                    {warning.lineEnd && warning.lineEnd !== warning.lineStart
                      ? `–${warning.lineEnd}`
                      : ""}
                    {" – "}
                    {warning.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-white/55">
        Changes here are local to your browser and will be lost when you leave
        the page.
      </p>
    </div>
  );
}
