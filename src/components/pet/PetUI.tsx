"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Heart, Smile, Utensils, Zap } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { stamp } from "@/lib/motion";
import { COATS, moodWord, petNeed, tickPet, type PetState } from "@/lib/pet";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ProgressBar } from "@/components/ui/misc";
import { Switch } from "@/components/ui/Switch";
import { Input } from "@/components/ui/inputs";
import { coatSwatch } from "./palettes";

/** the clock, ticking every `ms` — enough for values that change by the hour */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** the cat as it is right now: the stored record with the time since applied */
export function useLivePet(): PetState {
  const pet = useEmber((s) => s.pet);
  const now = useNow();
  return useMemo(() => tickPet(pet, Math.max(now, pet.updatedAt)), [pet, now]);
}

const STATS = [
  { key: "fullness", icon: Utensils, color: "var(--c-amber)" },
  { key: "mood", icon: Smile, color: "var(--c-sky)" },
  { key: "energy", icon: Zap, color: "var(--c-sage)" },
  { key: "affection", icon: Heart, color: "var(--c-rose)" },
] as const;

/** the four values as bars; `compact` for the widget */
export function PetStats({ pet, compact = false }: { pet: PetState; compact?: boolean }) {
  const t = useT();
  return (
    <ul className={compact ? "grid grid-cols-2 gap-x-4 gap-y-2" : "flex flex-col gap-3"}>
      {STATS.map(({ key, icon: Icon, color }) => {
        const v = Math.round(pet[key]);
        return (
          <li key={key}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
              <span className="flex min-w-0 items-center gap-1.5 text-muted">
                <Icon size={compact ? 12 : 13} style={{ color }} aria-hidden />
                <span className="truncate">{t(`pet.stat.${key}`)}</span>
              </span>
              {!compact && <AnimatedNumber value={v} className="num text-faint" />}
            </div>
            <ProgressBar value={v / 100} color={color} />
          </li>
        );
      })}
    </ul>
  );
}

/** one line on how the cat is, and the gentlest hint about what would help */
export function useMoodLine(pet: PetState) {
  const t = useT();
  const need = petNeed(pet);
  const mood = t(`pet.mood.${moodWord(pet)}`).replace("{name}", pet.name);
  return need ? `${mood} ${t(`pet.need.${need}`).replace("{name}", pet.name)}` : mood;
}

/** Settings for the cat: its name and its coat */
export function PetLooks() {
  const pet = useEmber((s) => s.pet);
  const updatePet = useEmber((s) => s.updatePet);
  const t = useT();

  return (
    <section className="panel p-5">
      <h2 className="text-[15px] font-semibold">{t("pet.looks")}</h2>
      <label className="mt-3 block">
        <span className="mb-1.5 block text-[12px] text-muted">{t("pet.name")}</span>
        {/* keyed by the saved name, so a name arriving from another device replaces the draft */}
        <NameField key={pet.name} saved={pet.name} onSave={(name) => updatePet({ name })} />
      </label>
      <p className="mb-1.5 mt-4 text-[12px] text-muted">{t("pet.coat")}</p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("pet.coat")}>
        {COATS.map((id) => {
          const active = pet.coat === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => updatePet({ coat: id })}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-[11px] [--press-scale:0.96] ${
                active ? "border-accent/60 text-ink shadow-[0_0_0_1px_var(--accent)]" : "border-white/[0.08] text-muted hover:border-white/[0.18]"
              }`}
            >
              <span className="relative h-8 w-8 rounded-full shadow-[inset_0_-3px_6px_rgba(0,0,0,0.18),0_2px_6px_-2px_rgba(0,0,0,0.4)]" style={{ background: coatSwatch(id) }}>
                {active && (
                  <motion.span {...stamp} className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-bg-deep">
                    <Check size={10} strokeWidth={3} />
                  </motion.span>
                )}
              </span>
              {t(`pet.coat.${id}`)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function NameField({ saved, onSave }: { saved: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(saved);
  return (
    <Input
      value={name}
      maxLength={24}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => name.trim() && name.trim() !== saved && onSave(name)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder="Mochi"
      enterKeyHint="done"
      autoComplete="off"
    />
  );
}

/** the cat's own sounds — off by default */
export function PetSoundSwitch({ bare = false }: { bare?: boolean }) {
  const on = useEmber((s) => s.settings.petSounds ?? false);
  const updateSettings = useEmber((s) => s.updateSettings);
  const t = useT();
  const row = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[14px] font-medium">{t("pet.sounds")}</p>
        <p className="mt-0.5 text-[12px] text-muted">{t("pet.soundsSub")}</p>
      </div>
      <Switch
        checked={on}
        onChange={(v) => {
          updateSettings({ petSounds: v });
          if (v) void import("./catSounds").then((m) => setTimeout(() => m.meow("hello"), 60));
        }}
        label={t("pet.sounds")}
      />
    </div>
  );
  return bare ? row : <section className="panel p-5">{row}</section>;
}
