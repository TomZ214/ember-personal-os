import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushReady, sendPush } from "@/lib/server/push";
import { DEFAULT_NOTIFICATIONS, type EventItem, type Settings, type Task } from "@/lib/types";

/**
 * The scheduled job behind push notifications. Netlify calls this every 15
 * minutes; it decides — per user, in their own timezone — what is worth a ping:
 *
 *   • a daily summary at their chosen hour (skipped when nothing is due)
 *   • a nudge ~30 minutes before a calendar event starts
 *
 * `push_log` is a send-once ledger: we claim the row BEFORE sending, so a
 * retried or overlapping run can never double-notify.
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

/** today's date and clock in a given timezone */
function localNow(tz: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** same rule the calendar uses, minus the date-fns dependency */
function occursOn(ev: EventItem, key: string): boolean {
  if (ev.date === key) return true;
  if (ev.recurrence === "none") return false;
  const first = new Date(ev.date + "T00:00:00Z");
  const day = new Date(key + "T00:00:00Z");
  if (day < first) return false;
  if (ev.recurrence === "daily") return true;
  return first.getUTCDay() === day.getUTCDay(); // weekly
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
    const { date: today, minutes: nowMin } = localNow(tz);

    const tasks = (state.tasks ?? []).filter((t) => t.status !== "done" && t.due);
    const overdue = tasks.filter((t) => t.due! < today).length;
    const dueToday = tasks.filter((t) => t.due === today).length;

    const pending: { key: string; payload: Parameters<typeof sendPush>[1] }[] = [];

    // daily digest — only if there's actually something to report
    if (prefs.digest && Math.floor(nowMin / 60) === prefs.digestHour && overdue + dueToday > 0) {
      const bits = [
        overdue > 0 ? `${overdue} overdue` : null,
        dueToday > 0 ? `${dueToday} due today` : null,
      ].filter(Boolean);
      pending.push({
        key: `digest-${today}`,
        payload: {
          title: overdue > 0 ? "⚠️ Ember — today's plan" : "🔥 Ember — today's plan",
          body: `You have ${bits.join(" and ")}.`,
          url: "/tasks",
          tag: "ember-digest",
        },
      });
    }

    // event reminders — the 20-40 min window guarantees exactly one hit per 15-min run
    if (prefs.eventReminders) {
      for (const ev of state.events ?? []) {
        if (!occursOn(ev, today)) continue;
        const until = ev.start - nowMin;
        if (until < 20 || until > 40) continue;
        pending.push({
          key: `event-${ev.id}-${today}`,
          payload: {
            title: "📅 Starting soon",
            body: `${ev.title} in ${until} minutes${ev.location ? ` · ${ev.location}` : ""}.`,
            url: "/calendar",
            tag: `ember-event-${ev.id}`,
          },
        });
      }
    }

    for (const { key, payload } of pending) {
      // claim first: a duplicate key means another run already sent this
      const { error: claimErr } = await sb.from("push_log").insert({ user_id: userId, key });
      if (claimErr) continue;

      for (const d of devices) {
        const result = await sendPush({ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth }, payload);
        if (result === "sent") sent++;
        if (result === "gone") await sb.from("push_subscriptions").delete().eq("endpoint", d.endpoint);
      }
    }
  }

  return NextResponse.json({ users: byUser.size, sent });
}
