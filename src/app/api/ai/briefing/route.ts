import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * The daily briefing: Claude reads a snapshot of the day — tasks, calendar,
 * weather, unread mail, habits, alarms — and writes a short orientation in the
 * user's language.
 *
 * The snapshot is assembled on the client and sent here; nothing is read from
 * the database. Keys never reach the browser, same as the mail AI route.
 */

export const maxDuration = 30;

interface Snapshot {
  lang: "de" | "en";
  name?: string;
  /** local time of day, so the briefing can greet appropriately */
  hour: number;
  weekday: string;
  tasks: { title: string; overdue?: boolean; time?: string; priority?: string }[];
  events: { title: string; time?: string }[];
  habits: string[];
  alarms: { time: string; label?: string }[];
  unread?: number;
  weather?: { temp: number; min?: number; max?: number; summary?: string };
}

const SYSTEM = `You write a short daily briefing for one person's personal dashboard.

Rules:
- Write ONLY in the language given by the "lang" field. de = German (informal "du"), en = English.
- 2 to 4 sentences. No headings, no bullet points, no preamble, no sign-off.
- Open by orienting them in the day, then name what actually matters: what is
  overdue or time-critical first, then the rest. Mention the weather only when it
  changes what they should do (rain, cold, heat) — never as small talk.
- Be specific. Use the real titles and times you were given. Never invent an item.
- If the day is genuinely empty, say so plainly and warmly in one sentence. Do not
  manufacture urgency and do not pad.
- Sound like a level-headed colleague, not a cheerleader. No emoji, no exclamation
  marks, no "Let's crush it".`;

function provider(): "anthropic" | "openai" | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

async function claude(payload: string): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1000,
    system: SYSTEM,
    // A briefing is short-form writing, but deciding what actually matters today
    // is a judgement call — adaptive thinking at low effort keeps it quick while
    // still letting the model weigh the day before it writes.
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    messages: [{ role: "user", content: payload }],
  });
  // a refusal comes back as a normal 200 with no text block — check before reading
  if (response.stop_reason === "refusal") return "";
  return response.content.find((b) => b.type === "text")?.text ?? "";
}

async function chatgpt(payload: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: payload },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `OpenAI error ${res.status}`);
  return data.choices?.[0]?.message?.content ?? "";
}

export async function POST(req: NextRequest) {
  const active = provider();
  if (!active) {
    return NextResponse.json(
      { error: "not_configured", missing: ["ANTHROPIC_API_KEY or OPENAI_API_KEY"] },
      { status: 503 },
    );
  }

  const snapshot = (await req.json()) as Snapshot;
  if (snapshot?.lang !== "de" && snapshot?.lang !== "en") {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  // trimmed hard: the model only needs today, and a smaller payload is cheaper
  const payload = JSON.stringify({
    lang: snapshot.lang,
    name: snapshot.name?.slice(0, 40),
    hour: snapshot.hour,
    weekday: snapshot.weekday,
    tasks: (snapshot.tasks ?? []).slice(0, 12),
    events: (snapshot.events ?? []).slice(0, 12),
    habits: (snapshot.habits ?? []).slice(0, 10),
    alarms: (snapshot.alarms ?? []).slice(0, 5),
    unread: snapshot.unread,
    weather: snapshot.weather,
  });

  try {
    const text = active === "anthropic" ? await claude(payload) : await chatgpt(payload);
    if (!text.trim()) {
      return NextResponse.json({ error: "empty_response" }, { status: 502 });
    }
    return NextResponse.json({ briefing: text.trim() });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `AI request failed (${e.status})` }, { status: 502 });
    }
    console.error("[ai/briefing]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "ai_error" }, { status: 502 });
  }
}
