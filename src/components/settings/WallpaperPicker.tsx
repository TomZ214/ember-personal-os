"use client";

import { motion } from "framer-motion";
import { Check, ImageOff } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { WALLPAPERS, type WallpaperId } from "@/lib/types";

/**
 * Settings → Wallpaper.
 *
 * Its own section rather than part of the theme picker, because it is its own
 * choice: any picture works with any accent, and neither constrains the other.
 *
 * Each tile is the real image, so what you pick is what you get. "None" shows
 * the ambient gradient it actually falls back to rather than an empty square.
 */
export function WallpaperPicker() {
  const current = useEmber((s) => s.settings.wallpaper ?? "none");
  const updateSettings = useEmber((s) => s.updateSettings);
  const t = useT();

  return (
    <section className="panel p-5">
      <h2 className="text-[15px] font-semibold">{t("wall.title")}</h2>
      <p className="mt-0.5 max-w-[56ch] text-[13px] text-muted">{t("wall.sub")}</p>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {WALLPAPERS.map((w) => {
          const on = w.id === current;
          return (
            <motion.button
              key={w.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => updateSettings({ wallpaper: w.id as WallpaperId })}
              aria-pressed={on}
              className={`group relative aspect-[16/10] overflow-hidden rounded-xl border transition-colors ${
                on ? "border-accent" : "border-white/[0.1] hover:border-white/[0.25]"
              }`}
            >
              {w.file ? (
                // a plain img rather than next/image: these are static files of
                // known size served from /public, so the optimiser has nothing
                // to add and would only put a loader in front of a thumbnail
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  // the 480px copy, not the wallpaper: five tiles pulling the
                  // full-size files would cost megabytes to draw thumbnails
                  src={w.thumb ?? w.file}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <span className="ambient absolute inset-0" style={{ position: "absolute" }} />
              )}

              {/* the same scrim the real background uses, so the tile predicts
                  how legible the interface will be on it */}
              <span
                aria-hidden
                className="absolute inset-0"
                style={{
                  background: w.dark
                    ? "linear-gradient(180deg, oklch(0 0 0 / 0.2), oklch(0 0 0 / 0.45))"
                    : "linear-gradient(180deg, oklch(0 0 0 / 0.4), oklch(0 0 0 / 0.6))",
                }}
              />

              <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 px-2.5 py-2 text-[12px] font-medium">
                <span className="truncate">{t(`wall.${w.id}`)}</span>
                {on && <Check size={13} className="shrink-0 text-accent" />}
              </span>

              {w.id === "none" && (
                <ImageOff
                  size={18}
                  className="absolute left-1/2 top-[42%] -translate-x-1/2 text-white/40"
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
