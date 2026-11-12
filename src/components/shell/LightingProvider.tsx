"use client";

import { useEffect, useRef } from "react";
import { useEmber } from "@/lib/store";
import { distanceToBox, followFactor, innermostAt, lightPosition, litStrength } from "@/lib/lighting";

/**
 * The virtual light source.
 *
 * One pointermove listener for the whole app, coalesced into one rAF frame,
 * writing CSS variables and nothing else — no React state, so no component in
 * EmberOS re-renders when the pointer moves. Everything downstream is CSS:
 *
 *   the ambient light,  --cursor-x / --cursor-y   viewport px
 *   parallax layers     --cursor-visible          (light only)
 *   each lit surface    --mx / --my               % within that surface
 *                       --lit                     0..1, how strongly its rim
 *                                                 catches the light
 *                       --lens-angle              the lens ring rotates to
 *                                                 face the light
 *                       [data-lit="in"|"near"]    promotes its light layers
 *   the one under the   --gx / --gy / --glow      the glow inside the pane
 *   pointer
 *
 * The cursor position is written on the few elements that use it, never on
 * <html>: a custom property changing on the root invalidates the style of
 * every element in the document, every frame. The per-surface variables are
 * registered as non-inheriting (globals.css) for the same reason.
 *
 * The light does not jump to the pointer, it flows after it: it closes on
 * the pointer exponentially (the same on a 60 Hz and a 120 Hz screen), which
 * is what makes the highlight feel like it is moving through something. The
 * loop only runs while the light is still catching up.
 *
 * Every surface within reach is lit, not only the one under the pointer:
 * --lit falls off with distance, and --mx/--my run past 0-100% for a pointer
 * outside the pane, so a neighbour's rim glows on the side facing the light.
 * Only the rim: the glow inside a pane belongs to the one the pointer is on,
 * so a neighbour repaints one small-content layer per frame, not two.
 * Rects are cached (refreshed twice a second and on scroll/resize), so a
 * frame is arithmetic plus a few variable writes on the panes in reach. If
 * the device cannot keep its frame rate that way, neighbours are dropped and
 * only the pane under the pointer stays lit.
 *
 * A press — mouse, finger or pen — flares the specular where it lands
 * ([data-glass-press], see globals.css). On touch screens that is the whole
 * effect: the pane lights under the finger and fades on release. A touch only
 * counts once it is clearly not the start of a scroll (held for a moment, or
 * lifted again as a tap), so scrolling never sets panes flashing.
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
/** px beyond a pane's edge at which the pointer still lights its rim */
const LIGHT_REACH = 140;
/** how quickly the light closes on the pointer: time constant in ms */
const FOLLOW_MS = 55;
/** Lighting neighbours repaints several panes a frame. A device that cannot
 *  hold this average frame time (ms) for SLOW_WINDOWS windows of
 *  WINDOW_FRAMES frames in a row only lights the pane under the pointer. A
 *  single hitch (a route change, a GC pause) never trips it. */
const SLOW_FRAME_MS = 24;
const WINDOW_FRAMES = 30;
const SLOW_WINDOWS = 2;
/** a finger resting this long (ms) without scrolling is a press, not a scroll */
const TOUCH_HOLD_MS = 110;
/** how long a quick tap leaves its light on before it fades (ms) */
const TAP_GLOW_MS = 180;

export function LightingProvider() {
  const glass = useEmber((s) => s.settings.liquidGlass ?? true);
  const reduced = useEmber((s) => s.settings.reducedEffects ?? false);
  const pane = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!glass || reduced) return;
    // prefers-reduced-motion users have asked for exactly this kind of thing
    // to stop moving
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lightPane = pane.current;
    // where the pointer is, and where the light has got to
    let tx = 0, ty = 0, x = 0, y = 0;
    let started = false;
    let frameId = 0;
    let running = false;
    let lastFrame = 0;
    // adaptive quality: frame time while the light is moving, in windows
    let windowSum = 0;
    let windowFrames = 0;
    let slowWindows = 0;
    let reach = LIGHT_REACH;
    let paneVisible = false;
    let surfaces: { el: HTMLElement; r: DOMRect }[] = [];
    let surfacesAt = 0;
    const lit = new Set<HTMLElement>();
    let magnets: HTMLElement[] = [];
    let parallax: HTMLElement[] = [];
    let magnetsAt = 0;

    const unlight = (el: HTMLElement) => {
      el.style.setProperty("--lit", "0");
      el.style.setProperty("--glow", "0");
      // back to the rest angle (light from above) so idle panes agree
      el.style.removeProperty("--lens-angle");
      el.removeAttribute("data-lit");
    };
    const clearLit = () => {
      lit.forEach(unlight);
      lit.clear();
    };

    const refreshSurfaces = (now: number) => {
      // with a dialog open, only the dialog is lit: nothing under the scrim
      const scope: ParentNode = document.querySelector('[aria-modal="true"]') ?? document;
      surfaces = [];
      const vh = window.innerHeight;
      scope.querySelectorAll<HTMLElement>(SURFACES).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.bottom > -LIGHT_REACH && r.top < vh + LIGHT_REACH) surfaces.push({ el, r });
      });
      if (scope !== document && (scope as HTMLElement).matches?.(SURFACES)) {
        surfaces.push({ el: scope as HTMLElement, r: (scope as HTMLElement).getBoundingClientRect() });
      }
      surfacesAt = now;
    };

    const light = (el: HTMLElement, r: DOMRect, px: number, py: number, strength: number) => {
      const { mx, my, angle } = lightPosition(px, py, r);
      const posX = `${mx.toFixed(1)}%`;
      const posY = `${my.toFixed(1)}%`;
      el.style.setProperty("--mx", posX);
      el.style.setProperty("--my", posY);
      el.style.setProperty("--lit", strength.toFixed(3));
      // the glow follows only inside the pane; a neighbour keeps the rim alone
      // (and the glow of a pane the pointer has just left fades where it was)
      const state = strength >= 1 ? "in" : "near";
      if (state === "in") {
        el.style.setProperty("--gx", posX);
        el.style.setProperty("--gy", posY);
      }
      if (el.getAttribute("data-lit") !== state) {
        el.setAttribute("data-lit", state);
        el.style.setProperty("--glow", state === "in" ? "1" : "0");
      }
      // the lens ring turns to face the light, so the bright edge is always
      // the one the light is actually on
      el.style.setProperty("--lens-angle", `${angle.toFixed(0)}deg`);
    };

    const frame = (time: number) => {
      // dt is 0 on the first frame of a run, so a pause never counts as lag
      const dt = lastFrame ? Math.min(time - lastFrame, 100) : 0;
      lastFrame = time;
      if (dt > 0 && reach > 0) {
        windowSum += Math.min(dt, 50);
        if (++windowFrames === WINDOW_FRAMES) {
          slowWindows = windowSum / windowFrames > SLOW_FRAME_MS ? slowWindows + 1 : 0;
          windowSum = 0;
          windowFrames = 0;
          if (slowWindows >= SLOW_WINDOWS) reach = 0;
        }
      }
      const dx = tx - x;
      const dy = ty - y;
      const settled = Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4;
      if (settled) {
        x = tx;
        y = ty;
      } else {
        const k = followFactor(dt || 16, FOLLOW_MS);
        x += dx * k;
        y += dy * k;
      }
      const now = performance.now();
      if (now - magnetsAt > 500) {
        magnets = Array.from(document.querySelectorAll<HTMLElement>("[data-magnetic]"));
        parallax = Array.from(document.querySelectorAll<HTMLElement>(".parallax-bg, .parallax-mid"));
        magnetsAt = now;
      }
      const cx = `${x.toFixed(1)}px`;
      const cy = `${y.toFixed(1)}px`;
      if (lightPane) {
        if (!paneVisible) {
          paneVisible = true;
          lightPane.style.setProperty("--cursor-visible", "1");
        }
        lightPane.style.setProperty("--cursor-x", cx);
        lightPane.style.setProperty("--cursor-y", cy);
      }
      for (const el of parallax) {
        el.style.setProperty("--cursor-x", cx);
        el.style.setProperty("--cursor-y", cy);
      }

      // --- specular: every surface in reach, strongest under the pointer
      if (now - surfacesAt > 500) refreshSurfaces(now);
      const seen = new Set<HTMLElement>();
      for (const { el, r } of surfaces) {
        const strength = litStrength(distanceToBox(x, y, r), reach);
        if (strength <= 0) continue;
        light(el, r, x, y, strength);
        seen.add(el);
      }
      lit.forEach((el) => {
        if (!seen.has(el)) {
          unlight(el);
          lit.delete(el);
        }
      });
      seen.forEach((el) => lit.add(el));

      // --- magnetism (the candidate list is refreshed above, twice a second:
      // the DOM does not change faster than that)
      for (const el of magnets) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        const mdx = tx - (r.left + r.width / 2);
        const mdy = ty - (r.top + r.height / 2);
        const dist = Math.hypot(mdx, mdy);
        const pullRange = Math.max(r.width, r.height) / 2 + MAGNET_RANGE;
        if (dist > pullRange) {
          if (el.style.getPropertyValue("--mag-x") !== "0px") {
            el.style.setProperty("--mag-x", "0px");
            el.style.setProperty("--mag-y", "0px");
          }
          continue;
        }
        // falls off toward the edge of range, so nothing snaps
        const pull = (1 - dist / pullRange) * MAGNET_MAX;
        el.style.setProperty("--mag-x", `${((mdx / (dist || 1)) * pull).toFixed(2)}px`);
        el.style.setProperty("--mag-y", `${((mdy / (dist || 1)) * pull).toFixed(2)}px`);
      }

      if (settled) {
        running = false;
        lastFrame = 0;
      } else frameId = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (running) return;
      running = true;
      frameId = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      if (!started) {
        // the first time, the light is simply there — not flown in from 0,0
        started = true;
        x = tx;
        y = ty;
      }
      wake();
    };

    // cached rects are wrong the moment anything moves under the pointer
    const invalidate = () => {
      surfacesAt = 0;
      magnetsAt = 0;
      if (started && lit.size) wake();
    };
    const onLeave = () => {
      cancelAnimationFrame(frameId);
      running = false;
      lastFrame = 0;
      started = false;
      paneVisible = false;
      lightPane?.style.setProperty("--cursor-visible", "0");
      clearLit();
      for (const el of magnets) {
        el.style.setProperty("--mag-x", "0px");
        el.style.setProperty("--mag-y", "0px");
      }
    };

    // --- press: the pane flares where it is touched
    let touched: HTMLElement | null = null;
    let touch: { id: number; x: number; y: number } | null = null;
    let holdTimer = 0;
    let glowTimer = 0;
    const pressTimers = new Map<HTMLElement, number>();
    const flare = (el: HTMLElement) => {
      window.clearTimeout(pressTimers.get(el));
      el.removeAttribute("data-glass-press");
      // restart the animation if the same pane is pressed again
      void el.offsetWidth;
      el.setAttribute("data-glass-press", "");
      pressTimers.set(el, window.setTimeout(() => {
        el.removeAttribute("data-glass-press");
        pressTimers.delete(el);
      }, 560));
    };
    // By geometry, not by DOM ancestry: the dock's glass bar is a sibling of
    // its icons, not their parent. The smallest pane under the point is the
    // one that was pressed.
    const paneAt = (px: number, py: number) => {
      const now = performance.now();
      if (now - surfacesAt > 500) refreshSurfaces(now);
      const i = innermostAt(px, py, surfaces.map((s) => s.r));
      return i < 0 ? null : surfaces[i];
    };
    const releaseTouch = () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(glowTimer);
      touch = null;
      if (touched) unlight(touched);
      touched = null;
    };
    // light the pane under a finger; there is no hover on a touch screen
    const touchLight = (px: number, py: number) => {
      const hit = paneAt(px, py);
      if (!hit) return;
      if (touched && touched !== hit.el) unlight(touched);
      touched = hit.el;
      light(hit.el, hit.r, px, py, 1);
      flare(hit.el);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        const hit = paneAt(e.clientX, e.clientY);
        if (hit) flare(hit.el);
        return;
      }
      // wait: this may be the first instant of a scroll, which cancels the pointer
      releaseTouch();
      const { pointerId: id, clientX: px, clientY: py } = e;
      touch = { id, x: px, y: py };
      holdTimer = window.setTimeout(() => {
        if (touch?.id === id) touchLight(px, py);
      }, TOUCH_HOLD_MS);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || touch?.id !== e.pointerId) return;
      const { x: px, y: py } = touch;
      const quickTap = !touched;
      window.clearTimeout(holdTimer);
      touch = null;
      // a tap shorter than the hold delay still gets its glint, briefly
      if (quickTap) touchLight(px, py);
      window.clearTimeout(glowTimer);
      glowTimer = window.setTimeout(releaseTouch, quickTap ? TAP_GLOW_MS : 0);
    };
    // the browser took the touch over (a scroll, a system gesture): no light
    const onCancel = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") releaseTouch();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onCancel, { passive: true });
    window.addEventListener("scroll", invalidate, { passive: true, capture: true });
    window.addEventListener("resize", invalidate, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("scroll", invalidate, true);
      window.removeEventListener("resize", invalidate);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      onLeave();
      releaseTouch();
      pressTimers.forEach((t, el) => {
        window.clearTimeout(t);
        el.removeAttribute("data-glass-press");
      });
    };
  }, [glass, reduced]);

  // The ambient half of the lighting: one fixed pane carrying a soft bloom at
  // the cursor. It is what makes surfaces *near* the pointer feel lit rather
  // than only the one directly under it — and it costs one composited layer,
  // not per-card work. Dropped entirely under reduced effects.
  if (!glass || reduced) return null;
  return (
    <div
      ref={pane}
      aria-hidden
      className="cursor-light pointer-events-none fixed left-0 top-0 z-0"
      // the element is inert; everything about it is driven by --cursor-*
    />
  );
}
