import type { EventItem, NotificationSettings, Task } from "@/lib/types";

/**
 * Pure decision core for the push cron — kept separate so its timing math is
 * unit-testable without a live Supabase or a real push endpoint.
 *
 * All times are wall-clock in the user's timezone, expressed as a "scalar":
 * dayNumber * 1440 + minutesSinceMidnight. Differences of scalars equal
 * wall-clock minute differences (barring the rare DST hour), which lets a
 * "1 day before" reminder cross a date boundary cleanly.
 */

export const ALLDAY_MIN = 9 * 60; // all-day items anchor to 09:00 local
export const GRACE_MIN = 15;      // still fire up to 15 min past the due moment

export interface PushPlanItem {
  key: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

export function dayNumber(dateStr: string): number {
  return Math.floor(Date.parse(`${dateStr}T00:00:00Z`) / 86_400_000);
}

export function parseHM(hm?: string | null): number | null {
  if (!hm) return null;
  const [h, m] = hm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** fire if now is at/after the reminder moment and not past the grace window */
export function shouldFire(nowScalar: number, dueScalar: number, offsetMin: number): boolean {
  const fire = dueScalar - offsetMin;
  return nowScalar >= fire && nowScalar <= dueScalar + GRACE_MIN;
}

export function fmtOffset(min: number): string {
  if (min <= 0) return "now";
  if (min < 60) return `in ${min} min`;
  if (min < 1440) return `in ${Math.round(min / 60)} h`;
  return `in ${Math.round(min / 1440)} d`;
}

function occursOn(ev: EventItem, key: string): boolean {
  if (ev.date === key) return true;
  if (ev.recurrence === "none") return false;
  const first = new Date(`${ev.date}T00:00:00Z`);
  const day = new Date(`${key}T00:00:00Z`);
  if (day < first) return false;
  if (ev.recurrence === "daily") return true;
  return first.getUTCDay() === day.getUTCDay();
}

export interface NowInfo {
  date: string;     // yyyy-MM-dd in the user's tz
  minutes: number;  // minutes since midnight in the user's tz
  scalar: number;   // dayNumber(date) * 1440 + minutes
}

/** everything this user should be notified about on this run */
export function planNotifications(
  state: { tasks?: Task[]; events?: EventItem[] },
  prefs: NotificationSettings,
  now: NowInfo,
): PushPlanItem[] {
  const out: PushPlanItem[] = [];
  const openTasks = (state.tasks ?? []).filter((t) => t.status !== "done" && t.due);

  // daily digest — only if there's actually something to report
  if (prefs.digest && Math.floor(now.minutes / 60) === prefs.digestHour) {
    const overdue = openTasks.filter((t) => t.due! < now.date).length;
    const dueToday = openTasks.filter((t) => t.due === now.date).length;
    if (overdue + dueToday > 0) {
      const bits = [
        overdue > 0 ? `${overdue} overdue` : null,
        dueToday > 0 ? `${dueToday} due today` : null,
      ].filter(Boolean);
      out.push({
        key: `digest-${now.date}`,
        title: overdue > 0 ? "⚠️ Ember — today's plan" : "🔥 Ember — today's plan",
        body: `You have ${bits.join(" and ")}.`,
        url: "/tasks",
        tag: "ember-digest",
      });
    }
  }

  // per-task reminders — honor each task's own offset
  if (prefs.taskReminders) {
    for (const t of openTasks) {
      if (t.reminder === null || t.reminder === undefined) continue;
      const dueMin = parseHM(t.time) ?? ALLDAY_MIN;
      const dueScalar = dayNumber(t.due!) * 1440 + dueMin;
      if (!shouldFire(now.scalar, dueScalar, t.reminder)) continue;
      const when = t.time ? `at ${t.time}` : "today";
      out.push({
        key: `taskrem-${t.id}-${t.due}`,
        title: "✅ Task reminder",
        body: t.reminder > 0 ? `${t.title} — due ${when} (${fmtOffset(t.reminder)})` : `${t.title} — due ${when}`,
        url: "/tasks",
        tag: `ember-task-${t.id}`,
      });
    }
  }

  // per-event reminders — default 30 min when the event didn't set one
  if (prefs.eventReminders) {
    for (const ev of state.events ?? []) {
      if (!occursOn(ev, now.date)) continue;
      const offset = ev.reminder ?? 30;
      const dueScalar = dayNumber(now.date) * 1440 + ev.start;
      if (!shouldFire(now.scalar, dueScalar, offset)) continue;
      out.push({
        key: `evtrem-${ev.id}-${now.date}`,
        title: "📅 Starting soon",
        body: `${ev.title} ${fmtOffset(Math.max(0, dueScalar - now.scalar))}${ev.location ? ` · ${ev.location}` : ""}.`,
        url: "/calendar",
        tag: `ember-event-${ev.id}`,
      });
    }
  }

  return out;
}
