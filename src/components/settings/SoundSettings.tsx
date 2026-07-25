"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { playCue } from "@/lib/sound";
import { Switch } from "@/components/ui/Switch";

/** Settings → Sound effects: on/off plus a master volume that previews itself. */
export function SoundSettings() {
  const sound = useEmber((s) => s.settings.sound ?? true);
  const volume = useEmber((s) => s.settings.soundVolume ?? 0.5);
  const updateSettings = useEmber((s) => s.updateSettings);
  const t = useT();

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />} {t("sound.title")}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">{t("sound.sub")}</p>
        </div>
        <Switch
          checked={sound}
          onChange={(v) => {
            updateSettings({ sound: v });
            // confirm the change with the thing being changed
            if (v) setTimeout(() => playCue("success"), 40);
          }}
          label={t("sound.title")}
        />
      </div>

      {sound && (
        <label className="mt-4 flex items-center gap-3 border-t border-white/[0.06] pt-4">
          <VolumeX size={14} className="shrink-0 text-faint" />
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(volume * 100)}
            onChange={(e) => updateSettings({ soundVolume: Number(e.target.value) / 100 })}
            // preview on release rather than on every step, so dragging
            // doesn't machine-gun the speaker
            onPointerUp={() => playCue("notify")}
            onKeyUp={() => playCue("notify")}
            className="ios w-full min-w-0 flex-1"
            aria-label={t("sound.volume")}
          />
          <Volume2 size={15} className="shrink-0 text-muted" />
          <span className="num w-9 shrink-0 text-right text-xs text-faint">
            {Math.round(volume * 100)}%
          </span>
        </label>
      )}
    </section>
  );
}
