import "server-only";
import { googleJson } from "./google";
import type { GCalendar, GEvent, GEventInput } from "@/lib/integrations/types";

const BASE = "https://www.googleapis.com/calendar/v3";

interface RawCalendar {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole: string;
}

interface RawEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  colorId?: string;
  recurringEventId?: string;
  recurrence?: string[];
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
  reminders?: { useDefault?: boolean; overrides?: { minutes: number }[] };
}

let eventColorCache: Record<string, string> | null = null;

async function eventColors(): Promise<Record<string, string>> {
  if (eventColorCache) return eventColorCache;
  const data = await googleJson<{ event: Record<string, { background: string }> }>(`${BASE}/colors`);
  eventColorCache = Object.fromEntries(Object.entries(data.event).map(([k, v]) => [k, v.background]));
  return eventColorCache;
}

export async function listCalendars(): Promise<GCalendar[]> {
  const data = await googleJson<{ items: RawCalendar[] }>(`${BASE}/users/me/calendarList`);
  return (data.items ?? [])
    .filter((c) => c.accessRole === "owner" || c.accessRole === "writer" || c.accessRole === "reader")
    .map((c) => ({
      id: c.id,
      name: c.summary,
      color: c.backgroundColor ?? "#7986cb",
      primary: !!c.primary,
    }));
}

function minutesOf(dateTime: string): number {
  return parseInt(dateTime.slice(11, 13)) * 60 + parseInt(dateTime.slice(14, 16));
}

function mapEvent(raw: RawEvent, calendarId: string, calColor: string, palette: Record<string, string>): GEvent | null {
  if (raw.status === "cancelled") return null;
  const allDay = !!raw.start.date;
  const date = allDay ? raw.start.date! : raw.start.dateTime!.slice(0, 10);
  return {
    id: raw.id,
    calendarId,
    title: raw.summary ?? "(untitled)",
    date,
    start: allDay ? 0 : minutesOf(raw.start.dateTime!),
    end: allDay ? 24 * 60 : minutesOf(raw.end.dateTime ?? raw.start.dateTime!),
    allDay,
    color: (raw.colorId && palette[raw.colorId]) || calColor,
    location: raw.location,
    notes: raw.description,
    attendees: (raw.attendees ?? []).map((a) => ({
      email: a.email,
      name: a.displayName,
      status: (a.responseStatus as GEvent["attendees"][number]["status"]) ?? "needsAction",
    })),
    recurring: !!raw.recurringEventId || !!raw.recurrence,
    reminders: raw.reminders?.useDefault ? [10] : (raw.reminders?.overrides ?? []).map((o) => o.minutes),
  };
}

/** all events across the user's calendars in [timeMin, timeMax), recurring expanded */
export async function listEvents(timeMin: string, timeMax: string, tz: string): Promise<{ calendars: GCalendar[]; events: GEvent[] }> {
  const [calendars, palette] = await Promise.all([listCalendars(), eventColors()]);
  const perCal = await Promise.all(
    calendars.map(async (cal) => {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
        timeZone: tz,
      });
      const data = await googleJson<{ items: RawEvent[] }>(
        `${BASE}/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
      );
      return (data.items ?? [])
        .map((e) => mapEvent(e, cal.id, cal.color, palette))
        .filter((e): e is GEvent => !!e);
    }),
  );
  return { calendars, events: perCal.flat() };
}

function toDateTime(date: string, minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${date}T${h}:${m}:00`;
}

function eventBody(input: GEventInput, tz: string) {
  const body: Record<string, unknown> = {
    summary: input.title,
    location: input.location || undefined,
    description: input.notes || undefined,
    start: { dateTime: toDateTime(input.date, input.start), timeZone: tz },
    end: { dateTime: toDateTime(input.date, input.end), timeZone: tz },
  };
  if (input.recurrence === "daily") body.recurrence = ["RRULE:FREQ=DAILY"];
  if (input.recurrence === "weekly") body.recurrence = ["RRULE:FREQ=WEEKLY"];
  return body;
}

export async function createEvent(input: GEventInput, tz: string): Promise<void> {
  const cal = input.calendarId ?? "primary";
  await googleJson(`${BASE}/calendars/${encodeURIComponent(cal)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(eventBody(input, tz)),
  });
}

export async function updateEvent(
  calendarId: string,
  eventId: string,
  patch: Partial<GEventInput>,
  tz: string,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.summary = patch.title;
  if (patch.location !== undefined) body.location = patch.location;
  if (patch.notes !== undefined) body.description = patch.notes;
  if (patch.date !== undefined && patch.start !== undefined && patch.end !== undefined) {
    body.start = { dateTime: toDateTime(patch.date, patch.start), timeZone: tz };
    body.end = { dateTime: toDateTime(patch.date, patch.end), timeZone: tz };
  }
  await googleJson(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
}

export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  await googleJson(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
}
