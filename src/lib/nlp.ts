import { addDays, startOfDay } from "date-fns";
import { dayKey } from "./dates";

export interface ParsedEvent {
  title: string;
  date: string;
  start: number;
  end: number;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
};

export interface ParsedTask {
  title: string;
  /** yyyy-MM-dd, absent when the phrase carried no date */
  due?: string;
  /** HH:mm, absent when the phrase carried no time */
  time?: string;
}

interface When {
  title: string;
  date: Date;
  start: number;
  duration: number;
  matchedDate: boolean;
  matchedTime: boolean;
}

/**
 * Pulls a date, a time and a duration out of a phrase and hands back what is
 * left as the title. Shared by the event and task parsers so "friday" means
 * the same thing in both — a task quick-add that understood fewer date words
 * than the event one would be its own kind of bug.
 */
function parseWhen(input: string): When | null {
  let text = ` ${input.trim()} `;
  if (text.trim().length < 2) return null;

  let date = startOfDay(new Date());
  let matchedDate = false;

  const consume = (re: RegExp, apply: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (m) {
      apply(m);
      text = text.replace(re, " ");
      return true;
    }
    return false;
  };

  matchedDate = consume(/\s(today|heute)\s/i, () => { date = startOfDay(new Date()); }) || matchedDate;
  matchedDate = consume(/\s(tomorrow|morgen)\s/i, () => { date = addDays(startOfDay(new Date()), 1); }) || matchedDate;
  matchedDate = consume(/\s(übermorgen)\s/i, () => { date = addDays(startOfDay(new Date()), 2); }) || matchedDate;

  if (!matchedDate) {
    const names = Object.keys(WEEKDAYS).join("|");
    matchedDate = consume(new RegExp(`\\s(${names})\\s`, "i"), (m) => {
      const target = WEEKDAYS[m[1].toLowerCase()];
      let d = addDays(startOfDay(new Date()), 1);
      while (d.getDay() !== target) d = addDays(d, 1);
      date = d;
    });
  }

  // explicit date 24.12. / 24.12.2026 / 12/24
  if (!matchedDate) {
    matchedDate = consume(/\s(\d{1,2})\.(\d{1,2})\.?(\d{4})?\s/, (m) => {
      const now = new Date();
      const year = m[3] ? parseInt(m[3]) : now.getFullYear();
      const d = new Date(year, parseInt(m[2]) - 1, parseInt(m[1]));
      if (!m[3] && d < startOfDay(now)) d.setFullYear(year + 1);
      date = d;
    });
  }

  // duration ("90min", "2h")
  let duration = 60;
  consume(/\s(\d{1,3})\s?min(uten)?\s/i, (m) => { duration = parseInt(m[1]); });
  consume(/\s(\d{1,2})\s?h(ours?|rs?)?\s/i, (m) => { duration = parseInt(m[1]) * 60; });

  // time: "14:30", "14.30 uhr", "2pm", "2:30pm", "at 9"
  let start = 9 * 60;
  let matchedTime = false;
  matchedTime = consume(/\s(\d{1,2})[:.](\d{2})\s?(am|pm|uhr)?\s/i, (m) => {
    let h = parseInt(m[1]);
    const ap = m[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    start = h * 60 + parseInt(m[2]);
  }) || matchedTime;
  if (!matchedTime) {
    matchedTime = consume(/\s(\d{1,2})\s?(am|pm|uhr)\s/i, (m) => {
      let h = parseInt(m[1]);
      const ap = m[2].toLowerCase();
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      start = h * 60;
    }) || matchedTime;
  }
  if (!matchedTime) {
    matchedTime = consume(/\s(?:at|um)\s(\d{1,2})\s/i, (m) => { start = parseInt(m[1]) * 60; }) || matchedTime;
  }

  const title = text.replace(/\s+/g, " ").trim().replace(/^(at|um)\s/i, "");
  if (!title) return null;

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    date,
    start,
    duration,
    matchedDate,
    matchedTime,
  };
}

/**
 * Parses quick-entry phrases like:
 *   "Dentist tomorrow 14:30"  ·  "Lunch with Max friday 12pm"
 *   "Zahnarzt morgen 14:30"   ·  "Gym monday 7am 90min"
 *
 * Returns null without a date or a time, because an event with neither is
 * just a task.
 */
export function parseQuickEvent(input: string): ParsedEvent | null {
  const w = parseWhen(input);
  if (!w) return null;
  if (!w.matchedDate && !w.matchedTime) return null;

  return {
    title: w.title,
    date: dayKey(w.date),
    start: w.start,
    end: Math.min(w.start + w.duration, 24 * 60),
  };
}

/**
 * The same phrase understanding, for tasks. "Pay rent friday" becomes a task
 * called "Pay rent" that is due on Friday, rather than a task literally named
 * "Pay rent friday" with no due date — which is what typing it used to do.
 *
 * Unlike an event, a task is perfectly valid with no date at all, so this
 * never returns null for a dateless phrase; it just hands back the title.
 * A bare time with no day means today, the way a person means it.
 */
export function parseQuickTask(input: string): ParsedTask | null {
  const w = parseWhen(input);
  if (!w) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    title: w.title,
    due: w.matchedDate || w.matchedTime ? dayKey(w.date) : undefined,
    time: w.matchedTime ? `${pad(Math.floor(w.start / 60))}:${pad(w.start % 60)}` : undefined,
  };
}
