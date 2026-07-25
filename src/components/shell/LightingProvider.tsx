"use client";

import { useEffect } from "react";
import { useEmber } from "@/lib/store";

/**
 * The virtual light source.
 *
 * One pointermove listener for the whole app, coalesced into one rAF frame,
 * writing CSS variables and nothing else — no React state, so no component in
 * EmberOS re-renders when the pointer moves. Everything downstream is CSS:
 *
 *   <html>              --cursor-x / --cursor-y   viewport px, drives the
 *                                                 ambient light and parallax
 *   the lit surface     --mx / --my               % within that surface
 *                       --lit                     0..1 specular strength
 *                       --lens-angle              the lens ring rotates to
 *                                                 face the light
 *
 * The element rect is cached per surface rather than measured every frame, so
 * a frame costs one elementFromPoint and two variable writes. Scrolling and
 * resizing drop the cache.
 *
 * Magnetism rides on the same loop: elements marked [data-magnetic] within
 * range get --mag-x / --mag-y, which CSS applies through the `translate`
 * property — deliberately not `transform`, so Framer Motion's transforms on
 * the same element are never clobbered.
 */

const SURFACES = ".panel, .glass, .glass-strong";
/** how close the pointer must get before a control starts leaning toward it */
const MAGNET_RANGE = 90;
/** how far a control is allowed to travel — past ~10px it stops feeling physical */
const MAGNET_MAX = 8;

export function LightingProvider() {
  const glass = useEmber((s) => s.settings.liquidGlass ?? true);
  const reduced = useEmber((s) => s.settings.reducedEffects ?? false);
  const cursorLight = useEmber((s) => s.settings.cursorLighting ?? true);

  useEffect(() => {
    if (!glass || !cursorLight) return;
    // a cursor light is meaningless without a cursor, and prefers-reduced-motion
    // users have asked for exactly this kind of thing to stop moving
    const fine = window.matchMedia("(pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || still.matches) return;

    const root = document.documentElement;
    let x = 0;
    let y = 0;
    let queued = false;
    let lit: HTMLElement | null = null;
    let rect: DOMRect | null = null;
    let magnets: HTMLElement[] = [];
    let magnetsAt = 0;

    const clearLit = () => {
      if (!lit) return;
      lit.style.setProperty("--lit", "0");
      lit = null;
      rect = null;
    };

    const frame = () => {
      queued = false;
      root.style.setProperty("--cursor-x", `${x}px`);
      root.style.setProperty("--cursor-y", `${y}px`);

      // --- specular: only the surface under the pointer does per-frame work
      const hit = document.elementFromPoint(x, y);
      const surface = hit ? (hit.closest(SURFACES) as HTMLElement | null) : null;
      if (surface !== lit) {
        clearLit();
        lit = surface;
        rect = surface ? surface.getBoundingClientRect() : null;
      }
      if (lit && rect && rect.width > 0 && rect.height > 0) {
        const px = ((x - rect.left) / rect.width) * 100;
        const py = ((y - rect.top) / rect.height) * 100;
        lit.style.setProperty("--mx", `${px.toFixed(1)}%`);
        lit.style.setProperty("--my", `${py.toFixed(1)}%`);
        lit.style.setProperty("--lit", "1");
        // the lens ring turns to face the light, so the bright edge is always
        // the one the light is actually on
        const angle = (Math.atan2(py - 50, px - 50) * 180) / Math.PI + 90;
        lit.style.setProperty("--lens-angle", `${angle.toFixed(0)}deg`);
      }

      // --- magnetism: the candidate list is cheap to refresh, but not every
      // frame — the DOM does not change that fast
      const now = performance.now();
      if (now - magnetsAt > 500) {
        magnets = Array.from(document.querySelectorAll<HTMLElement>("[data-magnetic]"));
        magnetsAt = now;
      }
      for (const el of magnets) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const reach = Math.max(r.width, r.height) / 2 + MAGNET_RANGE;
        if (dist > reach) {
          if (el.style.getPropertyValue("--mag-x") !== "0px") {
            el.style.setProperty("--mag-x", "0px");
            el.style.setProperty("--mag-y", "0px");
          }
          continue;
        }
        // falls off toward the edge of range, so nothing snaps
        const pull = (1 - dist / reach) * MAGNET_MAX;
        el.style.setProperty("--mag-x", `${((dx / (dist || 1)) * pull).toFixed(2)}px`);
        el.style.setProperty("--mag-y", `${((dy / (dist || 1)) * pull).toFixed(2)}px`);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      if (!queued) {
        queued = true;
        requestAnimationFrame(frame);
      }
    };

    // a cached rect is wrong the moment anything moves under the pointer
    const invalidate = () => {
      rect = lit ? lit.getBoundingClientRect() : null;
      magnetsAt = 0;
    };
    const onLeave = () => {
      clearLit();
      for (const el of magnets) {
        el.style.setProperty("--mag-x", "0px");
        el.style.setProperty("--mag-y", "0px");
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", invalidate, { passive: true, capture: true });
    window.addEventListener("resize", invalidate, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", invalidate, true);
      window.removeEventListener("resize", invalidate);
      document.removeEventListener("pointerleave", onLeave);
      onLeave();
    };
  }, [glass, cursorLight]);

  // The ambient half of the lighting: one fixed pane carrying a soft bloom at
  // the cursor. It is what makes surfaces *near* the pointer feel lit rather
  // than only the one directly under it — and it costs one composited layer,
  // not per-card work. Dropped entirely under reduced effects.
  if (!glass || reduced || !cursorLight) return null;
  return (
    <div
      aria-hidden
      className="cursor-light pointer-events-none fixed inset-0 z-0"
      // the element is inert; everything about it is driven by --cursor-*
    />
  );
}
