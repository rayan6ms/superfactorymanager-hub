// src/components/layout/UserMenuAutoCloser.tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function UserMenuAutoCloser() {
  const pathname = usePathname();

  useEffect(() => {
    const menus = Array.from(
      document.querySelectorAll<HTMLDetailsElement>("details[data-user-menu]")
    );

    if (!menus.length) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      menus.forEach(menu => {
        if (!menu.open) return;
        if (!menu.contains(target)) {
          menu.removeAttribute("open");
        }
      });
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    const menus = Array.from(
      document.querySelectorAll<HTMLDetailsElement>("details[data-user-menu]")
    );
    menus.forEach(menu => {
      if (menu.open) {
        menu.removeAttribute("open");
      }
    });
  }, [pathname]);

  return null;
}
