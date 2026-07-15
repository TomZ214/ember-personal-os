"use client";

import { supabase } from "./cloud";

/**
 * Web Push: the app can reach you when it isn't open.
 *
 * On iOS this only works for the home-screen app (Safari tabs can't subscribe),
 * which is exactly how Tom runs Ember. The subscription is stored per device in
 * Supabase; the scheduled job on the server reads it and sends the pings.
 */

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function pushConfigured(): boolean {
  return !!VAPID;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iOS only allows push from an installed (home-screen) app */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's non-standard flag
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function permission(): NotificationPermission | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** ask, subscribe, and remember this device — returns an error message or null */
export async function enablePush(userId: string): Promise<string | null> {
  if (!pushSupported()) return "This browser can't do push notifications.";
  if (!VAPID) return "Push isn't configured on the server (missing VAPID key).";
  if (isIOS() && !isStandalone())
    return "On iPhone, add Ember to the home screen first — Safari tabs can't receive notifications.";

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "Notifications were blocked. Allow them in your browser/iOS settings.";

  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerWorker());
  if (!reg) return "Could not start the service worker.";
  await navigator.serviceWorker.ready;

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID) as BufferSource,
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  if (!json.endpoint || !json.keys) return "The browser returned an unusable subscription.";

  const sb = supabase();
  if (!sb) return "Cloud sync isn't configured.";
  const { error } = await sb.from("push_subscriptions").upsert({
    endpoint: json.endpoint,
    user_id: userId,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
  });
  return error ? error.message : null;
}

/**
 * Self-heal: browsers silently rotate or drop push subscriptions, which would
 * make notifications quietly stop. On every sign-in we re-subscribe if needed
 * and re-store the current subscription (refreshing the timezone too), so the
 * server always has a live endpoint for this device.
 */
export async function refreshPushSubscription(userId: string): Promise<void> {
  if (!pushSupported() || !VAPID) return;
  if (Notification.permission !== "granted") return; // user never opted in — nothing to keep alive
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID) as BufferSource,
      });
    } catch {
      return; // subscribe can fail if permission was revoked at the OS level
    }
  }

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  if (!json.endpoint || !json.keys) return;
  await supabase()?.from("push_subscriptions").upsert({
    endpoint: json.endpoint,
    user_id: userId,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
  });
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await supabase()?.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

/** fire a one-off notification through the server, to prove the whole chain works */
export async function sendTestPush(): Promise<string | null> {
  const sub = await currentSubscription();
  if (!sub) return "This device isn't subscribed yet.";
  const res = await fetch("/api/push/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return body.error ?? `Server responded ${res.status}`;
  }
  return null;
}
