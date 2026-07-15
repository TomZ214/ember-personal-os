import { NextResponse, type NextRequest } from "next/server";
import { pushReady, sendPush } from "@/lib/server/push";

/** Sends a single notification to the calling device, to verify the setup. */
export async function POST(req: NextRequest) {
  if (!pushReady()) {
    return NextResponse.json({ error: "Push is not configured on the server." }, { status: 503 });
  }

  const { subscription } = (await req.json()) as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  };
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  const result = await sendPush(
    { endpoint, p256dh, auth },
    {
      title: "Ember works 🔥",
      body: "Notifications are live. You'll get your daily summary and event reminders here.",
      url: "/",
      tag: "ember-test",
    },
  );

  if (result === "sent") return NextResponse.json({ ok: true });
  return NextResponse.json(
    { error: result === "gone" ? "This subscription expired — turn notifications off and on again." : "Push delivery failed." },
    { status: 502 },
  );
}
