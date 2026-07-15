"use client";

import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  applyCloudData, claimInboxTasks, cloudConfigured, collectCloudData, deviceId, LAST_SYNC_KEY,
  pullCloud, pushCloud, reconcileSharedTasks, supabase, type CloudRow,
} from "@/lib/cloud";
import { useEmber } from "@/lib/store";
import { refreshPushSubscription } from "@/lib/push";
import { toast } from "@/components/ui/toast";

/**
 * Device↔cloud sync engine (Supabase, optional).
 *
 *   local change ──debounce──▶ push (upsert own row)
 *   other device's push ──realtime──▶ applied here instantly
 *   sign-in / manual sync ──▶ pull, newer side wins
 *
 * `<CloudSyncEngine/>` mounts the machinery exactly once (in the Shell);
 * everything else reads `useCloudStatus()` and calls the exported actions.
 */

interface CloudStatus {
  configured: boolean;
  authLoading: boolean;
  signedIn: boolean;
  email: string | null;
  syncing: boolean;
  error: string | null;
  lastSync: string | null;
}

export const useCloudStatus = create<CloudStatus>(() => ({
  configured: false,
  authLoading: false,
  signedIn: false,
  email: null,
  syncing: false,
  error: null,
  lastSync: null,
}));

const set = useCloudStatus.setState;
let currentUserId: string | null = null;
// guard: don't echo a snapshot we just applied back into the cloud
let applyingRemote = false;

/* ---------------- actions ---------------- */

export async function cloudSignIn(email: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return "Cloud sync is not configured";
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/settings/connections` },
  });
  return error ? error.message : null;
}

/**
 * Sign in with the 6-digit code from the same email as the magic link.
 * Needed on iOS home-screen apps: links open in Safari, whose sign-in the
 * standalone app can't see — a code typed inside the app works everywhere.
 */
export async function cloudVerifyCode(email: string, code: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return "Cloud sync is not configured";
  const { error } = await sb.auth.verifyOtp({
    email: email.trim(),
    token: code.replace(/\s/g, ""),
    type: "email",
  });
  return error ? error.message : null;
}

export async function cloudSignOut(): Promise<void> {
  await supabase()?.auth.signOut();
  localStorage.removeItem(LAST_SYNC_KEY);
  set({ lastSync: null });
}

async function push(uid: string): Promise<void> {
  try {
    const at = await pushCloud(uid);
    set({ lastSync: at, error: null });
    // report family-task completion back to the submitters (best effort)
    void reconcileSharedTasks(uid, useEmber.getState().tasks).catch(() => {});
  } catch (e) {
    set({ error: e instanceof Error ? e.message : String(e) });
  }
}

/** pull remote and reconcile — the newer side wins */
async function reconcile(uid: string): Promise<"pulled" | "pushed" | "in-sync"> {
  const remote: CloudRow | null = await pullCloud(uid);
  const local = localStorage.getItem(LAST_SYNC_KEY);
  if (!remote) {
    await pushCloud(uid);
    set({ lastSync: localStorage.getItem(LAST_SYNC_KEY) });
    return "pushed";
  }
  if (!local || remote.updated_at > local) {
    applyingRemote = true;
    applyCloudData(remote.data);
    localStorage.setItem(LAST_SYNC_KEY, remote.updated_at);
    set({ lastSync: remote.updated_at });
    setTimeout(() => {
      applyingRemote = false;
    }, 300);
    return "pulled";
  }
  return "in-sync";
}

export async function cloudSyncNow(): Promise<void> {
  if (!currentUserId) return;
  set({ syncing: true, error: null });
  try {
    await drainInbox(currentUserId);
    const outcome = await reconcile(currentUserId);
    if (outcome === "in-sync") await push(currentUserId);
  } catch (e) {
    set({ error: e instanceof Error ? e.message : String(e) });
  }
  set({ syncing: false });
}

const INBOX_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const INBOX_RECURRENCES = ["none", "daily", "weekly", "monthly"] as const;

/** turn pending family quick-add rows into real tasks (claim-then-add) */
async function drainInbox(uid: string): Promise<void> {
  try {
    const pending = await claimInboxTasks(uid);
    if (pending.length === 0) return;
    const { addTask } = useEmber.getState();
    for (const t of pending) {
      const priority = INBOX_PRIORITIES.find((p) => p === t.priority) ?? "medium";
      const recurrence = INBOX_RECURRENCES.find((r) => r === t.recurrence) ?? "none";
      addTask({
        title: t.title,
        notes: [t.notes, t.sender ? `Von ${t.sender}` : null].filter(Boolean).join("\n") || undefined,
        tags: ["family"],
        priority,
        due: t.due ?? undefined,
        // prefer the full rule the family member chose; fall back to the legacy field
        repeat: t.repeat ?? undefined,
        recurrence: t.repeat ? "none" : recurrence,
        sharedId: t.id, // links back to shared_tasks so the sender sees status
      });
    }
    toast(pending.length === 1 ? "1 neue Aufgabe von der Familie" : `${pending.length} neue Aufgaben von der Familie`);
  } catch {
    // table may not exist yet (family.sql not run) — quick-add is optional
  }
}

export function cloudItemCount(): number {
  const d = collectCloudData();
  return d.tasks.length + d.events.length + d.notes.length + d.habits.length +
    d.goals.length + d.txns.length + d.contacts.length + d.mails.length;
}

/* ---------------- engine ---------------- */

export function CloudSyncEngine() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const sb = supabase();
    const configured = cloudConfigured();

    const boot = setTimeout(() => {
      set({ configured, authLoading: configured, lastSync: localStorage.getItem(LAST_SYNC_KEY) });
    }, 0);
    if (!sb) return () => clearTimeout(boot);

    let channel: RealtimeChannel | null = null;
    let pushTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubStore: (() => void) | null = null;

    const stopSync = () => {
      if (channel) {
        sb.removeChannel(channel);
        channel = null;
      }
      if (unsubStore) {
        unsubStore();
        unsubStore = null;
      }
    };

    const startSync = (uid: string) => {
      stopSync();
      currentUserId = uid;

      void reconcile(uid).catch((e) =>
        set({ error: e instanceof Error ? e.message : String(e) }),
      );
      void drainInbox(uid);
      // keep this device's push subscription alive server-side
      void refreshPushSubscription(uid).catch(() => {});

      // realtime: other devices' pushes land here instantly
      channel = sb
        .channel(`os_state_${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "task_inbox", filter: `user_id=eq.${uid}` },
          () => void drainInbox(uid),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "os_state", filter: `user_id=eq.${uid}` },
          (payload) => {
            const row = payload.new as CloudRow;
            if (!row?.data || row.device_id === deviceId()) return;
            applyingRemote = true;
            applyCloudData(row.data);
            localStorage.setItem(LAST_SYNC_KEY, row.updated_at);
            set({ lastSync: row.updated_at });
            toast("Synced from another device", "info");
            setTimeout(() => {
              applyingRemote = false;
            }, 300);
          },
        )
        .subscribe();

      // local changes → debounced push
      unsubStore = useEmber.subscribe(() => {
        if (applyingRemote) return;
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => void push(uid), 2500);
      });
    };

    const init = setTimeout(async () => {
      const { data } = await sb.auth.getSession();
      const s = data.session;
      set({ authLoading: false, signedIn: !!s, email: s?.user.email ?? null });
      if (s) startSync(s.user.id);
    }, 0);

    const { data: authSub } = sb.auth.onAuthStateChange((_evt, s) => {
      set({ authLoading: false, signedIn: !!s, email: s?.user.email ?? null });
      if (s && currentUserId !== s.user.id) startSync(s.user.id);
      if (!s) {
        currentUserId = null;
        stopSync();
      }
    });

    return () => {
      clearTimeout(boot);
      clearTimeout(init);
      if (pushTimer) clearTimeout(pushTimer);
      authSub.subscription.unsubscribe();
      stopSync();
    };
  }, []);

  return null;
}
