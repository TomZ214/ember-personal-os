import {
  addDays, addHours, addMonths, addYears, format, getDaysInMonth, isValid, parse,
} from "date-fns";
import type { RepeatFreq, RepeatRule, Task, TaskRecurrence } from "./types";

/**
 * The scheduling engine. Pure and dependency-light so it runs identically in
 * the browser (spawning the next task on completion) and on the server (the
 * push cron working out what is due). date-fns is server-safe.
 *
 * A due datetime is (yyyy-MM-dd date, optional HH:mm time). All math is done in
 * floating local time — the cron compares against the user's timezone clock.
 */

const WEEKDAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINAL = ["", "first", "second", "third", "fourth"];

export const REPEAT_FREQ_LABEL: Record<RepeatFreq, string> = {
  none: "Never",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  weekdays: "Every weekday",
  weekends: "Every weekend",
};

export function defaultRule(): RepeatRule {
  return { freq: "none", interval: 1, end: { kind: "forever" } };
}

/** normalize a task's repeat config: prefer the rich rule, fall back to legacy */
export function ruleForTask(task: Pick<Task, "repeat" | "recurrence" | "due">): RepeatRule {
  if (task.repeat && task.repeat.freq !== "none") return withDefaults(task.repeat);
  const legacy = task.recurrence;
  if (legacy && legacy !== "none") return { freq: legacy, interval: 1, end: { kind: "forever" } };
  return defaultRule();
}

function withDefaults(rule: RepeatRule): RepeatRule {
  return { end: { kind: "forever" }, ...rule, interval: Math.max(1, rule.interval || 1) };
}

export function repeats(rule: RepeatRule | undefined): boolean {
  return !!rule && rule.freq !== "none";
}

function parseDate(dateStr: string, time?: string): Date {
  const d = parse(`${dateStr} ${time ?? "00:00"}`, "yyyy-MM-dd HH:mm", new Date());
  return isValid(d) ? d : new Date();
}

/** nth weekday (1..4) or last (-1) of the month containing `ref` */
function nthWeekdayOfMonth(ref: Date, nth: number, weekday: number): Date {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  if (nth === -1) {
    // walk back from the last day until the weekday matches
    let day = getDaysInMonth(new Date(year, month, 1));
    while (new Date(year, month, day).getDay() !== weekday) day--;
    return new Date(year, month, day);
  }
  let day = 1;
  while (new Date(year, month, day).getDay() !== weekday) day++;
  day += (nth - 1) * 7;
  return new Date(year, month, day);
}

/**
 * The next due datetime strictly after `from`, honoring the rule's cadence.
 * Returns null when the rule has run out (count exhausted / past until date).
 */
export function nextOccurrence(rule: RepeatRule, fromDate: string, fromTime?: string): { date: string; time?: string } | null {
  const r = withDefaults(rule);
  if (r.freq === "none") return null;

  const from = parseDate(fromDate, fromTime);
  let next: Date;

  switch (r.freq) {
    case "hourly":
      next = addHours(from, r.interval);
      break;

    case "daily":
      next = addDays(from, r.interval);
      break;

    case "weekdays":
      next = addDays(from, 1);
      while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1);
      break;

    case "weekends":
      next = addDays(from, 1);
      while (next.getDay() !== 0 && next.getDay() !== 6) next = addDays(next, 1);
      break;

    case "weekly": {
      const days = (r.weekdays && r.weekdays.length ? r.weekdays : [from.getDay()]).slice().sort((a, b) => a - b);
      // try later this week first
      let cursor = addDays(from, 1);
      const startWeekday = from.getDay();
      const laterThisWeek = days.find((d) => d > startWeekday);
      if (laterThisWeek !== undefined) {
        next = addDays(from, laterThisWeek - startWeekday);
      } else {
        // jump interval weeks ahead, then to the first selected weekday
        cursor = addDays(from, 7 * r.interval - startWeekday); // start of that week (Sunday)
        next = addDays(cursor, days[0]);
      }
      break;
    }

    case "monthly": {
      const m = r.monthly ?? { mode: "day" as const };
      if (m.mode === "weekday") {
        const target = addMonths(from, r.interval);
        next = nthWeekdayOfMonth(target, m.nth, m.weekday);
      } else {
        const target = addMonths(from, r.interval);
        const dom = Math.min(from.getDate(), getDaysInMonth(target));
        next = new Date(target.getFullYear(), target.getMonth(), dom);
      }
      break;
    }

    case "yearly":
      next = addYears(from, r.interval);
      break;

    default:
      return null;
  }

  // preserve the time of day (except hourly, which already advanced it)
  if (fromTime && r.freq !== "hourly") {
    const [h, mi] = fromTime.split(":").map(Number);
    next.setHours(h, mi, 0, 0);
  }

  // end conditions
  if (r.end?.kind === "until") {
    const untilEnd = parseDate(r.end.date, "23:59");
    if (next > untilEnd) return null;
  }

  return {
    date: format(next, "yyyy-MM-dd"),
    time: fromTime && r.freq !== "hourly" ? fromTime : r.freq === "hourly" ? format(next, "HH:mm") : undefined,
  };
}

/** step the end condition forward as one occurrence is consumed */
export function advanceEnd(rule: RepeatRule): RepeatRule {
  if (rule.end?.kind === "count") {
    const left = rule.end.count - 1;
    return { ...rule, end: { kind: "count", count: left } };
  }
  return rule;
}

/** has the rule reached its limit and should not spawn again? */
export function ruleExhausted(rule: RepeatRule): boolean {
  return rule.end?.kind === "count" && rule.end.count <= 1;
}

/** short label for a task card badge */
export function repeatShort(rule: RepeatRule): string {
  const r = withDefaults(rule);
  const n = r.interval;
  switch (r.freq) {
    case "none": return "Once";
    case "hourly": return n === 1 ? "Hourly" : `Every ${n}h`;
    case "daily": return n === 1 ? "Daily" : `Every ${n}d`;
    case "weekdays": return "Weekdays";
    case "weekends": return "Weekends";
    case "weekly": return n === 1 ? "Weekly" : `Every ${n}w`;
    case "monthly": return n === 1 ? "Monthly" : `Every ${n}mo`;
    case "yearly": return n === 1 ? "Yearly" : `Every ${n}y`;
  }
}

/** full human sentence for the editor and details view */
export function describeRepeat(rule: RepeatRule): string {
  const r = withDefaults(rule);
  const n = r.interval;
  let base: string;
  switch (r.freq) {
    case "none": return "Does not repeat";
    case "hourly": base = n === 1 ? "Every hour" : `Every ${n} hours`; break;
    case "daily": base = n === 1 ? "Every day" : `Every ${n} days`; break;
    case "weekdays": base = "Every weekday (Mon–Fri)"; break;
    case "weekends": base = "Every weekend (Sat & Sun)"; break;
    case "weekly": {
      const which = r.weekdays && r.weekdays.length
        ? " on " + r.weekdays.slice().sort((a, b) => a - b).map((d) => WEEKDAY_LABEL[d]).join(", ")
        : "";
      base = (n === 1 ? "Every week" : `Every ${n} weeks`) + which;
      break;
    }
    case "monthly": {
      const m = r.monthly ?? { mode: "day" as const };
      const every = n === 1 ? "Every month" : `Every ${n} months`;
      base = m.mode === "weekday"
        ? `${every} on the ${m.nth === -1 ? "last" : ORDINAL[m.nth]} ${WEEKDAY_LONG[m.weekday]}`
        : every;
      break;
    }
    case "yearly": base = n === 1 ? "Every year" : `Every ${n} years`; break;
  }
  if (r.end?.kind === "until") base += `, until ${r.end.date}`;
  if (r.end?.kind === "count") base += `, ${r.end.count} times`;
  return base;
}

/** re-express a legacy string as a rule (for migrating old data) */
export function ruleFromLegacy(legacy: TaskRecurrence | undefined): RepeatRule {
  if (!legacy || legacy === "none") return defaultRule();
  return { freq: legacy, interval: 1, end: { kind: "forever" } };
}
