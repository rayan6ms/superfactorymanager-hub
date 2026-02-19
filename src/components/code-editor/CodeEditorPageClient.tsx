"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { z } from "zod";
import { BookOpen, Check, Loader2, PlusSquare, Save, Share2, X } from "lucide-react";
import { useAuthRequired } from "@/components/auth/AuthRequiredProvider";
import { CodeBox } from "@/components/CodeBox";
import CopyCodeButton from "@/components/CopyCodeButton";
import { Badge, Button, Card, Input } from "@/components/ui";
import {
  BUILD_CODE_MIN_NON_WHITESPACE,
  BUILD_NAME_MAX_LENGTH,
  buildNameSchema,
  buildVisibilitySchema,
  getCodeContentStats,
  normalizeBuildName,
} from "@/lib/builds/validation";
import {
  buildPublicBuildPath,
  CODE_EDITOR_DRAFT_STORAGE_KEY,
  POST_COMPOSER_PREFILL_CODE_KEY,
  POST_REDIRECT_SHARE_LINK_STORAGE_KEY,
  POST_REDIRECT_TOAST_STORAGE_KEY,
} from "@/lib/builds/links";
import type { BuildWriteResponse } from "@/lib/builds/types";
import { analyzeSfmlCode, type CodeFeedback } from "@/lib/sfml/analysis";

const DEFAULT_CODE = `name " "

every 20 ticks do
    input from x
    output to y
    forget
end`;

const CODE_ANALYZE_DEBOUNCE = 350;
const DRAFT_SAVE_DEBOUNCE = 600;
const NAME_CHECK_DEBOUNCE = 300;
const CODE_TOO_SHORT_ERROR = "Code needs more than 50 non-whitespace characters before saving.";

type SaveIntent = "save" | "share";
type BuildVisibility = z.infer<typeof buildVisibilitySchema>;

type SavedBuild = {
  username: string;
  slug: string;
  nameLower: string;
};

type NameCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken"; message: string }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {description && <p className="text-sm text-white/60">{description}</p>}
    </div>
  );
}

export default function CodeEditorPageClient({
  initialIsAuthenticated,
}: {
  initialIsAuthenticated: boolean;
}) {
  const router = useRouter();
  const { openLogin } = useAuthRequired();
  const [code, setCode] = useState(DEFAULT_CODE);
  const [wrapLines, setWrapLines] = useState(true);
  const [codeFeedback, setCodeFeedback] = useState<CodeFeedback>({
    status: "ok",
    message: "",
    syntaxErrors: [],
    warnings: [],
  });
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveIntent, setSaveIntent] = useState<SaveIntent>("save");
  const [buildName, setBuildName] = useState("");
  const [visibility, setVisibility] = useState<BuildVisibility>("PUBLIC");
  const [nameCheck, setNameCheck] = useState<NameCheckState>({ status: "idle" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [codeLengthErrorCount, setCodeLengthErrorCount] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [shareFallbackLink, setShareFallbackLink] = useState<string | null>(null);
  const [lastSavedBuild, setLastSavedBuild] = useState<SavedBuild | null>(null);
  const [lastSavedTrimmedCode, setLastSavedTrimmedCode] = useState<string | null>(null);

  const nameRequestRef = useRef(0);
  const draftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const codeStats = useMemo(() => getCodeContentStats(code), [code]);
  const hasValidCodeLength = codeStats.nonWhitespaceCount >= BUILD_CODE_MIN_NON_WHITESPACE;
  const hasUnsavedChanges = useMemo(() => {
    if (!lastSavedTrimmedCode) return true;
    return codeStats.trimmedCode !== lastSavedTrimmedCode;
  }, [codeStats.trimmedCode, lastSavedTrimmedCode]);

  const persistDraftNow = useCallback((value: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CODE_EDITOR_DRAFT_STORAGE_KEY, value);
    } catch { }
  }, []);

  const requireLoginWithDraftWarning = useCallback((message: string) => {
    persistDraftNow(code);
    openLogin(message);
  }, [code, openLogin, persistDraftNow]);

  const showCodeLengthTip = useCallback((count: number) => {
    setCodeLengthErrorCount(count);
  }, []);

  const getBuildShareUrl = useCallback((build: SavedBuild) => {
    if (typeof window === "undefined") return null;
    const sharePath = buildPublicBuildPath(build.username, build.slug);
    return `${window.location.origin}${sharePath}`;
  }, []);

  const copyBuildLink = useCallback(async (build: SavedBuild) => {
    const absoluteUrl = getBuildShareUrl(build);
    if (!absoluteUrl) return;
    await navigator.clipboard.writeText(absoluteUrl);
  }, [getBuildShareUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawDraft = window.localStorage.getItem(CODE_EDITOR_DRAFT_STORAGE_KEY);
      if (rawDraft && rawDraft.trim()) {
        setCode(rawDraft);
      }
    } catch { }
    setHasLoadedDraft(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedDraft || typeof window === "undefined") return;

    if (draftTimeoutRef.current) {
      clearTimeout(draftTimeoutRef.current);
    }

    draftTimeoutRef.current = setTimeout(() => {
      persistDraftNow(code);
    }, DRAFT_SAVE_DEBOUNCE);

    return () => {
      if (draftTimeoutRef.current) {
        clearTimeout(draftTimeoutRef.current);
      }
    };
  }, [code, hasLoadedDraft, persistDraftNow]);

  useEffect(() => {
    if (codeLengthErrorCount === null) return;
    if (hasValidCodeLength) {
      setCodeLengthErrorCount(null);
    }
  }, [codeLengthErrorCount, hasValidCodeLength]);

  useEffect(() => {
    if (!saveModalOpen) return;
    if (!buildName.trim()) {
      setNameCheck({ status: "idle" });
      return;
    }

    const parsed = buildNameSchema.safeParse(buildName);
    if (!parsed.success) {
      setNameCheck({
        status: "invalid",
        message: parsed.error.issues[0]?.message ?? "Invalid build name.",
      });
      return;
    }

    const normalized = normalizeBuildName(parsed.data).nameLower;
    if (lastSavedBuild && hasUnsavedChanges && normalized === lastSavedBuild.nameLower) {
      setNameCheck({
        status: "taken",
        message: "To update an existing build, open it from your builds page.",
      });
      return;
    }

    setNameCheck({ status: "checking" });
    const requestId = nameRequestRef.current + 1;
    nameRequestRef.current = requestId;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/builds/check-name?name=${encodeURIComponent(buildName)}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (requestId !== nameRequestRef.current) return;

        if (response.status === 401) {
          setNameCheck({ status: "error", message: "Log in required to check names." });
          return;
        }

        const payload = await response.json().catch(() => null) as
          | { available?: boolean; reason?: string }
          | null;

        if (!response.ok) {
          setNameCheck({ status: "error", message: "Could not check availability right now." });
          return;
        }

        if (payload?.available) {
          setNameCheck({ status: "available" });
          return;
        }

        if (payload?.reason === "INVALID") {
          setNameCheck({ status: "invalid", message: "Build name is not valid." });
          return;
        }

        setNameCheck({ status: "taken", message: "That build name is already taken." });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestId !== nameRequestRef.current) return;
        setNameCheck({ status: "error", message: "Could not check availability right now." });
      }
    }, NAME_CHECK_DEBOUNCE);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [buildName, hasUnsavedChanges, lastSavedBuild, saveModalOpen]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const openSaveModal = useCallback((intent: SaveIntent) => {
    if (!initialIsAuthenticated) {
      requireLoginWithDraftWarning(
        "You need to log in to save or share. Your current code is safe and will be restored after login.",
      );
      return;
    }

    setSaveIntent(intent);
    setSaveError(null);
    setShareFallbackLink(null);
    setSaveModalOpen(true);
  }, [initialIsAuthenticated, requireLoginWithDraftWarning]);

  const handleCreatePost = useCallback(() => {
    if (!initialIsAuthenticated) {
      requireLoginWithDraftWarning(
        "You need to log in to create a post. Your current code is safe and will be restored after login.",
      );
      return;
    }

    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(POST_COMPOSER_PREFILL_CODE_KEY, code);
      } catch { }
    }
    router.push("/posts/new");
  }, [code, initialIsAuthenticated, requireLoginWithDraftWarning, router]);

  const handleShare = useCallback(async () => {
    if (!initialIsAuthenticated) {
      requireLoginWithDraftWarning(
        "You need to log in to save or share. Your current code is safe and will be restored after login.",
      );
      return;
    }

    if (lastSavedBuild && !hasUnsavedChanges) {
      setShareFallbackLink(null);
      try {
        await copyBuildLink(lastSavedBuild);
        setToastMessage("Build link copied!");
      } catch {
        setShareFallbackLink(getBuildShareUrl(lastSavedBuild));
        setToastMessage("Clipboard access was blocked. Copy the link below.");
      }
      return;
    }

    openSaveModal("share");
  }, [
    copyBuildLink,
    getBuildShareUrl,
    hasUnsavedChanges,
    initialIsAuthenticated,
    lastSavedBuild,
    openSaveModal,
    requireLoginWithDraftWarning,
  ]);

  const handleSaveSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError(null);

    const parsed = z.object({
      name: buildNameSchema,
      visibility: buildVisibilitySchema,
    }).safeParse({
      name: buildName,
      visibility,
    });

    if (!parsed.success) {
      setNameCheck({
        status: "invalid",
        message: parsed.error.issues[0]?.message ?? "Build name is required.",
      });
      return;
    }

    if (!hasValidCodeLength) {
      showCodeLengthTip(codeStats.nonWhitespaceCount);
      setSaveError(CODE_TOO_SHORT_ERROR);
      return;
    }

    const normalized = normalizeBuildName(parsed.data.name).nameLower;
    if (lastSavedBuild && hasUnsavedChanges && normalized === lastSavedBuild.nameLower) {
      const message = "To update an existing build, open it from your builds page.";
      setNameCheck({ status: "taken", message });
      setSaveError(message);
      return;
    }

    if (nameCheck.status === "checking") {
      setSaveError("Please wait for name availability to finish checking.");
      return;
    }
    if (nameCheck.status === "invalid" || nameCheck.status === "taken" || nameCheck.status === "error") {
      setSaveError(nameCheck.message);
      return;
    }
    if (nameCheck.status !== "available") {
      setSaveError("Please enter a valid, available name.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: parsed.data.name,
          code,
          visibility: parsed.data.visibility,
        }),
      });

      const payload = await response.json().catch(() => null) as BuildWriteResponse | null;
      if (response.status === 401) {
        setSaveModalOpen(false);
        requireLoginWithDraftWarning(
          "You need to log in to save or share. Your current code is safe and will be restored after login.",
        );
        return;
      }

      if (response.status === 409 && payload?.error === "BUILD_NAME_TAKEN") {
        setNameCheck({ status: "taken", message: "That build name is already taken." });
        setSaveError("That build name is already taken.");
        return;
      }

      if (response.status === 400 && payload?.error === "CODE_TOO_SHORT") {
        const count = typeof payload.nonWhitespaceCount === "number"
          ? payload.nonWhitespaceCount
          : codeStats.nonWhitespaceCount;
        showCodeLengthTip(count);
        setSaveError(CODE_TOO_SHORT_ERROR);
        return;
      }

      if (!response.ok || !payload?.build) {
        setSaveError(payload?.error ?? "Could not save build right now.");
        return;
      }

      const savedBuild: SavedBuild = {
        username: payload.build.username,
        slug: payload.build.slug,
        nameLower: payload.build.nameLower,
      };
      setLastSavedBuild(savedBuild);
      setLastSavedTrimmedCode(codeStats.trimmedCode);
      setSaveModalOpen(false);
      setShareFallbackLink(null);

      if (saveIntent === "share") {
        const shareUrl = getBuildShareUrl(savedBuild);
        try {
          await copyBuildLink(savedBuild);
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(POST_REDIRECT_TOAST_STORAGE_KEY, "Build link copied!");
            window.sessionStorage.removeItem(POST_REDIRECT_SHARE_LINK_STORAGE_KEY);
          }
        } catch {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(
              POST_REDIRECT_TOAST_STORAGE_KEY,
              "Build saved. Clipboard access was blocked, copy the link below.",
            );
            if (shareUrl) {
              window.sessionStorage.setItem(POST_REDIRECT_SHARE_LINK_STORAGE_KEY, shareUrl);
            }
          }
        }
      }

      router.push(buildPublicBuildPath(savedBuild.username, savedBuild.slug));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save build right now.";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }, [
    buildName,
    code,
    codeStats.nonWhitespaceCount,
    codeStats.trimmedCode,
    copyBuildLink,
    getBuildShareUrl,
    hasUnsavedChanges,
    hasValidCodeLength,
    lastSavedBuild,
    nameCheck,
    requireLoginWithDraftWarning,
    router,
    saveIntent,
    showCodeLengthTip,
    visibility,
  ]);

  const nameStatusIcon = useMemo(() => {
    if (nameCheck.status === "checking") return <Loader2 className="h-4 w-4 animate-spin text-white/70" />;
    if (nameCheck.status === "available") return <Check className="h-4 w-4 text-emerald-300" />;
    if (nameCheck.status === "invalid" || nameCheck.status === "taken" || nameCheck.status === "error") {
      return <X className="h-4 w-4 text-red-300" />;
    }
    return null;
  }, [nameCheck.status]);

  return (
    <div className="space-y-8 pb-4">
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
            <Button size="sm" variant="transparent" className="w-full justify-center gap-2">
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
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
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
            <CopyCodeButton value={code} />
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

        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm text-white/65">
            Share a URL to your code creation, anyone with the link may see your build if the visibility is set to public.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="outline" onClick={handleCreatePost}>
              <PlusSquare className="h-4 w-4" aria-hidden="true" />
              Create post with code
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleShare()}>
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Share
            </Button>
            <Button type="button" onClick={() => openSaveModal("save")}>
              <Save className="h-4 w-4" aria-hidden="true" />
              Save build
            </Button>
          </div>
        </div>
      </Card>

      {codeLengthErrorCount !== null && (
        <div className="sticky bottom-4 z-40 rounded-xl border border-red-400/60 bg-red-500/15 px-4 py-3 text-sm text-red-100 shadow-soft">
          Code needs more than 50 characters; it currently has {codeLengthErrorCount} characters.
        </div>
      )}

      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg space-y-5 p-5 sm:p-6">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-white">
                {saveIntent === "share" ? "Save build to share" : "Save build"}
              </h2>
              <p className="text-sm text-white/65">
                Name will be saved in lowercase.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSaveSubmit}>
              <div className="space-y-2">
                <label htmlFor="build-name" className="text-sm font-medium text-white/75">
                  Build name
                </label>
                <Input
                  id="build-name"
                  placeholder="Enter a unique build name"
                  value={buildName}
                  onChange={(event) => {
                    setBuildName(event.target.value);
                    setSaveError(null);
                  }}
                  maxLength={BUILD_NAME_MAX_LENGTH}
                  autoFocus
                  rightIcon={nameStatusIcon}
                />
                {nameCheck.status !== "idle" && nameCheck.status !== "checking" && (
                  <p className={clsx(
                    "text-sm",
                    nameCheck.status === "available" ? "text-emerald-300" : "text-red-300",
                  )}>
                    {nameCheck.status === "available" ? "Name is available." : nameCheck.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-white/75">Visibility</p>
                <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1 text-xs font-semibold">
                  <button
                    type="button"
                    aria-pressed={visibility === "PUBLIC"}
                    onClick={() => setVisibility("PUBLIC")}
                    className={clsx(
                      "rounded-full px-3 py-1.5 transition",
                      visibility === "PUBLIC" ? "bg-brand-500 text-white shadow-soft" : "text-white/70 hover:text-white",
                    )}
                  >
                    PUBLIC
                  </button>
                  <button
                    type="button"
                    aria-pressed={visibility === "PRIVATE"}
                    onClick={() => setVisibility("PRIVATE")}
                    className={clsx(
                      "rounded-full px-3 py-1.5 transition",
                      visibility === "PRIVATE" ? "bg-brand-500 text-white shadow-soft" : "text-white/70 hover:text-white",
                    )}
                  >
                    PRIVATE
                  </button>
                </div>
                <p className="text-sm text-white/65">
                  {visibility === "PUBLIC"
                    ? "Will be shown publicly on your profile."
                    : "Will not be shown on your public profile."}
                </p>
              </div>

              {lastSavedBuild && hasUnsavedChanges && (
                <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
                  To update an existing build, open it from your builds page.
                </div>
              )}

              {saveError && (
                <p className="text-sm text-error">{saveError}</p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <Badge>
                  {hasValidCodeLength
                    ? `${codeStats.nonWhitespaceCount} non-whitespace characters`
                    : "Code is too short to save"}
                </Badge>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setSaveModalOpen(false)}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      saveIntent === "share" ? "Save and share" : "Save build"
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        </div>
      )}

      {(shareFallbackLink || toastMessage) && (
        <div className="fixed left-1/2 top-4 z-50 w-30 -translate-x-1/2 space-y-2">
          {toastMessage && (
            <div className="rounded-md border border-brand-300/75 bg-brand-500 px-4 py-2 text-center text-sm font-medium text-white/90 shadow-soft">
              {toastMessage}
            </div>
          )}
          {shareFallbackLink && (
            <Card className="space-y-3 rounded-md border border-amber-300/60 bg-amber-700 p-4 text-amber-50 shadow-soft">
              <p className="text-sm text-amber-50">
                Clipboard permission is unavailable. Copy this canonical build link manually.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input readOnly value={shareFallbackLink} className="border-amber-200/50 bg-amber-950/50 font-mono text-xs text-amber-50" />
                <Button
                  type="button"
                  className="border-amber-200/40 bg-amber-500 text-white hover:bg-amber-400 sm:shrink-0"
                  onClick={async () => {
                    if (!lastSavedBuild) return;
                    try {
                      await copyBuildLink(lastSavedBuild);
                      setToastMessage("Build link copied!");
                      setShareFallbackLink(null);
                    } catch {
                      setToastMessage("Clipboard access is still blocked.");
                    }
                  }}
                >
                  Copy
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
