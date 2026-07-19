/**
 * v2 migration: Ember no longer ships demo data. This one-time pass removes
 * the exact items the old seed created (matched by their fixed signatures)
 * while leaving everything the user created or edited untouched.
 */

import type {
  EventItem, Folder, Goal, Habit, Mail, Note, Subscription, Task, Txn,
} from "./types";

const SEED_TASKS = new Set([
  "Renew passport", "Draft Q3 portfolio review", "Book flights for Lisbon trip",
  "Fix squeaky bike brake", "Prepare tax documents", "Read 'The Design of Everyday Things'",
  "Plan mum's birthday dinner", "Migrate blog to new host", "Weekly grocery run",
  "Send invoice #204", "Water the plants",
]);

const SEED_EVENTS = new Set([
  "Team standup", "Deep work — portfolio", "Lunch with Max", "Gym — push day",
  "Dentist check-up", "Call with Lena", "Mum's birthday dinner",
  "Flat viewing — Karl-Marx-Str.", "Language exchange",
]);

const SEED_NOTES = new Set([
  "Lisbon trip planning", "Portfolio rework", "Reading list", "Weekly review — ritual",
  "Gift ideas — Mum", "Meeting notes — Atlas project",
]);

const SEED_FOLDERS = new Set(["Ideas", "Work", "Journal"]);

const SEED_HABITS = new Set(["Morning run", "Read 20 pages", "Meditate", "No sugar", "Practice guitar"]);

const SEED_GOALS = new Set(["Run a half marathon", "€10.000 emergency fund", "Ship the side project"]);

const SEED_TXN_NOTES = new Set([
  "Studio Nord — salary", "Invoice — brand refresh", "Rent + utilities", "Weekly groceries",
  "Deutschlandticket + taxi", "Dinner with friends", "Café + lunch", "New running shoes",
  "Train to Munich", "Birthday gifts",
]);

const SEED_SUBS = new Set(["Spotify", "Netflix", "iCloud+", "Gym", "Domain + hosting"]);

const SEED_MAIL_SUBJECTS = new Set([
  "Atlas kickoff — notes & next steps", "Climbing Saturday?",
  "Reminder: submission deadline approaching", "Ciao! Thursday exchange — new place?",
  "New routes + summer opening hours", "Motion design collab — rough idea",
  "Your July account statement is ready", "Reservation confirmed — party of 6",
  "Your weekly highlights digest", "Your ticket: Berlin → Lisbon? Not quite — but Munich!",
]);

interface PurgeableState {
  seeded?: boolean;
  tasks?: Task[];
  events?: EventItem[];
  notes?: Note[];
  folders?: Folder[];
  habits?: Habit[];
  goals?: Goal[];
  txns?: Txn[];
  subs?: Subscription[];
  mails?: Mail[];
}

export function purgeSeedData<T extends PurgeableState>(state: T): T {
  if (!state?.seeded) return { ...state, seeded: false };

  const notes = (state.notes ?? []).filter((n) => !SEED_NOTES.has(n.title));
  const keptFolderIds = new Set(notes.map((n) => n.folderId));

  return {
    ...state,
    seeded: false,
    tasks: (state.tasks ?? []).filter((t) => !SEED_TASKS.has(t.title)),
    events: (state.events ?? []).filter((e) => !SEED_EVENTS.has(e.title)),
    notes,
    // seed folders disappear only once nothing lives in them anymore
    folders: (state.folders ?? []).filter((f) => !SEED_FOLDERS.has(f.name) || keptFolderIds.has(f.id)),
    habits: (state.habits ?? []).filter((h) => !SEED_HABITS.has(h.name)),
    goals: (state.goals ?? []).filter((g) => !SEED_GOALS.has(g.title)),
    txns: (state.txns ?? []).filter((t) => !SEED_TXN_NOTES.has(t.note)),
    subs: (state.subs ?? []).filter((s) => !SEED_SUBS.has(s.name)),
    mails: (state.mails ?? []).filter((m) => !SEED_MAIL_SUBJECTS.has(m.subject)),
  };
}
