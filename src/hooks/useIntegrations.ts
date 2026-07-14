"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, subDays } from "date-fns";
import { useApi } from "./useApi";
import { useEmber } from "@/lib/store";
import { CATEGORY_VAR } from "@/lib/types";
import type {
  BankAccount, BankSubscription, BankTxn, ConnectionStatus, GCalendar, GContact, GEvent, GEventInput,
} from "@/lib/integrations/types";

/* ---------------- status ---------------- */

export function useGoogleStatus() {
  return useApi<ConnectionStatus>("/api/google/status");
}

export function useBankStatus() {
  return useApi<ConnectionStatus>("/api/bank/status");
}

export function markSynced(key: string) {
  try {
    localStorage.setItem(`ember-sync-${key}`, new Date().toISOString());
  } catch {}
}

export function lastSynced(key: string): string | null {
  try {
    return localStorage.getItem(`ember-sync-${key}`);
  } catch {
    return null;
  }
}

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** does a merged calendar event occur on the given day? (google events arrive pre-expanded) */
export function eventOccursOn(ev: CalEvent, key: string): boolean {
  if (ev.date === key) return true;
  if (ev.source === "google" || !ev.recurring) return false;
  const first = new Date(ev.date);
  const day = new Date(key);
  if (day < first) return false;
  return ev.recurrenceKind === "daily" ? true : first.getDay() === day.getDay();
}

/* ---------------- calendar (merged local + google) ---------------- */

export interface CalEvent {
  id: string;
  title: string;
  date: string;
  start: number;
  end: number;
  /** resolved CSS color */
  color: string;
  allDay: boolean;
  location?: string;
  notes?: string;
  recurring: boolean;
  /** local recurrence rule; google events arrive pre-expanded */
  recurrenceKind?: "none" | "daily" | "weekly";
  source: "local" | "google";
  calendarId?: string;
  attendees?: GEvent["attendees"];
}

export interface CalendarInput {
  title: string;
  date: string;
  start: number;
  end: number;
  location?: string;
  notes?: string;
  recurrence: "none" | "daily" | "weekly";
  /** local color key — used when the event lives in the local store */
  localColor: keyof typeof CATEGORY_VAR;
  /** target google calendar id, when connected */
  calendarId?: string;
}

/**
 * One calendar surface over two backends: the local store (always) and
 * Google Calendar (when connected). Mutations route by event source.
 */
export function useCalendarSource() {
  const google = useGoogleStatus();
  const connected = !!google.data?.connected;

  // a generous rolling window keeps every calendar view + the dashboard fed
  const range = useMemo(() => {
    const from = subDays(new Date(), 45);
    const to = addDays(new Date(), 90);
    return `timeMin=${encodeURIComponent(from.toISOString())}&timeMax=${encodeURIComponent(to.toISOString())}&tz=${encodeURIComponent(tz())}`;
  }, []);

  const remote = useApi<{ calendars: GCalendar[]; events: GEvent[] }>(
    connected ? `/api/google/calendar?${range}` : null,
    { refreshMs: 60_000 },
  );

  useEffect(() => {
    if (remote.data) markSynced("calendar");
  }, [remote.data]);

  const localEvents = useEmber((s) => s.events);
  const addLocal = useEmber((s) => s.addEvent);
  const updateLocal = useEmber((s) => s.updateEvent);
  const deleteLocal = useEmber((s) => s.deleteEvent);

  const [hiddenCals, setHiddenCals] = useState<Set<string>>(new Set());
  const toggleCalendar = (id: string) =>
    setHiddenCals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const events = useMemo<CalEvent[]>(() => {
    const local: CalEvent[] = localEvents.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      start: e.start,
      end: e.end,
      color: CATEGORY_VAR[e.color],
      allDay: false,
      location: e.location,
      notes: e.notes,
      recurring: e.recurrence !== "none",
      recurrenceKind: e.recurrence,
      source: "local",
    }));
    const remoteEvents: CalEvent[] = (remote.data?.events ?? [])
      .filter((e) => !hiddenCals.has(e.calendarId))
      .map((e) => ({ ...e, source: "google" as const }));
    return [...local, ...remoteEvents];
  }, [localEvents, remote.data, hiddenCals]);

  const create = useCallback(
    async (input: CalendarInput) => {
      if (connected && input.calendarId && input.calendarId !== "local") {
        const payload: GEventInput = { ...input, calendarId: input.calendarId, recurrence: input.recurrence };
        const res = await fetch("/api/google/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: payload, tz: tz() }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "create failed");
        await remote.refresh();
      } else {
        addLocal({
          title: input.title, date: input.date, start: input.start, end: input.end,
          color: input.localColor, recurrence: input.recurrence,
          location: input.location, notes: input.notes,
        });
      }
    },
    [connected, addLocal, remote],
  );

  const update = useCallback(
    async (ev: CalEvent, patch: Partial<CalendarInput>) => {
      if (ev.source === "google") {
        const res = await fetch("/api/google/calendar/event", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ calendarId: ev.calendarId, eventId: ev.id, patch, tz: tz() }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "update failed");
        await remote.refresh();
      } else {
        updateLocal(ev.id, {
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.date !== undefined && { date: patch.date }),
          ...(patch.start !== undefined && { start: patch.start }),
          ...(patch.end !== undefined && { end: patch.end }),
          ...(patch.location !== undefined && { location: patch.location || undefined }),
          ...(patch.notes !== undefined && { notes: patch.notes || undefined }),
          ...(patch.recurrence !== undefined && { recurrence: patch.recurrence }),
          ...(patch.localColor !== undefined && { color: patch.localColor }),
        });
      }
    },
    [updateLocal, remote],
  );

  const remove = useCallback(
    async (ev: CalEvent) => {
      if (ev.source === "google") {
        const res = await fetch(
          `/api/google/calendar/event?calendarId=${encodeURIComponent(ev.calendarId!)}&eventId=${encodeURIComponent(ev.id)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error((await res.json()).error ?? "delete failed");
        await remote.refresh();
      } else {
        deleteLocal(ev.id);
      }
    },
    [deleteLocal, remote],
  );

  return {
    connected,
    calendars: remote.data?.calendars ?? [],
    hiddenCals,
    toggleCalendar,
    events,
    syncing: remote.loading,
    syncError: remote.error,
    needsReconnect: remote.errorStatus === 401,
    refresh: remote.refresh,
    create,
    update,
    remove,
  };
}

/* ---------------- gmail unread (dashboard) ---------------- */

export function useGmailUnread() {
  const google = useGoogleStatus();
  const unread = useApi<{ unread: number; important?: number }>(
    google.data?.connected ? "/api/google/gmail/unread" : null,
    { refreshMs: 120_000 },
  );
  return {
    connected: !!google.data?.connected,
    unread: unread.data?.unread ?? null,
    /** unread mail from the Sparkasse — surfaced in the welcome alert */
    important: unread.data?.important ?? 0,
  };
}

/* ---------------- google contacts ---------------- */

export function useGoogleContacts() {
  const google = useGoogleStatus();
  const res = useApi<{ contacts: GContact[] }>(
    google.data?.connected ? "/api/google/contacts" : null,
  );
  useEffect(() => {
    if (res.data) markSynced("contacts");
  }, [res.data]);
  return { connected: !!google.data?.connected, contacts: res.data?.contacts ?? [], loading: res.loading };
}

/* ---------------- bank ---------------- */

interface BankCache {
  accounts: BankAccount[];
  transactions: BankTxn[];
  subscriptions: BankSubscription[];
  syncedAt: string;
}

const BANK_CACHE_KEY = "ember-bank-cache";

/**
 * Bank data with an aggressive client cache: PSD2 providers rate-limit
 * account access (~4 syncs/day), so we sync once and keep the result in
 * localStorage until the user explicitly syncs again.
 */
export function useBank() {
  const status = useBankStatus();
  const connected = !!status.data?.connected;
  const [cacheState, setCache] = useState<BankCache | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loadedFromStorage, setLoadedFromStorage] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(BANK_CACHE_KEY);
        if (raw) setCache(JSON.parse(raw) as BankCache);
      } catch {}
      setLoadedFromStorage(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const [accRes, txnRes] = await Promise.all([
        fetch("/api/bank/accounts"),
        fetch("/api/bank/transactions"),
      ]);
      const acc = await accRes.json();
      const txn = await txnRes.json();
      if (!accRes.ok) throw new Error(acc.error ?? "accounts failed");
      if (!txnRes.ok) throw new Error(txn.error ?? "transactions failed");
      const next: BankCache = {
        accounts: acc.accounts,
        transactions: txn.transactions,
        subscriptions: txn.subscriptions,
        syncedAt: txn.syncedAt,
      };
      localStorage.setItem(BANK_CACHE_KEY, JSON.stringify(next));
      markSynced("bank");
      setCache(next);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, []);

  // first sync happens automatically right after connecting
  useEffect(() => {
    if (connected && loadedFromStorage && !cacheState && !syncing && !syncError) {
      const t = setTimeout(() => void sync(), 0);
      return () => clearTimeout(t);
    }
  }, [connected, loadedFromStorage, cacheState, syncing, syncError, sync]);

  return {
    status: status.data,
    connected,
    accounts: cacheState?.accounts ?? [],
    transactions: cacheState?.transactions ?? [],
    subscriptions: cacheState?.subscriptions ?? [],
    syncedAt: cacheState?.syncedAt ?? null,
    syncing,
    syncError,
    sync,
    clearCache: () => {
      localStorage.removeItem(BANK_CACHE_KEY);
      setCache(null);
    },
  };
}
