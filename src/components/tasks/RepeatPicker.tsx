"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { RepeatEnd, RepeatFreq, RepeatRule } from "@/lib/types";
import { describeRepeat } from "@/lib/recurrence";
import { Input, Label, Select } from "@/components/ui/inputs";

/**
 * Professional recurrence editor — the calendar-app scheduler. Emits a full
 * RepeatRule. Kept compact: the extra controls only appear when they matter.
 */

const FREQS: { value: RepeatFreq; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "weekdays", label: "Every weekday (Mon–Fri)" },
  { value: "weekends", label: "Every weekend (Sat & Sun)" },
];

const UNIT: Partial<Record<RepeatFreq, string>> = {
  hourly: "hours", daily: "days", weekly: "weeks", monthly: "months", yearly: "years",
};

const WD = [
  { d: 1, l: "M" }, { d: 2, l: "T" }, { d: 3, l: "W" }, { d: 4, l: "T" },
  { d: 5, l: "F" }, { d: 6, l: "S" }, { d: 0, l: "S" },
];

const ORDINALS = [
  { v: 1, l: "first" }, { v: 2, l: "second" }, { v: 3, l: "third" }, { v: 4, l: "fourth" }, { v: -1, l: "last" },
];

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function RepeatPicker({
  value, onChange, dueWeekday,
}: {
  value: RepeatRule;
  onChange: (r: RepeatRule) => void;
  /** weekday of the task's due date, to seed the weekly/monthly defaults */
  dueWeekday?: number;
}) {
  const set = (patch: Partial<RepeatRule>) => onChange({ ...value, ...patch });
  const showInterval = !!UNIT[value.freq];
  const end: RepeatEnd = value.end ?? { kind: "forever" };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label>
          <Label>Repeats</Label>
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
            {FREQS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </label>

        {showInterval && (
          <label>
            <Label>Every</Label>
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
              <span className="text-sm text-muted">{UNIT[value.freq]}</span>
            </div>
          </label>
        )}
      </div>

      <AnimatePresence initial={false}>
        {value.freq === "weekly" && (
          <Reveal key="wk">
            <Label>On these days</Label>
            <div className="flex gap-1.5">
              {WD.map(({ d, l }) => {
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
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-medium transition-colors ${
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
            <Label>On</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="radio"
                  checked={(value.monthly?.mode ?? "day") === "day"}
                  onChange={() => set({ monthly: { mode: "day" } })}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                the same day of the month
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
                the
                <Select
                  value={value.monthly?.mode === "weekday" ? String(value.monthly.nth) : "1"}
                  disabled={value.monthly?.mode !== "weekday"}
                  onChange={(e) =>
                    set({ monthly: { mode: "weekday", nth: Number(e.target.value), weekday: value.monthly?.mode === "weekday" ? value.monthly.weekday : dueWeekday ?? 1 } })
                  }
                  className="h-9 w-28"
                >
                  {ORDINALS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </Select>
                <Select
                  value={value.monthly?.mode === "weekday" ? String(value.monthly.weekday) : "1"}
                  disabled={value.monthly?.mode !== "weekday"}
                  onChange={(e) =>
                    set({ monthly: { mode: "weekday", nth: value.monthly?.mode === "weekday" ? value.monthly.nth : 1, weekday: Number(e.target.value) } })
                  }
                  className="h-9 w-32"
                >
                  {WEEKDAY_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
                </Select>
              </label>
            </div>
          </Reveal>
        )}

        {value.freq !== "none" && (
          <Reveal key="end">
            <Label>Ends</Label>
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
                <option value="forever">Never</option>
                <option value="until">On date</option>
                <option value="count">After…</option>
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
                  times
                </span>
              )}
            </div>
          </Reveal>
        )}
      </AnimatePresence>

      {value.freq !== "none" && (
        <p className="text-xs text-accent">{describeRepeat(value)}</p>
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
