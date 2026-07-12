import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * AI features for Mail: summaries and smart replies.
 * Optional — works with ANTHROPIC_API_KEY (Claude, preferred) or
 * OPENAI_API_KEY (ChatGPT). The client hides AI affordances when neither
 * is configured. Keys never reach the browser.
 */

export const maxDuration = 30;

interface AiRequest {
  kind: "summarize" | "replies";
  subject: string;
  from: string;
  body: string;
}

const SUMMARIZE_SYSTEM =
  "You summarize emails for a personal dashboard. Reply with 1-2 short sentences capturing what the sender wants, then, only if the email contains concrete action items or dates, up to 3 bullet lines starting with '• '. No preamble, no headings. Match the email's language.";

const REPLIES_SYSTEM =
  "You draft smart replies for the recipient of an email. Produce exactly 3 alternative replies: one brief positive/agreeing, one asking a clarifying question, one politely declining or deferring. Each 1-3 sentences, ready to send, in the email's language, no placeholders like [name]. Respond with JSON: {\"replies\": [\"...\", \"...\", \"...\"]}";

const REPLY_SCHEMA = {
  type: "object" as const,
  properties: {
    replies: {
      type: "array" as const,
      items: { type: "string" as const },
    },
  },
  required: ["replies"],
  additionalProperties: false,
};

function provider(): "anthropic" | "openai" | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export async function GET() {
  return NextResponse.json({ configured: provider() !== null });
}

/* ---------- provider calls ---------- */

async function claude(kind: AiRequest["kind"], email: string): Promise<string> {
  const client = new Anthropic();
  if (kind === "summarize") {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 300,
      system: SUMMARIZE_SYSTEM,
      messages: [{ role: "user", content: email }],
    });
    return response.content.find((b) => b.type === "text")?.text ?? "";
  }
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 400,
    system: REPLIES_SYSTEM,
    messages: [{ role: "user", content: email }],
    output_config: { format: { type: "json_schema", schema: REPLY_SCHEMA } },
  });
  return response.content.find((b) => b.type === "text")?.text ?? "{}";
}

async function chatgpt(kind: AiRequest["kind"], email: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: kind === "summarize" ? 300 : 400,
      messages: [
        { role: "system", content: kind === "summarize" ? SUMMARIZE_SYSTEM : REPLIES_SYSTEM },
        { role: "user", content: email },
      ],
      ...(kind === "replies" ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `OpenAI error ${res.status}`);
  }
  return data.choices?.[0]?.message?.content ?? (kind === "replies" ? "{}" : "");
}

/* ---------- route ---------- */

export async function POST(req: NextRequest) {
  const active = provider();
  if (!active) {
    return NextResponse.json(
      { error: "not_configured", missing: ["ANTHROPIC_API_KEY or OPENAI_API_KEY"] },
      { status: 503 },
    );
  }
  const { kind, subject, from, body } = (await req.json()) as AiRequest;
  if (!body || (kind !== "summarize" && kind !== "replies")) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const email = `From: ${from}\nSubject: ${subject}\n\n${body.slice(0, 12_000)}`;

  try {
    const text = active === "anthropic" ? await claude(kind, email) : await chatgpt(kind, email);
    if (kind === "summarize") {
      return NextResponse.json({ summary: text.trim() });
    }
    const parsed = JSON.parse(text) as { replies?: string[] };
    return NextResponse.json({ replies: (parsed.replies ?? []).slice(0, 3) });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `AI request failed (${e.status})` }, { status: 502 });
    }
    console.error("[ai]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "ai_error" }, { status: 502 });
  }
}
