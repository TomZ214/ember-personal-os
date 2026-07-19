"use client";

import { useEffect } from "react";
import { useEmber } from "@/lib/store";

/**
 * Mirrors the saved appearance onto <html>, which is what every CSS override in
 * globals.css keys off:
 *
 *   data-theme  sunset (absent) | tide | crimson | orchid
 *   data-glass  on | off        — the Liquid Glass material system
 *   data-fx     full | reduced  — the performance ceiling for effects
 *
 * The inline script in layout.tsx sets all three before first paint so the app
 * never flashes the wrong material; this keeps them in sync afterwards,
 * including when a change arrives from cloud sync on another device.
 */
export function ThemeApplier() {
  const theme = useEmber((s) => s.settings.theme ?? "sunset");
  // both default ON — the glass look is the product, not an opt-in
  const glass = useEmber((s) => s.settings.liquidGlass ?? true);
  const reduced = useEmber((s) => s.settings.reducedEffects ?? false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "sunset") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.glass = glass ? "on" : "off";
  }, [glass]);

  useEffect(() => {
    document.documentElement.dataset.fx = reduced ? "reduced" : "full";
  }, [reduced]);

  return null;
}
