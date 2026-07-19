"use client";

import { useEffect } from "react";
import { recordBackNav, recordNavOrigin } from "@/lib/navOrigin";

/**
 * Watches for the gesture that starts a navigation and records where on screen
 * it happened, so <Template> can grow the arriving page out of that point.
 *
 * Capture phase and pointerdown (not click) so the origin is banked before any
 * handler runs or the router tears the current page down.
 */
export function NavOriginTracker() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]");
      const href = anchor?.getAttribute("href");
      // internal routes only — external links leave the app entirely
      if (!href || !href.startsWith("/")) return;
      recordNavOrigin(e.clientX, e.clientY);
    };
    const onPop = () => recordBackNav();

    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  return null;
}
