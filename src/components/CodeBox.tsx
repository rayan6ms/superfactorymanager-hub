"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { clsx } from "clsx";
import { highlightSFML } from "@/lib/highlight-sfml";

type CodeBoxProps = {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  isInvalid?: boolean;
  describedBy?: string;
};

const escapeHtml = (input: string) =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const plainHighlight = (code: string) => {
  const safe = code ? escapeHtml(code) : "&nbsp;";
  return `<pre class="shiki plain" style="color: rgba(255,255,255,0.85)"><code>${safe}</code></pre>`;
};

export function CodeBox({ value, onChange, onBlur, isInvalid = false, describedBy }: CodeBoxProps) {
  const deferredValue = useDeferredValue(value);
  const [highlightState, setHighlightState] = useState<{ code: string; html: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightWrapperRef = useRef<HTMLDivElement | null>(null);
  const highlightContentRef = useRef<HTMLElement | null>(null);
  const fallbackHtml = useMemo(() => plainHighlight(value), [value]);
  const highlightReady = highlightState?.code === value;
  const html = highlightReady ? highlightState.html : fallbackHtml;
  const textareaStyle = useMemo<CSSProperties | undefined>(
    () =>
      value && highlightReady ? { color: "transparent", WebkitTextFillColor: "transparent" } : undefined,
    [value, highlightReady]
  );

  const syncScroll = useCallback(() => {
    if (!textareaRef.current || !highlightContentRef.current) return;
    const { scrollTop, scrollLeft } = textareaRef.current;
    highlightContentRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
  }, []);

  useEffect(() => {
    let active = true;
    const plain = plainHighlight(deferredValue);

    highlightSFML(deferredValue, "dracula-soft")
      .then(html => {
        if (!active) return;
        setHighlightState({ code: deferredValue, html });
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
    }
    syncScroll();
  }, [syncScroll, html]);

  useEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  return (
    <div
      className={clsx(
        "codebox relative isolate grid w-full overflow-hidden rounded-xl border bg-[var(--surface-2)]/80 transition-shadow",
        isInvalid
          ? "border-red-500/60 focus-within:border-red-500/70 focus-within:ring-2 focus-within:ring-red-400"
          : "border-white/10 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400"
      )}
    >
      <div
        ref={highlightWrapperRef}
        className="codebox-highlight pointer-events-none col-span-full row-span-full h-full w-full overflow-hidden rounded-[inherit] px-4 py-3"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={event => {
          onChange(event.target.value);
        }}
        onBlur={onBlur}
        onScroll={syncScroll}
        aria-invalid={isInvalid || undefined}
        aria-describedby={describedBy}
        placeholder="// paste your code here"
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        style={{ backgroundColor: "transparent", ...textareaStyle }}
        className={clsx(
          "col-span-full row-span-full relative z-10 min-h-[16rem] w-full resize-y border-0 bg-transparent px-4 py-3 font-mono text-sm leading-6 text-white outline-none focus:outline-none",
          value
            ? "caret-brand-200 selection:bg-brand-500/30 selection:text-white"
            : "text-white/80 placeholder:text-white/40"
        )}
      />
    </div>
  );
}
