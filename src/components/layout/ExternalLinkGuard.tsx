"use client";
import { useEffect } from "react";

function isExternalLink(href: string, currentOrigin: string) {
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;
  try {
    const url = new URL(href, currentOrigin);
    return url.origin !== currentOrigin;
  } catch {
    return false;
  }
}

export default function ExternalLinkGuard() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      if (anchor.dataset.allowExternal === "true") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href") ?? "";
      const origin = window.location.origin;
      if (!isExternalLink(href, origin)) return;

      const hostname = (() => {
        try {
          return new URL(href, origin).hostname;
        } catch {
          return href;
        }
      })();

      const confirmed = window.confirm(
        `You're about to leave superfactorymanager and open ${hostname}.\nWe can't guarantee external sites are safe. Continue?`,
      );

      if (!confirmed) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, []);

  return null;
}
