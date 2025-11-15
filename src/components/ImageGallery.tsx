"use client";
/* eslint-disable @next/next/no-img-element */

export default function ImageGallery({ imgs }: { imgs: { id: string; thumbSm: string; thumbMd: string; thumbLg: string; original: string }[] }) {
  if (!imgs?.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {imgs.map(img => (
        <a
          key={img.id}
          href={img.original || img.thumbLg || img.thumbMd || img.thumbSm}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-black/20"
        >
          <img
            src={img.thumbLg || img.thumbMd || img.thumbSm || img.original}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
          <span className="pointer-events-none absolute inset-0 border-2 border-transparent transition group-hover:border-white/20" />
        </a>
      ))}
    </div>
  );
}
