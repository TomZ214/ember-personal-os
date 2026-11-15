"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SPRING, card } from "@/lib/motion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { eachDayOfInterval, format, startOfWeek, subDays } from "date-fns";
import { Flame, Plus, Repeat, Trash2 } from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { dayKey, dfLocale, todayKey } from "@/lib/dates";
import { tint } from "@/lib/tint";
import { CATEGORY_VAR, type CategoryColor, type Habit } from "@/lib/types";
import { useLang, useT } from "@/lib/i18n";
import { streak } from "@/components/widgets/HabitsToday";
import { sparkle } from "@/components/ui/celebrate";
import { playCue } from "@/lib/sound";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Select } from "@/components/ui/inputs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

const COLORS: CategoryColor[] = ["ember", "amber", "sage", "sky", "lilac", "rose"];
const EMOJIS = ["🏃", "📖", "🧘", "💧", "🎸", "✍️", "🥗", "😴", "🚫", "💪", "🌅", "🧹"];

export default function HabitsPage() {
  const hydrated = useHydrated();
  const habits = useEmber((s) => s.habits);
  const t = useT();
  const [adding, setAdding] = useState(false);
  const today = todayKey();
  const doneToday = habits.filter((h) => h.log[today]).length;

  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  return (
    <div>
      <PageHeader
        title={t("habits.title")}
        sub={habits.length ? `${doneToday} ${t("habits.of")} ${habits.length} ${t("habits.keptToday")}` : t("habits.sub")}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> {t("habits.new")}
          </Button>
        }
      />

      {habits.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<Repeat size={20} />}
            title={t("habits.none")}
            hint={t("habits.noneHint")}
            action={<Button onClick={() => setAdding(true)}>{t("habits.createFirst")}</Button>}
          />
        </div>
      ) : (
        // .stagger: the rows settle in one after another on a route change.
        // A habit added or removed later moves by itself, and the others
        // make room (layout).
        <div className="stagger flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {habits.map((h) => (
              <motion.div key={h.id} layout {...card} transition={{ layout: SPRING.smooth }}>
                <HabitRow habit={h} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AddHabit open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function HabitRow({ habit }: { habit: Habit }) {
  const t = useT();
  const lang = useLang();
  const toggleHabit = useEmber((s) => s.toggleHabit);
  const deleteHabit = useEmber((s) => s.deleteHabit);
  const c = CATEGORY_VAR[habit.color];
  const today = todayKey();
  const s = streak(habit);

  const week = eachDayOfInterval({ start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: new Date() });
  const weekDone = week.filter((d) => habit.log[dayKey(d)]).length;

  const best = useMemo(() => {
    let bestRun = 0, run = 0;
    for (let i = 200; i >= 0; i--) {
      if (habit.log[dayKey(subDays(new Date(), i))]) {
        run++;
        bestRun = Math.max(bestRun, run);
      } else run = 0;
    }
    return bestRun;
  }, [habit.log]);

  const total = Object.keys(habit.log).length;

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex min-w-44 flex-1 items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] text-xl"
            style={{ background: `color-mix(in oklch, ${c} 14%, transparent)` }}>
            {habit.emoji}
          </span>
          <div>
            <p className="font-medium">{habit.name}</p>
            <p className="text-xs text-muted">
              {habit.target === 7 ? t("habits.everyDay") : habit.target === 1 ? t("habits.onceWeek") : `${habit.target}× ${t("habits.perWeek")}`} ·{" "}
              <span className="num" style={{ color: weekDone >= habit.target ? c : undefined }}>
                {weekDone}/{habit.target} {t("habits.thisWeek")}
              </span>
            </p>
          </div>
        </div>

        {/* this week's toggles */}
        <div className="flex gap-1.5">
          {eachDayOfInterval({ start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), -6) }).map((d) => {
            const key = dayKey(d);
            const done = !!habit.log[key];
            const future = key > today;
            return (
              <button
                key={key}
                disabled={future}
                onClick={(e) => {
                  toggleHabit(habit.id, key);
                  // same flourish as the dashboard widget, ticking-on only
                  if (done) return;
                  playCue("success");
                  const r = e.currentTarget.getBoundingClientRect();
                  sparkle({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
                }}
                aria-label={`${habit.name}, ${format(d, "EEEE", { locale: dfLocale(lang) })}`}
                aria-pressed={done}
                className={`flex h-9 w-9 flex-col items-center justify-center rounded-xl border text-[10px] transition-all ${
                  future ? "cursor-default border-white/[0.04] text-faint/50" :
                  done ? "border-transparent font-semibold text-[#fff]" : "border-white/[0.10] text-faint hover:border-white/25"
                } ${key === today && !done ? "ring-1 ring-accent/50" : ""}`}
                style={done ? { background: c, boxShadow: `0 2px 12px -2px ${c}` } : undefined}
              >
                {format(d, "EEEEE", { locale: dfLocale(lang) })}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-5 text-center">
          <Stat label={t("habits.streak")} value={<span className="flex items-center justify-center gap-1" style={{ color: c }}><Flame size={14} className="lit" style={{ "--lit-glow": "5px" } as React.CSSProperties} /><AnimatedNumber value={s} /></span>} />
          <Stat label={t("habits.best")} value={<AnimatedNumber value={best} />} />
          <Stat label={t("habits.total")} value={<AnimatedNumber value={total} />} />
          <button
            onClick={() => { deleteHabit(habit.id); toast(t("habits.removed"), "info"); }}
            aria-label={`${t("action.delete")} ${habit.name}`}
            className="rounded-lg p-2 text-faint transition-colors hover:text-danger"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* the history, as many weeks as the card is wide */}
      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <Heatmap habit={habit} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="num text-base font-semibold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-faint">{label}</p>
    </div>
  );
}

/** one week is a column this wide at most (cell + gap), in px */
const WEEK_PX = 20;

/**
 * The history, one square per day, a column per week, newest on the right.
 *
 * It spans the card: as many weeks as fit (a year at most), in squares that
 * share the width exactly. A fixed 18 weeks used to sit in the left third of
 * a wide card with the rest left empty.
 */
function Heatmap({ habit }: { habit: Habit }) {
  const t = useT();
  const lang = useLang();
  const c = CATEGORY_VAR[habit.color];
  const box = useRef<HTMLDivElement>(null);
  const [weeks, setWeeks] = useState(18);

  // measured before the first paint, so the grid never appears at one size
  // and jumps to another
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setWeeks(Math.min(53, Math.max(12, Math.round(el.clientWidth / WEEK_PX))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const start = startOfWeek(subDays(new Date(), weeks * 7 - 7), { weekStartsOn: 1 });
  const today = todayKey();

  return (
    <div
      ref={box}
      role="img"
      aria-label={`${habit.name}: ${t("habits.heatmap")}`}
      className="grid gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: weeks }, (_, w) => (
        <div key={w} className="flex flex-col gap-[3px]">
          {Array.from({ length: 7 }, (_, d) => {
            const day = subDays(start, -(w * 7 + d) * 1);
            const key = dayKey(day);
            if (key > today) return <span key={d} className="aspect-square w-full" />;
            const done = !!habit.log[key];
            return (
              <span
                key={d}
                title={`${format(day, lang === "de" ? "d. MMM" : "MMM d", { locale: dfLocale(lang) })}: ${done ? t("habits.dayDone") : t("habits.dayOpen")}`}
                className={`aspect-square w-full rounded-[4px] ${key === today ? "outline outline-1 -outline-offset-1 outline-white/30" : ""}`}
                style={{ background: done ? c : tint(6) }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function AddHabit({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const addHabit = useEmber((s) => s.addHabit);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏃");
  const [color, setColor] = useState<CategoryColor>("sage");
  const [target, setTarget] = useState(7);

  const save = () => {
    if (!name.trim()) return;
    addHabit({ name: name.trim(), emoji, color, target });
    toast(t("habits.created"));
    setName("");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={t("habits.new")}>
      <div className="flex flex-col gap-4">
        <label>
          <Label>{t("habits.name")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("habits.namePh")} autoFocus />
        </label>
        <div>
          <Label>{t("habits.icon")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                aria-pressed={emoji === e}
                className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg transition-all ${
                  emoji === e ? "bg-white/[0.12] ring-1 ring-accent/60" : "bg-white/[0.04] hover:bg-white/[0.08]"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("habits.color")}</Label>
            <div className="flex h-10 items-center gap-2">
              {COLORS.map((cc) => (
                <button
                  key={cc}
                  onClick={() => setColor(cc)}
                  aria-label={cc}
                  aria-pressed={color === cc}
                  className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${color === cc ? "ring-2 ring-white/70 ring-offset-2 ring-offset-[#1c1a19]" : ""}`}
                  style={{ background: CATEGORY_VAR[cc] }}
                />
              ))}
            </div>
          </div>
          <label>
            <Label>{t("habits.frequency")}</Label>
            <Select value={target} onChange={(e) => setTarget(Number(e.target.value))}>
              <option value={7}>{t("habits.everyDay")}</option>
              <option value={5}>{`5× ${t("habits.perWeek")}`}</option>
              <option value={4}>{`4× ${t("habits.perWeek")}`}</option>
              <option value={3}>{`3× ${t("habits.perWeek")}`}</option>
              <option value={2}>{`2× ${t("habits.perWeek")}`}</option>
              <option value={1}>{t("habits.onceWeek")}</option>
            </Select>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("action.cancel")}</Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>{t("habits.create")}</Button>
        </div>
      </div>
    </Modal>
  );
}
