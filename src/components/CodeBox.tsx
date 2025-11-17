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
import { CODE_CANVAS_BG, highlightSFML } from "@/lib/highlight-sfml";

type CodeBoxProps = {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  isInvalid?: boolean;
  describedBy?: string;
  errorLines?: number[];
  wrapLines?: boolean;
};

type CodeBoxCSSVars = {
  "--codebox-line-height": string;
  "--codebox-padding-x": string;
  "--codebox-padding-y": string;
  "--codebox-highlight-bg": string;
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
const CODE_PADDING_X = "1rem";
const CODE_PADDING_Y = "0.75rem";
const LINE_SPLIT_REGEX = /\r\n|\r|\n/;

const parseCssNumber = (value?: string | null) => {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (trimmed.endsWith("rem")) {
    const base = typeof window !== "undefined" ? parseFloat(getComputedStyle(document.documentElement).fontSize || "16") : 16;
    return parseFloat(trimmed) * (Number.isFinite(base) ? base : 16);
  }
  if (trimmed.endsWith("px")) {
    return parseFloat(trimmed);
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : 0;
};

export function CodeBox({ value, onChange, onBlur, isInvalid = false, describedBy, errorLines, wrapLines = true }: CodeBoxProps) {
  const deferredValue = useDeferredValue(value);
  const [highlightState, setHighlightState] = useState<{ code: string; html: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightWrapperRef = useRef<HTMLDivElement | null>(null);
  const highlightContentRef = useRef<HTMLElement | null>(null);
  const highlightOverlayRef = useRef<HTMLDivElement | null>(null);
  const lineNumbersInnerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [boxHeight, setBoxHeight] = useState<number>(MIN_HEIGHT);
  const [lineHeight, setLineHeight] = useState<string>(DEFAULT_LINE_HEIGHT);
  const [lineHeights, setLineHeights] = useState<number[]>([]);
  const containerStyle = useMemo<CodeBoxCSSVars & CSSProperties>(
    () => ({
      height: boxHeight,
      "--codebox-line-height": lineHeight,
      "--codebox-padding-x": CODE_PADDING_X,
      "--codebox-padding-y": CODE_PADDING_Y,
      "--codebox-highlight-bg": CODE_CANVAS_BG,
    }),
    [boxHeight, lineHeight]
  );
  const fallbackHtml = useMemo(() => plainHighlight(value), [value]);
  const highlightReady = highlightState?.code === value;
  const html = highlightReady ? highlightState.html : fallbackHtml;
  const textareaStyle = useMemo<CSSProperties>(() => {
    const style: CSSProperties = {
      whiteSpace: wrapLines ? "pre-wrap" : "pre",
      overflowWrap: wrapLines ? "break-word" : "normal",
      wordBreak: wrapLines ? "break-word" : "normal",
    };
    if (value && highlightReady) {
      style.color = "transparent";
      style.WebkitTextFillColor = "transparent";
    }
    return style;
  }, [value, highlightReady, wrapLines]);
  const lineCount = useMemo(() => Math.max(1, value.split(LINE_SPLIT_REGEX).length), [value]);
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
  const fallbackLineHeightPx = useMemo(
    () => parseCssNumber(lineHeight) || parseCssNumber(DEFAULT_LINE_HEIGHT) || 24,
    [lineHeight]
  );
  const effectiveLineHeights = useMemo(() => {
    if (!lineCount) return [] as number[];
    return Array.from({ length: lineCount }, (_, index) => lineHeights[index] ?? fallbackLineHeightPx);
  }, [lineCount, lineHeights, fallbackLineHeightPx]);
  const lineOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (let i = 0; i < lineCount; i += 1) {
      offsets[i] = acc;
      acc += effectiveLineHeights[i] ?? fallbackLineHeightPx;
    }
    return offsets;
  }, [effectiveLineHeights, fallbackLineHeightPx, lineCount]);
  const highlightRects = useMemo(() => {
    if (!uniqueErrorLines.length) return [] as { key: number; top: number; height: number }[];
    return uniqueErrorLines
      .map(line => {
        const index = line - 1;
        const height = effectiveLineHeights[index];
        const top = lineOffsets[index];
        if (typeof height !== "number" || typeof top !== "number") return null;
        return { key: line, top, height };
      })
      .filter((rect): rect is { key: number; top: number; height: number } => Boolean(rect));
  }, [uniqueErrorLines, effectiveLineHeights, lineOffsets]);

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
    target.style.minWidth = wrapLines ? "100%" : "auto";
    target.style.width = wrapLines ? "100%" : "max-content";
    target.style.whiteSpace = wrapLines ? "pre-wrap" : "pre";
    target.style.wordBreak = wrapLines ? "break-word" : "normal";
    target.style.overflowWrap = wrapLines ? "break-word" : "normal";
    if (computed.lineHeight && computed.lineHeight !== lineHeight) {
      setLineHeight(computed.lineHeight);
    }
  }, [lineHeight, wrapLines]);

  const computeLineMetrics = useCallback(() => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const text = textarea.value ?? "";
    const lines = text.length ? text.split(LINE_SPLIT_REGEX) : [""];
    const computed = window.getComputedStyle(textarea);
    const baseLineHeightPx = parseCssNumber(computed.lineHeight) || fallbackLineHeightPx;
    if (!wrapLines) {
      setLineHeights(lines.map(() => baseLineHeightPx));
      return;
    }
    const paddingLeft = parseCssNumber(computed.paddingLeft);
    const paddingRight = parseCssNumber(computed.paddingRight);
    const availableWidth = Math.max(1, textarea.clientWidth - paddingLeft - paddingRight);
    const canvas = (measureCanvasRef.current ||= document.createElement("canvas"));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setLineHeights(lines.map(() => baseLineHeightPx));
      return;
    }
    const fontDescriptor = `${computed.fontStyle} ${computed.fontVariant} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`
      .replace(/\s+/g, " ")
      .trim();
    ctx.font = fontDescriptor;
    const heights = lines.map(line => {
      const normalized = (line || " ").replace(/\t/g, INDENT);
      const measuredWidth = ctx.measureText(normalized || " ").width;
      const wraps = Math.max(1, Math.ceil(measuredWidth / availableWidth));
      return wraps * baseLineHeightPx;
    });
    setLineHeights(heights);
  }, [fallbackLineHeightPx, wrapLines]);

  useEffect(() => {
    let active = true;
    const plain = plainHighlight(deferredValue);

    highlightSFML(deferredValue, wrapLines ? "sfm-dracula-soft" : "sfm-dracula")
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
  }, [deferredValue, wrapLines]);

  useEffect(() => {
    if (!highlightWrapperRef.current) return;
    const pre = highlightWrapperRef.current.querySelector("pre");
    if (pre) {
      highlightContentRef.current = pre as HTMLElement;
      pre.style.transformOrigin = "top left";
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

  useLayoutEffect(() => {
    computeLineMetrics();
  }, [value, wrapLines, computeLineMetrics]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      syncScroll();
    });
    return () => cancelAnimationFrame(raf);
  }, [boxHeight, value, syncScroll]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      computeLineMetrics();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [computeLineMetrics]);

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
      data-wrap-mode={wrapLines ? "wrap" : "scroll"}
    >
      <div className="relative flex w-full" style={containerStyle}>
        <div
          className="flex shrink-0 select-none border-r border-white/10 bg-black/20 px-3 py-3 text-right font-mono text-sm text-white/40"
          aria-hidden="true"
        >
          <div ref={lineNumbersInnerRef} className="relative w-full">
            {Array.from({ length: lineCount }, (_, index) => {
              const lineNumber = index + 1;
              const isErrorLine = errorLineSet.has(lineNumber);
              const height = Math.max(effectiveLineHeights[index] ?? fallbackLineHeightPx, 1);
              return (
                <div
                  key={index}
                  className={clsx(
                    "tabular-nums flex items-start justify-end px-2 text-xs",
                    isErrorLine && "bg-red-500/20 text-white/80"
                  )}
                  style={{
                    lineHeight: "var(--codebox-line-height)",
                    height: `${height}px`,
                  }}
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
            className="codebox-highlight pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
            <div ref={highlightOverlayRef} className="pointer-events-none absolute inset-0">
              {highlightRects.map(rect => (
                <div
                  key={rect.key}
                  className="pointer-events-none rounded-sm bg-red-500/20"
                  style={{
                    position: "absolute",
                    top: `calc(var(--codebox-padding-y) + ${rect.top}px)`,
                    height: `${rect.height}px`,
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
            onPaste={() => {
              requestAnimationFrame(adjustHeight);
            }}
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
            placeholder="-- paste your code here"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            wrap={wrapLines ? "soft" : "off"}
            style={{ backgroundColor: "transparent", borderRadius: 0, ...textareaStyle }}
            className={clsx(
              "relative z-10 h-full w-full resize-none border-0 bg-transparent px-4 py-3 font-mono text-sm leading-6 text-white outline-none focus:outline-none",
              wrapLines ? "overflow-y-auto overflow-x-hidden" : "overflow-auto",
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
