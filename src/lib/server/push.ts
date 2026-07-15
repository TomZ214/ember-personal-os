import webpush from "web-push";

/** Server-side Web Push. Keys live in env and never reach the browser. */

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export function pushReady(): boolean {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:noreply@ember.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

/**
 * Deliver one notification.
 * Returns "gone" when the subscription is dead (browser uninstalled / cleared),
 * so the caller can prune it instead of retrying forever.
 */
export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
): Promise<"sent" | "gone" | "failed"> {
  configure();
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: 3600 },
    );
    return "sent";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("[push] send failed", status, e);
    return "failed";
  }
}
