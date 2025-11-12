"use client";
import { useEffect } from "react";

export default function ViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    fetch(`/api/posts/${encodeURIComponent(slug)}/view`, { method: "POST" }).catch(() => { });
  }, [slug]);
  return null;
}
