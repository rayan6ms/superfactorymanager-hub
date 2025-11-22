"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type * as monacoNs from "monaco-editor";
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

const theme: monacoNs.editor.IStandaloneThemeData = {
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
    { token: "comment", foreground: "#aaaaaa" },
    { token: "string", foreground: "#f1fa8c" },
    { token: "number", foreground: "#8be9fd" },
    { token: "keyword", foreground: "#938bfd" },
    { token: "type", foreground: "#fdca8b" },
    { token: "operator", foreground: "#ffffffff" },
    { token: "identifier", foreground: "#8bfd95" },
  ],
};

type CodeBoxProps = {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  isInvalid?: boolean;
  describedBy?: string;

  errorMarkers?: { line: number; message: string }[];
  warningRanges?: { startLine: number; endLine?: number; message?: string }[];

  wrapLines?: boolean;
};

type MarkerInput = {
  severity: "error" | "warning";
  startLine: number;
  endLine: number;
  message?: string;
};

function normalizeMarkers(
  errorMarkers?: { line: number; message: string }[],
  warningRanges?: { startLine: number; endLine?: number; message?: string }[],
): MarkerInput[] {
  const markers: MarkerInput[] = [];

  errorMarkers?.forEach(err => {
    if (Number.isFinite(err.line) && err.line > 0) {
      markers.push({
        severity: "error",
        startLine: Math.floor(err.line),
        endLine: Math.floor(err.line),
        message: err.message,
      });
    }
  });

  warningRanges?.forEach(range => {
    if (!Number.isFinite(range.startLine) || range.startLine <= 0) return;
    const start = Math.floor(range.startLine);
    const end =
      Number.isFinite(range.endLine) && range.endLine && range.endLine > 0
        ? Math.floor(range.endLine)
        : start;
    markers.push({
      severity: "warning",
      startLine: start,
      endLine: end,
      message: range.message,
    });
  });

  return markers;
}

function ensureLanguage(monaco: typeof monacoNs) {
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
      ignoreCase: true,
      tokenizer: {
        root: [
          [/--.*$/, "comment"],
          [/\"([^\\\"]|\\.)*\"/, "string"],
          [/\b\d+\b/, "number"],

          [/[A-Z_][A-Z0-9_]*/, {
            cases: {
              "@typeKeywords": "type",
              "@keywords": "keyword",
              "@operators": "operator",
              "@default": "identifier",
            },
          }],

          [/[=><!~?:&|+\-*\/\^%]+/, "operator"],

          [/\w+/, "identifier"],
        ],
      },
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
  errorMarkers,
  warningRanges,
  wrapLines = true,
}: CodeBoxProps) {
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoNs | null>(null);
  const editorHeightRef = useRef(MIN_HEIGHT);
  const [editorHeight, setEditorHeight] = useState(MIN_HEIGHT);

  const markers = useMemo(
    () => normalizeMarkers(errorMarkers, warningRanges),
    [errorMarkers, warningRanges],
  );

  const applyMarkers = useCallback(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;

    const model = editor.getModel();
    if (!model) return;

    const markerData: monacoNs.editor.IMarkerData[] = markers.map(marker => ({
      startLineNumber: marker.startLine,
      startColumn: 1,
      endLineNumber: marker.endLine,
      endColumn: 1,
      message:
        marker.message ??
        (marker.severity === "error" ? "Error" : "Warning"),
      severity:
        marker.severity === "error"
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
    }));

    monaco.editor.setModelMarkers(model, SFML_LANGUAGE_ID, markerData);
  }, [markers]);

  const updateHeight = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const contentHeight = editor.getContentHeight();
    const next = Math.min(
      MAX_HEIGHT,
      Math.max(MIN_HEIGHT, Math.ceil(contentHeight + 24)),
    );

    if (next !== editorHeightRef.current) {
      editorHeightRef.current = next;
      setEditorHeight(next);
    }
  }, []);

  useEffect(() => {
    applyMarkers();
  }, [applyMarkers]);

  const handleMount = useCallback(
    (editor: monacoNs.editor.IStandaloneCodeEditor, monaco: typeof monacoNs) => {
      monacoRef.current = monaco;
      editorRef.current = editor;

      ensureLanguage(monaco);
      monaco.editor.setTheme(SFML_THEME_ID);

      applyMarkers();
      updateHeight();

      const disposables: monacoNs.IDisposable[] = [
        editor.onDidContentSizeChange(() => updateHeight()),
        editor.onDidBlurEditorText(() => onBlur?.()),
      ];

      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Tab, () => {
        editor.getAction("editor.action.outdentLines")?.run();
      });

      editor.addCommand(monaco.KeyCode.Tab, () => {
        const selection = editor.getSelection();
        if (!selection) return;

        if (selection.startLineNumber !== selection.endLineNumber) {
          editor.getAction("editor.action.indentLines")?.run();
        } else {
          editor.trigger("keyboard", "type", { text: "\t" });
        }
      });

      return () => {
        disposables.forEach(d => d.dispose());
      };
    },
    [applyMarkers, onBlur, updateHeight],
  );

  return (
    <div
      className={clsx(
        "codebox relative isolate w-full rounded-xl border bg-[#0c0e12] transition-shadow",
        isInvalid
          ? "border-red-500/60 focus-within:border-red-500/70 focus-within:ring-2 focus-within:ring-red-400"
          : "border-white/10 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400",
      )}
      aria-invalid={isInvalid || undefined}
      aria-describedby={describedBy}
    >
      <div
        className="relative"
        style={{ backgroundColor: `rgba${CODE_CANVAS_BG}`, minHeight: MIN_HEIGHT }}
      >
        <Editor
          height={editorHeight}
          defaultLanguage={SFML_LANGUAGE_ID}
          language={SFML_LANGUAGE_ID}
          theme={SFML_THEME_ID}
          defaultValue={value}
          onChange={next => onChange(next ?? "")}
          onMount={handleMount}
          options={{
            fontSize: 14,
            fontFamily:
              '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            minimap: { enabled: false },
            wordWrap: wrapLines ? "on" : "off",
            wrappingIndent: "same",
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            renderLineHighlight: "line",
            renderValidationDecorations: "on",
            automaticLayout: true,
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
