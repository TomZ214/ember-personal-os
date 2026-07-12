import { format, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";

export const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
export const todayKey = () => dayKey(new Date());

export function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function friendlyDay(key: string): string {
  const d = parseISO(key);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, MMM d");
}

export function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name}`;
}

export const eur = (n: number) =>
  new Intl.NumberFormat("en-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);

/** does a (possibly recurring) event occur on the given day? */
export function occursOn(ev: { date: string; recurrence: string }, key: string): boolean {
  if (ev.date === key) return true;
  if (ev.recurrence === "none") return false;
  const first = parseISO(ev.date);
  const day = parseISO(key);
  if (day < first) return false;
  if (ev.recurrence === "daily") return true;
  return first.getDay() === day.getDay(); // weekly
}
