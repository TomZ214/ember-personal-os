export type TaskStatus = "backlog" | "todo" | "doing" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";
export type CategoryColor = "ember" | "amber" | "sage" | "sky" | "lilac" | "rose";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

/** how often a task comes back after it is completed */
export type TaskRecurrence = "none" | "daily" | "weekly" | "monthly";

export const TASK_RECURRENCE_META: Record<TaskRecurrence, { label: string; short: string }> = {
  none: { label: "Does not repeat", short: "Once" },
  daily: { label: "Every day", short: "Daily" },
  weekly: { label: "Every week", short: "Weekly" },
  monthly: { label: "Every month", short: "Monthly" },
};

export interface Task {
  id: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: Priority;
  due?: string; // yyyy-MM-dd
  tags: string[];
  subtasks: Subtask[];
  createdAt: string;
  completedAt?: string;
  order: number;
  /** when set, completing the task schedules the next occurrence */
  recurrence?: TaskRecurrence;
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

export interface Contact {
  id: string;
  name: string;
  group: "friends" | "family" | "work";
  email?: string;
  phone?: string;
  birthday?: string; // yyyy-MM-dd
  notes?: string;
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
  /** ping ~30 minutes before a calendar event starts */
  eventReminders: boolean;
}

export interface Settings {
  userName: string;
  focusMinutes: number;
  breakMinutes: number;
  latitude: number;
  longitude: number;
  place: string;
  budgets?: Budgets;
  notifications?: NotificationSettings;
}

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  digest: true,
  digestHour: 8,
  eventReminders: true,
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
