"use client";

import { useEffect } from "react";
import { useEmber } from "@/lib/store";

/**
 * Cards that tilt in 3D, in the solid surface styles (neumorphism,
 * claymorphism).
 *
 * With a mouse or trackpad, the card under the pointer turns toward it and
 * rises a little; pressing pushes it down under the pointer. On a touch
 * screen, where nothing hovers, a card held for a moment sinks under the
 * finger — the side that is pressed goes in — and springs back on release.
 *
 * What tilts: interactive cards (.panel-hover) and anything marked
 * [data-tilt]. Never reading panes: a 3D-transformed layer renders its text
 * slightly soft, which is fine for a moment on a card and not for a page of
 * text.
 *
 * Like LightingProvider: one listener for the app, one rAF write per frame,
 * CSS variables only, no React state. The variables are registered as
 * non-inheriting (globals.css, "Depth"), so a write restyles the card and
 * not its contents, and the transform composites on the GPU — these styles
 * have no backdrop blur to redo.
 */

const TILTABLE = ".panel-hover, [data-tilt]";
/** a finger resting this long (ms) without scrolling is a press, not a scroll */
const TOUCH_HOLD_MS = 80;

/** how far a card may turn: small cards more, wide ones barely */
const maxTilt = (r: DOMRect) => Math.min(7, Math.max(1.5, 1800 / Math.max(r.width, r.height)));

export function DepthProvider() {
  const style = useEmber((s) => s.settings.surfaceStyle ?? "glass");
  const reduced = useEmber((s) => s.settings.reducedEffects ?? false);

  useEffect(() => {
    if (style === "glass" || reduced) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let card: HTMLElement | null = null;
    let rect: DOMRect | null = null;
    let px = 0, py = 0;
    let pressed = false;
    let frame = 0;
    let holdTimer = 0;
    let touchId: number | null = null;

    const write = () => {
      frame = 0;
      if (!card || !rect) return;
      // -1..1 across the card, from its centre
      const x = Math.max(-1, Math.min(1, ((px - rect.left) / rect.width) * 2 - 1));
      const y = Math.max(-1, Math.min(1, ((py - rect.top) / rect.height) * 2 - 1));
      card.style.setProperty("--tilt-x", x.toFixed(3));
      card.style.setProperty("--tilt-y", y.toFixed(3));
      // hovering: the card turns toward the pointer and rises;
      // pressed: the side under the pointer goes in and the card sinks
      card.style.setProperty("--tilt-sign", pressed ? "-1" : "1");
      card.style.setProperty("--tilt-z", pressed ? "-6px" : "6px");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(write);
    };

    const release = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (card) {
        card.removeAttribute("data-tilting");
        for (const v of ["--tilt-x", "--tilt-y", "--tilt-sign", "--tilt-z", "--tilt-max"]) card.style.removeProperty(v);
      }
      card = null;
      rect = null;
      pressed = false;
    };
    const take = (el: HTMLElement, x: number, y: number) => {
      if (el !== card) {
        release();
        card = el;
        rect = el.getBoundingClientRect();
        el.style.setProperty("--tilt-max", `${maxTilt(rect).toFixed(2)}deg`);
        el.setAttribute("data-tilting", "");
      }
      px = x;
      py = y;
      schedule();
    };
    const cardAt = (target: EventTarget | null) =>
      target instanceof Element ? (target.closest(TILTABLE) as HTMLElement | null) : null;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = cardAt(e.target);
      if (!el) {
        if (card) release();
        return;
      }
      take(el, e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      const el = cardAt(e.target);
      if (!el) return;
      if (e.pointerType !== "touch") {
        take(el, e.clientX, e.clientY);
        pressed = true;
        schedule();
        return;
      }
      // a touch may be the start of a scroll, which cancels the pointer
      window.clearTimeout(holdTimer);
      touchId = e.pointerId;
      const { clientX, clientY, pointerId } = e;
      holdTimer = window.setTimeout(() => {
        if (touchId !== pointerId) return;
        take(el, clientX, clientY);
        pressed = true;
        schedule();
      }, TOUCH_HOLD_MS);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        window.clearTimeout(holdTimer);
        touchId = null;
        release();
        return;
      }
      if (!card) return;
      pressed = false;
      schedule();
    };
    const onCancel = () => {
      window.clearTimeout(holdTimer);
      touchId = null;
      release();
    };
    // the card moved under the pointer: measure again on the next move
    const invalidate = () => {
      if (card) rect = card.getBoundingClientRect();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onCancel, { passive: true });
    // a dragged task card must not carry its tilt into the drag image
    window.addEventListener("dragstart", onCancel, { passive: true });
    window.addEventListener("scroll", invalidate, { passive: true, capture: true });
    window.addEventListener("resize", invalidate, { passive: true });
    document.addEventListener("pointerleave", onCancel);
    window.addEventListener("blur", onCancel);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("dragstart", onCancel);
      window.removeEventListener("scroll", invalidate, true);
      window.removeEventListener("resize", invalidate);
      document.removeEventListener("pointerleave", onCancel);
      window.removeEventListener("blur", onCancel);
      window.clearTimeout(holdTimer);
      release();
    };
  }, [style, reduced]);

  return null;
}
