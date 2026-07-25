"use client";

import { Gauge, Sparkles } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Switch } from "@/components/ui/Switch";

/**
 * Settings → Appearance → Effects.
 *
 * Two independent dials rather than one quality slider, because they answer
 * different questions: Liquid Glass is a matter of taste, Reduce visual
 * effects is a matter of hardware. Someone on a weak laptop may still want
 * the glass look, just cheaper.
 */
export function EffectsSettings() {
  const glass = useEmber((s) => s.settings.liquidGlass ?? true);
  const reduced = useEmber((s) => s.settings.reducedEffects ?? false);
  const updateSettings = useEmber((s) => s.updateSettings);
  const t = useT();

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Sparkles size={16} /> {t("fx.glassTitle")}
          </h2>
          <p className="mt-0.5 max-w-[52ch] text-[13px] text-muted">{t("fx.glassSub")}</p>
        </div>
        <Switch
          checked={glass}
          onChange={(v) => updateSettings({ liquidGlass: v })}
          label={t("fx.glassTitle")}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Gauge size={15} /> {t("fx.reduceTitle")}
          </h3>
          <p className="mt-0.5 max-w-[52ch] text-[13px] text-muted">{t("fx.reduceSub")}</p>
        </div>
        <Switch
          checked={reduced}
          onChange={(v) => updateSettings({ reducedEffects: v })}
          label={t("fx.reduceTitle")}
        />
      </div>

      <p className="mt-4 text-xs text-faint">{t("fx.note")}</p>
    </section>
  );
}
