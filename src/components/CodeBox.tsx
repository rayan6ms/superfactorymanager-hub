"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import type * as monacoNs from "monaco-editor";
import { clsx } from "clsx";

const SFML_LANGUAGE_ID = "sfml";
const SFML_THEME_ID = "sfm-dracula";
const MIN_HEIGHT = 256;
const MAX_HEIGHT = 560;

const theme: monacoNs.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  colors: {
    "editor.background": "#13131A",
    "editorLineNumber.foreground": "#9ca3af",
    "editorLineNumber.activeForeground": "#c084fc",
    "editorCursor.foreground": "#a78bfa",
    "editorIndentGuide.background": "#374151",
    "editorIndentGuide.activeBackground": "#6b7280",
    "editorLineHighlightBackground": "#111827",
    "editorGutter.background": "#13131A",
    "editor.selectionBackground": "#5b21b6",
  },
  rules: [
    { token: "comment", foreground: "#A8A8A8" },

    { token: "punctuation.simple", foreground: "#FFFFFF" },

    { token: "keyword.core", foreground: "#767DFF" },
    { token: "keyword.io", foreground: "#FE82F6" },
    { token: "keyword.position", foreground: "#B833C6" },

    { token: "keyword.logic", foreground: "#FFC47C" },
    { token: "number.tick", foreground: "#FFC47C" },

    { token: "number", foreground: "#7DE7FF" },
    { token: "operator.logic", foreground: "#7DE7FF" },

    { token: "identifier", foreground: "#80ED89" },
    { token: "string", foreground: "#80ED89" },

    { token: "keyword.redstone", foreground: "#F96767" },
    { token: "invalid", foreground: "#F96767" },

    { token: "keyword.special", foreground: "#F1FA8C" },
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

type MonacoGlobal = typeof globalThis & {
  MonacoEnvironment?: {
    getWorker?: (moduleId: string, label: string) => Worker;
  };
};

function ensureMonacoEnvironment() {
  const monacoGlobal = globalThis as MonacoGlobal;
  if (typeof window === "undefined") return;
  if (monacoGlobal.MonacoEnvironment?.getWorker) return;

  monacoGlobal.MonacoEnvironment = {
    ...monacoGlobal.MonacoEnvironment,
    getWorker(_moduleId, label) {
      if (label === "json") {
        return new Worker(
          new URL("monaco-editor/esm/vs/language/json/json.worker.js", import.meta.url),
          { type: "module" },
        );
      }

      if (label === "css" || label === "scss" || label === "less") {
        return new Worker(
          new URL("monaco-editor/esm/vs/language/css/css.worker.js", import.meta.url),
          { type: "module" },
        );
      }

      if (label === "html" || label === "handlebars" || label === "razor") {
        return new Worker(
          new URL("monaco-editor/esm/vs/language/html/html.worker.js", import.meta.url),
          { type: "module" },
        );
      }

      if (label === "typescript" || label === "javascript") {
        return new Worker(
          new URL("monaco-editor/esm/vs/language/typescript/ts.worker.js", import.meta.url),
          { type: "module" },
        );
      }

      return new Worker(
        new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url),
        { type: "module" },
      );
    },
  };
}

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
  if (existing) return;

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
    ignoreCase: true,
    tokenizer: {
      root: [
        // comments
        [/--.*$/, "comment"],

        // closed strings
        [/\"([^\"\\]|\\.)*\"/, "string"],

        // unclosed strings -> red
        [/\"([^\"\\]|\\.)*$/, "invalid"],

        // numbers before g -> orange
        [/\b(\d+)(?=\s*[gG]\b)/, "number.tick"],

        // other numbers -> teal
        [/\b\d+\b/, "number"],

        // strategies
        [/\bround robin by block\b/i, "keyword.special"],
        [/\bround robin by label\b/i, "keyword.special"],

        // core keywords
        [
          /\b(name|every|do|if|end|has|then|forget|else|true|false)\b/i,
          "keyword.core"
        ],

        // IO
        [/\b(input|from|output|to)\b/i, "keyword.io"],

        // position
        [
          /\b(top|bottom|left|right|front|back|west|east|north|south|side|each)\b/i,
          "keyword.position"
        ],

        // logic/timing/g
        [
          /\b(ticks|tick|some|retain|slots|except|second|overall|lone|one|in|empty|seconds|slot|and|not|or|global|g)\b/i,
          "keyword.logic"
        ],

        // operators / helpers
        [/\b(ge|le|eq|gt|lt|plus|with|without|tag)\b/i, "operator.logic"],
        [/[=<>]=?|[#\+]/, "operator.logic"],

        // redstone / pulse
        [/\b(redstone|pulse)\b/i, "keyword.redstone"],

        // punctuation: , - : /
        [/[,:\-\/]/, "punctuation.simple"],

        // wildcard *
        [/\*/, "identifier"], // same green group

        // fallback identifiers
        [/\w+/, "identifier"]
      ]
    }
  });

  monaco.editor.defineTheme(SFML_THEME_ID, theme);
}

export function CodeBox({
  value,
  onChange,
  onBlur,
  isInvalid,
  describedBy,
  errorMarkers,
  warningRanges,
  wrapLines = true,
}: CodeBoxProps) {
  const [isLoaderConfigured, setIsLoaderConfigured] = useState(false);
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoNs | null>(null);

  const [editorHeight, setEditorHeight] = useState(MIN_HEIGHT);

  const [initialValue] = useState(() => value);

  useEffect(() => {
    let disposed = false;
    ensureMonacoEnvironment();

    import("monaco-editor")
      .then(monaco => {
        loader.config({ monaco });
        if (!disposed) {
          setIsLoaderConfigured(true);
        }
      })
      .catch(error => {
        console.error("Monaco loader setup failed:", error);
      });

    return () => {
      disposed = true;
    };
  }, []);

  const handleChange = useCallback(
    (next: string | undefined) => {
      onChange(next ?? "");
    },
    [onChange],
  );

  const markers = useMemo(
    () => normalizeMarkers(errorMarkers, warningRanges),
    [errorMarkers, warningRanges],
  );

  const updateHeight = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const contentHeight = editor.getContentHeight();
    const next = Math.min(
      MAX_HEIGHT,
      Math.max(MIN_HEIGHT, Math.ceil(contentHeight + 24)),
    );

    setEditorHeight(prev => (prev === next ? prev : next));
  }, []);

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
      message: marker.message ?? (marker.severity === "error" ? "Error" : "Warning"),
      severity:
        marker.severity === "error"
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
    }));

    monaco.editor.setModelMarkers(model, SFML_LANGUAGE_ID, markerData);
  }, [markers]);

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

      editor.onDidContentSizeChange(updateHeight);
      editor.onDidBlurEditorText(() => onBlur?.());

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
    },
    [applyMarkers, updateHeight, onBlur],
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
        style={{ backgroundColor: "rgba(0,0,0,0)", minHeight: MIN_HEIGHT }}
      >
        {isLoaderConfigured ? (
          <Editor
            height={editorHeight}
            defaultLanguage={SFML_LANGUAGE_ID}
            language={SFML_LANGUAGE_ID}
            theme={SFML_THEME_ID}
            defaultValue={initialValue}
            onChange={handleChange}
            onMount={handleMount}
            options={{
              fontSize: 14,
              fontFamily:
                '"Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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
        ) : (
          <div className="flex min-h-[256px] items-center justify-center px-4 py-10 text-sm text-white/60">
            Loading editor...
          </div>
        )}
      </div>
      <div className="flex justify-center text-center">
        <span>
          SFML syntax based on{" "}
          <a
            href="https://github.com/TeamDman/SuperFactoryManager"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-brand-300"
          >
            TeamDman/SuperFactoryManager
          </a>
        </span>
      </div>
    </div>
  );
}
