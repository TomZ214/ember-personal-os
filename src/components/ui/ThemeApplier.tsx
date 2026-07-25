"use client";

import { useEffect } from "react";
import { useEmber } from "@/lib/store";

/**
 * Mirrors the saved appearance onto <html>, which is what every override in
 * globals.css keys off:
 *
 *   data-accent      sunset (absent) | tide | crimson | orchid   — hue only
 *   data-appearance  ember | tahoe | minimal | midnight | vision — material only
 *   data-glass       on | off
 *   data-fx          full | reduced
 *
 * plus four scalar dials written as CSS variables:
 *   --blur-scale --tint-scale   the strength sliders
 *   data-lighting / data-reflect  the on/off switches for the expensive parts
 *
 * The two axes are deliberately separate attributes rather than one combined
 * class: that is what lets a new accent work in every appearance without
 * touching either one.
 *
 * The inline script in layout.tsx sets these before first paint so the app
 * never flashes the wrong material; this keeps them in sync afterwards,
 * including when a change arrives from cloud sync on another device.
 */
export function ThemeApplier() {
  const accent = useEmber((s) => s.settings.theme ?? "sunset");
  const appearance = useEmber((s) => s.settings.appearance ?? "ember");
  const glass = useEmber((s) => s.settings.liquidGlass ?? true);
  const reduced = useEmber((s) => s.settings.reducedEffects ?? false);
  const lighting = useEmber((s) => s.settings.cursorLighting ?? true);
  const reflect = useEmber((s) => s.settings.glassReflections ?? true);
  const blurScale = useEmber((s) => s.settings.blurStrength ?? 1);
  const tintScale = useEmber((s) => s.settings.transparencyStrength ?? 1);

  useEffect(() => {
    const root = document.documentElement;
    // sunset is the :root default, so it is expressed as the absence of the
    // attribute rather than as a value — one less selector to match per paint
    if (accent === "sunset") delete root.dataset.accent;
    else root.dataset.accent = accent;
  }, [accent]);

  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
  }, [appearance]);

  useEffect(() => {
    document.documentElement.dataset.glass = glass ? "on" : "off";
  }, [glass]);

  useEffect(() => {
    document.documentElement.dataset.fx = reduced ? "reduced" : "full";
  }, [reduced]);

  useEffect(() => {
    document.documentElement.dataset.lighting = lighting ? "on" : "off";
  }, [lighting]);

  useEffect(() => {
    document.documentElement.dataset.reflect = reflect ? "on" : "off";
  }, [reflect]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--blur-scale", String(blurScale));
    root.style.setProperty("--tint-scale", String(tintScale));
  }, [blurScale, tintScale]);

  return null;
}
