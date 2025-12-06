"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useId } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import Link from "next/link";
import Image from "next/image";
import { CodeBox } from "@/components/CodeBox";
import { Card, Button, Input } from "@/components/ui";
import ImageGallery, { type GalleryImage } from "@/components/ImageGallery";
import { MAX_POST_IMAGES } from "@/lib/images";
import {
  MAX_TAG_LENGTH,
  TAG_MAX_COUNT,
  TAG_MIN_COUNT,
  tagSchema,
  POST_DESCRIPTION_MIN_LENGTH,
  POST_DESCRIPTION_MAX_LENGTH,
} from "@/lib/validation";
import { analyzeYoutubeUrl } from "@/lib/youtube";
import { analyzeSfmlCode, type CodeFeedback } from "@/lib/sfml/analysis";
import { normalizeTag, type NormalizedTag } from "@/lib/tags";
import {
  Images,
  Loader2,
  Tag as TagIcon,
  UploadCloud,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MAX_IMAGE_MB = 5;
const MAX_IMAGE_COUNT = MAX_POST_IMAGES;
const MAX_TITLE_LENGTH = 120;
const CODE_ANALYZE_DEBOUNCE = 350;
const IMAGES_PER_PAGE = 4;

const DRAFT_STORAGE_PREFIX = "sfm-post-composer";
const DRAFT_VERSION = 1;
const DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type MarkdownFormat = "bold" | "italic" | "strike" | "code" | "ul" | "ol";

type Matrix = { byGame: Record<string, string[]>; gameVersions: string[] };
type CategoryOption = { key: string; name: string };
type ExistingImage = {
  id: string;
  original: string;
  thumbSm?: string | null;
  thumbMd?: string | null;
  thumbLg?: string | null;
};

type UploadedImage = {
  original: string;
  thumbSm?: string | null;
  thumbMd?: string | null;
  thumbLg?: string | null;
};

type FormState = {
  title: string;
  gameVersion: string;
  modVersion: string;
  categoryKey: string;
  description: string;
  code: string;
  youtubeUrl: string;
  openForImprovement: boolean;
};

type TextFieldKey = Exclude<keyof FormState, "openForImprovement">;
type FormErrorKey = TextFieldKey | "images" | "tags";

type YoutubePreview = {
  title: string;
  author: string;
  thumbnail: string | null;
  source: string;
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
  tags: null,
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
  tags: false,
};

type PostComposerProps = {
  mode?: "create" | "edit";
  slug?: string;
  initialData?: Partial<Omit<FormState, "openForImprovement">> & {
    id?: string;
    tags?: NormalizedTag[];
    dependencies?: { url: string; name: string }[];
    openForImprovement?: boolean;
    existingImages?: ExistingImage[];
  };
};

type DraftPayload = {
  v: number;
  savedAt: number;
  form: FormState;
  tags: NormalizedTag[];
  deps: { url: string; name: string }[];
};

function getDraftStorageKey(mode: "create" | "edit", slug?: string, postId?: string | undefined) {
  if (mode === "edit") {
    const idPart = postId ?? slug ?? "unknown";
    return `${DRAFT_STORAGE_PREFIX}:edit:${idPart}`;
  }
  return `${DRAFT_STORAGE_PREFIX}:create:new`;
}

function cleanupOldDrafts() {
  if (typeof window === "undefined") return;
  const now = Date.now();

  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(DRAFT_STORAGE_PREFIX)) continue;

      const raw = window.localStorage.getItem(key);
      if (!raw) {
        window.localStorage.removeItem(key);
        continue;
      }

      let parsed: DraftPayload | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        window.localStorage.removeItem(key);
        continue;
      }

      if (!parsed || typeof parsed.savedAt !== "number") continue;
      if (now - parsed.savedAt > DRAFT_TTL_MS) {
        window.localStorage.removeItem(key);
      }
    }
  } catch { }
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {description && <p className="text-sm text-white/60">{description}</p>}
    </div>
  );
}

function nsfwFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export default function PostComposer({ mode = "create", slug, initialData }: PostComposerProps) {
  const r = useRouter();
  const idPrefix = useId();
  const isEditMode = mode === "edit";
  const existingImages = initialData?.existingImages ?? [];
  const postId = initialData?.id;

  const draftKey = useMemo(
    () => getDraftStorageKey(mode, slug, postId),
    [mode, slug, postId]
  );

  const [matrix, setMatrix] = useState<Matrix>({ byGame: {}, gameVersions: [] });
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    title: initialData?.title ?? "",
    gameVersion: initialData?.gameVersion ?? "",
    modVersion: initialData?.modVersion ?? "",
    categoryKey: initialData?.categoryKey ?? "",
    description: initialData?.description ?? "",
    code: initialData?.code ?? "",
    youtubeUrl: initialData?.youtubeUrl ?? "",
    openForImprovement: initialData?.openForImprovement ?? false,
  });
  const [tags, setTags] = useState<NormalizedTag[]>(initialData?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [depsInput, setDepsInput] = useState("");
  const [deps, setDeps] = useState<{ url: string; name: string }[]>(initialData?.dependencies ?? []);
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
  const [youtubePreview, setYoutubePreview] = useState<YoutubePreview | null>(null);
  const [youtubePreviewStatus, setYoutubePreviewStatus] = useState<"idle" | "loading" | "error">("idle");
  const [youtubePreviewMessage, setYoutubePreviewMessage] = useState<string | null>(null);
  const [youtubePreviewSource, setYoutubePreviewSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [persistedImages, setPersistedImages] = useState<ExistingImage[]>(existingImages);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [nsfwCheckStatus, setNsfwCheckStatus] = useState<"idle" | "running" | "error">("idle");
  const [nsfwMessage, setNsfwMessage] = useState<string | null>(null);
  const [limitedByMax, setLimitedByMax] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);
  const [imagePage, setImagePage] = useState(0)
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const [descriptionMaxHeight, setDescriptionMaxHeight] = useState<number | null>(null);
  const saveDraftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nsfwCheckedRef = useRef<Record<string, true>>({});
  const totalImageSlots = persistedImages.length + mediaFiles.length;
  const submitButtonLabel = isEditMode ? "Save changes" : "Publish post";
  const submitLoadingLabel = isEditMode ? "Saving..." : "Publishing...";
  const fileSummary = useMemo(() => {
    if (!totalImageSlots) return `No files chosen (0/${MAX_IMAGE_COUNT})`;
    const parts: string[] = [];
    if (persistedImages.length) parts.push(`${persistedImages.length} existing`);
    if (mediaFiles.length) parts.push(`${mediaFiles.length} new`);
    return `${totalImageSlots}/${MAX_IMAGE_COUNT} image slots used${parts.length ? ` (${parts.join(", ")})` : ""}`;
  }, [mediaFiles.length, persistedImages.length, totalImageSlots]);

  useLayoutEffect(() => {
    const textarea = descriptionRef.current;
    if (!textarea) return;

    const updateMaxHeight = () => {
      const parent = textarea.parentElement;
      if (!parent) return;
      const parentHeight = parent.clientHeight;
      if (!parentHeight) return;

      const maxHeight = parentHeight * 0.65;
      setDescriptionMaxHeight(maxHeight);
    };

    updateMaxHeight();

    if (typeof ResizeObserver !== "undefined") {
      const parent = textarea.parentElement;
      if (!parent) return;
      const observer = new ResizeObserver(() => updateMaxHeight());
      observer.observe(parent);
      return () => observer.disconnect();
    }
  }, []);

  useEffect(() => {
    const textarea = descriptionRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = descriptionMaxHeight ?? scrollHeight;

    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
  }, [form.description, descriptionMaxHeight]);

  const previewItems = useMemo(
    () => [
      ...persistedImages.map((image, index) => ({
        key: image.id,
        type: "existing" as const,
        src: image.thumbMd || image.thumbLg || image.thumbSm || image.original,
        labelIndex: index,
      })),
      ...previews.map((src, i) => {
        const file = mediaFiles[i];
        const key = file ? `${file.name}-${file.lastModified}-${file.size}` : `${src}-${i}`;
        return {
          key,
          type: "new" as const,
          src,
          labelIndex: persistedImages.length + i,
          fileIndex: i,
          fileName: file?.name ?? `upload-${i + 1}`,
        };
      }),
    ],
    [mediaFiles, persistedImages, previews],
  );

  const galleryImages: GalleryImage[] = useMemo(
    () =>
      previewItems.map(item => ({
        id: item.key,
        original: item.src,
        thumbSm: item.src,
        thumbMd: item.src,
        thumbLg: item.src,
      })),
    [previewItems],
  );

  const totalPages = previewItems.length > 0 ? Math.ceil(previewItems.length / IMAGES_PER_PAGE) : 0;

  const currentPage = totalPages ? Math.min(imagePage, totalPages - 1) : 0;
  const startIndex = currentPage * IMAGES_PER_PAGE;
  const endIndex = Math.min(startIndex + IMAGES_PER_PAGE, previewItems.length);
  const currentPageItems = previewItems.slice(startIndex, endIndex);

  const errorId = useCallback((key: FormErrorKey) => `${idPrefix}-${key}-error`, [idPrefix]);
  const codeWarningsId = `${idPrefix}-code-warnings`;
  const errorMarkers = useMemo(
    () =>
      codeFeedback.syntaxErrors.map(error => ({
        line: error.lineStart,
        message: error.message,
      })),
    [codeFeedback.syntaxErrors],
  );

  const warningRanges = useMemo(
    () =>
      codeFeedback.warnings.map(warning => ({
        startLine: warning.lineStart,
        endLine: warning.lineEnd ?? warning.lineStart,
        message: warning.message,
      })),
    [codeFeedback.warnings],
  );

  const computeImagesError = useCallback((list: File[], existing: ExistingImage[] = persistedImages) => {
    const total = list.length + existing.length;
    if (total === 0) return "Upload at least one image to showcase your build.";
    if (total > MAX_IMAGE_COUNT) {
      return `You can upload up to ${MAX_IMAGE_COUNT} images. Remove one to add another.`;
    }
    for (const file of list) {
      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > MAX_IMAGE_MB) {
        return `"${file.name}" is ${sizeMb.toFixed(1)}MB. Each image must be ${MAX_IMAGE_MB}MB or smaller.`;
      }
    }
    return null;
  }, [persistedImages]);

  const validateField = useCallback((key: TextFieldKey, value: string, current: FormState): string | null => {
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
        if (categoriesLoading) return null;
        if (categoriesError && !categories.length) {
          return "Categories failed to load. Try refreshing the page.";
        }
        if (!trimmed) return "Choose a category for your post.";
        if (!categories.find(category => category.key === trimmed)) {
          return "Pick one of the available categories.";
        }
        return null;
      }
      case "description": {
        if (!trimmed) return "Description is required.";
        if (trimmed.length < POST_DESCRIPTION_MIN_LENGTH) {
          return `Description must be at least ${POST_DESCRIPTION_MIN_LENGTH} characters (currently ${trimmed.length}).`;
        }
        if (trimmed.length > POST_DESCRIPTION_MAX_LENGTH) {
          return `Description must be at most ${POST_DESCRIPTION_MAX_LENGTH} characters (currently ${trimmed.length}).`;
        }
        return null;
      }
      case "code":
        return trimmed ? null : "Code is required.";
      case "youtubeUrl": {
        if (!trimmed) return null;
        const analysis = analyzeYoutubeUrl(trimmed);
        return analysis.ok ? null : analysis.message;
      }
      default:
        return null;
    }
  }, [categories, categoriesError, categoriesLoading, matrix]);

  const change = useCallback(<K extends TextFieldKey>(key: K, value: FormState[K]) => {
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

  const validateTags = useCallback((list: NormalizedTag[]): string | null => {
    if (list.length < TAG_MIN_COUNT) {
      return `Add at least ${TAG_MIN_COUNT} tags.`;
    }
    if (list.length > TAG_MAX_COUNT) {
      return `Use up to ${TAG_MAX_COUNT} tags.`;
    }
    return null;
  }, []);

  const formEvaluations = useMemo(() => {
    const next: Record<FormErrorKey, string | null> = {
      title: validateField("title", form.title, form),
      gameVersion: validateField("gameVersion", form.gameVersion, form),
      modVersion: validateField("modVersion", form.modVersion, form),
      categoryKey: validateField("categoryKey", form.categoryKey, form),
      description: validateField("description", form.description, form),
      code: codeFeedback.message,
      youtubeUrl: validateField("youtubeUrl", form.youtubeUrl, form),
      images: null,
      tags: validateTags(tags),
    };

    const imageMessage = limitedByMax
      ? `You can upload up to ${MAX_IMAGE_COUNT} images. Remove one to add another.`
      : computeImagesError(mediaFiles, persistedImages);

    next.images = imageMessage;
    return next;
  }, [
    form,
    validateField,
    codeFeedback.message,
    limitedByMax,
    computeImagesError,
    mediaFiles,
    validateTags,
    tags,
    persistedImages,
  ]);

  const nsfwBlockingMessage = useMemo(() => {
    if (nsfwCheckStatus === "running") return "Scanning your images for safety...";
    return nsfwMessage;
  }, [nsfwCheckStatus, nsfwMessage]);

  const blockingMessages = useMemo(() => {
    const unique = new Set<string>();
    Object.values(formEvaluations).forEach(message => {
      if (message) unique.add(message);
    });
    if (nsfwBlockingMessage) unique.add(nsfwBlockingMessage);
    return Array.from(unique);
  }, [formEvaluations, nsfwBlockingMessage]);

  const publishDisabled = loading || blockingMessages.length > 0;

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

  const tryAddTag = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return false;
      const parsed = tagSchema.safeParse(trimmed);
      if (!parsed.success) {
        setTagError(parsed.error.issues?.[0]?.message ?? "Invalid tag.");
        return false;
      }
      const normalized = normalizeTag(parsed.data);
      let error: string | null = null;
      let added = false;
      setTags(prev => {
        if (prev.some(tag => tag.slug === normalized.slug)) {
          error = "This tag is already added.";
          return prev;
        }
        if (prev.length >= TAG_MAX_COUNT) {
          error = `You can add up to ${TAG_MAX_COUNT} tags.`;
          return prev;
        }
        added = true;
        return [...prev, normalized];
      });
      if (error) {
        setTagError(error);
        return false;
      }
      if (added) {
        setTagError(null);
        markTouched("tags");
      }
      return added;
    },
    [markTouched]
  );

  const addTagsFromInput = useCallback(
    (values: string[]) => {
      values.forEach(value => {
        void tryAddTag(value);
      });
    },
    [tryAddTag]
  );

  const handleTagInputChange = useCallback(
    (value: string) => {
      setTagError(null);
      if (value.includes(",")) {
        const parts = value.split(",");
        const last = parts.pop() ?? "";
        addTagsFromInput(parts);
        setTagInput(last);
        return;
      }
      setTagInput(value);
    },
    [addTagsFromInput]
  );

  const commitTagInput = useCallback(() => {
    if (!tagInput.trim()) {
      setTagInput("");
      return;
    }
    if (tryAddTag(tagInput)) {
      setTagInput("");
    }
  }, [tagInput, tryAddTag]);

  const removeTag = useCallback(
    (slug: string) => {
      setTags(prev => prev.filter(tag => tag.slug !== slug));
      setTagError(null);
      markTouched("tags");
    },
    [markTouched]
  );

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/meta/sfm/versions");
      const data = await res.json();
      setMatrix(data);
    })();
  }, []);

  useEffect(() => {
    let active = true;
    setCategoriesLoading(true);
    setCategoriesError(null);
    (async () => {
      try {
        const res = await fetch("/api/meta/categories");
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setCategoriesError(data.error || "Could not load categories.");
          setCategories([]);
        } else {
          setCategories(Array.isArray(data.categories) ? data.categories : []);
        }
      } catch {
        if (!active) return;
        setCategoriesError("Could not load categories.");
        setCategories([]);
      } finally {
        if (active) {
          setCategoriesLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const modOptions = useMemo(
    () => (form.gameVersion ? (matrix.byGame[form.gameVersion] || []) : []),
    [form.gameVersion, matrix]
  );

  const previousGameVersionRef = useRef(form.gameVersion);
  useEffect(() => {
    if (previousGameVersionRef.current !== form.gameVersion) {
      change("modVersion", "");
      previousGameVersionRef.current = form.gameVersion;
    }
  }, [form.gameVersion, change]);

  useEffect(() => {
    if (!previewItems.length) {
      setImagePage(0);
      return;
    }
    const maxPage = Math.max(0, Math.ceil(previewItems.length / IMAGES_PER_PAGE) - 1);
    setImagePage(prev => (prev > maxPage ? maxPage : prev));
  }, [previewItems.length]);

  useEffect(() => {
    const message = validateTags(tags);
    setErrors(prev => (prev.tags === message ? prev : { ...prev, tags: message }));
  }, [tags, validateTags]);

  useEffect(() => {
    if (totalImageSlots < MAX_IMAGE_COUNT && limitedByMax) {
      setLimitedByMax(false);
    }

    const message = limitedByMax
      ? `You can upload up to ${MAX_IMAGE_COUNT} images. Remove one to add another.`
      : computeImagesError(mediaFiles, persistedImages);
    setErrors(prev => (prev.images === message ? prev : { ...prev, images: message }));
    if (!mediaFiles.length) {
      setPreviews(prev => (prev.length ? [] : prev));
      return;
    }
    const urls = mediaFiles.map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [mediaFiles, computeImagesError, limitedByMax, persistedImages, totalImageSlots]);

  useEffect(() => {
    if (!mediaFiles.length) {
      setNsfwCheckStatus("idle");
      setNsfwMessage(null);
      return;
    }

    const filesToScan = mediaFiles.filter((file) => {
      const key = nsfwFileKey(file);
      return !nsfwCheckedRef.current[key];
    });

    if (!filesToScan.length) {
      setNsfwCheckStatus("idle");
      setNsfwMessage(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setNsfwCheckStatus("running");
    setNsfwMessage(null);

    const analyze = async () => {
      const fd = new FormData();
      filesToScan.forEach((file) => fd.append("file", file));

      try {
        const res = await fetch("/api/nsfw-check", {
          method: "POST",
          body: fd,
          credentials: "include",
          signal: controller.signal,
        });
        const payload = await res.json().catch(() => null);

        if (cancelled) return;

        if (!res.ok) {
          setNsfwCheckStatus("error");
          setNsfwMessage(
            payload?.error ??
            "We couldn't analyze your images for safety. Please try again.",
          );
          return;
        }

        filesToScan.forEach((file) => {
          nsfwCheckedRef.current[nsfwFileKey(file)] = true;
        });

        setNsfwCheckStatus("idle");
        setNsfwMessage(null);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;

        const message =
          error instanceof Error
            ? error.message
            : "We couldn't analyze your images for safety. Please try again.";
        setNsfwCheckStatus("error");
        setNsfwMessage(message);
      }
    };

    void analyze();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mediaFiles]);

  const removeMediaAt = useCallback((index: number) => {
    setMediaFiles(prev => prev.filter((_, idx) => idx !== index));
  }, []);

  const removeExistingImage = useCallback((id: string) => {
    setPersistedImages(prev => prev.filter(image => image.id !== id));
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

  const applyMarkdown = useCallback(
    (format: MarkdownFormat) => {
      const textarea = descriptionRef.current;
      if (!textarea) return;

      const { selectionStart, selectionEnd, value } = textarea;
      const selected = value.slice(selectionStart, selectionEnd);
      const isList = format === "ul" || format === "ol";
      const defaultText = isList ? "List item" : "text";
      const text = selected || defaultText;

      let replacement = text;

      switch (format) {
        case "bold":
          replacement = `**${text}**`;
          break;
        case "italic":
          replacement = `*${text}*`;
          break;
        case "strike":
          replacement = `~~${text}~~`;
          break;
        case "code":
          replacement = text.includes("\n")
            ? `\`\`\`\n${text}\n\`\`\``
            : `\`${text}\``;
          break;
        case "ul":
          replacement = text
            .split("\n")
            .map(line =>
              line
                ? `- ${line.replace(/^\s*[-*]\s*/, "")}`
                : "- "
            )
            .join("\n");
          break;
        case "ol":
          replacement = text
            .split("\n")
            .map((line, index) =>
              `${index + 1}. ${line.replace(/^\s*\d+\.\s*/, "") || "List item"}`
            )
            .join("\n");
          break;
      }

      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionEnd);
      const nextValue = `${before}${replacement}${after}`;

      change("description", nextValue);

      const cursorStart = before.length;
      const cursorEnd = cursorStart + replacement.length;

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorStart, cursorEnd);
      });
    },
    [change],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    cleanupOldDrafts();

    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as DraftPayload;
        if (parsed.v === DRAFT_VERSION) {
          setForm(prev => ({ ...prev, ...parsed.form }));
          setTags(parsed.tags ?? []);
          setDeps(parsed.deps ?? []);
        }
      }
    } catch {
    } finally {
      setHasLoadedDraft(true);
    }
  }, [draftKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasLoadedDraft) return;

    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
    }

    saveDraftTimeoutRef.current = setTimeout(() => {
      const payload: DraftPayload = {
        v: DRAFT_VERSION,
        savedAt: Date.now(),
        form,
        tags,
        deps,
      };

      try {
        window.localStorage.setItem(draftKey, JSON.stringify(payload));
      } catch { }
    }, 500);

    return () => {
      if (saveDraftTimeoutRef.current) {
        clearTimeout(saveDraftTimeoutRef.current);
      }
    };
  }, [form, tags, deps, draftKey, hasLoadedDraft]);

  useEffect(() => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      setCodeFeedback(analyzeSfmlCode(form.code, { required: true }));
    }, CODE_ANALYZE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [form.code]);

  useEffect(() => {
    setErrors(prev => {
      if (prev.code === codeFeedback.message) return prev;
      return { ...prev, code: codeFeedback.message };
    });
  }, [codeFeedback.message]);

  useEffect(() => {
    const raw = form.youtubeUrl.trim();
    if (!raw) {
      setYoutubePreview(null);
      setYoutubePreviewSource(null);
      setYoutubePreviewStatus("idle");
      setYoutubePreviewMessage(null);
      return;
    }
    const analysis = analyzeYoutubeUrl(raw);
    if (!analysis.ok) {
      setYoutubePreview(null);
      setYoutubePreviewSource(null);
      setYoutubePreviewStatus("idle");
      setYoutubePreviewMessage(null);
      return;
    }
    if (youtubePreviewSource === raw) return;
    let active = true;
    setYoutubePreviewStatus("loading");
    setYoutubePreviewMessage(null);
    (async () => {
      try {
        const res = await fetch(`/api/meta/youtube?url=${encodeURIComponent(raw)}`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setYoutubePreview(null);
          setYoutubePreviewSource(null);
          setYoutubePreviewStatus("error");
          setYoutubePreviewMessage(data.error || "Could not load video preview.");
          return;
        }
        setYoutubePreview({
          title: data.title,
          author: data.author,
          thumbnail: data.thumbnail,
          source: raw,
        });
        setYoutubePreviewSource(raw);
        setYoutubePreviewStatus("idle");
      } catch {
        if (!active) return;
        setYoutubePreview(null);
        setYoutubePreviewSource(null);
        setYoutubePreviewStatus("error");
        setYoutubePreviewMessage("Could not load video preview.");
      }
    })();
    return () => {
      active = false;
    };
  }, [form.youtubeUrl, youtubePreviewSource]);

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
    setSubmitError(null);

    const codeAnalysis = analyzeSfmlCode(form.code, { required: true });
    setCodeFeedback(codeAnalysis);

    const imageMessage = limitedByMax
      ? `You can upload up to ${MAX_IMAGE_COUNT} images. Remove one to add another.`
      : computeImagesError(mediaFiles, persistedImages);
    const tagMessage = validateTags(tags);

    const nextErrors: Record<FormErrorKey, string | null> = {
      title: validateField("title", form.title, form),
      gameVersion: validateField("gameVersion", form.gameVersion, form),
      modVersion: validateField("modVersion", form.modVersion, form),
      categoryKey: validateField("categoryKey", form.categoryKey, form),
      description: validateField("description", form.description, form),
      code: codeAnalysis.message,
      youtubeUrl: validateField("youtubeUrl", form.youtubeUrl, form),
      images: imageMessage,
      tags: tagMessage,
    };

    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    if (nsfwCheckStatus === "running") {
      setSubmitError("Please wait while we finish scanning your images for safety.");
      return;
    }
    if (nsfwMessage) {
      setSubmitError(nsfwMessage);
      return;
    }

    try {
      setLoading(true);
      let uploadedImages: UploadedImage[] = [];

      if (mediaFiles.length) {
        const fd = new FormData();
        for (const file of mediaFiles) {
          fd.append("file", file);
        }

        const uploadRes = await fetch("/api/uploads", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const uploadPayload = await uploadRes.json().catch(() => null);

        if (!uploadRes.ok) {
          const uploadMessage =
            (uploadPayload && typeof uploadPayload === "object" && "error" in uploadPayload
              ? (uploadPayload as { error?: string }).error
              : null) ?? "Failed to upload images.";
          setSubmitError(uploadMessage);
          return;
        }

        if (!Array.isArray(uploadPayload)) {
          setSubmitError("Unexpected upload response.");
          return;
        }

        uploadedImages = (uploadPayload as UploadedImage[]).map(img => ({
          original: img?.original,
          thumbSm: img?.thumbSm ?? undefined,
          thumbMd: img?.thumbMd ?? undefined,
          thumbLg: img?.thumbLg ?? undefined,
        }));
      }

      const body = {
        title: form.title.trim(),
        gameVersion: form.gameVersion,
        modVersion: form.modVersion,
        categoryKey: form.categoryKey.trim(),
        dependencies: deps.map((d) => d.url),
        tags: tags.map((tag) => tag.name),
        images: uploadedImages,
        keepImageIds: persistedImages.map(image => image.id),
        code: form.code,
        description: form.description.trim(),
        youtubeUrl: form.youtubeUrl.trim(),
        openForImprovement: form.openForImprovement,
      };
      const endpoint = isEditMode && slug ? `/api/posts/${slug}` : "/api/posts";
      const method = isEditMode ? "PATCH" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(
          data.error ||
          (isEditMode
            ? "We couldn't save your changes. Double-check the details and try again."
            : "We couldn't publish your post. Check the details and try again."),
        );
        return;
      }

      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(draftKey);
        } catch { }
      }

      if (isEditMode && slug) {
        r.push(`/posts/${data.slug ?? slug}`);
      } else {
        r.push(`/posts/${data.slug}`);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while publishing your post.";
      setSubmitError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {isEditMode && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
          <p className="font-semibold text-amber-100">Editing this post will clear all verification votes.</p>
          <p className="text-amber-100/80">
            Publish updates only when you are ready&mdash;the community will have to verify the new version again.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-10">
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
                maxLength={MAX_TITLE_LENGTH}
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
                <p id={errorId("title")} className="text-sm text-error">
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
                    "h-12 w-full rounded-2xl border border-white/10 bg-(--surface-2)/80 px-4 text-sm font-medium text-white focus:ring-2",
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
                  <p id={errorId("gameVersion")} className="text-sm text-error">
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
                      "h-12 w-full appearance-none rounded-2xl border border-white/10 bg-(--surface-2)/80 px-4 text-sm font-medium text-white focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
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
                  <p id={errorId("modVersion")} className="text-sm text-error">
                    {errors.modVersion}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="categoryKey" className="text-sm font-medium text-white/75">
                Category
              </label>
              <select
                id="categoryKey"
                className={clsx(
                  "h-12 w-full rounded-2xl border border-white/10 bg-(--surface-2)/80 px-4 text-sm font-medium text-white focus:ring-2",
                  shouldShowError("categoryKey")
                    ? "focus:ring-red-400 focus:border-red-500/70 border-red-500/60"
                    : "focus:border-brand-400 focus:ring-brand-400"
                )}
                value={form.categoryKey}
                onChange={e => change("categoryKey", e.target.value)}
                onBlur={() => markTouched("categoryKey")}
                disabled={categoriesLoading && !categories.length}
                aria-invalid={shouldShowError("categoryKey") || undefined}
                aria-describedby={shouldShowError("categoryKey") ? errorId("categoryKey") : undefined}
              >
                <option value="">
                  {categoriesLoading ? "Loading categories…" : "Select a category…"}
                </option>
                {categories.map(category => (
                  <option key={category.key} value={category.key}>
                    {category.name}
                  </option>
                ))}
              </select>
              {categoriesError && <p className="text-xs text-amber-300">{categoriesError}</p>}
              {shouldShowError("categoryKey") && errors.categoryKey && (
                <p id={errorId("categoryKey")} className="text-sm text-error">
                  {errors.categoryKey}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <label htmlFor="tags" className="text-sm font-medium text-white/75">
                Tags <span className="text-white/45">({TAG_MIN_COUNT}–{TAG_MAX_COUNT} required)</span>
              </label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Input
                    id="tags"
                    placeholder="Add tags like automation, redstone, megabase"
                    value={tagInput}
                    onChange={e => handleTagInputChange(e.target.value)}
                    onBlur={() => markTouched("tags")}
                    onKeyDown={event => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitTagInput();
                      }
                    }}
                    maxLength={MAX_TAG_LENGTH}
                    aria-invalid={shouldShowError("tags") || undefined}
                    aria-describedby={shouldShowError("tags") ? errorId("tags") : undefined}
                    disabled={tags.length >= TAG_MAX_COUNT}
                    className={clsx(
                      shouldShowError("tags") && "border-red-500/60 focus:ring-red-400 focus:border-red-500/70"
                    )}
                  />
                  <p className="text-xs text-white/60">
                    Separate tags with commas or use the add button. Each tag can be up to {MAX_TAG_LENGTH} characters.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={commitTagInput}
                  disabled={tags.length >= TAG_MAX_COUNT}
                >
                  <TagIcon className="h-4 w-4" /> Add tag
                </Button>
              </div>
              {tagError && <p className="text-sm text-error">{tagError}</p>}
              {shouldShowError("tags") && errors.tags && (
                <p id={errorId("tags")} className="text-sm text-error">
                  {errors.tags}
                </p>
              )}
              {!!tags.length && (
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <span
                      key={tag.slug}
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-white/85"
                    >
                      <span className="inline-flex items-center gap-1">
                        <TagIcon className="h-3 w-3 text-white/60" />
                        {tag.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTag(tag.slug)}
                        className="rounded-full border border-white/20 px-2 py-0.5 text-xs font-semibold text-white/60 transition hover:border-white/40 hover:text-white"
                        aria-label={`Remove tag ${tag.name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
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
                  Dependency URL <span className="text-white/45">(optional)</span>
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
            {depError && <p className="text-sm text-error">{depError}</p>}
            {!!deps.length && (
              <div className="flex flex-wrap gap-2">
                {deps.map(d => (
                  <a
                    key={d.url}
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
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
            title="Description"
            description="Tell readers what to expect and how to get started."
          />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="description" className="text-sm font-medium text-white/75">
                Overview
              </label>

              {/* Markdown toolbar */}
              <div className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 p-1 text-xs font-semibold text-white/70">
                <button
                  type="button"
                  onClick={() => applyMarkdown("bold")}
                  className="rounded-full px-2 py-1 hover:bg-white/10"
                  aria-label="Bold"
                >
                  <Bold className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyMarkdown("italic")}
                  className="rounded-full px-2 py-1 hover:bg-white/10"
                  aria-label="Italic"
                >
                  <Italic className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyMarkdown("strike")}
                  className="rounded-full px-2 py-1 hover:bg-white/10"
                  aria-label="Strikethrough"
                >
                  <Strikethrough className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyMarkdown("code")}
                  className="rounded-full px-2 py-1 hover:bg-white/10"
                  aria-label="Code"
                >
                  <Code className="h-3.5 w-3.5" />
                </button>

                <span className="mx-1 h-4 w-px bg-white/15" aria-hidden="true" />

                <button
                  type="button"
                  onClick={() => applyMarkdown("ul")}
                  className="rounded-full px-2 py-1 hover:bg-white/10"
                  aria-label="Bullet list"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyMarkdown("ol")}
                  className="rounded-full px-2 py-1 hover:bg-white/10"
                  aria-label="Numbered list"
                >
                  <ListOrdered className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <textarea
              id="description"
              ref={descriptionRef}
              className={clsx(
                "min-h-32 w-full resize-none overflow-y-auto rounded-2xl border border-white/10 bg-(--surface-2)/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:ring-2",
                shouldShowError("description")
                  ? "focus:ring-red-400 focus:border-red-500/70 border-red-500/60"
                  : "focus:border-brand-400 focus:ring-brand-400"
              )}
              style={descriptionMaxHeight ? { maxHeight: descriptionMaxHeight } : undefined}
              placeholder="Describe the goal, features, and any setup instructions"
              value={form.description}
              onChange={e => change("description", e.target.value)}
              onBlur={() => markTouched("description")}
              aria-invalid={shouldShowError("description") || undefined}
              aria-describedby={shouldShowError("description") ? errorId("description") : undefined}
            />

            {(() => {
              const length = form.description.trim().length;
              const tooLong = length > POST_DESCRIPTION_MAX_LENGTH;

              return (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <p className={clsx(tooLong ? "text-red-300" : "text-white/45")}>
                    {length}/{POST_DESCRIPTION_MAX_LENGTH} characters{" "}
                    <span className="text-white/50">
                      (minimum {POST_DESCRIPTION_MIN_LENGTH})
                    </span>
                  </p>
                  <p className="text-white/45">
                    Supports basic Markdown: **bold**, *italic*, ~~strike~~, `code`, lists, and more.
                  </p>
                </div>
              );
            })()}

            {shouldShowError("description") && errors.description && (
              <p id={errorId("description")} className="text-sm text-error">
                {errors.description}
              </p>
            )}

            {form.description.trim().length > 0 && (
              <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                  Preview
                </p>
                <div className="prose prose-invert prose-sm max-w-none prose-headings:text-white prose-strong:text-white prose-em:text-white/90 prose-p:text-white/85 prose-li:text-white/80">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {form.description}
                  </ReactMarkdown>
                </div>
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
                <p id={errorId("youtubeUrl")} className="text-sm text-error">
                  {errors.youtubeUrl}
                </p>
              )}
              {youtubePreviewStatus === "loading" && (
                <p className="text-xs text-white/60">Fetching video details…</p>
              )}
              {youtubePreviewStatus === "error" && youtubePreviewMessage && (
                <p className="text-xs text-amber-300">{youtubePreviewMessage}</p>
              )}
              {youtubePreview && (
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/85">
                  {youtubePreview.thumbnail ? (
                    <Image
                      src={youtubePreview.thumbnail}
                      alt="YouTube thumbnail"
                      width={96}
                      height={64}
                      className="h-16 w-24 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="grid h-16 w-24 place-items-center rounded-lg bg-white/10 text-white/50">
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="h-6 w-6"
                        aria-hidden="true"
                      >
                        <path d="M10 15.5 16 12 10 8.5z" />
                      </svg>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{youtubePreview.title}</p>
                    <p className="text-xs text-white/60">by {youtubePreview.author}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label htmlFor="images" className="text-sm font-medium text-white/75">
                    Image gallery
                    <span className="text-white/45"> (max {MAX_IMAGE_MB}MB each, up to {MAX_IMAGE_COUNT} images)</span>
                  </label>
                  <label
                    htmlFor="images"
                    className={clsx(
                      "inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:bg-white/10",
                      shouldShowError("images") && "border-red-500/60 text-red-200 hover:border-red-400",
                      totalImageSlots >= MAX_IMAGE_COUNT && "cursor-not-allowed opacity-60 hover:border-white/15 hover:bg-white/5"
                    )}
                  >
                    <Images aria-hidden="true" className="h-4 w-4" />
                    <span>Choose files</span>
                  </label>
                </div>
                <input
                  id="images"
                  type="file"
                  multiple
                  accept="image/*"
                  className="sr-only"
                  disabled={totalImageSlots >= MAX_IMAGE_COUNT}
                  onChange={e => {
                    markTouched("images");
                    const incoming = e.target.files ? Array.from(e.target.files) : [];
                    if (incoming.length) {
                      const remainingSlots = Math.max(0, MAX_IMAGE_COUNT - persistedImages.length);
                      setMediaFiles(prev => {
                        const merged = [...prev, ...incoming];
                        if (merged.length > remainingSlots) {
                          setLimitedByMax(true);
                        }
                        return merged.slice(0, remainingSlots || 0);
                      });
                    }
                    e.target.value = "";
                  }}
                  aria-invalid={shouldShowError("images") || undefined}
                  aria-describedby={shouldShowError("images") ? errorId("images") : undefined}
                />
                <p className="text-xs text-white/60">
                  <span className="font-semibold text-white/80">Selected:</span> {fileSummary}. The first image becomes your thumbnail.
                </p>
              </div>
              {shouldShowError("images") && errors.images && (
                <p id={errorId("images")} className="text-sm text-error">
                  {errors.images}
                </p>
              )}
              {nsfwCheckStatus === "running" && (
                <p className="text-xs text-white/60">Scanning your images for safety…</p>
              )}
              {nsfwCheckStatus === "error" && nsfwMessage && (
                <p className="text-sm text-amber-300">{nsfwMessage}</p>
              )}
              {previewItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-6 text-center text-sm text-white/60">
                  No images have been attached to this post yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {previewItems.length > IMAGES_PER_PAGE && (
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/70">
                      <div>
                        Showing{" "}
                        <span className="font-semibold text-white">
                          {startIndex + 1}–{endIndex}
                        </span>{" "}
                        of{" "}
                        <span className="font-semibold text-white">
                          {previewItems.length}
                        </span>{" "}
                        images
                      </div>
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setImagePage(p => Math.max(0, p - 1))}
                          disabled={currentPage === 0}
                          className={clsx(
                            "inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white/80 transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40",
                            currentPage === 0 && "opacity-60"
                          )}
                          aria-label="Previous images"
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <span className="text-white/75">
                          Page{" "}
                          <span className="font-semibold text-white">
                            {currentPage + 1}
                          </span>{" "}
                          / {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setImagePage(p =>
                              Math.min(totalPages - 1, p + 1),
                            )
                          }
                          disabled={currentPage >= totalPages - 1}
                          className={clsx(
                            "inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white/80 transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40",
                            currentPage >= totalPages - 1 && "opacity-60"
                          )}
                          aria-label="Next images"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    {currentPageItems.map(item => {
                      const isNew = item.type === "new";
                      return (
                        <div
                          key={item.key}
                          className="relative aspect-video overflow-hidden rounded-2xl border border-white/10"
                        >
                          <span className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                            <span>#{item.labelIndex + 1}</span>
                            {item.labelIndex === 0 && (
                              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[0.6rem] uppercase tracking-wide text-black">
                                thumb
                              </span>
                            )}
                            {!isNew && (
                              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[0.6rem] uppercase tracking-wide text-black text-xs">
                                existing
                              </span>
                            )}
                          </span>

                          {isNew ? (
                            <button
                              type="button"
                              onClick={() =>
                                item.fileIndex !== undefined &&
                                removeMediaAt(item.fileIndex)
                              }
                              className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-sm font-bold text-white transition hover:bg-black/80"
                              aria-label={item.fileName ? `Remove ${item.fileName}` : "Remove image"}
                            >
                              ×
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => removeExistingImage(item.key)}
                              className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-sm font-bold text-white transition hover:bg-black/80"
                              aria-label="Remove existing image"
                            >
                              ×
                            </button>
                          )}

                          <Image
                            src={item.src}
                            alt=""
                            fill
                            className="z-0 object-cover"
                            sizes="(min-width: 1280px) 33vw, (min-width: 1024px) 50vw, 100vw"
                          />

                          {isNew && item.fileIndex !== undefined && (
                            <div className="absolute bottom-3 left-3 z-10 flex gap-2">
                              <button
                                type="button"
                                onClick={() => moveMedia(item.fileIndex, item.fileIndex - 1)}
                                disabled={item.fileIndex === 0}
                                className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white/90 transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/30 disabled:text-white/40"
                                aria-label={item.fileName ? `Move ${item.fileName} earlier` : "Move image earlier"}
                              >
                                ←
                              </button>
                              <button
                                type="button"
                                onClick={() => moveMedia(item.fileIndex, item.fileIndex + 1)}
                                disabled={item.fileIndex === mediaFiles.length - 1}
                                className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white/90 transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/30 disabled:text-white/40"
                                aria-label={item.fileName ? `Move ${item.fileName} later` : "Move image later"}
                              >
                                →
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {galleryImages.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <p className="text-xs font-medium text-white/70">
                        Gallery preview (what readers will see)
                      </p>
                      <ImageGallery imgs={galleryImages} />
                    </div>
                  )}
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

          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/75 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-white/70">
              Need inspiration or not sure how to structure your script? Open the code guide in a new tab to see some
              complete SuperFactoryManager examples.
            </p>
            <Link
              href="/guide"
              target="_blank"
              rel="noreferrer"
              className="inline-flex sm:shrink-0"
            >
              <Button size="sm" variant="ghost" className="w-full justify-center gap-2">
                <BookOpen className="h-4 w-4" />
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
                  wrapLines
                    ? "bg-brand-500 text-white shadow-soft"
                    : "text-white/70 hover:text-white"
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
                  !wrapLines
                    ? "bg-brand-500 text-white shadow-soft"
                    : "text-white/70 hover:text-white"
                )}
              >
                Horizontal scroll
              </button>
            </div>
          </div>

          {hasLoadedDraft && (
            <CodeBox
              key={hasLoadedDraft ? `${draftKey}-ready` : `${draftKey}-loading`}
              value={form.code}
              onChange={v => change("code", v)}
              onBlur={() => markTouched("code")}
              isInvalid={shouldShowError("code")}
              errorMarkers={errorMarkers}
              warningRanges={warningRanges}
              wrapLines={wrapLines}
              describedBy={[
                shouldShowError("code") ? errorId("code") : null,
                codeFeedback.status === "ok" && codeFeedback.warnings.length ? codeWarningsId : null,
              ]
                .filter(Boolean)
                .join(" ") || undefined}
            />
          )}
          {shouldShowError("code") && errors.code && (
            <div id={errorId("code")} className="space-y-1 text-sm text-error">
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

        <Card className="space-y-5 p-6 sm:px-8 sm:py-7 lg:col-span-2">
          <SectionTitle
            title="Collaboration"
            description="Allow other builders to propose code improvements for this post."
          />
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-white/80">
              {form.openForImprovement
                ? "Anyone with an account can suggest code edits. You decide what to merge."
                : "Only you can update this code. Enable collaboration to accept pull-request style edits."}
            </p>
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, openForImprovement: !prev.openForImprovement }))}
              className={clsx(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
                form.openForImprovement
                  ? "bg-brand-500 text-white shadow-soft"
                  : "border border-white/20 bg-white/5 text-white/80 hover:border-white/30 hover:text-white"
              )}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current">
                <span
                  className={clsx(
                    "h-3 w-3 rounded-full bg-current transition",
                    form.openForImprovement ? "opacity-100" : "opacity-0"
                  )}
                />
              </span>
              {form.openForImprovement ? "Open to improvements" : "Closed to improvements"}
            </button>
          </div>
          <p className="text-xs text-white/55">
            When collaboration is enabled, contributors can edit only the code and must include a message explaining their changes.
          </p>
        </Card>
      </div>

      <div className="space-y-4">
        {blockingMessages.length > 0 && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm wrap-anywhere text-red-200">
            <p className="font-semibold text-red-100">Complete the following before publishing:</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 marker:text-red-200">
              {blockingMessages.map(message => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}
        {submitError && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm text-red-200">
            {submitError}
          </div>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            size="lg"
            className="w-full sm:w-auto"
            disabled={publishDisabled}
            onClick={submit}
          >
            {loading ? (
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
            ) : (
              <UploadCloud aria-hidden="true" />
            )}
            {loading ? submitLoadingLabel : submitButtonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
