import { NextResponse, type NextRequest } from "next/server";
import { googleError } from "@/lib/server/google";
import { createEvent, listEvents } from "@/lib/server/google-calendar";
import type { GEventInput } from "@/lib/integrations/types";

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const timeMin = p.get("timeMin");
  const timeMax = p.get("timeMax");
  const tz = p.get("tz") ?? "Europe/Berlin";
  if (!timeMin || !timeMax) {
    return NextResponse.json({ error: "timeMin/timeMax required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await listEvents(timeMin, timeMax, tz));
  } catch (e) {
    return googleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { input, tz } = (await req.json()) as { input: GEventInput; tz: string };
    if (!input?.title || !input.date) {
      return NextResponse.json({ error: "invalid event" }, { status: 400 });
    }
    await createEvent(input, tz ?? "Europe/Berlin");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return googleError(e);
  }
}
