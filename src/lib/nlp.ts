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

/**
 * Parses quick-entry phrases like:
 *   "Dentist tomorrow 14:30"  ·  "Lunch with Max friday 12pm"
 *   "Zahnarzt morgen 14:30"   ·  "Gym monday 7am 90min"
 */
export function parseQuickEvent(input: string): ParsedEvent | null {
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

  if (!matchedDate && !matchedTime) return null;

  const title = text.replace(/\s+/g, " ").trim().replace(/^(at|um)\s/i, "");
  if (!title) return null;

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    date: dayKey(date),
    start,
    end: Math.min(start + duration, 24 * 60),
  };
}
