"use client";

import { useEffect } from "react";
import { registerWorker } from "@/lib/push";

/**
 * iOS home-screen apps: when the on-screen keyboard closes, WKWebView
 * sometimes fails to restore the window height — the whole app stays shifted
 * up and a black band is left above the home indicator until the app is
 * force-quit. A tiny scroll nudge after the keyboard goes away makes iOS
 * recompute the viewport and snap the page back into place.
 */
export function ViewportFix() {
  // the push service worker must already be installed when the user flips the
  // switch in Settings, so register it quietly on every load
  useEffect(() => {
    const t = setTimeout(() => void registerWorker()?.catch(() => {}), 0);
    return () => clearTimeout(t);
  }, []);

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

    // The on-screen keyboard shrinks only the *visual* viewport; fixed dialogs
    // are laid out against the full window, so on an iPad their lower half
    // (and the Save button) ended up behind the keyboard. Publish the visible
    // area so dialogs can fit into it.
    const root = document.documentElement.style;
    let frame = 0;
    const publish = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.setProperty("--vv-height", `${Math.round(vv.height)}px`);
        root.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`);
      });
    };
    publish();
    vv.addEventListener("resize", publish);
    vv.addEventListener("scroll", publish);

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
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", publish);
      vv.removeEventListener("scroll", publish);
      vv.removeEventListener("resize", nudge);
      document.removeEventListener("focusout", nudge);
    };
  }, []);

  return null;
}
