"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type WheelEvent,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export type GalleryImage = {
  id: string;
  thumbSm: string;
  thumbMd: string;
  thumbLg: string;
  original: string;
};

type ImageGalleryProps = {
  imgs: GalleryImage[];
};

export default function ImageGallery({ imgs }: ImageGalleryProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(1);

  const total = imgs?.length ?? 0;
  const hasImages = total > 0;

  const openViewer = useCallback(
    (index: number) => {
      if (!hasImages) return;
      setActiveIndex(index);
      setZoom(1);
      setOpen(true);
    },
    [hasImages],
  );

  const closeViewer = useCallback(() => {
    setOpen(false);
    setZoom(1);
  }, []);

  const goToNext = useCallback(() => {
    if (!hasImages) return;
    setActiveIndex((prev) => {
      const normalized = ((prev % total) + total) % total;
      return (normalized + 1) % total;
    });
    setZoom(1);
  }, [total, hasImages]);

  const goToPrev = useCallback(() => {
    if (!hasImages) return;
    setActiveIndex((prev) => {
      const normalized = ((prev % total) + total) % total;
      return (normalized - 1 + total) % total;
    });
    setZoom(1);
  }, [total, hasImages]);

  useEffect(() => {
    if (!open || !hasImages) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPrev();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, hasImages, closeViewer, goToNext, goToPrev]);

  const safeIndex = hasImages ? Math.min(activeIndex, total - 1) : 0;

  const currentImage = useMemo(() => {
    if (!hasImages) return null;
    return imgs[safeIndex] ?? imgs[0];
  }, [imgs, hasImages, safeIndex]);

  const currentImageSrc = useMemo(() => {
    if (!currentImage) return null;
    return (
      currentImage.original ||
      currentImage.thumbLg ||
      currentImage.thumbMd ||
      currentImage.thumbSm ||
      null
    );
  }, [currentImage]);

  const openImageInNewTab = useCallback(() => {
    if (!currentImageSrc) return;
    window.open(currentImageSrc, "_blank", "noopener,noreferrer");
  }, [currentImageSrc]);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey || !hasImages) return;
      event.preventDefault();
      setZoom((prev) => clamp(prev + (event.deltaY < 0 ? 0.1 : -0.1), 1, 3));
    },
    [hasImages],
  );

  const zoomInAction = useCallback(
    () => setZoom((prev) => clamp(prev + 0.25, 1, 3)),
    [],
  );
  const zoomOutAction = useCallback(
    () => setZoom((prev) => clamp(prev - 0.25, 1, 3)),
    [],
  );
  const resetZoom = useCallback(() => setZoom(1), []);

  if (!hasImages) return null;

  const overlay =
    open && typeof document !== "undefined"
      ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[#0e111a]/75 px-3 py-6 sm:px-6 sm:py-10 backdrop-blur-sm sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeViewer();
            }
          }}
        >
          <div className="flex w-full max-w-7xl max-h-[calc(100dvh-3rem)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#111827]/90 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">
                  Gallery
                </p>
                <p className="text-lg font-semibold text-white">
                  Image {safeIndex + 1} of {total}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={zoomOutAction}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-white/40 hover:text-white"
                >
                  <ZoomOut className="h-5 w-5" aria-hidden="true" />
                  <span className="sr-only">Zoom out</span>
                </button>
                <button
                  type="button"
                  onClick={zoomInAction}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-white/40 hover:text-white"
                >
                  <ZoomIn className="h-5 w-5" aria-hidden="true" />
                  <span className="sr-only">Zoom in</span>
                </button>
                <button
                  type="button"
                  onClick={resetZoom}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 px-3 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:text-white"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={openImageInNewTab}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!currentImageSrc}
                >
                  <ExternalLink className="h-5 w-5" aria-hidden="true" />
                  <span className="sr-only">Open image in new tab</span>
                </button>
                <button
                  type="button"
                  onClick={closeViewer}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-white/40 hover:text-white"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            </div>

            <div className="relative flex-1 bg-[#0d1422]/85 px-6 py-4 sm:px-10 sm:py-6">
              <div
                className="h-full w-full overflow-auto rounded-2xl bg-white/5 dark-scrollbar"
                onWheel={handleWheel}
              >
                <div className="flex min-h-full min-w-full items-center justify-center p-4">
                  {currentImageSrc && (
                    <img
                      src={currentImageSrc}
                      alt=""
                      className="w-auto max-w-full object-contain"
                      style={{ transform: `scale(${zoom})`, maxHeight: "min(70vh, 70dvh)" }}
                    />
                  )}
                </div>
              </div>

              {total > 1 && (
                <div className="mt-4 flex items-center justify-around gap-4">
                  <button
                    type="button"
                    onClick={goToPrev}
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white/85 transition hover:border-white/50 hover:bg-white/15"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    <span>Previous</span>
                  </button>
                  <p className="text-xs text-white/60">
                    Image {safeIndex + 1} of {total}
                  </p>
                  <button
                    type="button"
                    onClick={goToNext}
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white/85 transition hover:border-white/50 hover:bg-white/15"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-white/10 bg-[#0f172a]/80 px-4 py-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {imgs.map((image, index) => {
                  const preview =
                    image.thumbSm ||
                    image.thumbMd ||
                    image.thumbLg ||
                    image.original;
                  const isActive = index === safeIndex;
                  return (
                    <button
                      type="button"
                      key={image.id}
                      onClick={() => {
                        setActiveIndex(index);
                        setZoom(1);
                      }}
                      className={clsx(
                        "flex h-16 w-24 flex-none items-center justify-center overflow-hidden rounded-xl border",
                        isActive
                          ? "border-white/80"
                          : "border-white/15 opacity-70 hover:opacity-100",
                      )}
                    >
                      <img
                        src={preview}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <span className="sr-only">
                        Thumbnail {index + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )
      : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {imgs.map((img, index) => {
          const preview = img.thumbLg || img.thumbMd || img.thumbSm || img.original;
          return (
            <button
              type="button"
              key={img.id}
              onClick={() => openViewer(index)}
              className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-white/5"
            >
              <img
                src={preview}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              />
              <span className="pointer-events-none absolute left-2 top-2 inline-flex h-7 min-w-8 items-center justify-center rounded-full bg-[#0e111a]/80 px-2 text-xs font-semibold text-white">
                #{index + 1}
              </span>
              <span className="pointer-events-none absolute inset-0 border-2 border-transparent transition group-hover:border-white/20" />
            </button>
          );
        })}
      </div>

      {overlay}
    </>
  );
}
