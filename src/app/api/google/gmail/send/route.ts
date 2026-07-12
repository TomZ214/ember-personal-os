import { NextResponse, type NextRequest } from "next/server";
import { googleError } from "@/lib/server/google";
import { sendMessage } from "@/lib/server/google-gmail";
import type { GmailSendInput } from "@/lib/integrations/types";

export async function POST(req: NextRequest) {
  try {
    const { input, draft } = (await req.json()) as { input: GmailSendInput; draft?: boolean };
    if (!input?.to && !draft) {
      return NextResponse.json({ error: "recipient required" }, { status: 400 });
    }
    // keep request bodies sane: 20 MB of base64 ≈ 15 MB attachments
    const attSize = (input.attachments ?? []).reduce((a, x) => a + x.base64.length, 0);
    if (attSize > 20 * 1_048_576) {
      return NextResponse.json({ error: "attachments too large (15 MB max)" }, { status: 413 });
    }
    await sendMessage(input, !!draft);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return googleError(e);
  }
}
