import { NextResponse, type NextRequest } from "next/server";
import { googleError } from "@/lib/server/google";
import { cleanupBatch, cleanupPreview, type CleanupOptions } from "@/lib/server/google-gmail";

interface CleanupRequest {
  action: "preview" | "batch";
  options: CleanupOptions;
}

const SCOPES = new Set(["inbox", "promotions", "social", "updates", "spam"]);

export async function POST(req: NextRequest) {
  try {
    const { action, options } = (await req.json()) as CleanupRequest;
    if (
      !options ||
      !/^\d{4}-\d{2}-\d{2}$/.test(options.before ?? "") ||
      !Array.isArray(options.include) ||
      options.include.length === 0 ||
      options.include.some((s) => !SCOPES.has(s))
    ) {
      return NextResponse.json({ error: "invalid cleanup options" }, { status: 400 });
    }
    options.excludeLabels = Array.isArray(options.excludeLabels) ? options.excludeLabels.slice(0, 20) : [];

    if (action === "preview") return NextResponse.json(await cleanupPreview(options));
    if (action === "batch") return NextResponse.json(await cleanupBatch(options));
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return googleError(e);
  }
}
