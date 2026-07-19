"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { VAULT_STORAGE_KEY } from "./crypto";
import { useEmber, type CloudData } from "./store";
import type { RepeatRule } from "./types";

/**
 * Cloud sync via Supabase — optional, env-gated like every integration.
 * One row per user in `os_state` (JSONB snapshot of the syncable slices),
 * guarded by row-level security (user_id = auth.uid()), with Supabase
 * Realtime pushing changes to other signed-in devices instantly.
 *
 * Deliberately NOT synced: OAuth/bank tokens (httpOnly cookies, per device),
 * file blobs (IndexedDB, can be large), bank cache (refetchable). The vault
 * travels as its existing AES-256 ciphertext — the cloud never sees
 * plaintext secrets.
 */

export const DEVICE_ID_KEY = "ember-device-id";
export const LAST_SYNC_KEY = "ember-cloud-last-sync";

export function cloudConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!cloudConfigured()) return null;
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/** current syncable snapshot of this device */
export function collectCloudData(): CloudData {
  const s = useEmber.getState();
  return {
    tasks: s.tasks,
    events: s.events,
    folders: s.folders,
    notes: s.notes,
    habits: s.habits,
    goals: s.goals,
    txns: s.txns,
    subs: s.subs,
    contacts: s.contacts,
    mails: s.mails,
    alarms: s.alarms,
    settings: s.settings,
    completionLog: s.completionLog,
    vaultBlob: localStorage.getItem(VAULT_STORAGE_KEY),
  };
}

/** apply a remote snapshot to this device */
export function applyCloudData(data: CloudData) {
  useEmber.getState().applyCloudState(data);
  if (data.vaultBlob) localStorage.setItem(VAULT_STORAGE_KEY, data.vaultBlob);
}

export interface CloudRow {
  user_id: string;
  device_id: string;
  data: CloudData;
  updated_at: string;
}

export async function pushCloud(userId: string): Promise<string> {
  const sb = supabase();
  if (!sb) throw new Error("cloud not configured");
  const updated_at = new Date().toISOString();
  const { error } = await sb.from("os_state").upsert({
    user_id: userId,
    device_id: deviceId(),
    data: collectCloudData(),
    updated_at,
  });
  if (error) throw new Error(error.message);
  localStorage.setItem(LAST_SYNC_KEY, updated_at);
  return updated_at;
}

export async function pullCloud(userId: string): Promise<CloudRow | null> {
  const sb = supabase();
  if (!sb) throw new Error("cloud not configured");
  const { data, error } = await sb
    .from("os_state")
    .select("user_id, device_id, data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CloudRow | null) ?? null;
}

/* ---------------- family quick-add ---------------- */

export interface ShareLink {
  token: string;
  label: string;
  created_at: string;
}

export async function listShareLinks(): Promise<ShareLink[]> {
  const sb = supabase();
  if (!sb) throw new Error("cloud not configured");
  const { data, error } = await sb
    .from("share_links")
    .select("token, label, created_at")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data as ShareLink[]) ?? [];
}

export async function createShareLink(userId: string, label: string): Promise<ShareLink> {
  const sb = supabase();
  if (!sb) throw new Error("cloud not configured");
  const { data, error } = await sb
    .from("share_links")
    .insert({ user_id: userId, label })
    .select("token, label, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as ShareLink;
}

export async function deleteShareLink(token: string): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("cloud not configured");
  const { error } = await sb.from("share_links").delete().eq("token", token);
  if (error) throw new Error(error.message);
}

export interface InboxTask {
  id: string;
  title: string;
  notes: string | null;
  sender: string | null;
  priority: string | null;
  due: string | null;
  time: string | null;
  recurrence: string | null;
  repeat: RepeatRule | null;
}

/**
 * Claim pending quick-add tasks. Deleting first (and only keeping rows the
 * delete actually returned) means two signed-in devices can never both turn
 * the same inbox row into a task. The row id doubles as the shared_tasks id,
 * so the created task can later report its status back to the sender.
 */
export async function claimInboxTasks(userId: string): Promise<InboxTask[]> {
  const sb = supabase();
  if (!sb) throw new Error("cloud not configured");
  const { data, error } = await sb
    .from("task_inbox")
    .delete()
    .eq("user_id", userId)
    .select("id, title, notes, sender, priority, due, time, recurrence, repeat");
  if (error) throw new Error(error.message);
  return (data as InboxTask[]) ?? [];
}

/**
 * Push the completion status of family-submitted tasks back to shared_tasks,
 * so the sender's /add/<token> page shows whether they were done. Idempotent:
 * we fetch current statuses and only write the ones that changed.
 */
export async function reconcileSharedTasks(
  userId: string,
  tasks: { sharedId?: string; status: string; completedAt?: string }[],
): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const mine = tasks.filter((t) => t.sharedId);
  if (mine.length === 0) return;

  const { data, error } = await sb
    .from("shared_tasks")
    .select("id, status")
    .eq("user_id", userId);
  if (error) return; // table may not exist yet (family.sql not run)
  const remote = new Map((data as { id: string; status: string }[]).map((r) => [r.id, r.status]));

  for (const t of mine) {
    const want = t.status === "done" ? "done" : "open";
    if (remote.get(t.sharedId!) === want) continue;
    if (!remote.has(t.sharedId!)) continue; // no record to update (older task)
    await sb
      .from("shared_tasks")
      .update({ status: want, done_at: want === "done" ? t.completedAt ?? new Date().toISOString() : null })
      .eq("id", t.sharedId!);
  }
}

export interface SharedTaskView {
  title: string;
  status: string;
  sender: string | null;
  created_at: string;
  done_at: string | null;
}

/** family member reads back the tasks they submitted through a link + status */
export async function listSharedTasks(token: string): Promise<SharedTaskView[]> {
  const sb = supabase();
  if (!sb) throw new Error("cloud not configured");
  const { data, error } = await sb.rpc("inbox_list_tasks", { share_token: token });
  if (error) throw new Error(error.message);
  return (data as SharedTaskView[]) ?? [];
}
