"use client";
import Image from "next/image";

export default function ImageGallery({ imgs }: { imgs: { id: string; thumbSm: string; thumbMd: string; thumbLg: string; original: string }[] }) {
  if (!imgs?.length) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {imgs.map(img => (
        <div key={img.id} className="relative rounded-xl overflow-hidden border border-base-700/60 bg-white/5">
          <Image
            src={img.thumbMd || img.thumbSm}
            alt=""
            width={640} height={360}
            sizes="(max-width: 768px) 50vw, 33vw"
            className="w-full h-auto"
          />
        </div>
      ))}
    </div>
  );
}
