"use client";

import { useEffect } from "react";
import { useEmber } from "@/lib/store";

/**
 * Mirrors the saved theme onto <html data-theme>, which is what the CSS
 * variable overrides in globals.css key off. The inline script in layout.tsx
 * handles the very first paint; this keeps it in sync afterwards (including
 * when a change arrives from cloud sync on another device).
 */
export function ThemeApplier() {
  const theme = useEmber((s) => s.settings.theme ?? "sunset");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "sunset") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  return null;
}
