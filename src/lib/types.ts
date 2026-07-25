export type TaskStatus = "backlog" | "todo" | "doing" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";
export type CategoryColor = "ember" | "amber" | "sage" | "sky" | "lilac" | "rose";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

/** legacy simple repeat — kept so old tasks and the family inbox still work */
export type TaskRecurrence = "none" | "daily" | "weekly" | "monthly";

export const TASK_RECURRENCE_META: Record<TaskRecurrence, { label: string; short: string }> = {
  none: { label: "Does not repeat", short: "Once" },
  daily: { label: "Every day", short: "Daily" },
  weekly: { label: "Every week", short: "Weekly" },
  monthly: { label: "Every month", short: "Monthly" },
};

/* ---------------- advanced scheduling ---------------- */

export type RepeatFreq =
  | "none" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "weekdays" | "weekends";

/** monthly can repeat on a day-of-month or on an nth weekday (e.g. last Friday) */
export type MonthlyMode =
  | { mode: "day" }                                   // same day number each month
  | { mode: "weekday"; nth: number; weekday: number }; // nth 1..4 or -1 = last; weekday 0=Sun..6=Sat

export type RepeatEnd =
  | { kind: "forever" }
  | { kind: "until"; date: string } // yyyy-MM-dd, inclusive
  | { kind: "count"; count: number }; // total occurrences remaining, including the current one

/** a full recurrence rule — the professional scheduler */
export interface RepeatRule {
  freq: RepeatFreq;
  interval: number;      // every N units (>= 1)
  weekdays?: number[];   // weekly: which days repeat (0=Sun..6=Sat)
  monthly?: MonthlyMode; // monthly: how the day is chosen
  end?: RepeatEnd;       // absent = forever
}

/** minutes before the due time; 0 = at due time. undefined/null = no reminder */
export const REMINDER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "At due time" },
  { value: 5, label: "5 minutes before" },
  { value: 10, label: "10 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 1440, label: "1 day before" },
];

export interface Task {
  id: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: Priority;
  due?: string; // yyyy-MM-dd
  time?: string; // HH:mm — the due time; when absent the task is all-day
  tags: string[];
  subtasks: Subtask[];
  createdAt: string;
  completedAt?: string;
  updatedAt?: string;
  order: number;
  /** legacy field — still honored when `repeat` is absent */
  recurrence?: TaskRecurrence;
  /** the advanced rule; completing the task schedules the next occurrence */
  repeat?: RepeatRule;
  /** minutes before the due time to send a reminder push */
  reminder?: number | null;
  /** links a family-submitted task to its shared_tasks row, so the sender can
   *  see whether it's done — set when the family inbox is drained */
  sharedId?: string;
}

export type Recurrence = "none" | "daily" | "weekly";

export interface EventItem {
  id: string;
  title: string;
  date: string; // yyyy-MM-dd (first occurrence)
  start: number; // minutes from midnight
  end: number;
  color: CategoryColor;
  recurrence: Recurrence;
  location?: string;
  notes?: string;
  /** minutes before start to send a reminder push */
  reminder?: number | null;
}

export interface Folder {
  id: string;
  name: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  folderId: string;
  pinned: boolean;
  updatedAt: string;
}

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: CategoryColor;
  /** target check-ins per week (7 = daily) */
  target: number;
  log: Record<string, true>; // yyyy-MM-dd -> done
  createdAt: string;
}

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
}

export interface Goal {
  id: string;
  title: string;
  why: string;
  deadline?: string;
  color: CategoryColor;
  milestones: Milestone[];
}

export type TxnKind = "income" | "expense";

export interface Txn {
  id: string;
  kind: TxnKind;
  amount: number; // positive, EUR
  category: string;
  date: string; // yyyy-MM-dd
  note: string;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number; // per cycle
  cycle: "monthly" | "yearly";
  color: CategoryColor;
}

export type MailFolder = "inbox" | "sent" | "drafts" | "archive";
export type MailLabel = "personal" | "work" | "updates" | "finance";

export interface Mail {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  body: string;
  date: string; // ISO datetime
  read: boolean;
  starred: boolean;
  label: MailLabel;
  folder: MailFolder;
  attachments?: { name: string; size: string }[];
}

export interface FileMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt: string;
}

export interface VaultEntry {
  id: string;
  title: string;
  category: "logins" | "cards" | "notes";
  username: string;
  secret: string; // only ever held decrypted in memory
  url?: string;
}

/** monthly spending limits, keyed by the category names the bank data uses */
export type Budgets = Record<string, number>;

export interface NotificationSettings {
  /** daily summary of what's due, sent at this local hour (0-23) */
  digest: boolean;
  digestHour: number;
  /** ping before a calendar event starts, per each event's reminder */
  eventReminders: boolean;
  /** ping before a task's due time, per each task's reminder */
  taskReminders: boolean;
}

export interface Briefing {
  /** yyyy-MM-dd it was written for — one per day, regenerated on demand */
  date: string;
  text: string;
  createdAt: string;
}

export interface Alarm {
  id: string;
  /** HH:mm, 24-hour */
  time: string;
  label: string;
  enabled: boolean;
  /** weekdays it repeats on, 0=Sun..6=Sat. Empty = one-shot. */
  days: number[];
  /** yyyy-MM-dd it last rang, so a given day can only fire it once */
  lastFired?: string;
}

export type Language = "en" | "de";

/** Brand gradient themes. `sunset` is the original ember look and the default. */
/**
 * Accent — hue only. Adding one here plus a `[data-accent="…"]` block in
 * globals.css is the whole job; it works in every appearance automatically,
 * because no appearance names a colour.
 *
 * Still called `theme` in Settings for backwards compatibility with saved
 * data and with everything already synced to other devices.
 */
export type Theme = "sunset" | "tide" | "crimson" | "orchid";

export const THEMES: { id: Theme; from: string; to: string }[] = [
  { id: "sunset", from: "#ffd59e", to: "#ff6b9d" },
  { id: "tide", from: "#2c3e50", to: "#4ca1af" },
  { id: "crimson", from: "#95122c", to: "#100c08" },
  { id: "orchid", from: "#ff0080", to: "#00e5ff" },
];

/** Appearance — material only. Orthogonal to accent by construction. */
export type Appearance = "ember" | "tahoe" | "minimal" | "midnight" | "vision";

export const APPEARANCES: { id: Appearance; blur: number; radius: number; tint: number }[] = [
  // the numbers here are only for the settings preview tile — the real values
  // live in CSS, and this list must never become a second source of truth
  { id: "ember", blur: 18, radius: 18, tint: 0.028 },
  { id: "tahoe", blur: 30, radius: 28, tint: 0.055 },
  { id: "minimal", blur: 6, radius: 12, tint: 0.04 },
  { id: "midnight", blur: 22, radius: 16, tint: 0.015 },
  { id: "vision", blur: 40, radius: 32, tint: 0.07 },
];

export interface Settings {
  userName: string;
  focusMinutes: number;
  breakMinutes: number;
  latitude: number;
  longitude: number;
  place: string;
  budgets?: Budgets;
  notifications?: NotificationSettings;
  /** UI language — English or German */
  language?: Language;
  /** Brand gradient / colour theme */
  theme?: Theme;
  /** UI sound effects */
  sound?: boolean;
  /** 0..1 master volume for UI sounds */
  soundVolume?: number;
  /** Visual style — material, depth and radius. Independent of `theme`. */
  appearance?: Appearance;
  /**
   * Liquid Glass: translucent layered surfaces, cursor lighting, refraction,
   * magnetic controls. Off falls back to opaque surfaces — same layout, same
   * features, none of the per-frame work.
   */
  liquidGlass?: boolean;
  /** Advanced appearance dials, each independently switchable. */
  cursorLighting?: boolean;
  glassReflections?: boolean;
  ambientParticles?: boolean;
  /** 0..1 multipliers over whatever the appearance sets. */
  transparencyStrength?: number;
  blurStrength?: number;
  /**
   * Trims the expensive half of the effects (blur radius, reflections,
   * particle count, cursor lighting) without going fully solid. For weaker
   * hardware and battery.
   */
  reducedEffects?: boolean;
}

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  digest: true,
  digestHour: 8,
  eventReminders: true,
  taskReminders: true,
};

export const CATEGORY_VAR: Record<CategoryColor, string> = {
  ember: "var(--c-ember)",
  amber: "var(--c-amber)",
  sage: "var(--c-sage)",
  sky: "var(--c-sky)",
  lilac: "var(--c-lilac)",
  rose: "var(--c-rose)",
};

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  low: { label: "Low", color: "var(--muted)" },
  medium: { label: "Medium", color: "var(--c-sky)" },
  high: { label: "High", color: "var(--c-amber)" },
  urgent: { label: "Urgent", color: "var(--c-ember)" },
};
