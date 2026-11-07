import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Calorie tracker: estimate the foods in a description and/or a photo.
 * Optional like every AI feature — needs ANTHROPIC_API_KEY on the server; the
 * client hides the AI tab when GET reports it is not configured. The key never
 * reaches the browser, and the client validates every number it gets back.
 */

export const maxDuration = 60;

const MODEL = "claude-opus-5-5";
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];
/** the client downsizes photos to ~1 MP JPEG; anything far larger is not ours */
const MAX_IMAGE_BASE64 = 4_000_000;
const MAX_TEXT = 2000;

const SYSTEM = `You estimate nutrition for a calorie tracker. The user describes a meal, sends a photo of it, or both.
List every distinct food or drink you can identify as a separate item. For each give a short name, the amount in grams (millilitres for drinks), and the totals for that amount: kcal, protein, carbs and fat in grams.
Use typical recipes and realistic portions when the amount is not stated; if the user names an amount, use it exactly. Count visible oil, sauces and dressings. Carbohydrates exclude fibre, as on EU labels.
If the photo or text contains no food, return an empty list.
Write the item names in {LANG}.`;

const SCHEMA = {
  type: "object" as const,
  properties: {
    items: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          grams: { type: "number" as const },
          kcal: { type: "number" as const },
          protein: { type: "number" as const },
          carbs: { type: "number" as const },
          fat: { type: "number" as const },
        },
        required: ["name", "grams", "kcal", "protein", "carbs", "fat"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

export async function GET() {
  return NextResponse.json({ configured: !!process.env.ANTHROPIC_API_KEY });
}

interface Body {
  text?: unknown;
  image?: { data?: unknown; mediaType?: unknown };
  lang?: unknown;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const data = typeof body.image?.data === "string" ? body.image.data : "";
  const mediaType = body.image?.mediaType as MediaType;
  if (text.length > MAX_TEXT) return NextResponse.json({ error: "text_too_long" }, { status: 413 });
  if (data && (data.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(data))) {
    return NextResponse.json({ error: "invalid_image" }, { status: 413 });
  }
  if (data && !MEDIA_TYPES.includes(mediaType)) return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  if (!text && !data) return NextResponse.json({ error: "empty" }, { status: 400 });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (data) content.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
  content.push({ type: "text", text: text || "Estimate the food in this photo." });

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM.replace("{LANG}", body.lang === "de" ? "German" : "English"),
      messages: [{ role: "user", content }],
      // a quick, routine estimate: low effort keeps it fast
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      // if a safety classifier ever declines, retry on the previous Opus instead of failing
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
    });
    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "refused" }, { status: 422 });
    }
    const out = response.content.find((b) => b.type === "text");
    const parsed = out?.type === "text" ? (JSON.parse(out.text) as { items?: unknown }) : { items: [] };
    return NextResponse.json({ items: Array.isArray(parsed.items) ? parsed.items : [] });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `ai_failed_${e.status ?? "unknown"}` }, { status: 502 });
    }
    console.error("[ai/nutrition]", e);
    return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  }
}
