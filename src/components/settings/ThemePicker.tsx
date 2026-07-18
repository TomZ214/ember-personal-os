"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { THEMES, type Theme } from "@/lib/types";

/**
 * Settings → Appearance. Each card previews the real gradient it applies, so
 * the choice is made by looking rather than reading.
 */
export function ThemePicker() {
  const theme = useEmber((s) => s.settings.theme ?? "sunset");
  const updateSettings = useEmber((s) => s.updateSettings);
  const t = useT();

  const pick = (id: Theme) => updateSettings({ theme: id });

  return (
    <section className="panel p-5">
      <h2 className="text-[15px] font-semibold">{t("theme.title")}</h2>
      <p className="mt-0.5 text-[13px] text-muted">{t("theme.sub")}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {THEMES.map((th) => {
          const active = theme === th.id;
          return (
            <button
              key={th.id}
              onClick={() => pick(th.id)}
              aria-pressed={active}
              aria-label={t(`theme.${th.id}`)}
              className={`group relative overflow-hidden rounded-2xl border p-0 text-left transition-all duration-200 ${
                active
                  ? "border-accent/60 shadow-[0_0_0_1px_var(--accent)]"
                  : "border-white/[0.08] hover:border-white/[0.2]"
              }`}
            >
              {/* the actual ramp this theme installs */}
              <span
                aria-hidden
                className="block h-20 w-full transition-transform duration-300 group-hover:scale-[1.04]"
                style={{ background: `linear-gradient(160deg, ${th.from}, ${th.to})` }}
              />
              <span className="flex items-center justify-between gap-2 bg-white/[0.03] px-3 py-2">
                <span className="truncate text-[13px] font-medium">{t(`theme.${th.id}`)}</span>
                {active && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 22 }}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-bg-deep"
                  >
                    <Check size={11} strokeWidth={3} />
                  </motion.span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
