"use client";

import { useEffect } from "react";

/**
 * iOS home-screen apps: when the on-screen keyboard closes, WKWebView
 * sometimes fails to restore the window height — the whole app stays shifted
 * up and a black band is left above the home indicator until the app is
 * force-quit. A tiny scroll nudge after the keyboard goes away makes iOS
 * recompute the viewport and snap the page back into place.
 */
export function ViewportFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const typing = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      );
    };

    let t: ReturnType<typeof setTimeout> | undefined;
    const nudge = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (typing()) return;
        const y = window.scrollY;
        window.scrollTo(0, y + 1);
        window.scrollTo(0, y);
      }, 120);
    };

    vv.addEventListener("resize", nudge);
    document.addEventListener("focusout", nudge);
    return () => {
      clearTimeout(t);
      vv.removeEventListener("resize", nudge);
      document.removeEventListener("focusout", nudge);
    };
  }, []);

  return null;
}
