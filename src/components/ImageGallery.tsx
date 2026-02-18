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
import Image from "next/image";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

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
  const [brightness, setBrightness] = useState(1);

  const [baseSize, setBaseSize] = useState<{ width: number; height: number } | null>(null);
  const [imageAreaHeight, setImageAreaHeight] = useState<number | null>(null);

  const total = imgs?.length ?? 0;
  const hasImages = total > 0;

  const resetViewState = useCallback(() => {
    setZoom(1);
    setBrightness(1);
    setBaseSize(null);
    setImageAreaHeight(null);
  }, []);

  const openViewer = useCallback(
    (index: number) => {
      if (!hasImages) return;
      setActiveIndex(index);
      resetViewState();
      setOpen(true);
    },
    [hasImages, resetViewState],
  );

  const closeViewer = useCallback(() => {
    setOpen(false);
    resetViewState();
  }, [resetViewState]);

  const goToNext = useCallback(() => {
    if (!hasImages) return;
    setActiveIndex((prev) => {
      const normalized = ((prev % total) + total) % total;
      return (normalized + 1) % total;
    });
    resetViewState();
  }, [total, hasImages, resetViewState]);

  const goToPrev = useCallback(() => {
    if (!hasImages) return;
    setActiveIndex((prev) => {
      const normalized = ((prev % total) + total) % total;
      return (normalized - 1 + total) % total;
    });
    resetViewState();
  }, [total, hasImages, resetViewState]);

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
      setZoom((prev) =>
        clamp(prev + (event.deltaY < 0 ? 0.1 : -0.1), MIN_ZOOM, MAX_ZOOM),
      );
    },
    [hasImages],
  );

  const zoomInAction = useCallback(
    () => setZoom((prev) => clamp(prev + 0.25, MIN_ZOOM, MAX_ZOOM)),
    [],
  );
  const zoomOutAction = useCallback(
    () => setZoom((prev) => clamp(prev - 0.25, MIN_ZOOM, MAX_ZOOM)),
    [],
  );

  const resetAll = useCallback(() => {
    setZoom(1);
    setBrightness(1);
  }, []);

  const handleImageLoad = useCallback((img: HTMLImageElement) => {
    if (!img || typeof window === "undefined") return;

    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const maxAreaWidth = viewportWidth * 0.9;
    const maxAreaHeight = viewportHeight * 0.6;

    const isDesktop = viewportWidth >= 1024;
    const maxBaseScale = isDesktop ? 2 : 1;

    const rawScaleToFit = Math.min(maxAreaWidth / naturalWidth, maxAreaHeight / naturalHeight);
    const scaleToFit = Math.min(rawScaleToFit, maxBaseScale);

    const displayWidth = naturalWidth * scaleToFit;
    const displayHeight = naturalHeight * scaleToFit;

    const minDesktopHeight = viewportHeight * 0.5;
    const areaHeight = isDesktop ? Math.max(displayHeight, minDesktopHeight) : displayHeight;

    setBaseSize({ width: displayWidth, height: displayHeight });
    setImageAreaHeight(areaHeight);
    setZoom(1);
  }, []);


  if (!hasImages) return null;

  const canZoomOut = zoom > MIN_ZOOM;
  const canZoomIn = zoom < MAX_ZOOM;

  const displayWidth =
    baseSize && zoom ? baseSize.width * zoom : undefined;
  const displayHeight =
    baseSize && zoom ? baseSize.height * zoom : undefined;

  const verticalOffset =
    imageAreaHeight &&
      displayHeight &&
      zoom === 1 &&
      displayHeight < imageAreaHeight
      ? (imageAreaHeight - displayHeight) / 2
      : 0;

  const overlay =
    open && typeof document !== "undefined"
      ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e111a]/75 px-3 py-6 sm:px-6 sm:py-10 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeViewer();
            }
          }}
        >
          <div className="flex w-full max-w-7xl max-h-[calc(100dvh-3rem)] flex-col overflow-auto rounded-3xl border border-white/10 bg-neutral-900/80 backdrop-blur-sm shadow-2xl">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex w-fit sm:min-w-35 flex-1 flex-col">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">
                    Gallery
                  </p>
                  <p className="text-lg font-semibold text-white">
                    Image {safeIndex + 1} of {total}
                  </p>
                </div>

                <div className="flex flex-none justify-end sm:flex-1 sm:justify-center">
                  <label className="flex flex-col gap-1 text-xs font-medium text-white/60 sm:flex-row text-center sm:items-center sm:gap-3">
                    <span className="text-[11px] mb-2 sm:mb-0 sm:text-xs">
                      Brightness
                    </span>
                    <input
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.05}
                      value={brightness}
                      onChange={(e) => setBrightness(parseFloat(e.target.value))}
                      aria-label="Adjust image brightness"
                      className="h-1 w-40 cursor-pointer appearance-none rounded-full bg-white/20 accent-white"
                    />
                  </label>
                </div>

                <div className="mt-2 flex w-full justify-end gap-2 sm:mt-0 sm:w-auto sm:flex-1">
                  <button
                    type="button"
                    onClick={canZoomOut ? zoomOutAction : undefined}
                    disabled={!canZoomOut}
                    className={clsx(
                      "inline-flex h-10 w-10 items-center justify-center rounded-full border text-white/80 transition",
                      "hover:border-white/40 hover:text-white",
                      "disabled:cursor-not-allowed disabled:opacity-40 disabled:border-white/10 disabled:text-white/40",
                      "border-white/15",
                    )}
                  >
                    <ZoomOut className="h-5 w-5" aria-hidden="true" />
                    <span className="sr-only">Zoom out</span>
                  </button>

                  <button
                    type="button"
                    onClick={canZoomIn ? zoomInAction : undefined}
                    disabled={!canZoomIn}
                    className={clsx(
                      "inline-flex h-10 w-10 items-center justify-center rounded-full border text-white/80 transition",
                      "hover:border-white/40 hover:text-white",
                      "disabled:cursor-not-allowed disabled:opacity-40 disabled:border-white/10 disabled:text-white/40",
                      "border-white/15",
                    )}
                  >
                    <ZoomIn className="h-5 w-5" aria-hidden="true" />
                    <span className="sr-only">Zoom in</span>
                  </button>

                  <button
                    type="button"
                    onClick={resetAll}
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
            </div>

            <div className="relative bg-neutral-800/30 backdrop-blur-sm px-4 py-4 sm:px-10 sm:py-6">
              <div
                className="mx-auto w-full overflow-auto rounded-2xl bg-white/5 dark-scrollbar"
                style={
                  imageAreaHeight
                    ? { height: `${imageAreaHeight}px` }
                    : undefined
                }
                onWheel={handleWheel}
              >
                {currentImageSrc && (
                  <Image
                    src={currentImageSrc}
                    alt=""
                    width={2400}
                    height={1600}
                    priority
                    onLoadingComplete={(img) => handleImageLoad(img)}
                    className={clsx("block object-contain mx-auto", !baseSize && "max-h-[60vh] max-w-full")}
                    style={
                      baseSize
                        ? {
                          width: `${displayWidth}px`,
                          height: `${displayHeight}px`,
                          maxWidth: "none",
                          maxHeight: "none",
                          filter: `brightness(${brightness})`,
                          marginTop: verticalOffset ?? 0,
                        }
                        : {
                          filter: `brightness(${brightness})`,
                        }
                    }
                  />
                )}
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

            <div className="border-t border-white/10 bg-neutral-900/80 backdrop-blur-sm px-4 py-3">
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
                        resetViewState();
                      }}
                      className={clsx(
                        "flex h-16 w-24 flex-none items-center justify-center overflow-hidden rounded-xl border",
                        isActive
                          ? "border-white/80"
                          : "border-white/15 opacity-70 hover:opacity-100",
                      )}
                    >
                      <span className="relative h-full w-full">
                        <Image
                          src={preview}
                          alt=""
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </span>
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
          const preview =
            img.thumbLg || img.thumbMd || img.thumbSm || img.original;
          return (
            <button
              type="button"
              key={img.id}
              onClick={() => openViewer(index)}
              className="group relative overflow-hidden min-h-28 rounded-2xl border border-white/10 bg-white/5"
            >
              <Image
                src={preview}
                alt=""
                width={800}
                height={600}
                className="w-full h-auto max-h-60 object-cover transition duration-300 group-hover:scale-[1.02]"
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
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
