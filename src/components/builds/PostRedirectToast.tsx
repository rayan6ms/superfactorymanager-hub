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
    <div className="fixed bottom-5 right-5 z-50 w-[min(92vw,36rem)] space-y-2">
      {message && (
        <div className="rounded-xl border border-white/20 bg-black/85 px-4 py-2 text-sm text-white shadow-soft">
          {message}
        </div>
      )}
      {shareLink && (
        <div className="space-y-3 rounded-xl border border-amber-400/35 bg-black/90 p-3 text-sm text-amber-100 shadow-soft">
          <p>Clipboard permission is unavailable. Copy this canonical build link manually.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={shareLink} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              className="sm:shrink-0"
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
