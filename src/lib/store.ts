"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { todayKey } from "./dates";
import { advanceEnd, nextOccurrence as ruleNext, ruleExhausted, ruleForTask } from "./recurrence";
import { purgeSeedData } from "./migrations";
import type {
  Contact, EventItem, FileMeta, Folder, Goal, Habit, Mail, Note, Settings, Subscription, Task, Txn,
} from "./types";

const uid = () => crypto.randomUUID();

/**
 * Completing a recurring task doesn't consume it — it schedules the next one.
 * The finished copy stays in Done as a record; a fresh open task is created
 * with its due date/time rolled forward per the (possibly advanced) rule.
 */
function nextTaskOccurrence(task: Task, order: number): Task | null {
  const rule = ruleForTask(task);
  if (rule.freq === "none" || ruleExhausted(rule)) return null;
  const from = task.due ?? todayKey();
  const next = ruleNext(rule, from, task.time);
  if (!next) return null;
  return {
    ...task,
    id: uid(),
    status: "todo",
    completedAt: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    due: next.date,
    time: next.time ?? task.time,
    repeat: advanceEnd(rule),
    recurrence: undefined, // migrated onto `repeat`
    // a fresh run starts with its checklist cleared
    subtasks: task.subtasks.map((s) => ({ ...s, done: false })),
    order,
  };
}

/** the slices that sync to the cloud (and nothing else — no tokens, no UI state) */
export interface CloudData {
  tasks: Task[];
  events: EventItem[];
  folders: Folder[];
  notes: Note[];
  habits: Habit[];
  goals: Goal[];
  txns: Txn[];
  subs: Subscription[];
  contacts: Contact[];
  mails: Mail[];
  settings: Settings;
  /** the vault's encrypted blob travels as-is — it is already AES-256 ciphertext */
  vaultBlob?: string | null;
}

interface EmberState {
  seeded: boolean;
  hydrated: boolean;

  tasks: Task[];
  events: EventItem[];
  folders: Folder[];
  notes: Note[];
  habits: Habit[];
  goals: Goal[];
  txns: Txn[];
  subs: Subscription[];
  contacts: Contact[];
  mails: Mail[];
  files: FileMeta[];
  settings: Settings;

  /** focus timer — persisted so a session survives reloads */
  focus: { running: boolean; mode: "focus" | "break"; endsAt: number | null; sessionsToday: number; sessionsDate: string };

  // ephemeral UI
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  setHydrated: () => void;

  /** privacy screen: blurs all money amounts (persisted per device, never synced) */
  privacy: boolean;
  togglePrivacy: () => void;

  /** replace the syncable slices with a cloud snapshot (realtime sync) */
  applyCloudState: (data: Partial<CloudData>) => void;

  addTask: (t: Partial<Task> & { title: string }) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, status: Task["status"], beforeId?: string) => void;

  addEvent: (e: Omit<EventItem, "id">) => void;
  updateEvent: (id: string, patch: Partial<EventItem>) => void;
  deleteEvent: (id: string) => void;

  addNote: (folderId: string) => string;
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  addFolder: (name: string) => void;

  addHabit: (h: Omit<Habit, "id" | "log" | "createdAt">) => void;
  toggleHabit: (id: string, day: string) => void;
  deleteHabit: (id: string) => void;

  addGoal: (g: Omit<Goal, "id">) => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  toggleMilestone: (goalId: string, msId: string) => void;
  deleteGoal: (id: string) => void;

  addTxn: (t: Omit<Txn, "id">) => void;
  deleteTxn: (id: string) => void;
  addSub: (s: Omit<Subscription, "id">) => void;
  deleteSub: (id: string) => void;

  addContact: (c: Omit<Contact, "id">) => void;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  deleteContact: (id: string) => void;

  updateMail: (id: string, patch: Partial<Mail>) => void;
  markAllMailsRead: () => void;
  sendMail: (m: { to: string; subject: string; body: string; draft?: boolean }) => void;
  deleteMail: (id: string) => void;

  addFile: (f: FileMeta) => void;
  deleteFile: (id: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;

  startFocus: (mode: "focus" | "break") => void;
  stopFocus: (completed: boolean) => void;
}

export const useEmber = create<EmberState>()(
  persist(
    (set, get) => ({
      seeded: false,
      hydrated: false,

      tasks: [],
      events: [],
      folders: [],
      notes: [],
      habits: [],
      goals: [],
      txns: [],
      subs: [],
      contacts: [],
      mails: [],
      files: [],
      settings: {
        userName: "Tom",
        focusMinutes: 25,
        breakMinutes: 5,
        latitude: 52.52,
        longitude: 13.405,
        place: "Berlin",
        language: "en",
        theme: "sunset",
      },
      focus: { running: false, mode: "focus", endsAt: null, sessionsToday: 0, sessionsDate: todayKey() },

      paletteOpen: false,
      setPaletteOpen: (v) => set({ paletteOpen: v }),
      setHydrated: () => set({ hydrated: true }),

      privacy: false,
      togglePrivacy: () => set((s) => ({ privacy: !s.privacy })),

      applyCloudState: (data) => {
        const slices = Object.fromEntries(
          Object.entries(data).filter(([k]) => k !== "vaultBlob"),
        );
        set(slices);
      },

      addTask: (t) =>
        set((s) => ({
          tasks: [
            {
              id: uid(), title: t.title, notes: t.notes, status: t.status ?? "todo",
              priority: t.priority ?? "medium", due: t.due, time: t.time, tags: t.tags ?? [],
              subtasks: t.subtasks ?? [], createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              recurrence: t.recurrence ?? "none", repeat: t.repeat, reminder: t.reminder ?? null,
              sharedId: t.sharedId,
              order: Math.min(0, ...s.tasks.map((x) => x.order)) - 1,
            },
            ...s.tasks,
          ],
        })),
      updateTask: (id, patch) =>
        set((s) => {
          const spawned: Task[] = [];
          const tasks = s.tasks.map((t) => {
            if (t.id !== id) return t;
            const next = { ...t, ...patch, updatedAt: new Date().toISOString() };
            if (patch.status === "done" && t.status !== "done") {
              next.completedAt = new Date().toISOString();
              const repeat = nextTaskOccurrence(next, Math.min(0, ...s.tasks.map((x) => x.order)) - 1);
              if (repeat) spawned.push(repeat);
            }
            if (patch.status && patch.status !== "done") next.completedAt = undefined;
            return next;
          });
          return { tasks: [...spawned, ...tasks] };
        }),
      deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      moveTask: (id, status, beforeId) =>
        set((s) => {
          const moving = s.tasks.find((t) => t.id === id);
          if (!moving) return s;
          const rest = s.tasks.filter((t) => t.id !== id);
          const col = rest.filter((t) => t.status === status).sort((a, b) => a.order - b.order);
          const idx = beforeId ? col.findIndex((t) => t.id === beforeId) : col.length;
          const dropped: Task = {
            ...moving, status,
            completedAt: status === "done" ? moving.completedAt ?? new Date().toISOString() : undefined,
          };
          col.splice(idx === -1 ? col.length : idx, 0, dropped);
          const reordered = col.map((t, i) => ({ ...t, order: i }));
          // dragging a recurring task into Done schedules the next one too
          const repeat =
            status === "done" && moving.status !== "done"
              ? nextTaskOccurrence(dropped, Math.min(0, ...s.tasks.map((x) => x.order)) - 1)
              : null;
          return {
            tasks: [
              ...(repeat ? [repeat] : []),
              ...rest.filter((t) => t.status !== status),
              ...reordered,
            ],
          };
        }),

      addEvent: (e) => set((s) => ({ events: [...s.events, { ...e, id: uid() }] })),
      updateEvent: (id, patch) =>
        set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
      deleteEvent: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id) })),

      addNote: (folderId) => {
        const id = uid();
        set((s) => ({
          notes: [
            { id, title: "Untitled", body: "", folderId, pinned: false, updatedAt: new Date().toISOString() },
            ...s.notes,
          ],
        }));
        return id;
      },
      updateNote: (id, patch) =>
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)),
        })),
      deleteNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      addFolder: (name) => set((s) => ({ folders: [...s.folders, { id: uid(), name }] })),

      addHabit: (h) =>
        set((s) => ({
          habits: [...s.habits, { ...h, id: uid(), log: {}, createdAt: new Date().toISOString() }],
        })),
      toggleHabit: (id, day) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== id) return h;
            const log = { ...h.log };
            if (log[day]) delete log[day];
            else log[day] = true;
            return { ...h, log };
          }),
        })),
      deleteHabit: (id) => set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),

      addGoal: (g) => set((s) => ({ goals: [...s.goals, { ...g, id: uid() }] })),
      updateGoal: (id, patch) =>
        set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
      toggleMilestone: (goalId, msId) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId
              ? { ...g, milestones: g.milestones.map((m) => (m.id === msId ? { ...m, done: !m.done } : m)) }
              : g,
          ),
        })),
      deleteGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      addTxn: (t) => set((s) => ({ txns: [{ ...t, id: uid() }, ...s.txns] })),
      deleteTxn: (id) => set((s) => ({ txns: s.txns.filter((t) => t.id !== id) })),
      addSub: (sub) => set((s) => ({ subs: [...s.subs, { ...sub, id: uid() }] })),
      deleteSub: (id) => set((s) => ({ subs: s.subs.filter((x) => x.id !== id) })),

      addContact: (c) => set((s) => ({ contacts: [...s.contacts, { ...c, id: uid() }] })),
      updateContact: (id, patch) =>
        set((s) => ({ contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      deleteContact: (id) => set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) })),

      updateMail: (id, patch) =>
        set((s) => ({ mails: s.mails.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      markAllMailsRead: () =>
        set((s) => ({ mails: s.mails.map((m) => (m.read ? m : { ...m, read: true })) })),
      sendMail: ({ to, subject, body, draft }) =>
        set((s) => ({
          mails: [
            {
              id: uid(), from: "Me", fromEmail: `to: ${to}`, subject: subject || "(no subject)",
              body, date: new Date().toISOString(), read: true, starred: false,
              label: "personal" as const, folder: draft ? ("drafts" as const) : ("sent" as const),
            },
            ...s.mails,
          ],
        })),
      deleteMail: (id) => set((s) => ({ mails: s.mails.filter((m) => m.id !== id) })),

      addFile: (f) => set((s) => ({ files: [f, ...s.files] })),
      deleteFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      startFocus: (mode) => {
        const { settings, focus } = get();
        const mins = mode === "focus" ? settings.focusMinutes : settings.breakMinutes;
        set({ focus: { ...focus, running: true, mode, endsAt: Date.now() + mins * 60_000 } });
      },
      stopFocus: (completed) => {
        const { focus } = get();
        const today = todayKey();
        const sessions =
          (focus.sessionsDate === today ? focus.sessionsToday : 0) +
          (completed && focus.mode === "focus" ? 1 : 0);
        set({
          focus: { running: false, mode: "focus", endsAt: null, sessionsToday: sessions, sessionsDate: today },
        });
      },
    }),
    {
      name: "ember-os",
      version: 2,
      // v2: demo data is gone for good — scrub anything the old seed created
      migrate: (persisted, version) =>
        version < 2 ? (purgeSeedData(persisted as EmberState) as EmberState) : (persisted as EmberState),
      partialize: (s) =>
        Object.fromEntries(
          Object.entries(s).filter(([k]) => k !== "paletteOpen" && k !== "hydrated"),
        ) as EmberState,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

/** true once the persisted state has been loaded on the client */
export function useHydrated() {
  return useEmber((s) => s.hydrated);
}
