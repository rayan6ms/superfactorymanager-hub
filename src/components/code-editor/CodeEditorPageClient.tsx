"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { BookOpen } from "lucide-react";
import { CodeBox } from "@/components/CodeBox";
import { Button, Card } from "@/components/ui";
import { analyzeSfmlCode, type CodeFeedback } from "@/lib/sfml/analysis";

const DEFAULT_CODE = `name " "

every 20 ticks do
    input from x
    output to y
    forget
end`;

const CODE_ANALYZE_DEBOUNCE = 350;

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {description && <p className="text-sm text-white/60">{description}</p>}
    </div>
  );
}

export default function CodeEditorPageClient() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [wrapLines, setWrapLines] = useState(true);

  const [codeFeedback, setCodeFeedback] = useState<CodeFeedback>({
    status: "ok",
    message: "",
    syntaxErrors: [],
    warnings: [],
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setCodeFeedback(analyzeSfmlCode(code, { required: false }));
    }, CODE_ANALYZE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [code]);

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
      codeFeedback.warnings.map(w => ({
        startLine: w.lineStart,
        endLine: w.lineEnd ?? w.lineStart,
        message: w.message,
      })),
    [codeFeedback.warnings],
  );

  const showErrors = codeFeedback.status === "error" && codeFeedback.syntaxErrors.length > 0;
  const showWarnings = codeFeedback.status === "ok" && codeFeedback.warnings.length > 0;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="eyebrow">Editor</p>
        <h1 className="text-3xl font-semibold text-white">Code editor</h1>
        <p className="text-sm text-white/70">
          Draft SFML snippets here, then copy and paste them into your builds.
        </p>
      </div>

      <Card className="space-y-6 p-6 sm:px-8 sm:py-7">
        <SectionTitle
          title="Code"
          description="Write or paste a SuperFactoryManager script. We’ll highlight errors and common issues."
        />

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/75 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl text-white/70">
            Need inspiration or not sure how to structure your script? Click to open the official guide in a new tab to see
            complete examples.
          </p>
          <Link href="/guide" target="_blank" rel="noreferrer" className="inline-flex sm:shrink-0">
            <Button size="sm" variant="ghost" className="w-full justify-center gap-2">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Open guide
            </Button>
          </Link>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-white/65">
            {wrapLines
              ? "Long lines wrap into the next row so you never lose sight of your cursor."
              : "Long lines stay on one row. Scroll horizontally to view everything."}
          </p>
          <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1 text-xs font-semibold">
            <button
              type="button"
              aria-pressed={wrapLines}
              onClick={() => setWrapLines(true)}
              className={clsx(
                "rounded-full px-3 py-1.5 transition",
                wrapLines ? "bg-brand-500 text-white shadow-soft" : "text-white/70 hover:text-white",
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
                !wrapLines ? "bg-brand-500 text-white shadow-soft" : "text-white/70 hover:text-white",
              )}
            >
              Horizontal scroll
            </button>
          </div>
        </div>

        <CodeBox
          value={code}
          onChange={setCode}
          errorMarkers={errorMarkers}
          warningRanges={warningRanges}
          wrapLines={wrapLines}
          isInvalid={showErrors}
        />

        {showErrors && (
          <div className="space-y-1 text-sm text-error">
            <p className="font-semibold">Errors</p>
            <ul className="list-disc space-y-1 pl-5">
              {codeFeedback.syntaxErrors.map((err, idx) => (
                <li key={`${err.lineStart}-${err.columnStart ?? 0}-${idx}`}>
                  Line {err.lineStart}
                  {typeof err.columnStart === "number" ? `, column ${err.columnStart + 1}` : ""} – {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {showWarnings && (
          <div className="space-y-1 text-sm text-amber-300">
            <p className="font-semibold">Warnings</p>
            <ul className="list-disc space-y-1 pl-5 marker:text-amber-300">
              {codeFeedback.warnings.map((w, idx) => (
                <li key={`${w.lineStart}-${w.lineEnd ?? w.lineStart}-${idx}`}>
                  Line {w.lineStart}
                  {w.lineEnd && w.lineEnd !== w.lineStart ? `-${w.lineEnd}` : ""} – {w.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
