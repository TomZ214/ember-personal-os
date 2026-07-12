import { NextResponse, type NextRequest } from "next/server";
import { icloudError, sendICloud } from "@/lib/server/icloud";
import type { GmailSendInput } from "@/lib/integrations/types";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { input, draft } = (await req.json()) as { input: GmailSendInput; draft?: boolean };
    if (!input?.to && !draft) {
      return NextResponse.json({ error: "recipient required" }, { status: 400 });
    }
    const attSize = (input.attachments ?? []).reduce((a, x) => a + x.base64.length, 0);
    if (attSize > 20 * 1_048_576) {
      return NextResponse.json({ error: "attachments too large (15 MB max)" }, { status: 413 });
    }
    await sendICloud(input, !!draft);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return icloudError(e);
  }
}
