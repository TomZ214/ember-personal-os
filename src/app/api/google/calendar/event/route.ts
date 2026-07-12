import { NextResponse, type NextRequest } from "next/server";
import { googleError } from "@/lib/server/google";
import { deleteEvent, updateEvent } from "@/lib/server/google-calendar";
import type { GEventInput } from "@/lib/integrations/types";

export async function PATCH(req: NextRequest) {
  try {
    const { calendarId, eventId, patch, tz } = (await req.json()) as {
      calendarId: string;
      eventId: string;
      patch: Partial<GEventInput>;
      tz: string;
    };
    if (!calendarId || !eventId) {
      return NextResponse.json({ error: "calendarId/eventId required" }, { status: 400 });
    }
    await updateEvent(calendarId, eventId, patch, tz ?? "Europe/Berlin");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return googleError(e);
  }
}

export async function DELETE(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const calendarId = p.get("calendarId");
  const eventId = p.get("eventId");
  if (!calendarId || !eventId) {
    return NextResponse.json({ error: "calendarId/eventId required" }, { status: 400 });
  }
  try {
    await deleteEvent(calendarId, eventId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return googleError(e);
  }
}
