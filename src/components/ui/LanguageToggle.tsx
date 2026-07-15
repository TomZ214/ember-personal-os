"use client";

import { motion } from "framer-motion";
import { useEmber } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import type { Language } from "@/lib/types";

const OPTIONS: { value: Language; label: string; flag: string }[] = [
  { value: "en", label: "English", flag: "🇬🇧" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
];

/** segmented English / German switch */
export function LanguageToggle() {
  const lang = useLang();
  const updateSettings = useEmber((s) => s.updateSettings);

  return (
    <div className="inline-flex rounded-[12px] border border-white/[0.08] bg-white/[0.04] p-1">
      {OPTIONS.map((o) => {
        const active = lang === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => updateSettings({ language: o.value })}
            aria-pressed={active}
            className={`relative flex items-center gap-2 rounded-[9px] px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              active ? "text-ink" : "text-faint hover:text-muted"
            }`}
          >
            {active && (
              <motion.span
                layoutId="lang-active"
                className="absolute inset-0 rounded-[9px] bg-white/[0.10]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.flag}</span>
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
