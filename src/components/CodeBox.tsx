"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { clsx } from "clsx";
import { CODE_CANVAS_BG } from "@/lib/highlight-sfml";

const SFML_LANGUAGE_ID = "sfml";
const SFML_THEME_ID = "sfm-dracula";
const MIN_HEIGHT = 256;
const MAX_HEIGHT = 560;

const KEYWORDS = [
  "EXCEPT",
  "MOVE",
  "FROM",
  "TO",
  "INPUT",
  "OUTPUT",
  "WHERE",
  "SLOTS",
  "RETAIN",
  "EACH",
  "TOP",
  "BOTTOM",
  "NORTH",
  "EAST",
  "SOUTH",
  "WEST",
  "SIDE",
  "SELF",
  "SECONDS",
  "EVERY",
  "PULSE",
  "WORLD",
  "PROGRAM",
  "WITH",
  "WITHOUT",
  "DO",
  "END",
  "IF",
  "ELSE",
  "THEN",
];

const TYPES = ["TICKS", "TICK", "ROUND", "ROBIN", "NAME", "FORGET", "FLUID", "GAS", "ITEM", "FE"];
const OPERATORS = ["=", ">", "<", ">=", "<=", "EQ", "GT", "LT", "LE", "GE"];

const theme: Monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  colors: {
    "editor.background": "#0c0e12",
    "editorLineNumber.foreground": "#9ca3af",
    "editorLineNumber.activeForeground": "#c084fc",
    "editorCursor.foreground": "#a78bfa",
    "editorIndentGuide.background": "#374151",
    "editorIndentGuide.activeBackground": "#6b7280",
    "editorLineHighlightBackground": "#111827",
    "editorGutter.background": "#0c0e12",
    "editor.selectionBackground": "#5b21b6",
  },
  rules: [
    { token: "comment", foreground: "6272a4" },
    { token: "string", foreground: "f1fa8c" },
    { token: "number", foreground: "bd93f9" },
    { token: "keyword", foreground: "ff79c6" },
    { token: "type", foreground: "8be9fd" },
    { token: "operator", foreground: "ffb86c" },
  ],
};

type CodeBoxProps = {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  isInvalid?: boolean;
  describedBy?: string;
  errorLines?: number[];
  warningRanges?: { startLine: number; endLine?: number }[];
  wrapLines?: boolean;
};

type MarkerInput = { severity: Monaco.MarkerSeverity; startLine: number; endLine: number };

function normalizeMarkers(errorLines?: number[], warningRanges?: { startLine: number; endLine?: number }[]) {
  const markers: MarkerInput[] = [];
  if (errorLines?.length) {
    errorLines.forEach(line => {
      if (Number.isFinite(line) && line > 0) {
        markers.push({ severity: Monaco.MarkerSeverity.Error, startLine: Math.floor(line), endLine: Math.floor(line) });
      }
    });
  }

  warningRanges?.forEach(range => {
    if (!Number.isFinite(range.startLine) || range.startLine <= 0) return;
    const start = Math.floor(range.startLine);
    const end = Number.isFinite(range.endLine) && range.endLine && range.endLine > 0 ? Math.floor(range.endLine) : start;
    markers.push({ severity: Monaco.MarkerSeverity.Warning, startLine: start, endLine: end });
  });

  return markers;
}

function ensureLanguage(monaco: typeof Monaco) {
  const existing = monaco.languages.getLanguages().some(lang => lang.id === SFML_LANGUAGE_ID);
  if (!existing) {
    monaco.languages.register({ id: SFML_LANGUAGE_ID });
    monaco.languages.setLanguageConfiguration(SFML_LANGUAGE_ID, {
      comments: { lineComment: "--" },
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"],
      ],
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
      ],
    });
    monaco.languages.setMonarchTokensProvider(SFML_LANGUAGE_ID, {
      keywords: KEYWORDS,
      typeKeywords: TYPES,
      operators: OPERATORS,
      symbols: /[=><!~?:&|+\-*\/\^%]+/,
      escapes: /\\(?:[nrt"\\]|x[0-9A-Fa-f]{1,4})/,
      tokenizer: {
        root: [
          [/--.*$/, "comment"],
          [/\"([^\\\"]|\\.)*\"/, "string"],
          [/\b\d+\b/, "number"],
          [/\b(@typeKeywords)\b/, "type"],
          [/\b(@keywords)\b/, "keyword"],
          [/\b(@operators)\b/, "operator"],
          [/(@symbols)/, "operator"],
          [/\w+/, "identifier"],
        ],
      },
      ignoreCase: true,
    });
    monaco.editor.defineTheme(SFML_THEME_ID, theme);
  }
}

export function CodeBox({
  value,
  onChange,
  onBlur,
  isInvalid = false,
  describedBy,
  errorLines,
  warningRanges,
  wrapLines = true,
}: CodeBoxProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [editorHeight, setEditorHeight] = useState(MIN_HEIGHT);

  const markers = useMemo(() => normalizeMarkers(errorLines, warningRanges), [errorLines, warningRanges]);

  const applyMarkers = useCallback(() => {
    if (!monacoRef.current || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    monacoRef.current.editor.setModelMarkers(
      model,
      SFML_LANGUAGE_ID,
      markers.map(marker => ({
        startLineNumber: marker.startLine,
        startColumn: 1,
        endLineNumber: marker.endLine,
        endColumn: 1,
        message: marker.severity === Monaco.MarkerSeverity.Error ? "Error" : "Warning",
        severity: marker.severity,
      })),
    );
  }, [markers]);

  const updateHeight = useCallback(() => {
    if (!editorRef.current) return;
    const contentHeight = editorRef.current.getContentHeight();
    const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(contentHeight + 24)));
    setEditorHeight(next);
    editorRef.current.layout({ height: next });
  }, []);

  useEffect(() => {
    applyMarkers();
  }, [applyMarkers]);

  const handleMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;
    ensureLanguage(monaco);
    monaco.editor.setTheme(SFML_THEME_ID);
    applyMarkers();
    updateHeight();

    const resize = new ResizeObserver(() => {
      editor.layout();
      updateHeight();
    });
    if (containerRef.current) resize.observe(containerRef.current);

    const disposables: Monaco.IDisposable[] = [
      editor.onDidContentSizeChange(() => updateHeight()),
      editor.onDidBlurEditorText(() => onBlur?.()),
    ];

    return () => {
      resize.disconnect();
      disposables.forEach(d => d.dispose());
    };
  }, [applyMarkers, onBlur, updateHeight]);

  return (
    <div
      className={clsx(
        "codebox relative isolate w-full overflow-hidden rounded-xl border bg-(--surface-2)/80 transition-shadow",
        isInvalid
          ? "border-red-500/60 focus-within:border-red-500/70 focus-within:ring-2 focus-within:ring-red-400"
          : "border-white/10 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400",
      )}
      aria-invalid={isInvalid || undefined}
      aria-describedby={describedBy}
    >
      <div ref={containerRef} className="relative" style={{ backgroundColor: `rgba${CODE_CANVAS_BG}`, minHeight: MIN_HEIGHT }}>
        <Editor
          height={editorHeight}
          defaultLanguage={SFML_LANGUAGE_ID}
          language={SFML_LANGUAGE_ID}
          theme={SFML_THEME_ID}
          value={value}
          onChange={next => onChange(next ?? "")}
          onMount={handleMount}
          options={{
            fontSize: 14,
            fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            minimap: { enabled: false },
            wordWrap: wrapLines ? "on" : "off",
            wrappingIndent: "same",
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            renderLineHighlight: "line",
            renderValidationDecorations: "on",
            automaticLayout: false,
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 14,
            lineNumbersMinChars: 3,
            padding: { top: 14, bottom: 14 },
            tabSize: 4,
            ariaLabel: "Code editor",
          }}
        />
      </div>
    </div>
  );
}
