"use client";
import { useEffect } from "react";

type Props = {
  active?: boolean;
};

export default function HideHeaderSearch({ active = true }: Props) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.getAttribute("data-hide-header-search");
    document.body.setAttribute("data-hide-header-search", "true");
    return () => {
      if (previous) {
        document.body.setAttribute("data-hide-header-search", previous);
      } else {
        document.body.removeAttribute("data-hide-header-search");
      }
    };
  }, [active]);

  return null;
}
