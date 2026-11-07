"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  Apple, ChevronLeft, ChevronRight, Copy, Droplet, Flame, Minus, Plus, Scale, Target, Trash2, Undo2,
} from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { useLang, useT, type Translator } from "@/lib/i18n";
import { dfLocale, friendlyDay, todayKey } from "@/lib/dates";
import {
  ACTIVITY_FACTOR, dailyKcal, entriesOn, MACRO_SPLIT, MEALS, mealForTime, RATES, scale, shiftDay, streak,
  sum, targets, weightTrend,
  type Activity, type FoodEntry, type GoalKind, type MacroPreset, type Meal, type NutritionProfile,
} from "@/lib/nutrition";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Select } from "@/components/ui/inputs";
import { EmptyState, PageHeader, ProgressBar, ProgressRing } from "@/components/ui/misc";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/toast";
import { AddFoodSheet, fmt, MealPicker, parseNum, toInput } from "@/components/nutrition/AddFoodSheet";
import { WeekBars, WeightLine } from "@/components/nutrition/charts";

type Tab = "today" | "history" | "goals";

const MACRO_COLORS = { protein: "var(--c-sky)", carbs: "var(--c-amber)", fat: "var(--c-rose)" } as const;
const GLASS_ML = 250;

export default function NutritionPage() {
  const hydrated = useHydrated();
  const t = useT();
  const lang = useLang();
  const profile = useEmber((s) => s.nutrition.profile);
  const [tab, setTab] = useState<Tab>("today");
  const [day, setDay] = useState(todayKey);
  const [adding, setAdding] = useState<Meal | null>(null);

  // left open overnight: whoever was looking at "today" moves on to the new
  // today; someone browsing an older day stays where they are
  const lastToday = useRef(todayKey());
  useEffect(() => {
    const tick = () => {
      const now = todayKey();
      if (now === lastToday.current) return;
      const previous = lastToday.current;
      lastToday.current = now;
      setDay((d) => (d === previous ? now : d));
    };
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, []);

  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  const tabs: { id: Tab; label: string }[] = [
    { id: "today", label: t("nut.tab.today") },
    { id: "history", label: t("nut.tab.history") },
    { id: "goals", label: t("nut.tab.goals") },
  ];

  return (
    <div>
      <PageHeader
        title={t("nut.title")}
        sub={t("nut.sub")}
        actions={
          <Button variant="primary" onClick={() => { setTab("today"); setAdding(day === todayKey() ? mealForTime(new Date()) : "snack"); }}>
            <Plus size={16} /> {t("nut.add")}
          </Button>
        }
      />

      <div role="tablist" className="mb-5 flex gap-2">
        {tabs.map((x) => (
          <Button key={x.id} role="tab" aria-selected={tab === x.id} variant={tab === x.id ? "primary" : "subtle"} onClick={() => setTab(x.id)}>
            {x.label}
          </Button>
        ))}
      </div>

      {tab === "today" && (
        <>
          {!profile.setupDone && (
            <div className="panel mb-4 flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <p className="flex items-center gap-2"><Target size={18} className="shrink-0 text-accent" />{t("nut.setupHint")}</p>
              <Button size="sm" onClick={() => setTab("goals")}>{t("nut.setupCta")}</Button>
            </div>
          )}
          <DayNav day={day} setDay={setDay} t={t} lang={lang} />
          <TodayView day={day} onAdd={setAdding} />
        </>
      )}
      {tab === "history" && <HistoryView />}
      {tab === "goals" && <GoalsView onDone={() => setTab("today")} />}

      <AddFoodSheet open={adding !== null} onClose={() => setAdding(null)} day={day} initialMeal={adding ?? "snack"} />
    </div>
  );
}

function DayNav({ day, setDay, t, lang }: { day: string; setDay: (d: string) => void; t: Translator; lang: "en" | "de" }) {
  const today = todayKey();
  return (
    <div className="mb-4 flex items-center gap-2">
      <Button size="sm" variant="ghost" aria-label={t("nut.prevDay")} onClick={() => setDay(shiftDay(day, -1))}><ChevronLeft size={18} /></Button>
      <p className="min-w-36 text-center font-medium">{friendlyDay(day, lang)}</p>
      <Button size="sm" variant="ghost" aria-label={t("nut.nextDay")} disabled={day >= today} onClick={() => setDay(shiftDay(day, 1))}><ChevronRight size={18} /></Button>
      {day !== today && <Button size="sm" variant="subtle" onClick={() => setDay(today)}>{t("nut.today")}</Button>}
    </div>
  );
}

/* ---------------- today ---------------- */

function TodayView({ day, onAdd }: { day: string; onAdd: (m: Meal) => void }) {
  const t = useT();
  const lang = useLang();
  const entries = useEmber((s) => s.nutrition.entries);
  const profile = useEmber((s) => s.nutrition.profile);
  const water = useEmber((s) => s.nutrition.water[day] ?? 0);
  const setWater = useEmber((s) => s.setWater);
  const deleteEntry = useEmber((s) => s.deleteFoodEntry);
  const restoreEntry = useEmber((s) => s.restoreFoodEntry);
  const copyMeal = useEmber((s) => s.copyMeal);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [undo, setUndo] = useState<FoodEntry | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const goal = useMemo(() => targets(profile), [profile]);
  const todays = useMemo(() => entriesOn(entries, day), [entries, day]);
  const yesterday = useMemo(() => entriesOn(entries, shiftDay(day, -1)), [entries, day]);
  const total = sum(todays);
  const left = goal.kcal - total.kcal;
  const over = left < 0;

  const remove = (e: FoodEntry) => {
    deleteEntry(e.id);
    setUndo(e);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  };

  return (
    <div className="space-y-4">
      <section className="panel grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex justify-center">
          <ProgressRing value={goal.kcal ? total.kcal / goal.kcal : 0} size={168} stroke={12} color={over ? "var(--warning)" : "var(--accent)"}>
            <div className="text-center">
              <p className="num text-3xl font-semibold">{Math.abs(left)}</p>
              <p className="text-xs text-muted">{over ? t("nut.kcalOver") : t("nut.kcalLeft")}</p>
            </div>
          </ProgressRing>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label={t("nut.goal")} value={goal.kcal} />
            <Stat label={t("nut.eaten")} value={total.kcal} />
            <Stat label={over ? t("nut.over") : t("nut.left")} value={Math.abs(left)} warn={over} />
          </div>
          {(["protein", "carbs", "fat"] as const).map((k) => (
            <div key={k}>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: MACRO_COLORS[k] }} />{t(`nut.macro.${k}`)}</span>
                <span className="num text-muted">{Math.round(total[k])} / {goal[k]} g</span>
              </div>
              <ProgressBar value={goal[k] ? total[k] / goal[k] : 0} color={MACRO_COLORS[k]} />
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold"><Droplet size={17} className="text-[var(--c-sky)]" />{t("nut.water")}</h2>
          <span className="num text-sm text-muted">{fmt(water / 1000, lang, 2)} / {fmt(profile.waterGoalMl / 1000, lang, 2)} l</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" aria-label={t("nut.waterLess")} disabled={!water} onClick={() => setWater(day, water - GLASS_ML)}><Minus size={16} /></Button>
          {Array.from({ length: Math.max(8, Math.ceil(profile.waterGoalMl / GLASS_ML)) }, (_, i) => {
            const full = water >= (i + 1) * GLASS_ML;
            return (
              <button
                key={i}
                type="button"
                aria-label={t("nut.waterSet").replace("{ml}", String((i + 1) * GLASS_ML))}
                onClick={() => setWater(day, full && water < (i + 2) * GLASS_ML ? i * GLASS_ML : (i + 1) * GLASS_ML)}
                className={`flex h-10 w-8 items-end justify-center rounded-b-lg rounded-t-sm border transition-colors ${full ? "border-[var(--c-sky)]/50 bg-[var(--c-sky)]/25" : "border-white/[0.1] bg-white/[0.03]"}`}
              >
                <Droplet size={12} className={full ? "mb-1.5 text-[var(--c-sky)]" : "mb-1.5 text-faint"} />
              </button>
            );
          })}
          <Button size="sm" variant="ghost" aria-label={t("nut.waterMore")} onClick={() => setWater(day, water + GLASS_ML)}><Plus size={16} /></Button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {MEALS.map((meal) => {
          const items = todays.filter((e) => e.meal === meal);
          const kcal = sum(items).kcal;
          const canCopy = !items.length && yesterday.some((e) => e.meal === meal);
          return (
            <section key={meal} className="panel p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="font-semibold">{t(`nut.meal.${meal}`)} <span className="num ml-1 text-sm font-normal text-muted">{kcal} kcal</span></h2>
                <Button size="sm" variant="subtle" aria-label={t("nut.addTo").replace("{meal}", t(`nut.meal.${meal}`))} onClick={() => onAdd(meal)}><Plus size={15} /></Button>
              </div>
              {items.length ? (
                <ul className="-mx-2">
                  {items.map((e) => (
                    <li key={e.id} className="flex items-center gap-1">
                      <button type="button" onClick={() => setEditing(e)} className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/[0.04] active:bg-white/[0.07]">
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{e.name}</span>
                          <span className="num block truncate text-xs text-muted">
                            {[e.amount ? `${fmt(e.amount, lang)} ${e.unit}` : null, `${t("nut.macro.short.protein")} ${fmt(e.protein, lang)} · ${t("nut.macro.short.carbs")} ${fmt(e.carbs, lang)} · ${t("nut.macro.short.fat")} ${fmt(e.fat, lang)}`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="num shrink-0 text-sm">{e.kcal}</span>
                      </button>
                      <Button size="sm" variant="ghost" aria-label={t("nut.deleteEntry").replace("{name}", e.name)} onClick={() => remove(e)}><Trash2 size={14} /></Button>
                    </li>
                  ))}
                </ul>
              ) : canCopy ? (
                <button
                  type="button"
                  onClick={() => {
                    const n = copyMeal(shiftDay(day, -1), day, meal);
                    toast(t("nut.copied").replace("{n}", String(n)));
                  }}
                  className="mt-1 flex items-center gap-2 rounded-lg py-2 text-sm text-accent hover:underline"
                >
                  <Copy size={14} />{t("nut.copyYesterday")}
                </button>
              ) : (
                <p className="py-2 text-sm text-faint">{t("nut.nothingYet")}</p>
              )}
            </section>
          );
        })}
      </div>

      {undo && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-strong fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-(--z-toast) mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-full py-2 pl-4 pr-2 text-sm shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)] md:bottom-[calc(9rem+env(safe-area-inset-bottom))]">
          <span className="truncate">{t("nut.deleted").replace("{name}", undo.name)}</span>
          <Button size="sm" onClick={() => { restoreEntry(undo); setUndo(null); clearTimeout(undoTimer.current); }}><Undo2 size={14} />{t("nut.undo")}</Button>
        </motion.div>
      )}

      <EditEntry entry={editing} onClose={() => setEditing(null)} onDelete={(e) => { setEditing(null); remove(e); }} />
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-2 py-2.5">
      <p className={`num text-lg font-semibold ${warn ? "text-warning" : ""}`}>{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

function EditEntry({ entry, onClose, onDelete }: { entry: FoodEntry | null; onClose: () => void; onDelete: (e: FoodEntry) => void }) {
  return (
    <Modal open={!!entry} onClose={onClose} title={entry?.name ?? ""}>
      {/* keyed: every entry opens with its own values, never the previous one's */}
      {entry && <EditEntryForm key={entry.id} entry={entry} onClose={onClose} onDelete={onDelete} />}
    </Modal>
  );
}

function EditEntryForm({ entry, onClose, onDelete }: { entry: FoodEntry; onClose: () => void; onDelete: (e: FoodEntry) => void }) {
  const t = useT();
  const lang = useLang();
  const update = useEmber((s) => s.updateFoodEntry);
  const [meal, setMeal] = useState<Meal>(entry.meal);
  const [amount, setAmount] = useState(toInput(entry.amount, lang));
  const [kcal, setKcal] = useState(String(entry.kcal));

  const scalable = !!entry.per100 && entry.amount > 0;
  const a = parseNum(amount);
  const k = parseNum(kcal);
  const valid = scalable ? a != null && a > 0 && a <= 5000 : k != null && k > 0 && k <= 10_000;
  const preview = scalable && valid && entry.per100 ? scale(entry.per100, a!) : null;

  const save = () => {
    if (!valid) return;
    if (scalable && entry.per100) update(entry.id, { meal, amount: a!, ...scale(entry.per100, a!) });
    else {
      // a quick entry has no amount: scale its macros along with the calories
      const f = entry.kcal ? k! / entry.kcal : 0;
      const r1 = (n: number) => Math.round(n * f * 10) / 10;
      update(entry.id, { meal, kcal: Math.round(k!), protein: r1(entry.protein), carbs: r1(entry.carbs), fat: r1(entry.fat) });
    }
    onClose();
  };

  return (
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <MealPicker value={meal} onChange={setMeal} t={t} />
        {scalable ? (
          <label className="block"><Label>{t("nut.amount")} ({entry.unit})</Label><Input autoFocus inputMode="decimal" value={amount} aria-invalid={!valid} onChange={(e) => setAmount(e.target.value)} /></label>
        ) : (
          <label className="block"><Label>{t("nut.kcalTotal")}</Label><Input autoFocus inputMode="decimal" value={kcal} aria-invalid={!valid} onChange={(e) => setKcal(e.target.value)} /></label>
        )}
        {preview && <p className="num text-sm text-muted">{preview.kcal} kcal · {t("nut.macro.short.protein")} {fmt(preview.protein, lang)} g · {t("nut.macro.short.carbs")} {fmt(preview.carbs, lang)} g · {t("nut.macro.short.fat")} {fmt(preview.fat, lang)} g</p>}
        <div className="flex gap-2">
          <Button type="button" variant="danger" onClick={() => onDelete(entry)}><Trash2 size={15} />{t("nut.delete")}</Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!valid}>{t("nut.save")}</Button>
        </div>
      </form>
  );
}

/* ---------------- history ---------------- */

function HistoryView() {
  const t = useT();
  const lang = useLang();
  const nutrition = useEmber((s) => s.nutrition);
  const logWeight = useEmber((s) => s.logWeight);
  const deleteWeight = useEmber((s) => s.deleteWeight);
  const today = todayKey();
  const goal = useMemo(() => targets(nutrition.profile), [nutrition.profile]);
  const week = useMemo(() => dailyKcal(nutrition.entries, today, 7), [nutrition.entries, today]);
  const month = useMemo(() => dailyKcal(nutrition.entries, today, 30), [nutrition.entries, today]);
  const trend = useMemo(() => weightTrend(nutrition.weights).slice(-60), [nutrition.weights]);
  const [weight, setWeight] = useState("");

  const logged = month.filter((d) => d.logged);
  const avg = logged.length ? Math.round(logged.reduce((s, d) => s + d.kcal, 0) / logged.length) : 0;
  // "on target": within ±10 % of the goal on a day that was logged
  const onTarget = logged.filter((d) => Math.abs(d.kcal - goal.kcal) <= goal.kcal * 0.1).length;
  const loggedDays = new Set(logged.map((d) => d.day));
  const proteinSum = nutrition.entries.filter((e) => loggedDays.has(e.date)).reduce((s, e) => s + e.protein, 0);
  const avgProtein = loggedDays.size ? Math.round(proteinSum / loggedDays.size) : 0;
  const fmtDay = (d: string) => format(new Date(`${d}T12:00:00`), lang === "de" ? "d. MMM" : "MMM d", { locale: dfLocale(lang) });
  const w = parseNum(weight);
  const weightValid = w != null && w >= 30 && w <= 300;
  const first = trend[0], last = trend[trend.length - 1];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<Flame size={16} />} label={t("nut.streak")} value={`${streak(nutrition.entries, today)}`} unit={t("nut.days")} />
        <Tile icon={<Apple size={16} />} label={t("nut.avg30")} value={String(avg)} unit="kcal" />
        <Tile icon={<Target size={16} />} label={t("nut.onTarget")} value={`${onTarget}/${logged.length}`} unit={t("nut.days")} />
        <Tile icon={<Scale size={16} />} label={t("nut.avgProtein")} value={String(avgProtein)} unit="g" />
      </div>

      <section className="panel p-5">
        <h2 className="mb-1 font-semibold">{t("nut.last7")}</h2>
        <p className="mb-5 text-xs text-muted">{t("nut.last7Hint").replace("{kcal}", String(goal.kcal))}</p>
        {week.some((d) => d.logged)
          ? <WeekBars days={week.map((d) => ({ ...d, label: format(new Date(`${d.day}T12:00:00`), "EEEEEE", { locale: dfLocale(lang) }) }))} target={goal.kcal} label={t("nut.last7")} unit="kcal" />
          : <EmptyState icon={<Apple size={20} />} title={t("nut.noHistory")} hint={t("nut.noHistoryHint")} />}
      </section>

      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">{t("nut.weight")}</h2>
            {first && last && first !== last && (
              <p className="num text-xs text-muted">
                {t("nut.weightChange").replace("{kg}", `${last.trend - first.trend > 0 ? "+" : ""}${fmt(Math.round((last.trend - first.trend) * 10) / 10, lang)}`).replace("{since}", fmtDay(first.date))}
              </p>
            )}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!weightValid) return; logWeight(today, Math.round(w! * 10) / 10); setWeight(""); toast(t("nut.weightSaved")); }}>
            <div className="w-28"><Input inputMode="decimal" placeholder="kg" aria-label={t("nut.weightToday")} value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
            <Button type="submit" disabled={!weightValid}>{t("nut.save")}</Button>
          </form>
        </div>
        {trend.length >= 2 ? (
          <WeightLine points={trend} label={t("nut.weight")} formatDate={fmtDay} formatKg={(kg) => fmt(kg, lang)} />
        ) : (
          <p className="text-sm text-muted">{t("nut.weightHint")}</p>
        )}
        {trend.length > 0 && (
          <ul className="mt-4 divide-y divide-white/[0.06] text-sm">
            {[...trend].reverse().slice(0, 7).map((p) => (
              <li key={p.date} className="flex items-center justify-between py-1.5">
                <span className="text-muted">{fmtDay(p.date)}</span>
                <span className="flex items-center gap-2"><span className="num">{fmt(p.kg, lang)} kg</span>
                  <Button size="sm" variant="ghost" aria-label={t("nut.deleteWeight")} onClick={() => deleteWeight(p.date)}><Trash2 size={13} /></Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit: string }) {
  return (
    <div className="panel p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted">{icon}{label}</p>
      <p className="mt-2 text-2xl font-semibold"><span className="num">{value}</span> <span className="text-sm font-normal text-muted">{unit}</span></p>
    </div>
  );
}

/* ---------------- goals ---------------- */

function GoalsView({ onDone }: { onDone: () => void }) {
  const t = useT();
  const lang = useLang();
  const saved = useEmber((s) => s.nutrition.profile);
  const update = useEmber((s) => s.updateNutritionProfile);
  const [p, setP] = useState<NutritionProfile>(saved);
  const local = (n: number) => toInput(n, lang);
  const [text, setText] = useState({ age: String(saved.age), heightCm: String(saved.heightCm), weightKg: local(saved.weightKg), manualKcal: String(saved.manualKcal ?? ""), water: local(saved.waterGoalMl / 1000) });

  const num = (s: string, lo: number, hi: number) => { const n = parseNum(s); return n != null && n >= lo && n <= hi ? n : null; };
  const age = num(text.age, 14, 100), height = num(text.heightCm, 120, 230), weightKg = num(text.weightKg, 30, 300);
  const manual = p.manualKcal != null ? num(text.manualKcal, 800, 6000) : null;
  const water = num(text.water, 0.5, 6);
  const valid = age != null && height != null && weightKg != null && water != null && (p.manualKcal == null || manual != null);
  const draft: NutritionProfile = valid
    ? { ...p, age: Math.round(age!), heightCm: Math.round(height!), weightKg: weightKg!, manualKcal: p.manualKcal == null ? null : Math.round(manual!), waterGoalMl: Math.round(water! * 1000) }
    : p;
  const result = targets(draft);

  const field = (key: keyof typeof text, label: string, suffix: string) => (
    <label className="block">
      <Label>{label}</Label>
      <div className="relative">
        <Input inputMode="decimal" value={text[key]} onChange={(e) => setText({ ...text, [key]: e.target.value })} className="pr-12" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-faint">{suffix}</span>
      </div>
    </label>
  );

  return (
    <form
      className="grid gap-4 lg:grid-cols-[1fr_320px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        update({ ...draft, setupDone: true });
        toast(t("nut.goalsSaved"));
        onDone();
      }}
    >
      <section className="panel space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><Label>{t("nut.sex")}</Label>
            <Select value={p.sex} onChange={(e) => setP({ ...p, sex: e.target.value as NutritionProfile["sex"] })}>
              <option value="female">{t("nut.sex.female")}</option><option value="male">{t("nut.sex.male")}</option>
            </Select>
          </label>
          {field("age", t("nut.age"), t("nut.years"))}
          {field("heightCm", t("nut.height"), "cm")}
          {field("weightKg", t("nut.weightNow"), "kg")}
        </div>
        <label className="block"><Label>{t("nut.activity")}</Label>
          <Select value={p.activity} onChange={(e) => setP({ ...p, activity: e.target.value as Activity })}>
            {(Object.keys(ACTIVITY_FACTOR) as Activity[]).map((a) => <option key={a} value={a}>{t(`nut.activity.${a}`)}</option>)}
          </Select>
        </label>
        <div>
          <Label>{t("nut.goalKind")}</Label>
          <div role="radiogroup" className="grid grid-cols-3 gap-2">
            {(["lose", "maintain", "gain"] as GoalKind[]).map((g) => (
              <button key={g} type="button" role="radio" aria-checked={p.goal === g} onClick={() => setP({ ...p, goal: g })} className={`min-h-10 rounded-lg border px-2 text-sm font-medium ${p.goal === g ? "border-accent/50 bg-accent/15" : "border-white/[0.08] text-muted hover:text-ink"}`}>
                {t(`nut.goal.${g}`)}
              </button>
            ))}
          </div>
        </div>
        {p.goal !== "maintain" && (
          <label className="block"><Label>{t("nut.rate")}</Label>
            <Select value={String(p.rate)} onChange={(e) => setP({ ...p, rate: Number(e.target.value) })}>
              {RATES.map((r) => <option key={r} value={r}>{t("nut.ratePerWeek").replace("{kg}", r.toLocaleString(lang))}</option>)}
            </Select>
          </label>
        )}
        <label className="block"><Label>{t("nut.macroPreset")}</Label>
          <Select value={p.macroPreset} onChange={(e) => setP({ ...p, macroPreset: e.target.value as MacroPreset })}>
            {(Object.keys(MACRO_SPLIT) as MacroPreset[]).map((m) => {
              const s = MACRO_SPLIT[m];
              return <option key={m} value={m}>{t(`nut.preset.${m}`)} ({Math.round(s.protein * 100)}/{Math.round(s.carbs * 100)}/{Math.round(s.fat * 100)})</option>;
            })}
          </Select>
        </label>
        {field("water", t("nut.waterGoal"), "l")}
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] p-3">
          <div>
            <p className="text-sm font-medium">{t("nut.manual")}</p>
            <p className="text-xs text-muted">{t("nut.manualHint")}</p>
          </div>
          <Switch
            checked={p.manualKcal != null}
            label={t("nut.manual")}
            onChange={(on) => { setP({ ...p, manualKcal: on ? result.kcal : null }); if (on) setText({ ...text, manualKcal: String(result.kcal) }); }}
          />
        </div>
        {p.manualKcal != null && field("manualKcal", t("nut.manualKcal"), "kcal")}
      </section>

      <aside className="panel h-fit space-y-3 p-5 lg:sticky lg:top-20">
        <p className="text-xs text-muted">{t("nut.yourTarget")}</p>
        <p className="num text-4xl font-semibold">{result.kcal}<span className="ml-1 text-base font-normal text-muted">kcal</span></p>
        <dl className="space-y-1.5 text-sm">
          <Row k={t("nut.bmr")} v={`${result.bmr} kcal`} />
          <Row k={t("nut.tdee")} v={`${result.tdee} kcal`} />
          <Row k={t("nut.macro.protein")} v={`${result.protein} g`} />
          <Row k={t("nut.macro.carbs")} v={`${result.carbs} g`} />
          <Row k={t("nut.macro.fat")} v={`${result.fat} g`} />
        </dl>
        {result.clamped && <p className="text-xs text-warning">{t("nut.clamped")}</p>}
        {!valid && <p role="alert" className="text-xs text-danger">{t("nut.checkInputs")}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={!valid}>{t("nut.saveGoals")}</Button>
        <p className="text-[11px] text-faint">{t("nut.formulaNote")}</p>
      </aside>
    </form>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="num">{v}</dd></div>;
}
