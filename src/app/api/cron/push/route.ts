import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushReady, sendPush } from "@/lib/server/push";
import { dayNumber, planNotifications } from "@/lib/server/reminders";
import { DEFAULT_NOTIFICATIONS, type EventItem, type Settings, type Task } from "@/lib/types";

/**
 * The scheduled job behind push notifications. Netlify calls this every 2
 * minutes; it decides — per user, in their own timezone — what is worth a ping:
 *
 *   • a daily summary at their chosen hour (skipped when nothing is due)
 *   • a task reminder, at each task's chosen offset before its due time
 *   • an event reminder, at each event's chosen offset before it starts
 *
 * Matching is CATCH-UP, not a fixed window: a reminder fires on the first run
 * at or after its fire moment (up to a short grace past the due time), so a
 * skipped or delayed run never loses a reminder. `push_log` is a send-once
 * ledger — we claim the row before sending, so nothing is ever sent twice.
 */

export const maxDuration = 60;

interface SubRow {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  tz: string;
}

interface StateRow {
  user_id: string;
  data: { tasks?: Task[]; events?: EventItem[]; settings?: Settings };
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** today's date, clock-minutes, and an absolute wall-clock minute scalar, in a tz */
function localNow(tz: string): { date: string; minutes: number; scalar: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return { date, minutes, scalar: dayNumber(date) * 1440 + minutes };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace("Bearer ", "") ?? req.nextUrl.searchParams.get("key");
  if (!secret || given !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushReady() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "push not configured" }, { status: 503 });
  }

  const sb = admin();

  const { data: subs, error: subErr } = await sb
    .from("push_subscriptions")
    .select("endpoint, user_id, p256dh, auth, tz");
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });
  if (!subs?.length) return NextResponse.json({ users: 0, sent: 0 });

  const byUser = new Map<string, SubRow[]>();
  for (const s of subs as SubRow[]) {
    byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  }

  const { data: states } = await sb
    .from("os_state")
    .select("user_id, data")
    .in("user_id", [...byUser.keys()]);
  const stateOf = new Map((states as StateRow[] | null)?.map((s) => [s.user_id, s.data]) ?? []);

  let sent = 0;

  for (const [userId, devices] of byUser) {
    const state = stateOf.get(userId);
    if (!state) continue;

    const prefs = { ...DEFAULT_NOTIFICATIONS, ...(state.settings?.notifications ?? {}) };
    const tz = devices[0].tz || "Europe/Berlin";
    const now = localNow(tz);

    const pending = planNotifications(state, prefs, now);

    for (const item of pending) {
      // claim first: a duplicate key means another run already sent this
      const { error: claimErr } = await sb.from("push_log").insert({ user_id: userId, key: item.key });
      if (claimErr) continue;

      const payload = { title: item.title, body: item.body, url: item.url, tag: item.tag };
      for (const d of devices) {
        const result = await sendPush({ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth }, payload);
        if (result === "sent") sent++;
        if (result === "gone") await sb.from("push_subscriptions").delete().eq("endpoint", d.endpoint);
      }
    }
  }

  // opportunistic housekeeping: drop ledger rows older than 3 days
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString();
  await sb.from("push_log").delete().lt("sent_at", cutoff);

  return NextResponse.json({ users: byUser.size, sent });
}
