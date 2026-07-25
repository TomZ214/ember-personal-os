"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { APPEARANCES, THEMES, type Appearance, type Theme } from "@/lib/types";

/**
 * Settings → Appearance.
 *
 * Two independent choices, in the order they matter: the material first, then
 * the colour. They are separate lists rather than one grid of combinations
 * because they are genuinely orthogonal — five appearances times four accents
 * would be twenty tiles describing a choice that is really 5 + 4.
 *
 * Each appearance tile previews itself using the same CSS variables the real
 * surfaces use, so the preview cannot drift from the thing it previews.
 */
export function AppearancePicker() {
  const appearance = useEmber((s) => s.settings.appearance ?? "ember");
  const accent = useEmber((s) => s.settings.theme ?? "sunset");
  const updateSettings = useEmber((s) => s.updateSettings);
  const t = useT();

  return (
    <section className="panel p-5">
      <h2 className="text-[15px] font-semibold">{t("appear.title")}</h2>
      <p className="mt-0.5 text-[13px] text-muted">{t("appear.sub")}</p>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {APPEARANCES.map((a) => {
          const on = a.id === appearance;
          return (
            <motion.button
              key={a.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => updateSettings({ appearance: a.id as Appearance })}
              aria-pressed={on}
              className={`relative flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors ${
                on
                  ? "border-accent/60 bg-white/[0.07]"
                  : "border-white/[0.08] hover:border-white/[0.18] hover:bg-white/[0.04]"
              }`}
            >
              {/* the tile is a miniature of the material: same blur, radius and
                  tint numbers the appearance actually uses */}
              <span
                aria-hidden
                className="relative h-12 w-full overflow-hidden rounded-lg"
                style={{ background: "var(--grad-sunset)" }}
              >
                <span
                  className="absolute inset-x-2 inset-y-1.5 border border-white/20"
                  style={{
                    borderRadius: a.radius / 2,
                    backdropFilter: `blur(${a.blur / 3}px)`,
                    background: `oklch(1 0 0 / ${a.tint * 3})`,
                  }}
                />
              </span>
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                {t(`appear.${a.id}`)}
                {on && <Check size={13} className="text-accent" />}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <h3 className="text-[14px] font-medium">{t("appear.accent")}</h3>
        <p className="mt-0.5 text-[13px] text-muted">{t("appear.accentSub")}</p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {THEMES.map((c) => {
            const on = c.id === accent;
            return (
              <motion.button
                key={c.id}
                whileTap={{ scale: 0.94 }}
                onClick={() => updateSettings({ theme: c.id as Theme })}
                aria-pressed={on}
                aria-label={t(`theme.${c.id}`)}
                className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-[13px] transition-colors ${
                  on
                    ? "border-accent/60 bg-white/[0.07] text-ink"
                    : "border-white/[0.08] text-muted hover:border-white/[0.18] hover:text-ink"
                }`}
              >
                <span
                  aria-hidden
                  className="h-5 w-5 shrink-0 rounded-full"
                  style={{ background: `linear-gradient(160deg, ${c.from}, ${c.to})` }}
                />
                {t(`theme.${c.id}`)}
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
