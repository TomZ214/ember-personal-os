"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { RepeatEnd, RepeatFreq, RepeatRule } from "@/lib/types";
import { describeRepeat, type Lang } from "@/lib/recurrence";
import { Input, Label, Select } from "@/components/ui/inputs";

/**
 * Professional recurrence editor — the calendar-app scheduler. Emits a full
 * RepeatRule. Kept compact: the extra controls only appear when they matter.
 * Fully localized (en / de) so it works on the German family quick-add page.
 */

const FREQS: { value: RepeatFreq; en: string; de: string }[] = [
  { value: "none", en: "Does not repeat", de: "Wiederholt sich nicht" },
  { value: "hourly", en: "Hourly", de: "Stündlich" },
  { value: "daily", en: "Daily", de: "Täglich" },
  { value: "weekly", en: "Weekly", de: "Wöchentlich" },
  { value: "monthly", en: "Monthly", de: "Monatlich" },
  { value: "yearly", en: "Yearly", de: "Jährlich" },
  { value: "weekdays", en: "Every weekday (Mon–Fri)", de: "Jeden Wochentag (Mo–Fr)" },
  { value: "weekends", en: "Every weekend (Sat & Sun)", de: "Jedes Wochenende (Sa & So)" },
];

const UNIT: Record<Lang, Partial<Record<RepeatFreq, string>>> = {
  en: { hourly: "hours", daily: "days", weekly: "weeks", monthly: "months", yearly: "years" },
  de: { hourly: "Stunden", daily: "Tage", weekly: "Wochen", monthly: "Monate", yearly: "Jahre" },
};

const WD: Record<Lang, { d: number; l: string }[]> = {
  en: [{ d: 1, l: "M" }, { d: 2, l: "T" }, { d: 3, l: "W" }, { d: 4, l: "T" }, { d: 5, l: "F" }, { d: 6, l: "S" }, { d: 0, l: "S" }],
  de: [{ d: 1, l: "Mo" }, { d: 2, l: "Di" }, { d: 3, l: "Mi" }, { d: 4, l: "Do" }, { d: 5, l: "Fr" }, { d: 6, l: "Sa" }, { d: 0, l: "So" }],
};

const ORDINALS: Record<Lang, { v: number; l: string }[]> = {
  en: [{ v: 1, l: "first" }, { v: 2, l: "second" }, { v: 3, l: "third" }, { v: 4, l: "fourth" }, { v: -1, l: "last" }],
  de: [{ v: 1, l: "ersten" }, { v: 2, l: "zweiten" }, { v: 3, l: "dritten" }, { v: 4, l: "vierten" }, { v: -1, l: "letzten" }],
};

const WEEKDAY_NAMES: Record<Lang, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  de: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
};

const T: Record<Lang, Record<string, string>> = {
  en: { repeats: "Repeats", every: "Every", onDays: "On these days", on: "On", sameDay: "the same day of the month", the: "the", ends: "Ends", never: "Never", onDate: "On date", after: "After…", times: "times" },
  de: { repeats: "Wiederholen", every: "Alle", onDays: "An diesen Tagen", on: "Am", sameDay: "am gleichen Tag des Monats", the: "am", ends: "Endet", never: "Nie", onDate: "An Datum", after: "Nach…", times: "Mal" },
};

export function RepeatPicker({
  value, onChange, dueWeekday, lang = "en",
}: {
  value: RepeatRule;
  onChange: (r: RepeatRule) => void;
  /** weekday of the task's due date, to seed the weekly/monthly defaults */
  dueWeekday?: number;
  lang?: Lang;
}) {
  const set = (patch: Partial<RepeatRule>) => onChange({ ...value, ...patch });
  const showInterval = !!UNIT[lang][value.freq];
  const end: RepeatEnd = value.end ?? { kind: "forever" };
  const t = T[lang];

  return (
    <div className="flex flex-col gap-3">
      {/* only split into two columns when the interval field is actually shown,
          otherwise the frequency dropdown renders half-width with dead space */}
      <div className={showInterval ? "grid grid-cols-2 gap-3" : ""}>
        <label className="block">
          <Label>{t.repeats}</Label>
          <Select
            value={value.freq}
            onChange={(e) => {
              const freq = e.target.value as RepeatFreq;
              const patch: Partial<RepeatRule> = { freq };
              if (freq === "weekly" && (!value.weekdays || !value.weekdays.length))
                patch.weekdays = [dueWeekday ?? 1];
              if (freq === "monthly" && !value.monthly) patch.monthly = { mode: "day" };
              onChange({ ...value, ...patch });
            }}
          >
            {FREQS.map((f) => <option key={f.value} value={f.value}>{f[lang]}</option>)}
          </Select>
        </label>

        {showInterval && (
          <label>
            <Label>{t.every}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={999}
                value={value.interval}
                onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
                className="w-20 text-center"
                aria-label="Interval"
              />
              <span className="text-sm text-muted">{UNIT[lang][value.freq]}</span>
            </div>
          </label>
        )}
      </div>

      <AnimatePresence initial={false}>
        {value.freq === "weekly" && (
          <Reveal key="wk">
            <Label>{t.onDays}</Label>
            <div className="flex gap-1.5">
              {WD[lang].map(({ d, l }) => {
                const on = (value.weekdays ?? []).includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const cur = new Set(value.weekdays ?? []);
                      if (on) cur.delete(d); else cur.add(d);
                      set({ weekdays: [...cur].sort((a, b) => a - b) });
                    }}
                    className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-[13px] font-medium transition-colors ${
                      on ? "bg-accent/20 text-accent" : "bg-white/[0.05] text-muted hover:bg-white/[0.09]"
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </Reveal>
        )}

        {value.freq === "monthly" && (
          <Reveal key="mo">
            <Label>{t.on}</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="radio"
                  checked={(value.monthly?.mode ?? "day") === "day"}
                  onChange={() => set({ monthly: { mode: "day" } })}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {t.sameDay}
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={value.monthly?.mode === "weekday"}
                  onChange={() =>
                    set({ monthly: { mode: "weekday", nth: 1, weekday: dueWeekday ?? 1 } })
                  }
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {t.the}
                <Select
                  value={value.monthly?.mode === "weekday" ? String(value.monthly.nth) : "1"}
                  disabled={value.monthly?.mode !== "weekday"}
                  onChange={(e) =>
                    set({ monthly: { mode: "weekday", nth: Number(e.target.value), weekday: value.monthly?.mode === "weekday" ? value.monthly.weekday : dueWeekday ?? 1 } })
                  }
                  className="h-9 w-28"
                >
                  {ORDINALS[lang].map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </Select>
                <Select
                  value={value.monthly?.mode === "weekday" ? String(value.monthly.weekday) : "1"}
                  disabled={value.monthly?.mode !== "weekday"}
                  onChange={(e) =>
                    set({ monthly: { mode: "weekday", nth: value.monthly?.mode === "weekday" ? value.monthly.nth : 1, weekday: Number(e.target.value) } })
                  }
                  className="h-9 w-32"
                >
                  {WEEKDAY_NAMES[lang].map((n, i) => <option key={i} value={i}>{n}</option>)}
                </Select>
              </label>
            </div>
          </Reveal>
        )}

        {value.freq !== "none" && (
          <Reveal key="end">
            <Label>{t.ends}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={end.kind}
                onChange={(e) => {
                  const kind = e.target.value as RepeatEnd["kind"];
                  set({
                    end:
                      kind === "until" ? { kind: "until", date: "" } :
                      kind === "count" ? { kind: "count", count: 10 } :
                      { kind: "forever" },
                  });
                }}
                className="h-9 w-36"
              >
                <option value="forever">{t.never}</option>
                <option value="until">{t.onDate}</option>
                <option value="count">{t.after}</option>
              </Select>
              {end.kind === "until" && (
                <Input
                  type="date"
                  value={end.date}
                  onChange={(e) => set({ end: { kind: "until", date: e.target.value } })}
                  className="h-9 w-40"
                  aria-label="Repeat until"
                />
              )}
              {end.kind === "count" && (
                <span className="flex items-center gap-2 text-sm">
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={end.count}
                    onChange={(e) => set({ end: { kind: "count", count: Math.max(1, Number(e.target.value) || 1) } })}
                    className="h-9 w-20 text-center"
                    aria-label="Number of times"
                  />
                  {t.times}
                </span>
              )}
            </div>
          </Reveal>
        )}
      </AnimatePresence>

      {value.freq !== "none" && (
        <p className="text-xs text-accent">{describeRepeat(value, lang)}</p>
      )}
    </div>
  );
}

function Reveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="pt-0.5">{children}</div>
    </motion.div>
  );
}
