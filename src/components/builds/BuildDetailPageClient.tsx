"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { z } from "zod";
import { BookOpen, Check, Loader2, PlusSquare, Save, Share2, X } from "lucide-react";
import { useAuthRequired } from "@/components/auth/AuthRequiredProvider";
import { CodeBox } from "@/components/CodeBox";
import PostRedirectToast from "@/components/builds/PostRedirectToast";
import { Badge, Button, Card, Input } from "@/components/ui";
import {
  BUILD_CODE_MIN_NON_WHITESPACE,
  BUILD_NAME_MAX_LENGTH,
  buildNameSchema,
  buildVisibilitySchema,
  getCodeContentStats,
} from "@/lib/builds/validation";
import {
  buildBuildDraftStorageKey,
  buildPublicBuildPath,
  CODE_EDITOR_DRAFT_STORAGE_KEY,
  POST_COMPOSER_PREFILL_CODE_KEY,
} from "@/lib/builds/links";
import type { BuildDetailPayload, BuildWriteResponse } from "@/lib/builds/types";
import { analyzeSfmlCode, type CodeFeedback } from "@/lib/sfml/analysis";

const CODE_ANALYZE_DEBOUNCE = 350;
const DRAFT_SAVE_DEBOUNCE = 600;
const NAME_CHECK_DEBOUNCE = 300;
const CODE_TOO_SHORT_ERROR = "Code needs more than 50 non-whitespace characters before saving.";

type BuildVisibility = z.infer<typeof buildVisibilitySchema>;
type SaveIntent = "save" | "share";

type NameCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken"; message: string }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

function buildDraftKey(username: string, slug: string) {
  return buildBuildDraftStorageKey(username, slug);
}

function formatMetaDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function defaultForkName(sourceName: string) {
  const suffix = " (fork)";
  const maxBaseLength = Math.max(1, BUILD_NAME_MAX_LENGTH - suffix.length);
  const base = sourceName.trim().slice(0, maxBaseLength).trim() || "build";
  return `${base}${suffix}`;
}

export default function BuildDetailPageClient({
  initialData,
  initialIsAuthenticated,
  isAuthor,
}: {
  initialData: BuildDetailPayload;
  initialIsAuthenticated: boolean;
  isAuthor: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { openLogin } = useAuthRequired();

  const [buildMeta, setBuildMeta] = useState(initialData.build);
  const [commits, setCommits] = useState(initialData.commits);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(initialData.selectedCommitId);
  const [code, setCode] = useState(initialData.code);
  const [persistedTrimmedCode, setPersistedTrimmedCode] = useState(() => getCodeContentStats(initialData.code).trimmedCode);

  const [wrapLines, setWrapLines] = useState(true);
  const [codeFeedback, setCodeFeedback] = useState<CodeFeedback>({
    status: "ok",
    message: "",
    syntaxErrors: [],
    warnings: [],
  });

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveIntent, setSaveIntent] = useState<SaveIntent>("save");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [codeLengthErrorCount, setCodeLengthErrorCount] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [shareFallbackLink, setShareFallbackLink] = useState<string | null>(null);

  const [createBackupCommit, setCreateBackupCommit] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [authorSaveCount, setAuthorSaveCount] = useState(0);

  const [forkName, setForkName] = useState(() => defaultForkName(initialData.build.nameOriginal));
  const [forkVisibility, setForkVisibility] = useState<BuildVisibility>("PUBLIC");
  const [forkNameCheck, setForkNameCheck] = useState<NameCheckState>({ status: "idle" });

  const [isChangingVisibility, setIsChangingVisibility] = useState(false);
  const [isLoadingCommit, setIsLoadingCommit] = useState(false);

  const draftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedDraftRef = useRef(false);
  const forkNameRequestRef = useRef(0);

  const codeStats = useMemo(() => getCodeContentStats(code), [code]);
  const hasValidCodeLength = codeStats.nonWhitespaceCount >= BUILD_CODE_MIN_NON_WHITESPACE;
  const hasUnsavedChanges = useMemo(() => codeStats.trimmedCode !== persistedTrimmedCode, [codeStats.trimmedCode, persistedTrimmedCode]);
  const showUpdated = useMemo(() => {
    const createdTs = new Date(buildMeta.createdAt).getTime();
    const updatedTs = new Date(buildMeta.updatedAt).getTime();
    return Number.isFinite(createdTs) && Number.isFinite(updatedTs) && Math.abs(updatedTs - createdTs) > 1000;
  }, [buildMeta.createdAt, buildMeta.updatedAt]);

  const hasHistoricalAuthorSaves = useMemo(() => {
    if (!isAuthor) return false;
    return showUpdated || authorSaveCount > 0;
  }, [authorSaveCount, isAuthor, showUpdated]);

  const draftKey = useMemo(() => buildDraftKey(buildMeta.username, buildMeta.slug), [buildMeta.slug, buildMeta.username]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCodeFeedback(analyzeSfmlCode(code, { required: false }));
    }, CODE_ANALYZE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [code]);

  const errorMarkers = useMemo(
    () => codeFeedback.syntaxErrors.map((err) => ({ line: err.lineStart, message: err.message })),
    [codeFeedback.syntaxErrors],
  );

  const warningRanges = useMemo(
    () => codeFeedback.warnings.map((warning) => ({
      startLine: warning.lineStart,
      endLine: warning.lineEnd ?? warning.lineStart,
      message: warning.message,
    })),
    [codeFeedback.warnings],
  );

  const showErrors = codeFeedback.status === "error" && codeFeedback.syntaxErrors.length > 0;
  const showWarnings = codeFeedback.status === "ok" && codeFeedback.warnings.length > 0;

  const persistDraftNow = useCallback((value: string) => {
    if (typeof window === "undefined") return;
    try {
      if (isAuthor) {
        window.localStorage.setItem(draftKey, value);
      } else {
        window.localStorage.setItem(CODE_EDITOR_DRAFT_STORAGE_KEY, value);
      }
    } catch { }
  }, [draftKey, isAuthor]);

  useEffect(() => {
    if (!isAuthor || hasLoadedDraftRef.current || typeof window === "undefined") return;

    hasLoadedDraftRef.current = true;
    try {
      const rawDraft = window.localStorage.getItem(draftKey);
      if (rawDraft && rawDraft.trim()) {
        setCode(rawDraft);
      }
    } catch { }
  }, [draftKey, isAuthor]);

  useEffect(() => {
    if (!isAuthor || !hasLoadedDraftRef.current || typeof window === "undefined") return;

    if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);

    draftTimeoutRef.current = setTimeout(() => {
      persistDraftNow(code);
    }, DRAFT_SAVE_DEBOUNCE);

    return () => {
      if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
    };
  }, [code, isAuthor, persistDraftNow]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (codeLengthErrorCount === null) return;
    if (hasValidCodeLength) {
      setCodeLengthErrorCount(null);
    }
  }, [codeLengthErrorCount, hasValidCodeLength]);

  useEffect(() => {
    if (isAuthor || !saveModalOpen) return;
    if (!forkName.trim()) {
      setForkNameCheck({ status: "idle" });
      return;
    }

    const parsed = buildNameSchema.safeParse(forkName);
    if (!parsed.success) {
      setForkNameCheck({
        status: "invalid",
        message: parsed.error.issues[0]?.message ?? "Invalid build name.",
      });
      return;
    }

    setForkNameCheck({ status: "checking" });
    const requestId = forkNameRequestRef.current + 1;
    forkNameRequestRef.current = requestId;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/builds/check-name?name=${encodeURIComponent(forkName)}`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (requestId !== forkNameRequestRef.current) return;

        if (response.status === 401) {
          setForkNameCheck({ status: "error", message: "Log in required to check names." });
          return;
        }

        const payload = await response.json().catch(() => null) as { available?: boolean; reason?: string } | null;
        if (!response.ok) {
          setForkNameCheck({ status: "error", message: "Could not check availability right now." });
          return;
        }

        if (payload?.available) {
          setForkNameCheck({ status: "available" });
          return;
        }

        if (payload?.reason === "INVALID") {
          setForkNameCheck({ status: "invalid", message: "Build name is not valid." });
          return;
        }

        setForkNameCheck({ status: "taken", message: "That build name is already taken." });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestId !== forkNameRequestRef.current) return;
        setForkNameCheck({ status: "error", message: "Could not check availability right now." });
      }
    }, NAME_CHECK_DEBOUNCE);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [forkName, isAuthor, saveModalOpen]);

  const requireLoginWithDraftWarning = useCallback((message: string) => {
    persistDraftNow(code);
    openLogin(message);
  }, [code, openLogin, persistDraftNow]);

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

  const canonicalBuildUrl = useCallback(() => {
    if (typeof window === "undefined") return null;
    const sharePath = buildPublicBuildPath(buildMeta.username, buildMeta.slug);
    return `${window.location.origin}${sharePath}`;
  }, [buildMeta.slug, buildMeta.username]);

  const copyCanonicalBuildLink = useCallback(async () => {
    const absoluteUrl = canonicalBuildUrl();
    if (!absoluteUrl) return;
    await navigator.clipboard.writeText(absoluteUrl);
  }, [canonicalBuildUrl]);

  const handleCopyLink = useCallback(async () => {
    if (typeof window === "undefined") return;
    setShareFallbackLink(null);

    try {
      await copyCanonicalBuildLink();
      setToastMessage("Build link copied!");
    } catch {
      setShareFallbackLink(canonicalBuildUrl());
      setToastMessage("Clipboard access was blocked. Copy the link below.");
    }
  }, [canonicalBuildUrl, copyCanonicalBuildLink]);

  const openSaveDialog = useCallback((intent: SaveIntent) => {
    if (!isAuthor && !initialIsAuthenticated) {
      requireLoginWithDraftWarning(
        "You need to log in to save or share. Your current code is safe and will be restored after login.",
      );
      return;
    }
    setSaveIntent(intent);
    setSaveError(null);
    setShareFallbackLink(null);
    setSaveModalOpen(true);
  }, [initialIsAuthenticated, isAuthor, requireLoginWithDraftWarning]);

  const handleShare = useCallback(async () => {
    if (isAuthor && hasUnsavedChanges) {
      openSaveDialog("share");
      return;
    }
    await handleCopyLink();
  }, [handleCopyLink, hasUnsavedChanges, isAuthor, openSaveDialog]);

  const handleLoadCommit = useCallback(async (nextCommitId: string | null) => {
    const query = nextCommitId ? `?commitId=${encodeURIComponent(nextCommitId)}` : "";

    setIsLoadingCommit(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/builds/${encodeURIComponent(buildMeta.username)}/${encodeURIComponent(buildMeta.slug)}${query}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        setToastMessage("Could not load that commit.");
        return;
      }

      const payload = await response.json() as BuildDetailPayload;
      setBuildMeta(payload.build);
      setCommits(payload.commits);
      setSelectedCommitId(payload.selectedCommitId);
      setCode(payload.code);
      // Keep draft/unsaved detection anchored to the "Current" version only.
      if (!payload.selectedCommitId) {
        setPersistedTrimmedCode(getCodeContentStats(payload.code).trimmedCode);
      }
      router.replace(query ? `${pathname}${query}` : pathname, { scroll: false });
    } finally {
      setIsLoadingCommit(false);
    }
  }, [buildMeta.slug, buildMeta.username, pathname, router]);

  const handleChangeVisibility = useCallback(async (nextVisibility: BuildVisibility) => {
    if (!isAuthor || buildMeta.visibility === nextVisibility) return;

    setIsChangingVisibility(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/builds/me/${encodeURIComponent(buildMeta.slug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          code: persistedTrimmedCode,
          visibility: nextVisibility,
          createCommit: false,
        }),
      });

      const payload = await response.json().catch(() => null) as BuildWriteResponse | null;

      if (response.status === 401) {
        requireLoginWithDraftWarning(
          "You need to log in to save. Your current code is safe and will be restored after login.",
        );
        return;
      }

      if (!response.ok || !payload?.build) {
        setSaveError(payload?.error ?? "Could not update visibility right now.");
        return;
      }

      setBuildMeta((prev) => ({
        ...prev,
        visibility: payload.build?.visibility ?? prev.visibility,
        updatedAt: payload.build?.updatedAt ?? prev.updatedAt,
      }));
      setToastMessage("Saved!");
    } finally {
      setIsChangingVisibility(false);
    }
  }, [buildMeta.slug, buildMeta.visibility, isAuthor, persistedTrimmedCode, requireLoginWithDraftWarning]);

  const handleSave = useCallback(async () => {
    if (!isAuthor) return;

    if (!initialIsAuthenticated) {
      requireLoginWithDraftWarning(
        "You need to log in to save. Your current code is safe and will be restored after login.",
      );
      return;
    }

    if (!hasValidCodeLength) {
      setCodeLengthErrorCount(codeStats.nonWhitespaceCount);
      setSaveError(CODE_TOO_SHORT_ERROR);
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const shouldCreateCommit = hasHistoricalAuthorSaves && createBackupCommit;
      const response = await fetch(`/api/builds/me/${encodeURIComponent(buildMeta.slug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          code,
          createCommit: shouldCreateCommit,
          commitMessage: shouldCreateCommit ? (commitMessage.trim() || null) : null,
        }),
      });

      const payload = await response.json().catch(() => null) as BuildWriteResponse | null;

      if (response.status === 401) {
        setSaveModalOpen(false);
        requireLoginWithDraftWarning(
          "You need to log in to save. Your current code is safe and will be restored after login.",
        );
        return;
      }

      if (response.status === 400 && payload?.error === "CODE_TOO_SHORT") {
        const count = typeof payload.nonWhitespaceCount === "number"
          ? payload.nonWhitespaceCount
          : codeStats.nonWhitespaceCount;
        setCodeLengthErrorCount(count);
        setSaveError(CODE_TOO_SHORT_ERROR);
        return;
      }

      if (!response.ok || !payload?.build) {
        setSaveError(payload?.error ?? "Could not save build right now.");
        return;
      }

      setBuildMeta((prev) => ({
        ...prev,
        visibility: payload.build?.visibility ?? prev.visibility,
        updatedAt: payload.build?.updatedAt ?? prev.updatedAt,
      }));
      setPersistedTrimmedCode(codeStats.trimmedCode);
      setSelectedCommitId(null);
      setAuthorSaveCount((count) => count + 1);
      setCreateBackupCommit(false);
      setCommitMessage("");
      setSaveModalOpen(false);
      setShareFallbackLink(null);
      router.replace(pathname, { scroll: false });

      if (saveIntent === "share") {
        try {
          await copyCanonicalBuildLink();
          setToastMessage("Build link copied!");
        } catch {
          setShareFallbackLink(canonicalBuildUrl());
          setToastMessage("Build saved. Clipboard access was blocked, copy the link below.");
        }
      } else {
        setToastMessage("Saved!");
      }

      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(draftKey, codeStats.trimmedCode);
        } catch { }
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    buildMeta.slug,
    code,
    codeStats.nonWhitespaceCount,
    codeStats.trimmedCode,
    commitMessage,
    copyCanonicalBuildLink,
    canonicalBuildUrl,
    createBackupCommit,
    draftKey,
    hasHistoricalAuthorSaves,
    hasValidCodeLength,
    initialIsAuthenticated,
    isAuthor,
    pathname,
    requireLoginWithDraftWarning,
    router,
    saveIntent,
  ]);

  const handleFork = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();

    if (isAuthor) return;

    if (!initialIsAuthenticated) {
      setSaveModalOpen(false);
      requireLoginWithDraftWarning(
        "You need to log in to save or share. Your current code is safe and will be restored after login.",
      );
      return;
    }

    const parsed = z.object({
      name: buildNameSchema,
      visibility: buildVisibilitySchema,
    }).safeParse({
      name: forkName,
      visibility: forkVisibility,
    });

    if (!parsed.success) {
      setForkNameCheck({
        status: "invalid",
        message: parsed.error.issues[0]?.message ?? "Invalid build name.",
      });
      setSaveError(parsed.error.issues[0]?.message ?? "Invalid build name.");
      return;
    }

    if (!hasValidCodeLength) {
      setCodeLengthErrorCount(codeStats.nonWhitespaceCount);
      setSaveError(CODE_TOO_SHORT_ERROR);
      return;
    }

    if (forkNameCheck.status === "checking") {
      setSaveError("Please wait for name availability to finish checking.");
      return;
    }
    if (forkNameCheck.status === "invalid" || forkNameCheck.status === "taken" || forkNameCheck.status === "error") {
      setSaveError(forkNameCheck.message);
      return;
    }
    if (forkNameCheck.status !== "available") {
      setSaveError("Please enter a valid, available name.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: parsed.data.name,
          code,
          visibility: parsed.data.visibility,
          forkedFrom: {
            username: buildMeta.username,
            slug: buildMeta.slug,
          },
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
        setForkNameCheck({ status: "taken", message: "That build name is already taken." });
        setSaveError("That build name is already taken.");
        return;
      }

      if (response.status === 400 && payload?.error === "CODE_TOO_SHORT") {
        const count = typeof payload.nonWhitespaceCount === "number"
          ? payload.nonWhitespaceCount
          : codeStats.nonWhitespaceCount;
        setCodeLengthErrorCount(count);
        setSaveError(CODE_TOO_SHORT_ERROR);
        return;
      }

      if (!response.ok || !payload?.build) {
        setSaveError(payload?.error ?? "Could not fork build right now.");
        return;
      }

      setSaveModalOpen(false);
      router.push(buildPublicBuildPath(payload.build.username, payload.build.slug));
    } finally {
      setIsSaving(false);
    }
  }, [
    buildMeta.slug,
    buildMeta.username,
    code,
    codeStats.nonWhitespaceCount,
    forkName,
    forkNameCheck,
    forkVisibility,
    hasValidCodeLength,
    initialIsAuthenticated,
    isAuthor,
    requireLoginWithDraftWarning,
    router,
  ]);

  const commitOptions = useMemo(() => {
    return commits.map((commit) => {
      const dateLabel = formatMetaDate(commit.createdAt);
      const message = commit.message?.trim();
      return {
        id: commit.id,
        label: message ? `${dateLabel} - ${message}` : dateLabel,
      };
    });
  }, [commits]);

  const nameStatusIcon = useMemo(() => {
    if (forkNameCheck.status === "checking") return <Loader2 className="h-4 w-4 animate-spin text-white/70" />;
    if (forkNameCheck.status === "available") return <Check className="h-4 w-4 text-emerald-300" />;
    if (forkNameCheck.status === "invalid" || forkNameCheck.status === "taken" || forkNameCheck.status === "error") {
      return <X className="h-4 w-4 text-red-300" />;
    }
    return null;
  }, [forkNameCheck.status]);

  return (
    <main className="space-y-8 pb-8">
      <PostRedirectToast />

      <div className="space-y-2">
        <p className="eyebrow">Build</p>
        <h1 className="text-3xl font-semibold text-white">{buildMeta.nameOriginal}</h1>
        <div className="space-y-1 text-sm text-white/70">
          <p>
            By{" "}
            <Link href={`/profile/${encodeURIComponent(buildMeta.username)}`} className="text-brand-300 underline-offset-4 hover:underline">
              {buildMeta.username}
            </Link>
          </p>
          <p>Created {formatMetaDate(buildMeta.createdAt)}</p>
          {showUpdated ? <p>Updated {formatMetaDate(buildMeta.updatedAt)}</p> : null}
          {buildMeta.forkedFrom ? (
            <p>
              Forked from{" "}
              <Link
                href={`/profile/${encodeURIComponent(buildMeta.forkedFrom.username)}/builds/${encodeURIComponent(buildMeta.forkedFrom.slug)}`}
                className="text-brand-300 underline-offset-4 hover:underline"
              >
                {buildMeta.forkedFrom.username}/{buildMeta.forkedFrom.slug}
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      <Card className="space-y-5 p-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">Code</h2>
            <p className="text-sm text-white/60">View the current build or a saved commit version.</p>
          </div>

          <div className="min-w-[220px] space-y-1">
            <label htmlFor="build-commit-picker" className="text-xs font-medium uppercase tracking-wide text-white/60">
              Commit
            </label>
            <select
              id="build-commit-picker"
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-brand-300"
              value={selectedCommitId ?? ""}
              onChange={(event) => void handleLoadCommit(event.target.value || null)}
              disabled={isLoadingCommit}
            >
              <option value="">Current</option>
              {commitOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isAuthor && (
          <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-sm font-medium text-white/80">Visibility</p>
            <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1 text-xs font-semibold">
              <button
                type="button"
                aria-pressed={buildMeta.visibility === "PUBLIC"}
                onClick={() => void handleChangeVisibility("PUBLIC")}
                disabled={isChangingVisibility}
                className={clsx(
                  "rounded-full px-3 py-1.5 transition",
                  buildMeta.visibility === "PUBLIC" ? "bg-brand-500 text-white shadow-soft" : "text-white/70 hover:text-white",
                )}
              >
                PUBLIC
              </button>
              <button
                type="button"
                aria-pressed={buildMeta.visibility === "PRIVATE"}
                onClick={() => void handleChangeVisibility("PRIVATE")}
                disabled={isChangingVisibility}
                className={clsx(
                  "rounded-full px-3 py-1.5 transition",
                  buildMeta.visibility === "PRIVATE" ? "bg-brand-500 text-white shadow-soft" : "text-white/70 hover:text-white",
                )}
              >
                PRIVATE
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/75 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl text-white/70">
            Need inspiration or not sure how to structure your script? Click to open the official guide in a new tab.
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
                  {typeof err.columnStart === "number" ? `, column ${err.columnStart + 1}` : ""} - {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {showWarnings && (
          <div className="space-y-1 text-sm text-amber-300">
            <p className="font-semibold">Warnings</p>
            <ul className="list-disc space-y-1 pl-5 marker:text-amber-300">
              {codeFeedback.warnings.map((warning, idx) => (
                <li key={`${warning.lineStart}-${warning.lineEnd ?? warning.lineStart}-${idx}`}>
                  Line {warning.lineStart}
                  {warning.lineEnd && warning.lineEnd !== warning.lineStart ? `-${warning.lineEnd}` : ""} - {warning.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {saveError ? <p className="text-sm text-error">{saveError}</p> : null}

        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm text-white/65">
            {isAuthor
              ? "Share this build URL directly, or keep editing and overwrite your current build."
              : "You can edit this code and save a copy into your own builds."}
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
            <Button
              type="button"
              onClick={() => openSaveDialog("save")}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {isAuthor ? "Save build" : "Save to your builds"}
            </Button>
          </div>
        </div>
      </Card>

      {shareFallbackLink && (
        <Card className="space-y-3 border border-amber-400/35 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-100">
            Clipboard permission is unavailable. Copy this canonical build link manually.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={shareFallbackLink} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCopyLink()}
              className="sm:shrink-0"
            >
              Copy
            </Button>
          </div>
        </Card>
      )}

      {codeLengthErrorCount !== null && (
        <div className="sticky bottom-4 z-40 rounded-xl border border-red-400/60 bg-red-500/15 px-4 py-3 text-sm text-red-100 shadow-soft">
          Code needs more than 50 characters; it currently has {codeLengthErrorCount} characters.
        </div>
      )}

      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg space-y-5 p-5 sm:p-6">
            {isAuthor ? (
              <>
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-white">
                    {saveIntent === "share" ? "Save and share" : "Save build"}
                  </h2>
                  <p className="text-sm text-white/65">This overwrites the current build code.</p>
                </div>

                <div className="space-y-4">
                  {hasHistoricalAuthorSaves && (
                    <div className="space-y-2">
                      <label className="inline-flex items-center gap-2 text-sm text-white/80">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-white/30 bg-black/40"
                          checked={createBackupCommit}
                          onChange={(event) => setCreateBackupCommit(event.target.checked)}
                        />
                        Also save a backup as a new commit
                      </label>

                      {createBackupCommit && (
                        <Input
                          placeholder="Optional commit message"
                          value={commitMessage}
                          onChange={(event) => setCommitMessage(event.target.value)}
                          maxLength={280}
                        />
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <Badge>
                      {hasValidCodeLength
                        ? `${codeStats.nonWhitespaceCount} non-whitespace characters`
                        : "Code is too short to save"}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" onClick={() => setSaveModalOpen(false)} disabled={isSaving}>
                        Cancel
                      </Button>
                      <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : saveIntent === "share" ? "Save and share" : "Save build"}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-white">Save to your builds</h2>
                  <p className="text-sm text-white/65">Create your own copy of this build with your edits.</p>
                </div>

                <form className="space-y-4" onSubmit={handleFork}>
                  <div className="space-y-2">
                    <label htmlFor="fork-name" className="text-sm font-medium text-white/75">
                      Build name
                    </label>
                    <Input
                      id="fork-name"
                      value={forkName}
                      onChange={(event) => {
                        setForkName(event.target.value);
                        setSaveError(null);
                      }}
                      maxLength={BUILD_NAME_MAX_LENGTH}
                      rightIcon={nameStatusIcon}
                    />
                    {forkNameCheck.status !== "idle" && forkNameCheck.status !== "checking" && (
                      <p className={clsx(
                        "text-sm",
                        forkNameCheck.status === "available" ? "text-emerald-300" : "text-red-300",
                      )}>
                        {forkNameCheck.status === "available" ? "Name is available." : forkNameCheck.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-white/75">Visibility</p>
                    <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1 text-xs font-semibold">
                      <button
                        type="button"
                        aria-pressed={forkVisibility === "PUBLIC"}
                        onClick={() => setForkVisibility("PUBLIC")}
                        className={clsx(
                          "rounded-full px-3 py-1.5 transition",
                          forkVisibility === "PUBLIC" ? "bg-brand-500 text-white shadow-soft" : "text-white/70 hover:text-white",
                        )}
                      >
                        PUBLIC
                      </button>
                      <button
                        type="button"
                        aria-pressed={forkVisibility === "PRIVATE"}
                        onClick={() => setForkVisibility("PRIVATE")}
                        className={clsx(
                          "rounded-full px-3 py-1.5 transition",
                          forkVisibility === "PRIVATE" ? "bg-brand-500 text-white shadow-soft" : "text-white/70 hover:text-white",
                        )}
                      >
                        PRIVATE
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <Badge>
                      {hasValidCodeLength
                        ? `${codeStats.nonWhitespaceCount} non-whitespace characters`
                        : "Code is too short to save"}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" onClick={() => setSaveModalOpen(false)} disabled={isSaving}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSaving}>
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : "Save to your builds"}
                      </Button>
                    </div>
                  </div>
                </form>
              </>
            )}
          </Card>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-white/20 bg-black/85 px-4 py-2 text-sm text-white shadow-soft">
          {toastMessage}
        </div>
      )}
    </main>
  );
}
