"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { clsx } from "clsx";
import { highlightSFML } from "@/lib/highlight-sfml";

type CodeBoxProps = {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  isInvalid?: boolean;
  describedBy?: string;
  errorLines?: number[];
};

type CodeBoxCSSVars = {
  "--codebox-line-height": string;
  "--codebox-padding-x": string;
  "--codebox-padding-y": string;
};

const escapeHtml = (input: string) =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const plainHighlight = (code: string) => {
  const safe = code ? escapeHtml(code) : "&nbsp;";
  return `<pre class="shiki plain" style="color: rgba(0,0,0,0)"><code>${safe}</code></pre>`;
};

const INDENT = "    ";
const MIN_HEIGHT = 256;
const MAX_HEIGHT = 544;
const DEFAULT_LINE_HEIGHT = "1.5rem";
const CODE_PADDING_X = "1rem"; // Tailwind px-4
const CODE_PADDING_Y = "0.75rem"; // Tailwind py-3

export function CodeBox({ value, onChange, onBlur, isInvalid = false, describedBy, errorLines }: CodeBoxProps) {
  const deferredValue = useDeferredValue(value);
  const [highlightState, setHighlightState] = useState<{ code: string; html: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightWrapperRef = useRef<HTMLDivElement | null>(null);
  const highlightContentRef = useRef<HTMLElement | null>(null);
  const highlightOverlayRef = useRef<HTMLDivElement | null>(null);
  const lineNumbersInnerRef = useRef<HTMLDivElement | null>(null);
  const [boxHeight, setBoxHeight] = useState<number>(MIN_HEIGHT);
  const [lineHeight, setLineHeight] = useState<string>(DEFAULT_LINE_HEIGHT);
  const containerStyle = useMemo<CodeBoxCSSVars & CSSProperties>(
    () => ({
      height: boxHeight,
      "--codebox-line-height": lineHeight,
      "--codebox-padding-x": CODE_PADDING_X,
      "--codebox-padding-y": CODE_PADDING_Y,
    }),
    [boxHeight, lineHeight]
  );
  const fallbackHtml = useMemo(() => plainHighlight(value), [value]);
  const highlightReady = highlightState?.code === value;
  const html = highlightReady ? highlightState.html : fallbackHtml;
  const textareaStyle = useMemo<CSSProperties | undefined>(
    () =>
      value && highlightReady ? { color: "transparent", WebkitTextFillColor: "transparent" } : undefined,
    [value, highlightReady]
  );
  const lineCount = useMemo(() => Math.max(1, value.split(/\r\n|\r|\n/).length), [value]);
  const uniqueErrorLines = useMemo(() => {
    if (!errorLines || !errorLines.length) return [] as number[];
    const set = new Set<number>();
    errorLines.forEach(line => {
      if (Number.isFinite(line) && line > 0) {
        set.add(Math.floor(line));
      }
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [errorLines]);
  const errorLineSet = useMemo(() => new Set(uniqueErrorLines), [uniqueErrorLines]);
  const highlightRects = useMemo(() => {
    if (!uniqueErrorLines.length) return [] as { key: number; index: number }[];
    return uniqueErrorLines.map(line => ({ key: line, index: line - 1 }));
  }, [uniqueErrorLines]);

  const queueSelection = useCallback((start: number, end: number) => {
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.selectionStart = start;
      textareaRef.current.selectionEnd = end;
    });
  }, []);

  const syncScroll = useCallback(() => {
    if (!textareaRef.current) return;
    const { scrollTop, scrollLeft } = textareaRef.current;
    if (highlightContentRef.current) {
      highlightContentRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    }
    if (highlightOverlayRef.current) {
      highlightOverlayRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    }
    if (lineNumbersInnerRef.current) {
      lineNumbersInnerRef.current.style.transform = `translateY(${-scrollTop}px)`;
    }
  }, []);

  const adjustHeight = useCallback(() => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    el.style.height = "auto";
    const measured = el.scrollHeight;
    const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, measured));
    setBoxHeight(height);
    el.style.height = `${height}px`;
  }, []);

  const copyTypographyToHighlight = useCallback(() => {
    if (!textareaRef.current || !highlightContentRef.current) return;
    const computed = window.getComputedStyle(textareaRef.current);
    const target = highlightContentRef.current;
    target.style.fontFamily = computed.fontFamily;
    target.style.fontSize = computed.fontSize;
    target.style.lineHeight = computed.lineHeight;
    target.style.letterSpacing = computed.letterSpacing;
    target.style.tabSize = computed.tabSize;
    target.style.margin = "0";
    target.style.padding = "0";
    target.style.minWidth = "100%";
    target.style.width = "max-content";
    if (computed.lineHeight && computed.lineHeight !== lineHeight) {
      setLineHeight(computed.lineHeight);
    }
  }, [lineHeight]);

  useEffect(() => {
    let active = true;
    const plain = plainHighlight(deferredValue);

    highlightSFML(deferredValue, "dracula-soft")
      .then(htmlOutput => {
        if (!active) return;
        setHighlightState({ code: deferredValue, html: htmlOutput });
      })
      .catch(() => {
        if (!active) return;
        setHighlightState({ code: deferredValue, html: plain });
      });

    return () => {
      active = false;
    };
  }, [deferredValue]);

  useEffect(() => {
    if (!highlightWrapperRef.current) return;
    const pre = highlightWrapperRef.current.querySelector("pre");
    if (pre) {
      highlightContentRef.current = pre as HTMLElement;
      pre.style.transformOrigin = "top left";
      pre.style.backgroundColor = "transparent";
    }
    copyTypographyToHighlight();
    syncScroll();
  }, [copyTypographyToHighlight, syncScroll, html]);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  useLayoutEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      syncScroll();
    });
    return () => cancelAnimationFrame(raf);
  }, [boxHeight, value, syncScroll]);

  const handleIndent = useCallback(
    (element: HTMLTextAreaElement) => {
      const { selectionStart, selectionEnd } = element;
      const text = element.value;
      if (selectionStart === selectionEnd) {
        const nextValue = `${text.slice(0, selectionStart)}${INDENT}${text.slice(selectionEnd)}`;
        onChange(nextValue);
        queueSelection(selectionStart + INDENT.length, selectionStart + INDENT.length);
        return;
      }

      let adjustedEnd = selectionEnd;
      if (adjustedEnd > selectionStart && text.charAt(adjustedEnd - 1) === "\n") {
        adjustedEnd -= 1;
      }
      const startLineStart = text.lastIndexOf("\n", selectionStart - 1) + 1;
      const endLineBreak = text.indexOf("\n", adjustedEnd);
      const endLineEnd = endLineBreak === -1 ? text.length : endLineBreak;
      const block = text.slice(startLineStart, endLineEnd);
      const lines = block.split("\n");
      const indented = lines.map(line => `${INDENT}${line}`).join("\n");
      const nextValue = `${text.slice(0, startLineStart)}${indented}${text.slice(endLineEnd)}`;
      const linesCount = lines.length;
      const newStart = selectionStart + INDENT.length;
      const newEnd = selectionEnd + INDENT.length * linesCount;
      onChange(nextValue);
      queueSelection(newStart, newEnd);
    },
    [onChange, queueSelection]
  );

  const handleOutdent = useCallback(
    (element: HTMLTextAreaElement) => {
      const { selectionStart, selectionEnd } = element;
      const text = element.value;
      const startLineStart = text.lastIndexOf("\n", selectionStart - 1) + 1;
      let adjustedEnd = selectionEnd;
      if (adjustedEnd > selectionStart && text.charAt(adjustedEnd - 1) === "\n") {
        adjustedEnd -= 1;
      }
      const endLineBreak = text.indexOf("\n", adjustedEnd);
      const endLineEnd = endLineBreak === -1 ? text.length : endLineBreak;
      const block = text.slice(startLineStart, endLineEnd);

      if (!block.length) return;

      const selectionOffsetStart = selectionStart - startLineStart;
      const selectionOffsetEnd = selectionEnd - startLineStart;
      const selectionEndInBlock = Math.min(selectionOffsetEnd, block.length);
      const lines = block.split("\n");
      let removalBeforeStart = 0;
      let removalBeforeEnd = 0;
      let blockIndex = 0;
      const dedentedLines = lines.map((line, idx) => {
        const match = line.match(/^ {1,4}/);
        const removal = match ? match[0].length : 0;
        const nextLineStart = blockIndex;
        const nextLineEnd = blockIndex + line.length;
        if (idx === 0) {
          removalBeforeStart = Math.min(removal, selectionOffsetStart);
        }
        if (selectionEndInBlock > nextLineStart) {
          const available = Math.max(0, Math.min(removal, selectionEndInBlock - nextLineStart));
          removalBeforeEnd += available;
        }
        blockIndex = nextLineEnd + 1;
        return removal ? line.slice(removal) : line;
      });

      const nextBlock = dedentedLines.join("\n");
      if (nextBlock === block) {
        return;
      }

      const nextValue = `${text.slice(0, startLineStart)}${nextBlock}${text.slice(endLineEnd)}`;
      const newStart = selectionStart - removalBeforeStart;
      const newEnd = selectionEnd - removalBeforeEnd;
      onChange(nextValue);
      queueSelection(newStart, newEnd);
    },
    [onChange, queueSelection]
  );

  return (
    <div
      className={clsx(
        "codebox relative isolate w-full overflow-hidden rounded-xl border bg-(--surface-2)/80 transition-shadow",
        isInvalid
          ? "border-red-500/60 focus-within:border-red-500/70 focus-within:ring-2 focus-within:ring-red-400"
          : "border-white/10 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400"
      )}
    >
      <div className="relative flex w-full" style={containerStyle}>
        <div
          className="flex shrink-0 select-none border-r border-white/10 bg-black/20 px-3 py-3 text-right font-mono text-sm leading-6 text-white/40"
          aria-hidden="true"
        >
          <div ref={lineNumbersInnerRef} className="relative w-full">
            {Array.from({ length: lineCount }, (_, index) => {
              const lineNumber = index + 1;
              const isErrorLine = errorLineSet.has(lineNumber);
              return (
                <div
                  key={index}
                  className={clsx(
                    "tabular-nums px-2",
                    isErrorLine && "bg-red-500/20 text-white/80"
                  )}
                  style={{ lineHeight: "var(--codebox-line-height)", minHeight: "var(--codebox-line-height)" }}
                >
                  {lineNumber}
                </div>
              );
            })}
          </div>
        </div>
        <div className="relative flex-1 overflow-hidden">
          <div
            ref={highlightWrapperRef}
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
            <div ref={highlightOverlayRef} className="pointer-events-none absolute inset-0">
              {highlightRects.map(rect => (
                <div
                  key={rect.key}
                  className="pointer-events-none rounded-sm bg-red-500/20"
                  style={{
                    position: "absolute",
                    top: `calc(var(--codebox-padding-y) + ${rect.index} * var(--codebox-line-height))`,
                    height: "var(--codebox-line-height)",
                    left: "var(--codebox-padding-x)",
                    right: "var(--codebox-padding-x)",
                  }}
                />
              ))}
            </div>
            <div
              className="h-full px-4 py-3 font-mono text-sm leading-6 text-white"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={event => {
              onChange(event.target.value);
              requestAnimationFrame(syncScroll);
            }}
            onBlur={onBlur}
            onScroll={syncScroll}
            onKeyDown={event => {
              if (event.key === "Tab" && textareaRef.current) {
                event.preventDefault();
                if (event.shiftKey) {
                  handleOutdent(textareaRef.current);
                } else {
                  handleIndent(textareaRef.current);
                }
              }
            }}
            aria-invalid={isInvalid || undefined}
            aria-describedby={describedBy}
            placeholder="// paste your code here"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            style={{ backgroundColor: "transparent", borderRadius: 0, ...textareaStyle }}
            className={clsx(
              "relative z-10 h-full w-full resize-none overflow-auto border-0 bg-transparent px-4 py-3 font-mono text-sm leading-6 text-white outline-none focus:outline-none",
              value
                ? "caret-brand-200 selection:bg-brand-500/30 selection:text-white"
                : "text-white/80 placeholder:text-white/40"
            )}
          />
        </div>
      </div>
    </div>
  );
}
