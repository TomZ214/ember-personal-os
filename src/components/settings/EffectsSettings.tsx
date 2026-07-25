"use client";

import { Gauge, Sparkles } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useT } from "@/lib/i18n";

/**
 * Settings → Appearance → Advanced.
 *
 * Deliberately individual switches rather than one quality slider, because
 * they answer different questions. Liquid Glass is taste. Performance mode is
 * hardware. Reflections are a distraction threshold. Someone on a weak laptop
 * may still want the glass look, just cheaper — one combined dial cannot
 * express that.
 */

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-[13px]">{label}</span>
        {hint && <span className="mt-0.5 block max-w-[46ch] text-xs text-faint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
    </label>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 py-2.5">
      <span className="min-w-0 flex-1 text-[13px]">{label}</span>
      <input
        type="range"
        min={0}
        max={150}
        step={10}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={label}
        className="h-1.5 w-32 shrink-0 cursor-pointer appearance-none rounded-full bg-white/[0.12] accent-[var(--accent)]"
      />
      <span className="num w-10 shrink-0 text-right text-xs text-faint">
        {Math.round(value * 100)}%
      </span>
    </label>
  );
}

export function EffectsSettings() {
  const s = useEmber((x) => x.settings);
  const set = useEmber((x) => x.updateSettings);
  const t = useT();

  const glass = s.liquidGlass ?? true;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Sparkles size={16} /> {t("fx.glassTitle")}
          </h2>
          <p className="mt-0.5 max-w-[52ch] text-[13px] text-muted">{t("fx.glassSub")}</p>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-[13px] text-muted">{glass ? t("fx.on") : t("fx.off")}</span>
          <input
            type="checkbox"
            checked={glass}
            onChange={(e) => set({ liquidGlass: e.target.checked })}
            className="h-4 w-4 accent-[var(--accent)]"
            aria-label={t("fx.glassTitle")}
          />
        </label>
      </div>

      {/* The advanced dials only exist while there is glass to tune. Showing
          them disabled would be noise; hiding them makes the switch above read
          as the master control it actually is. */}
      {glass && (
        <div className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.06] pt-1">
          <Toggle
            label={t("fx.lighting")}
            hint={t("fx.lightingHint")}
            value={s.cursorLighting ?? true}
            onChange={(v) => set({ cursorLighting: v })}
          />
          <Toggle
            label={t("fx.reflections")}
            hint={t("fx.reflectionsHint")}
            value={s.glassReflections ?? true}
            onChange={(v) => set({ glassReflections: v })}
          />
          <Toggle
            label={t("fx.particles")}
            hint={t("fx.particlesHint")}
            value={s.ambientParticles ?? true}
            onChange={(v) => set({ ambientParticles: v })}
          />
          <Slider
            label={t("fx.blurStrength")}
            value={s.blurStrength ?? 1}
            onChange={(v) => set({ blurStrength: v })}
          />
          <Slider
            label={t("fx.transparency")}
            value={s.transparencyStrength ?? 1}
            onChange={(v) => set({ transparencyStrength: v })}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[14px] font-medium">
            <Gauge size={15} /> {t("fx.reduceTitle")}
          </h3>
          <p className="mt-0.5 max-w-[52ch] text-[13px] text-muted">{t("fx.reduceSub")}</p>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-[13px] text-muted">
            {s.reducedEffects ? t("fx.on") : t("fx.off")}
          </span>
          <input
            type="checkbox"
            checked={s.reducedEffects ?? false}
            onChange={(e) => set({ reducedEffects: e.target.checked })}
            className="h-4 w-4 accent-[var(--accent)]"
            aria-label={t("fx.reduceTitle")}
          />
        </label>
      </div>

      <p className="mt-4 text-xs text-faint">{t("fx.note")}</p>
    </section>
  );
}
