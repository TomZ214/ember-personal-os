"use client";

import { useEffect } from "react";
import { useEmber } from "@/lib/store";

/**
 * Mirrors the saved appearance onto <html>, which is what every CSS override in
 * globals.css keys off:
 *
 *   data-theme  sunset (absent) | tide | crimson | orchid | moss | dusk
 *   data-style  glass | neo | clay — the surface material
 *   data-glass  on | off        — the Liquid Glass material system; off
 *                                 whenever the style is not glass
 *   data-fx     full | reduced  — the performance ceiling for effects
 *
 * The inline script in layout.tsx sets all three before first paint so the app
 * never flashes the wrong material; this keeps them in sync afterwards,
 * including when a change arrives from cloud sync on another device.
 */
export function ThemeApplier() {
  const appearance = useEmber((s) => s.settings.appearance ?? "dark");
  const theme = useEmber((s) => s.settings.theme ?? "sunset");
  // both default ON — the glass look is the product, not an opt-in
  const style = useEmber((s) => s.settings.surfaceStyle ?? "glass");
  // glass effects only exist in the glass style: neumorphism and claymorphism
  // build on the solid surfaces, and every glass rule is gated on this
  const glass = useEmber((s) => (s.settings.liquidGlass ?? true) && (s.settings.surfaceStyle ?? "glass") === "glass");
  const reduced = useEmber((s) => s.settings.reducedEffects ?? false);
  const language = useEmber((s) => s.settings.language ?? "en");

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "sunset") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.glass = glass ? "on" : "off";
  }, [glass]);

  useEffect(() => {
    document.documentElement.dataset.style = style;
  }, [style]);

  useEffect(() => {
    document.documentElement.dataset.fx = reduced ? "reduced" : "full";
  }, [reduced]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.appearance = appearance === "system" ? (media.matches ? "dark" : "light") : appearance; };
    apply(); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance]);
  return null;
}
