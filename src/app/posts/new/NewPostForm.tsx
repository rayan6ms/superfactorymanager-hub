"use client";

import { useCallback, useEffect, useMemo, useState, useId } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Images, UploadCloud } from "lucide-react";
import { CodeBox } from "@/components/CodeBox";
import { Card, Button, Input } from "@/components/ui";
import { validateSyntax, type SyntaxErrorItem } from "@/lib/sfml/syntax";
import { collectWarnings, type WarningItem } from "@/lib/sfml/warnings";

const MAX_IMAGE_MB = 5;
const MAX_TITLE_LENGTH = 120;
const MIN_DESCRIPTION_LENGTH = 50;
const CATEGORY_KEY_PATTERN = /^[a-z0-9]+(?:[\-/][a-z0-9]+)*$/i;
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
const CODE_ANALYZE_DEBOUNCE = 350;
const YOUTUBE_REGEX = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;

type Matrix = { byGame: Record<string, string[]>; gameVersions: string[] };
type FormState = {
  title: string;
  gameVersion: string;
  modVersion: string;
  categoryKey: string;
  description: string;
  code: string;
  youtubeUrl: string;
};

type FormErrorKey = keyof FormState | "images";

type CodeFeedback = {
  status: "idle" | "ok" | "error";
  message: string | null;
  syntaxErrors: SyntaxErrorItem[];
  warnings: WarningItem[];
};

const INITIAL_ERRORS: Record<FormErrorKey, string | null> = {
  title: null,
  gameVersion: null,
  modVersion: null,
  categoryKey: null,
  description: null,
  code: null,
  youtubeUrl: null,
  images: null,
};

const INITIAL_TOUCHED: Record<FormErrorKey, boolean> = {
  title: false,
  gameVersion: false,
  modVersion: false,
  categoryKey: false,
  description: false,
  code: false,
  youtubeUrl: false,
  images: false,
};

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {description && <p className="text-sm text-white/60">{description}</p>}
    </div>
  );
}

export default function NewPostForm() {
  const r = useRouter();
  const idPrefix = useId();

  const [matrix, setMatrix] = useState<Matrix>({ byGame: {}, gameVersions: [] });
  const [form, setForm] = useState<FormState>({
    title: "",
    gameVersion: "",
    modVersion: "",
    categoryKey: "",
    description: "",
    code: "",
    youtubeUrl: "",
  });
  const [depsInput, setDepsInput] = useState("");
  const [deps, setDeps] = useState<{ url: string; name: string }[]>([]);
  const [depError, setDepError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<FormErrorKey, string | null>>({ ...INITIAL_ERRORS });
  const [touched, setTouched] = useState<Record<FormErrorKey, boolean>>({ ...INITIAL_TOUCHED });
  const [submitted, setSubmitted] = useState(false);
  const [codeFeedback, setCodeFeedback] = useState<CodeFeedback>({
    status: "error",
    message: "Code is required.",
    syntaxErrors: [],
    warnings: [],
  });
  const [loading, setLoading] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileSummary = useMemo(() => {
    if (!mediaFiles.length) return "No files chosen";
    if (mediaFiles.length === 1) return mediaFiles[0].name;
    return `${mediaFiles.length} files selected`;
  }, [mediaFiles]);
  const errorId = useCallback((key: FormErrorKey) => `${idPrefix}-${key}-error`, [idPrefix]);
  const codeWarningsId = `${idPrefix}-code-warnings`;

  const markTouched = useCallback((key: FormErrorKey) => {
    setTouched(prev => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const touchAll = useCallback(() => {
    setTouched(prev => {
      const next: Record<FormErrorKey, boolean> = { ...prev };
      (Object.keys(next) as FormErrorKey[]).forEach(k => {
        next[k] = true;
      });
      return next;
    });
  }, []);

  const shouldShowError = (key: FormErrorKey) => !!errors[key] && (submitted || touched[key]);

  const computeImagesError = useCallback((list: File[]) => {
    if (!list.length) return null;
    for (const file of list) {
      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > MAX_IMAGE_MB) {
        return `"${file.name}" is ${sizeMb.toFixed(1)}MB. Each image must be ${MAX_IMAGE_MB}MB or smaller.`;
      }
    }
    return null;
  }, []);

  const analyzeCode = useCallback((code: string): CodeFeedback => {
    const trimmed = code.trim();
    if (!trimmed) {
      return { status: "error", message: "Code is required.", syntaxErrors: [], warnings: [] };
    }
    if (trimmed.length < 3) {
      return {
        status: "error",
        message: `Code must be at least 3 characters long (currently ${trimmed.length}).`,
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
        ? `line ${first.lineStart}${typeof first.columnStart === "number" ? `, column ${first.columnStart + 1}` : ""}`
        : "the script";
      return {
        status: "error",
        message: first ? `Syntax error on ${location}: ${first.message}` : "Syntax error in script.",
        syntaxErrors: syntax.errors,
        warnings: [],
      };
    }

    const warnings = collectWarnings(trimmed);
    return { status: "ok", message: null, syntaxErrors: [], warnings };
  }, []);

  const validateField = useCallback((key: keyof FormState, value: string, current: FormState): string | null => {
    const trimmed = value.trim();
    switch (key) {
      case "title": {
        if (!trimmed) return "Title is required.";
        if (trimmed.length > MAX_TITLE_LENGTH) {
          return `Title must be ${MAX_TITLE_LENGTH} characters or fewer (currently ${trimmed.length}).`;
        }
        return null;
      }
      case "gameVersion":
        return trimmed ? null : "Choose a Minecraft version.";
      case "modVersion": {
        if (!current.gameVersion) return "Choose a Minecraft version first.";
        if (!trimmed) return "Choose an SFM mod version.";
        const allowed = matrix.byGame[current.gameVersion] || [];
        if (!allowed.includes(trimmed)) {
          return `SFM ${trimmed} is not available for Minecraft ${current.gameVersion}.`;
        }
        return null;
      }
      case "categoryKey": {
        if (!trimmed) return "Category key is required.";
        if (!CATEGORY_KEY_PATTERN.test(trimmed)) {
          return "Use lowercase letters, numbers, slashes, or hyphens only (e.g. factories/automation).";
        }
        return null;
      }
      case "description": {
        if (!trimmed) return "Description is required.";
        if (trimmed.length < MIN_DESCRIPTION_LENGTH) {
          return `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters (currently ${trimmed.length}).`;
        }
        return null;
      }
      case "code":
        return trimmed ? null : "Code is required.";
      case "youtubeUrl": {
        if (!trimmed) return null;
        return YOUTUBE_REGEX.test(trimmed) ? null : "Enter a valid YouTube video URL.";
      }
      default:
        return null;
    }
  }, [matrix]);

  const change = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    if (key === "code") {
      const nextValue = value as string;
      setForm(state => ({ ...state, code: nextValue }));
      const trimmed = nextValue.trim();
      if (!trimmed) {
        setCodeFeedback({ status: "error", message: "Code is required.", syntaxErrors: [], warnings: [] });
      }
      setErrors(prev => {
        const nextMessage = trimmed ? prev.code : "Code is required.";
        if (prev.code === nextMessage) return prev;
        return { ...prev, code: nextMessage };
      });
      return;
    }

    setForm(state => {
      const next = { ...state, [key]: value };
      const message = validateField(key, value as string, next);
      setErrors(prev => {
        if (prev[key] === message) return prev;
        return { ...prev, [key]: message };
      });
      return next;
    });
  }, [validateField]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/meta/sfm/versions");
      const data = await res.json();
      setMatrix(data);
    })();
  }, []);

  const modOptions = useMemo(
    () => (form.gameVersion ? (matrix.byGame[form.gameVersion] || []) : []),
    [form.gameVersion, matrix]
  );

  useEffect(() => {
    change("modVersion", "");
  }, [form.gameVersion, change]);

  useEffect(() => {
    const message = computeImagesError(mediaFiles);
    setErrors(prev => (prev.images === message ? prev : { ...prev, images: message }));
    if (!mediaFiles.length) {
      setPreviews(prev => (prev.length ? [] : prev));
      return;
    }
    const urls = mediaFiles.map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [mediaFiles, computeImagesError]);

  const removeMediaAt = useCallback((index: number) => {
    setMediaFiles(prev => prev.filter((_, idx) => idx !== index));
  }, []);

  const moveMedia = useCallback((from: number, to: number) => {
    setMediaFiles(prev => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  useEffect(() => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      setCodeFeedback(analyzeCode(form.code));
    }, CODE_ANALYZE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [form.code, analyzeCode]);

  useEffect(() => {
    setErrors(prev => {
      if (prev.code === codeFeedback.message) return prev;
      return { ...prev, code: codeFeedback.message };
    });
  }, [codeFeedback.message]);

  const addDep = async () => {
    const raw = depsInput.trim();
    setDepError(null);
    if (!raw) return;

    let url: URL;
    try { url = new URL(raw); } catch { setDepError("Invalid URL"); return; }
    if (!(url.hostname.includes("curseforge.com") || url.hostname.includes("modrinth.com"))) {
      setDepError("Must be a CurseForge or Modrinth link");
      return;
    }
    const res = await fetch(`/api/meta/dep/resolve?url=${encodeURIComponent(url.toString())}`);
    const data = await res.json();
    if (!res.ok) { setDepError(data.error || "Could not resolve"); return; }

    if (deps.find(d => d.url === url.toString())) { setDepsInput(""); return; }
    setDeps(d => [...d, { url: url.toString(), name: data.name }]);
    setDepsInput("");
  };

  const removeDep = (u: string) => setDeps(ds => ds.filter(d => d.url !== u));

  const submit = async () => {
    setSubmitted(true);
    touchAll();

    const nextErrors: Record<FormErrorKey, string | null> = {
      title: validateField("title", form.title, form),
      gameVersion: validateField("gameVersion", form.gameVersion, form),
      modVersion: validateField("modVersion", form.modVersion, form),
      categoryKey: validateField("categoryKey", form.categoryKey, form),
      description: validateField("description", form.description, form),
      code: null,
      youtubeUrl: validateField("youtubeUrl", form.youtubeUrl, form),
      images: computeImagesError(mediaFiles),
    };

    const codeAnalysis = analyzeCode(form.code);
    setCodeFeedback(codeAnalysis);
    nextErrors.code = codeAnalysis.message;

    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    try {
      setLoading(true);
      const body = {
        title: form.title.trim(),
        gameVersion: form.gameVersion,
        modVersion: form.modVersion,
        categoryKey: form.categoryKey.trim(),
        dependencies: deps.map(d => d.url),
        images: [],
        code: form.code,
        description: form.description.trim(),
        youtubeUrl: form.youtubeUrl.trim(),
      };
      const res = await fetch("/api/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Failed"); setLoading(false); return; }

      if (mediaFiles.length) {
        for (const f of mediaFiles) {
          const fd = new FormData();
          fd.append("file", f);
          await fetch(`/api/uploads/${data.id}`, { method: "POST", body: fd });
        }
      }
      r.push(`/posts/${data.slug}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1.15fr)] xl:gap-10">
        <Card className="space-y-6 px-6 py-5 sm:px-8 sm:py-7">
          <SectionTitle title="Post details" description="Set the essentials for your upload." />

          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium text-white/75">
                Title
              </label>
              <Input
                id="title"
                placeholder="Give your post a clear, descriptive title"
                value={form.title}
                onChange={e => change("title", e.target.value)}
                onBlur={() => markTouched("title")}
                aria-invalid={shouldShowError("title") || undefined}
                aria-describedby={shouldShowError("title") ? errorId("title") : undefined}
                className={clsx(
                  shouldShowError("title") && "border-red-500/60 focus:ring-red-400 focus:border-red-500/70"
                )}
              />
              <div className="flex items-center justify-between text-xs text-white/45">
                <span>Keep it under {MAX_TITLE_LENGTH} characters.</span>
                <span>
                  {form.title.trim().length}/{MAX_TITLE_LENGTH}
                </span>
              </div>
              {shouldShowError("title") && errors.title && (
                <p id={errorId("title")} className="text-sm text-red-400">
                  {errors.title}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="gameVersion" className="text-sm font-medium text-white/75">
                  Minecraft version
                </label>
                <select
                  id="gameVersion"
                  className={clsx(
                    "h-12 w-full rounded-2xl border border-white/10 bg-[var(--surface-2)]/80 px-4 text-sm font-medium text-white focus:ring-2",
                    shouldShowError("gameVersion")
                      ? "focus:ring-red-400 focus:border-red-500/70 border-red-500/60"
                      : "focus:border-brand-400 focus:ring-brand-400"
                  )}
                  value={form.gameVersion}
                  onChange={e => change("gameVersion", e.target.value)}
                  onBlur={() => markTouched("gameVersion")}
                  aria-invalid={shouldShowError("gameVersion") || undefined}
                  aria-describedby={shouldShowError("gameVersion") ? errorId("gameVersion") : undefined}
                >
                  <option value="">Select a Minecraft version…</option>
                  {matrix.gameVersions.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                {shouldShowError("gameVersion") && errors.gameVersion && (
                  <p id={errorId("gameVersion")} className="text-sm text-red-400">
                    {errors.gameVersion}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="modVersion" className="text-sm font-medium text-white/75">
                  SFM mod version
                </label>
                <div className="relative">
                  <select
                    id="modVersion"
                    className={clsx(
                      "h-12 w-full appearance-none rounded-2xl border border-white/10 bg-[var(--surface-2)]/80 px-4 text-sm font-medium text-white focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
                      shouldShowError("modVersion")
                        ? "focus:ring-red-400 focus:border-red-500/70 border-red-500/60"
                        : "focus:border-brand-400 focus:ring-brand-400"
                    )}
                    value={form.modVersion}
                    disabled={!form.gameVersion}
                    onChange={e => change("modVersion", e.target.value)}
                    onBlur={() => markTouched("modVersion")}
                    aria-invalid={shouldShowError("modVersion") || undefined}
                    aria-describedby={shouldShowError("modVersion") ? errorId("modVersion") : undefined}
                  >
                    <option value="">
                      {form.gameVersion ? "Select an SFM mod version…" : ""}
                    </option>
                    {modOptions.map(v => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {!form.gameVersion && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border border-dashed border-white/20 bg-black/30 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-white/45">
                      Select Minecraft first
                    </div>
                  )}
                </div>
                {shouldShowError("modVersion") && errors.modVersion && (
                  <p id={errorId("modVersion")} className="text-sm text-red-400">
                    {errors.modVersion}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="categoryKey" className="text-sm font-medium text-white/75">
                Category key
              </label>
              <Input
                id="categoryKey"
                placeholder="e.g. factories/automation"
                value={form.categoryKey}
                onChange={e => change("categoryKey", e.target.value)}
                onBlur={() => markTouched("categoryKey")}
                aria-invalid={shouldShowError("categoryKey") || undefined}
                aria-describedby={shouldShowError("categoryKey") ? errorId("categoryKey") : undefined}
                className={clsx(
                  shouldShowError("categoryKey") && "border-red-500/60 focus:ring-red-400 focus:border-red-500/70"
                )}
              />
              <p className="text-xs text-white/45">
                Use lowercase letters, numbers, slashes, or hyphens to group similar posts.
              </p>
              {shouldShowError("categoryKey") && errors.categoryKey && (
                <p id={errorId("categoryKey")} className="text-sm text-red-400">
                  {errors.categoryKey}
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card className="space-y-6 p-6 sm:px-8 sm:py-7">
          <SectionTitle
            title="Description"
            description="Tell readers what to expect and how to get started."
          />

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium text-white/75">
              Overview
            </label>
            <textarea
              id="description"
              className={clsx(
                "min-h-[8rem] w-full rounded-2xl border border-white/10 bg-[var(--surface-2)]/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:ring-2",
                shouldShowError("description")
                  ? "focus:ring-red-400 focus:border-red-500/70 border-red-500/60"
                  : "focus:border-brand-400 focus:ring-brand-400"
              )}
              placeholder="Describe the goal, features, and any setup instructions"
              value={form.description}
              onChange={e => change("description", e.target.value)}
              onBlur={() => markTouched("description")}
              aria-invalid={shouldShowError("description") || undefined}
              aria-describedby={shouldShowError("description") ? errorId("description") : undefined}
            />
            <p className="text-xs text-white/45">
              {form.description.trim().length}/{MIN_DESCRIPTION_LENGTH} characters minimum
            </p>
            {shouldShowError("description") && errors.description && (
              <p id={errorId("description")} className="text-sm text-red-400">
                {errors.description}
              </p>
            )}
          </div>
        </Card>

        <Card className="space-y-6 p-6 sm:px-8 sm:py-7">
          <SectionTitle
            title="Dependencies"
            description="Link any CurseForge or Modrinth projects your blueprint relies on."
          />

          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <label htmlFor="dependency" className="text-sm font-medium text-white/75">
                  Dependency URL
                </label>
                <Input
                  id="dependency"
                  placeholder="Paste a CurseForge or Modrinth link"
                  value={depsInput}
                  onChange={e => setDepsInput(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
                onClick={addDep}
              >
                Add
              </Button>
            </div>
            {depError && <p className="text-sm text-red-400">{depError}</p>}
            {!!deps.length && (
              <div className="flex flex-wrap gap-2">
                {deps.map(d => (
                  <a
                    key={d.url}
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm no-underline"
                  >
                    <span className="font-medium text-white/85 group-hover:text-white">{d.name}</span>
                    <button
                      type="button"
                      onClick={e => {
                        e.preventDefault();
                        removeDep(d.url);
                      }}
                      className="rounded-lg border border-white/20 px-2 py-0.5 text-xs font-semibold text-white/60 transition hover:border-white/40 hover:text-white"
                    >
                      ×
                    </button>
                  </a>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="space-y-6 p-6 sm:px-8 sm:py-7">
          <SectionTitle
            title="Media"
            description="Enhance your post with a video or screenshots."
          />

          <div className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="youtube" className="text-sm font-medium text-white/75">
                YouTube link <span className="text-white/45">(optional)</span>
              </label>
              <Input
                id="youtube"
                placeholder="https://www.youtube.com/watch?v=..."
                value={form.youtubeUrl}
                onChange={e => change("youtubeUrl", e.target.value)}
                onBlur={() => markTouched("youtubeUrl")}
                aria-invalid={shouldShowError("youtubeUrl") || undefined}
                aria-describedby={shouldShowError("youtubeUrl") ? errorId("youtubeUrl") : undefined}
                className={clsx(
                  shouldShowError("youtubeUrl") && "border-red-500/60 focus:ring-red-400 focus:border-red-500/70"
                )}
              />
              {shouldShowError("youtubeUrl") && errors.youtubeUrl && (
                <p id={errorId("youtubeUrl")} className="text-sm text-red-400">
                  {errors.youtubeUrl}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="images" className="text-sm font-medium text-white/75">
                  Image gallery <span className="text-white/45">(max {MAX_IMAGE_MB}MB each)</span>
                </label>
                <input
                  id="images"
                  type="file"
                  multiple
                  accept="image/*"
                  className="sr-only"
                  onChange={e => {
                    markTouched("images");
                    const incoming = e.target.files ? Array.from(e.target.files) : [];
                    if (incoming.length) {
                      setMediaFiles(prev => [...prev, ...incoming]);
                    }
                    e.target.value = "";
                  }}
                  aria-invalid={shouldShowError("images") || undefined}
                  aria-describedby={shouldShowError("images") ? errorId("images") : undefined}
                />
                <label
                  htmlFor="images"
                  className={clsx(
                    "inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:bg-white/10",
                    shouldShowError("images") && "border-red-500/60 text-red-200 hover:border-red-400"
                  )}
                >
                  <Images aria-hidden="true" className="h-4 w-4" />
                  <span>Choose files</span>
                </label>
                <p className="text-xs text-white/60">
                  <span className="font-semibold text-white/80">Selected:</span> {fileSummary}
                </p>
              </div>
              {shouldShowError("images") && errors.images && (
                <p id={errorId("images")} className="text-sm text-red-400">
                  {errors.images}
                </p>
              )}
              {!!previews.length && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {previews.map((src, i) => {
                    const file = mediaFiles[i];
                    if (!file) return null;
                    const key = `${file.name}-${file.lastModified}-${file.size}`;
                    return (
                      <div
                        key={key}
                        className="relative aspect-video overflow-hidden rounded-2xl border border-white/10"
                      >
                        <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                          #{i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeMediaAt(i)}
                          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-sm font-bold text-white transition hover:bg-black/80"
                          aria-label={`Remove ${file.name}`}
                        >
                          ×
                        </button>
                        <img src={src} alt="" className="h-full w-full object-cover" />
                        <div className="absolute bottom-3 left-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => moveMedia(i, i - 1)}
                            disabled={i === 0}
                            className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white/90 transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/30 disabled:text-white/40"
                            aria-label={`Move ${file.name} earlier`}
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            onClick={() => moveMedia(i, i + 1)}
                            disabled={i === mediaFiles.length - 1}
                            className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white/90 transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/30 disabled:text-white/40"
                            aria-label={`Move ${file.name} later`}
                          >
                            →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="space-y-6 p-6 sm:px-8 sm:py-7 lg:col-span-2">
          <SectionTitle
            title="Code"
            description="Paste the SuperFactoryManager script that powers your build."
          />

          <CodeBox
            value={form.code}
            onChange={v => change("code", v)}
            onBlur={() => markTouched("code")}
            isInvalid={shouldShowError("code")}
            describedBy={[
              shouldShowError("code") ? errorId("code") : null,
              codeFeedback.status === "ok" && codeFeedback.warnings.length ? codeWarningsId : null,
            ]
              .filter(Boolean)
              .join(" ") || undefined}
          />
          {shouldShowError("code") && errors.code && (
            <div id={errorId("code")} className="space-y-1 text-sm text-red-400">
              <p>{errors.code}</p>
              {codeFeedback.syntaxErrors.length > 0 && (
                <ul className="list-disc space-y-1 pl-5">
                  {codeFeedback.syntaxErrors.map((err, idx) => (
                    <li key={`${err.lineStart}-${err.columnStart}-${idx}`}>
                      Line {err.lineStart}
                      {typeof err.columnStart === "number" ? `, column ${err.columnStart + 1}` : ""} – {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {codeFeedback.status === "ok" && codeFeedback.warnings.length > 0 && (
            <div id={codeWarningsId} className="space-y-1 text-sm text-amber-300">
              <p className="font-semibold">Warnings</p>
              <ul className="list-disc space-y-1 pl-5 marker:text-amber-300">
                {codeFeedback.warnings.map((warning, idx) => (
                  <li key={`${warning.lineStart}-${warning.lineEnd}-${idx}`}>
                    Line {warning.lineStart}
                    {warning.lineEnd !== warning.lineStart ? `-${warning.lineEnd}` : ""} – {warning.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          size="lg"
          className="w-full sm:w-auto"
          disabled={loading}
          onClick={submit}
        >
          <UploadCloud aria-hidden="true" />
          {loading ? "Saving..." : "Publish post"}
        </Button>
      </div>
    </div>
  );
}
