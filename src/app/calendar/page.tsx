"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay,
  isSameMonth, isToday, startOfMonth, startOfWeek, subMonths, subWeeks,
} from "date-fns";
import {
  CalendarDays, ChevronLeft, ChevronRight, Loader2, MapPin, Plus, RefreshCw, Sparkles, Trash2, Users,
} from "lucide-react";
import { useHydrated } from "@/lib/store";
import { dayKey, dfLocale, friendlyDay, minutesToLabel, todayKey } from "@/lib/dates";
import { reminderKey, useLang, useT } from "@/lib/i18n";
import { parseQuickEvent } from "@/lib/nlp";
import { CATEGORY_VAR, REMINDER_OPTIONS, type CategoryColor, type Recurrence } from "@/lib/types";
import { eventOccursOn, useCalendarSource, type CalEvent, type CalendarInput } from "@/hooks/useIntegrations";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Select, Textarea } from "@/components/ui/inputs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

type View = "month" | "week" | "day" | "agenda";
const HOUR_H = 52;
const DAY_START = 7;
const DAY_END = 22;

type Cal = ReturnType<typeof useCalendarSource>;

const occursOnDay = eventOccursOn;

export default function CalendarPage() {
  const hydrated = useHydrated();
  const cal = useCalendarSource();
  const t = useT();
  const lang = useLang();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [creating, setCreating] = useState<{ date: string; start: number } | null>(null);
  const [nl, setNl] = useState("");

  const nlParsed = nl.trim().length > 2 ? parseQuickEvent(nl) : null;

  const quickAdd = async () => {
    if (!nlParsed) return;
    try {
      await cal.create({
        ...nlParsed,
        recurrence: "none",
        localColor: "sky",
        calendarId: cal.connected ? cal.calendars.find((c) => c.primary)?.id : undefined,
      });
      toast(`"${nlParsed.title}" — ${friendlyDay(nlParsed.date, lang)} ${minutesToLabel(nlParsed.start)}${cal.connected ? " · synced to Google" : ""}`);
      setNl("");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("cal.createFailed"), "error");
    }
  };

  const shift = (dir: 1 | -1) => {
    if (view === "month") setCursor((c) => (dir === 1 ? addMonths(c, 1) : subMonths(c, 1)));
    else if (view === "week") setCursor((c) => (dir === 1 ? addWeeks(c, 1) : subWeeks(c, 1)));
    else setCursor((c) => addDays(c, dir));
  };

  const title =
    view === "day" ? format(cursor, lang === "de" ? "EEEE, d. MMMM" : "EEEE, MMMM d", { locale: dfLocale(lang) }) :
    view === "week" ? `${t("cal.weekOf")} ${format(startOfWeek(cursor, { weekStartsOn: 1 }), "d. MMM", { locale: dfLocale(lang) })}` :
    format(cursor, "MMMM yyyy", { locale: dfLocale(lang) });

  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  return (
    <div>
      <PageHeader
        title={t("cal.title")}
        sub={cal.connected ? t("cal.syncedGoogle") : undefined}
        actions={
          <>
            {cal.connected && (
              <Button size="sm" variant="ghost" onClick={() => cal.refresh()} aria-label={t("cal.syncNow")} title={t("cal.syncNow")}>
                {cal.syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              </Button>
            )}
            <Button variant="primary" onClick={() => setCreating({ date: dayKey(cursor), start: 9 * 60 })}>
              <Plus size={16} /> {t("cal.new")}
            </Button>
          </>
        }
      />

      {/* natural language quick add */}
      <div className="relative mb-4">
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 transition-colors focus-within:border-accent/50">
          <Sparkles size={16} className="shrink-0 text-accent" />
          <input
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && quickAdd()}
            placeholder={t("cal.quickAddPh")}
            className="h-12 w-full bg-transparent text-sm placeholder:text-faint focus:outline-none"
            aria-label={t("cal.quickAdd")}
          />
          {nlParsed && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={quickAdd}
              className="num shrink-0 whitespace-nowrap rounded-full bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/25"
            >
              ↵ {friendlyDay(nlParsed.date, lang)} · {minutesToLabel(nlParsed.start)}
            </motion.button>
          )}
        </div>
      </div>

      {/* google calendar chips */}
      {cal.connected && cal.calendars.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {cal.calendars.map((c) => {
            const hidden = cal.hiddenCals.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => cal.toggleCalendar(c.id)}
                aria-pressed={!hidden}
                title={`${hidden ? t("cal.show") : t("cal.hide")} ${c.name}`}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                  hidden ? "border-white/[0.06] text-faint opacity-55" : "border-white/[0.1] bg-white/[0.04] text-muted"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: hidden ? "var(--faint)" : c.color }} />
                {c.name}
              </button>
            );
          })}
          {cal.needsReconnect && (
            <span className="text-xs text-warning">{t("cal.googleExpired")}</span>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} aria-label={t("cal.previous")} className="rounded-lg p-2 text-muted transition-colors hover:bg-white/[0.06] hover:text-ink">
            <ChevronLeft size={17} />
          </button>
          <button onClick={() => setCursor(new Date())} className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-white/[0.06] hover:text-ink">
            {t("cal.today")}
          </button>
          <button onClick={() => shift(1)} aria-label={t("cal.next")} className="rounded-lg p-2 text-muted transition-colors hover:bg-white/[0.06] hover:text-ink">
            <ChevronRight size={17} />
          </button>
          <h2 className="ml-2 text-base font-semibold tracking-tight sm:text-lg">{title}</h2>
        </div>
        <div className="flex rounded-[11px] border border-white/[0.08] bg-white/[0.04] p-0.5">
          {(["month", "week", "day", "agenda"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`relative h-8 rounded-[9px] px-3 text-[13px] font-medium transition-colors ${
                view === v ? "text-ink" : "text-faint hover:text-muted"
              }`}
            >
              {view === v && (
                <motion.span layoutId="cal-view" className="absolute inset-0 rounded-[9px] bg-white/[0.09]"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }} />
              )}
              <span className="relative">{t(`cal.view.${v}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {view === "month" && (
        <MonthView cal={cal} cursor={cursor} onDay={(d) => { setCursor(d); setView("day"); }} onEdit={setEditing}
          onCreate={(date) => setCreating({ date, start: 9 * 60 })} />
      )}
      {view === "week" && <TimeGrid cal={cal} days={7} cursor={cursor} onEdit={setEditing} onCreate={setCreating} />}
      {view === "day" && <TimeGrid cal={cal} days={1} cursor={cursor} onEdit={setEditing} onCreate={setCreating} />}
      {view === "agenda" && <AgendaView cal={cal} cursor={cursor} onEdit={setEditing} />}

      <EventEditor cal={cal} open={!!creating} defaults={creating ?? undefined} onClose={() => setCreating(null)} />
      <EventEditor cal={cal} open={!!editing} event={editing ?? undefined} onClose={() => setEditing(null)} />
    </div>
  );
}

/* ---------------- month ---------------- */

function MonthView({
  cal, cursor, onDay, onEdit, onCreate,
}: {
  cal: Cal;
  cursor: Date;
  onDay: (d: Date) => void;
  onEdit: (e: CalEvent) => void;
  onCreate: (date: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [dragEv, setDragEv] = useState<CalEvent | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
  });

  const drop = async (key: string) => {
    const ev = dragEv;
    setDragEv(null);
    setOverDay(null);
    if (!ev || ev.date === key) return;
    try {
      await cal.update(ev, { date: key, start: ev.start, end: ev.end });
      toast(`${t("cal.movedTo")} ${friendlyDay(key, lang)}${ev.source === "google" ? " · synced" : ""}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("cal.moveFailed"), "error");
    }
  };

  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-7 border-b border-white/[0.06]">
        {eachDayOfInterval({ start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) })
          .map((wd) => format(wd, "EEE", { locale: dfLocale(lang) }))
          .map((d) => (
          <div key={d} className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-faint">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = dayKey(d);
          const dayEvents = cal.events.filter((e) => occursOnDay(e, key)).sort((a, b) => a.start - b.start);
          const inMonth = isSameMonth(d, cursor);
          const today = isToday(d);
          return (
            <div
              key={key}
              onClick={() => onDay(d)}
              onDoubleClick={() => onCreate(key)}
              onDragOver={(e) => { e.preventDefault(); setOverDay(key); }}
              onDragLeave={() => setOverDay((o) => (o === key ? null : o))}
              onDrop={() => drop(key)}
              className={`min-h-20 cursor-pointer border-b border-r border-white/[0.04] p-1.5 transition-colors last:border-r-0 sm:min-h-28 ${
                inMonth ? "" : "opacity-35"
              } ${overDay === key && dragEv ? "bg-accent/10" : "hover:bg-white/[0.03]"}`}
            >
              <span
                className={`num mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  today ? "bg-[image:var(--grad-sunset)] font-semibold text-(--on-sunset) shadow-[0_0_12px_-2px_var(--primary)]" : "text-muted"
                }`}
              >
                {format(d, "d")}
              </span>
              <div className="flex flex-col gap-1">
                {dayEvents.slice(0, 3).map((e) => (
                  <button
                    key={e.id + key}
                    draggable
                    onDragStart={(ev) => { ev.stopPropagation(); setDragEv(e); }}
                    onDragEnd={() => setDragEv(null)}
                    onClick={(ev) => { ev.stopPropagation(); onEdit(e); }}
                    className="hidden cursor-grab items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] transition-transform hover:scale-[1.02] active:cursor-grabbing sm:flex"
                    style={{
                      background: `color-mix(in oklch, ${e.color} 16%, transparent)`,
                      color: `color-mix(in oklch, ${e.color} 70%, white)`,
                    }}
                  >
                    <span className="num shrink-0 opacity-80">{e.allDay ? "•" : minutesToLabel(e.start)}</span>
                    <span className="truncate font-medium">{e.title}</span>
                  </button>
                ))}
                <div className="flex gap-1 sm:hidden">
                  {dayEvents.slice(0, 4).map((e) => (
                    <span key={e.id + key} className="h-1.5 w-1.5 rounded-full" style={{ background: e.color }} />
                  ))}
                </div>
                {dayEvents.length > 3 && (
                  <span className="hidden px-1.5 text-[10px] text-faint sm:block">+{dayEvents.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- week / day time grid ---------------- */

function TimeGrid({
  cal, days, cursor, onEdit, onCreate,
}: {
  cal: Cal;
  days: 1 | 7;
  cursor: Date;
  onEdit: (e: CalEvent) => void;
  onCreate: (v: { date: string; start: number }) => void;
}) {
  const lang = useLang();
  const [nowMin, setNowMin] = useState(-1);

  useEffect(() => {
    const update = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    const raf = requestAnimationFrame(update);
    const t = setInterval(update, 60_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, []);

  const cols = days === 7
    ? eachDayOfInterval({ start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) })
    : [cursor];
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);

  return (
    <div className="panel overflow-x-auto">
      <div className="min-w-[640px] sm:min-w-0">
        {days === 7 && (
          <div className="grid border-b border-white/[0.06]" style={{ gridTemplateColumns: `3.5rem repeat(${days}, 1fr)` }}>
            <span />
            {cols.map((d) => (
              <div key={dayKey(d)} className="px-2 py-2 text-center">
                <p className="text-[11px] uppercase tracking-wide text-faint">{format(d, "EEE", { locale: dfLocale(lang) })}</p>
                <p className={`num mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                  isToday(d) ? "bg-[image:var(--grad-sunset)] font-semibold text-(--on-sunset)" : "text-ink"
                }`}>
                  {format(d, "d")}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="relative grid" style={{ gridTemplateColumns: `3.5rem repeat(${days}, 1fr)` }}>
          <div className="relative" style={{ height: hours.length * HOUR_H }}>
            {hours.map((h, i) => (
              <span key={h} className="num absolute right-2 -translate-y-1/2 text-[11px] text-faint" style={{ top: i * HOUR_H }}>
                {h.toString().padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {cols.map((d) => {
            const key = dayKey(d);
            const dayEvents = cal.events.filter((e) => occursOnDay(e, key) && !e.allDay);
            const allDay = cal.events.filter((e) => occursOnDay(e, key) && e.allDay);
            const showNow = isToday(d) && nowMin >= DAY_START * 60 && nowMin <= DAY_END * 60;
            return (
              <div
                key={key}
                className="relative border-l border-white/[0.05]"
                style={{ height: hours.length * HOUR_H }}
                onDoubleClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const min = DAY_START * 60 + Math.floor(((e.clientY - rect.top) / HOUR_H) * 60);
                  onCreate({ date: key, start: Math.round(min / 30) * 30 });
                }}
              >
                {hours.map((_, i) => (
                  <span key={i} className="absolute inset-x-0 border-t border-white/[0.04]" style={{ top: i * HOUR_H }} />
                ))}
                {allDay.slice(0, 2).map((e, i) => (
                  <button
                    key={e.id + key}
                    onClick={() => onEdit(e)}
                    className="absolute inset-x-1 z-[6] truncate rounded-md border px-2 py-0.5 text-left text-[11px] font-medium"
                    style={{
                      top: 2 + i * 22,
                      background: `color-mix(in oklch, ${e.color} 18%, oklch(0.14 0 0 / 0.8))`,
                      borderColor: `color-mix(in oklch, ${e.color} 40%, transparent)`,
                      color: `color-mix(in oklch, ${e.color} 70%, white)`,
                    }}
                  >
                    {e.title}
                  </button>
                ))}
                {showNow && (
                  <div className="absolute inset-x-0 z-10 flex items-center" style={{ top: ((nowMin - DAY_START * 60) / 60) * HOUR_H }}>
                    <span className="h-2 w-2 -translate-x-1 rounded-full bg-primary-bright shadow-[0_0_8px_var(--primary)]" />
                    <span className="h-px flex-1 bg-primary-bright/70" />
                  </div>
                )}
                {dayEvents.map((e) => {
                  const top = Math.max(0, ((e.start - DAY_START * 60) / 60) * HOUR_H);
                  const height = Math.max(22, ((e.end - e.start) / 60) * HOUR_H - 2);
                  return (
                    <motion.button
                      key={e.id + key}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => onEdit(e)}
                      className="absolute inset-x-1 z-[5] overflow-hidden rounded-lg border px-2 py-1 text-left backdrop-blur-sm transition-shadow hover:shadow-[0_4px_18px_-4px_rgba(0,0,0,0.6)]"
                      style={{
                        top,
                        height,
                        background: `color-mix(in oklch, ${e.color} 15%, oklch(0.14 0 0 / 0.7))`,
                        borderColor: `color-mix(in oklch, ${e.color} 40%, transparent)`,
                      }}
                    >
                      <p className="truncate text-[12px] font-semibold leading-tight"
                        style={{ color: `color-mix(in oklch, ${e.color} 70%, white)` }}>
                        {e.title}
                      </p>
                      {height > 34 && (
                        <p className="num text-[10px] text-muted">
                          {minutesToLabel(e.start)}–{minutesToLabel(e.end)}
                        </p>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="border-t border-white/[0.06] px-4 py-2 text-[11px] text-faint">Double-click a slot to create an event</p>
    </div>
  );
}

/* ---------------- agenda ---------------- */

function AgendaView({ cal, cursor, onEdit }: { cal: Cal; cursor: Date; onEdit: (e: CalEvent) => void }) {
  const t = useT();
  const lang = useLang();
  const daysAhead = Array.from({ length: 14 }, (_, i) => addDays(cursor, i));
  const groups = daysAhead
    .map((d) => ({
      day: d,
      items: cal.events.filter((e) => occursOnDay(e, dayKey(d))).sort((a, b) => a.start - b.start),
    }))
    .filter((g) => g.items.length > 0);

  if (groups.length === 0)
    return (
      <div className="panel">
        <EmptyState icon={<CalendarDays size={20} />} title={t("cal.nothing")} hint={t("cal.nothingHint")} />
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g, gi) => (
        <motion.section
          key={dayKey(g.day)}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: gi * 0.04, type: "spring", stiffness: 300, damping: 28 }}
        >
          <h3 className={`mb-2 text-sm font-semibold ${isSameDay(g.day, new Date()) ? "text-accent" : ""}`}>
            {friendlyDay(dayKey(g.day))}
            <span className="ml-2 text-xs font-normal text-faint">{format(g.day, lang === "de" ? "d. MMM" : "MMM d", { locale: dfLocale(lang) })}</span>
          </h3>
          <div className="panel divide-y divide-white/[0.05] overflow-hidden">
            {g.items.map((e) => (
              <button
                key={e.id + dayKey(g.day)}
                onClick={() => onEdit(e)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
              >
                <span className="num w-20 shrink-0 text-sm text-muted">
                  {e.allDay ? t("cal.allDay") : <>{minutesToLabel(e.start)}<span className="text-faint"> – {minutesToLabel(e.end)}</span></>}
                </span>
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: e.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{e.title}</span>
                  <span className="mt-0.5 flex items-center gap-3 text-xs text-faint">
                    {e.location && <span className="flex items-center gap-1"><MapPin size={11} /> {e.location}</span>}
                    {e.attendees && e.attendees.length > 0 && (
                      <span className="flex items-center gap-1"><Users size={11} /> {e.attendees.length}</span>
                    )}
                  </span>
                </span>
                {e.recurring && (
                  <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-faint">repeats</span>
                )}
                {e.source === "google" && (
                  <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-faint">Google</span>
                )}
              </button>
            ))}
          </div>
        </motion.section>
      ))}
    </div>
  );
}

/* ---------------- editor ---------------- */

const COLORS: CategoryColor[] = ["ember", "amber", "sage", "sky", "lilac", "rose"];

function EventEditor({
  cal, open, event, defaults, onClose,
}: {
  cal: Cal;
  open: boolean;
  event?: CalEvent;
  defaults?: { date: string; start: number };
  onClose: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayKey());
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [color, setColor] = useState<CategoryColor>("sky");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [location, setLocation] = useState("");
  const [reminder, setReminder] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState("local");
  const [saving, setSaving] = useState(false);
  const [inited, setInited] = useState<string | null>(null);

  const isGoogle = event?.source === "google";

  const initKey = open ? (event?.id ?? `new-${defaults?.date}-${defaults?.start}`) : null;
  if (initKey !== inited) {
    setInited(initKey);
    if (initKey) {
      setTitle(event?.title ?? "");
      setDate(event?.date ?? defaults?.date ?? todayKey());
      setStart(minutesToLabel(event?.start ?? defaults?.start ?? 9 * 60));
      setEnd(minutesToLabel(event?.end ?? (defaults?.start ?? 9 * 60) + 60));
      setColor("sky");
      setRecurrence(event?.recurring ? (event.recurrenceKind ?? "weekly") : "none");
      setLocation(event?.location ?? "");
      setReminder(event?.reminder ?? null);
      setNotes(event?.notes ?? "");
      setTarget(
        event ? (event.source === "google" ? event.calendarId! : "local")
          : cal.connected ? (cal.calendars.find((c) => c.primary)?.id ?? "local") : "local",
      );
      setSaving(false);
    }
  }

  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const base: CalendarInput = {
      title: title.trim(),
      date,
      start: toMin(start),
      end: Math.max(toMin(start) + 15, toMin(end)),
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      recurrence,
      localColor: color,
      calendarId: target,
      reminder,
    };
    try {
      if (event) {
        await cal.update(event, base);
        toast(`Event updated${isGoogle ? " · synced" : ""}`);
      } else {
        await cal.create(base);
        toast(`Event created${target !== "local" ? " · synced to Google" : ""}`);
      }
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("cal.saveFailed"), "error");
    }
    setSaving(false);
  };

  const remove = async () => {
    if (!event || saving) return;
    setSaving(true);
    try {
      await cal.remove(event);
      toast(t("cal.deleted"), "info");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("cal.deleteFailed"), "error");
    }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={event ? t("cal.edit") : t("cal.new")}>
      <div className="flex flex-col gap-4">
        <label>
          <Label>{t("cal.fTitle")}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("cal.fTitlePh")} autoFocus />
        </label>

        {!event && cal.connected && (
          <label>
            <Label>{t("cal.fCalendar")}</Label>
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              {cal.calendars.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.primary ? " (Google primary)" : ""}</option>
              ))}
              <option value="local">{t("cal.deviceOnly")}</option>
            </Select>
          </label>
        )}

        <div className="grid grid-cols-3 gap-3">
          <label className="col-span-3 sm:col-span-1">
            <Label>{t("cal.fDate")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            <Label>{t("cal.fStart")}</Label>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            <Label>{t("cal.fEnd")}</Label>
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {!isGoogle && target === "local" ? (
            <div>
              <Label>{t("cal.fColor")}</Label>
              <div className="flex h-10 items-center gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={c}
                    aria-pressed={color === c}
                    className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-white/70 ring-offset-2 ring-offset-[#1c1a19]" : ""}`}
                    style={{ background: CATEGORY_VAR[c] }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div>
              <Label>{t("cal.fColor")}</Label>
              <div className="flex h-10 items-center gap-2 text-[13px] text-muted">
                <span className="h-4 w-4 rounded-full" style={{ background: event?.color ?? cal.calendars.find((c) => c.id === target)?.color }} />
                Calendar color
              </div>
            </div>
          )}
          {(!isGoogle || !event?.recurring) && !event?.recurring ? (
            <label>
              <Label>{t("cal.fRepeats")}</Label>
              <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)} disabled={!!event && isGoogle}>
                <option value="none">{t("cal.never")}</option>
                <option value="daily">{t("cal.daily")}</option>
                <option value="weekly">{t("cal.weekly")}</option>
              </Select>
            </label>
          ) : (
            <div>
              <Label>{t("cal.fRepeats")}</Label>
              <p className="flex h-10 items-center text-[13px] text-muted">{isGoogle ? t("cal.recurringSeriesGoogle") : t("cal.recurringSeries")}</p>
            </div>
          )}
        </div>

        <label>
          <Label>{t("cal.fLocation")}</Label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("cal.optional")} />
        </label>
        {!isGoogle && (
          <label>
            <Label>{t("cal.fReminder")}</Label>
            <Select
              value={reminder === null ? "none" : String(reminder)}
              onChange={(e) => setReminder(e.target.value === "none" ? null : Number(e.target.value))}
            >
              <option value="none">{t("reminder.none")}</option>
              {REMINDER_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{t(reminderKey(r.value))}</option>
              ))}
            </Select>
          </label>
        )}
        <label>
          <Label>{t("cal.fNotes")}</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t("cal.optional")} />
        </label>

        {isGoogle && event?.attendees && event.attendees.length > 0 && (
          <div>
            <Label>{t("cal.attendees")}</Label>
            <ul className="flex flex-col gap-1.5">
              {event.attendees.slice(0, 6).map((a) => (
                <li key={a.email} className="flex items-center gap-2 text-[13px]">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    a.status === "accepted" ? "bg-success" : a.status === "declined" ? "bg-danger" : "bg-faint"
                  }`} />
                  <span className="truncate text-muted">{a.name || a.email}</span>
                  <span className="ml-auto shrink-0 text-[11px] capitalize text-faint">{a.status === "needsAction" ? "pending" : a.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          {event ? (
            <Button variant="danger" size="sm" onClick={remove} disabled={saving}>
              <Trash2 size={14} /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>{t("action.cancel")}</Button>
            <Button variant="primary" onClick={save} disabled={!title.trim() || saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {event ? t("tasks.save") : t("cal.create")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
