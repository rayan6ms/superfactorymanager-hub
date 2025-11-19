/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from "lucide-react";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef<HTMLDivElement | null>(null);

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
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const goToNext = useCallback(() => {
    if (!hasImages) return;
    setActiveIndex(prev => {
      const normalized = ((prev % total) + total) % total;
      return (normalized + 1) % total;
    });
    setZoom(1);
  }, [total, hasImages]);

  const goToPrev = useCallback(() => {
    if (!hasImages) return;
    setActiveIndex(prev => {
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

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const safeIndex = hasImages ? Math.min(activeIndex, total - 1) : 0;

  const currentImage = useMemo(() => {
    if (!hasImages) return null;
    return imgs[safeIndex] ?? imgs[0];
  }, [imgs, hasImages, safeIndex]);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey || !hasImages) return;
      event.preventDefault();
      setZoom(prev => clamp(prev + (event.deltaY < 0 ? 0.1 : -0.1), 1, 3));
    },
    [hasImages],
  );

  const zoomInAction = useCallback(() => setZoom(prev => clamp(prev + 0.25, 1, 3)), []);
  const zoomOutAction = useCallback(() => setZoom(prev => clamp(prev - 0.25, 1, 3)), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  const toggleFullscreen = useCallback(() => {
    const node = viewerRef.current;
    if (!node) return;
    if (!document.fullscreenElement) {
      node.requestFullscreen().catch(() => undefined);
    } else {
      document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  if (!hasImages) {
    return null;
  }

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
              className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-black/20"
            >
              <img
                src={preview}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              />
              <span className="pointer-events-none absolute inset-0 border-2 border-transparent transition group-hover:border-white/20" />
            </button>
          );
        })}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              closeViewer();
            }
          }}
        >
          <div
            ref={viewerRef}
            className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/80"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">Gallery</p>
                <p className="text-lg font-semibold text-white">
                  {safeIndex + 1} / {total}
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
                  onClick={toggleFullscreen}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-white/40 hover:text-white"
                >
                  {isFullscreen ? <Minimize2 className="h-5 w-5" aria-hidden="true" /> : <Maximize2 className="h-5 w-5" aria-hidden="true" />}
                  <span className="sr-only">Toggle fullscreen</span>
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

            <div className="relative flex-1 overflow-hidden bg-black/70" onWheel={handleWheel}>
              <img
                src={currentImage?.original || currentImage?.thumbLg || currentImage?.thumbMd || currentImage?.thumbSm}
                alt=""
                className="mx-auto h-full max-h-full w-full object-contain"
                style={{ transform: `scale(${zoom})`, transition: "transform 200ms ease" }}
              />
              {total > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goToPrev}
                    className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 p-3 text-white transition hover:border-white/40 hover:bg-black/70"
                  >
                    <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                    <span className="sr-only">Previous image</span>
                  </button>
                  <button
                    type="button"
                    onClick={goToNext}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 p-3 text-white transition hover:border-white/40 hover:bg-black/70"
                  >
                    <ChevronRight className="h-6 w-6" aria-hidden="true" />
                    <span className="sr-only">Next image</span>
                  </button>
                </>
              )}
            </div>

            <div className="border-t border-white/10 bg-black/70 px-4 py-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {imgs.map((image, index) => {
                  const preview = image.thumbSm || image.thumbMd || image.thumbLg || image.original;
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
                        isActive ? "border-white/80" : "border-white/15 opacity-70 hover:opacity-100",
                      )}
                    >
                      <img src={preview} alt="" className="h-full w-full object-cover" />
                      <span className="sr-only">Thumbnail {index + 1}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
