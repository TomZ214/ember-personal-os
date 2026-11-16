"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { stamp } from "@/lib/motion";
import { SURFACE_STYLES, type SurfaceStyle } from "@/lib/types";

/**
 * Settings → Style: the material every surface is made of.
 *
 * Each card shows a small scene built in that material, drawn with fixed
 * colours (only the accent follows the theme), so the three can be compared
 * side by side whichever one is active.
 */
export function StylePicker() {
  const style = useEmber((s) => s.settings.surfaceStyle ?? "glass");
  const updateSettings = useEmber((s) => s.updateSettings);
  const t = useT();

  return (
    <section className="panel p-5">
      <h2 className="text-[15px] font-semibold">{t("style.title")}</h2>
      <p className="mt-0.5 max-w-[56ch] text-[13px] text-muted">{t("style.sub")}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SURFACE_STYLES.map((id) => {
          const active = style === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => updateSettings({ surfaceStyle: id })}
              aria-pressed={active}
              className={`overflow-hidden rounded-2xl border p-0 text-left [--press-scale:0.98] ${
                active ? "border-accent/60 shadow-[0_0_0_1px_var(--accent)]" : "border-white/[0.08] hover:border-white/[0.2]"
              }`}
            >
              <Preview id={id} />
              <span className="flex items-start justify-between gap-2 px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{t(`style.${id}`)}</span>
                  <span className="block text-[11px] leading-snug text-muted">{t(`style.${id}Desc`)}</span>
                </span>
                {active && (
                  <motion.span
                    {...stamp}
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-bg-deep"
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

/** a pane, a control and a bar, made of the given material */
function Preview({ id }: { id: SurfaceStyle }) {
  if (id === "neo") {
    const raise = "5px 5px 11px oklch(0.62 0.04 260 / 0.45), -5px -5px 11px oklch(1 0 0 / 0.95)";
    const sink = "inset 3px 3px 6px oklch(0.62 0.04 260 / 0.45), inset -3px -3px 6px oklch(1 0 0 / 0.95)";
    return (
      <span aria-hidden className="relative block h-24" style={{ background: "oklch(0.925 0.014 255)" }}>
        <span className="absolute left-4 top-4 h-16 w-[46%] rounded-2xl" style={{ background: "oklch(0.925 0.014 255)", boxShadow: raise }}>
          <span className="absolute inset-x-3 top-3.5 h-1.5 rounded-full" style={{ boxShadow: sink }} />
          <span className="absolute left-3 top-3.5 h-1.5 w-[55%] rounded-full" style={{ background: "var(--primary)" }} />
          <span className="absolute bottom-3 left-3 h-4 w-9 rounded-full" style={{ boxShadow: sink }} />
        </span>
        <span className="absolute right-5 top-5 h-12 w-12 rounded-full" style={{ background: "oklch(0.925 0.014 255)", boxShadow: raise }}>
          <span className="absolute inset-3 rounded-full" style={{ boxShadow: sink }} />
        </span>
      </span>
    );
  }
  if (id === "clay") {
    const puff =
      "0 12px 18px -10px oklch(0.45 0.14 285 / 0.45), inset 3px 4px 8px -2px oklch(1 0 0 / 0.95), inset -5px -6px 10px -5px oklch(0.5 0.12 285 / 0.35)";
    return (
      <span
        aria-hidden
        className="relative block h-24"
        style={{ background: "radial-gradient(120% 120% at 0% 0%, oklch(0.94 0.03 300), oklch(0.86 0.06 285))" }}
      >
        <span className="absolute left-4 top-3.5 h-[68px] w-[48%] rounded-[22px]" style={{ background: "oklch(0.985 0.008 290)", boxShadow: puff }}>
          <span className="absolute left-3 top-3 h-6 w-6 rounded-[9px]" style={{ background: "var(--primary)", boxShadow: "inset 2px 3px 4px -1px oklch(1 0 0 / 0.55), inset -2px -3px 5px -2px oklch(0 0 0 / 0.25)" }} />
          <span className="absolute bottom-3 left-3 right-3 h-2 rounded-full" style={{ background: "oklch(0.9 0.03 290)" }} />
        </span>
        <span
          className="absolute right-4 top-6 h-11 w-[30%] rounded-full"
          style={{ background: "var(--grad-sunset)", boxShadow: "0 10px 16px -10px var(--primary-glow), inset 2px 4px 6px -2px oklch(1 0 0 / 0.55), inset -3px -4px 7px -3px oklch(0 0 0 / 0.25)" }}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="relative block h-24 overflow-hidden"
      style={{ background: "radial-gradient(90% 120% at 15% 110%, color-mix(in oklch, var(--primary) 55%, black), oklch(0.16 0.01 270) 70%)" }}
    >
      <span className="absolute -right-3 top-2 h-14 w-14 rounded-full" style={{ background: "var(--grad-sunset)", opacity: 0.8 }} />
      <span
        className="absolute left-4 top-4 h-16 w-[62%] rounded-2xl"
        style={{
          background: "linear-gradient(135deg, oklch(1 0 0 / 0.20), oklch(1 0 0 / 0.06))",
          border: "1px solid oklch(1 0 0 / 0.30)",
          boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.55), 0 10px 24px -10px oklch(0 0 0 / 0.6)",
          backdropFilter: "blur(10px)",
        }}
      >
        <span className="absolute left-3 top-3.5 h-1.5 w-[55%] rounded-full" style={{ background: "oklch(1 0 0 / 0.75)" }} />
        <span className="absolute bottom-3 left-3 h-1.5 w-[35%] rounded-full" style={{ background: "oklch(1 0 0 / 0.35)" }} />
      </span>
    </span>
  );
}
