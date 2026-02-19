"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import {
  POST_REDIRECT_SHARE_LINK_STORAGE_KEY,
  POST_REDIRECT_TOAST_STORAGE_KEY,
} from "@/lib/builds/links";

export default function PostRedirectToast() {
  const [{ message: initialMessage, shareLink: initialShareLink }] = useState(() => {
    if (typeof window === "undefined") {
      return { message: null as string | null, shareLink: null as string | null };
    }

    try {
      const nextMessage = window.sessionStorage.getItem(POST_REDIRECT_TOAST_STORAGE_KEY);
      const nextShareLink = window.sessionStorage.getItem(POST_REDIRECT_SHARE_LINK_STORAGE_KEY);

      // One-time redirect notice: read then clear immediately.
      window.sessionStorage.removeItem(POST_REDIRECT_TOAST_STORAGE_KEY);
      window.sessionStorage.removeItem(POST_REDIRECT_SHARE_LINK_STORAGE_KEY);

      return { message: nextMessage, shareLink: nextShareLink };
    } catch {
      return { message: null as string | null, shareLink: null as string | null };
    }
  });
  const [message, setMessage] = useState<string | null>(initialMessage);
  const [shareLink, setShareLink] = useState<string | null>(initialShareLink);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 2400);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message && !shareLink) return null;

  return (
    <div className="fixed left-1/2 top-4 z-50 w-[min(92vw,36rem)] -translate-x-1/2 space-y-2">
      {message && (
        <div className="rounded-md border border-brand-300/75 bg-brand-500 px-4 py-2 text-center text-sm font-medium text-white/90 shadow-soft">
          {message}
        </div>
      )}
      {shareLink && (
        <div className="space-y-3 rounded-md border border-amber-300/60 bg-amber-700 p-3 text-sm text-amber-50 shadow-soft">
          <p>Clipboard permission is unavailable. Copy this canonical build link manually.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={shareLink} className="border-amber-200/50 bg-amber-950/50 font-mono text-xs text-amber-50" />
            <Button
              type="button"
              className="border-amber-200/40 bg-amber-500 text-white hover:bg-amber-400 sm:shrink-0"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareLink);
                  setMessage("Build link copied!");
                  setShareLink(null);
                } catch {
                  setMessage("Clipboard access is still blocked.");
                }
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
