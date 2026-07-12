import { NextResponse, type NextRequest } from "next/server";
import { getICloudAttachment, icloudError } from "@/lib/server/icloud";
import type { GmailBox } from "@/lib/integrations/types";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const messageId = p.get("messageId");
  const box = (p.get("box") ?? "inbox") as GmailBox;
  const index = parseInt(p.get("index") ?? "");
  const filename = p.get("filename") ?? "attachment";
  if (!messageId || Number.isNaN(index)) {
    return NextResponse.json({ error: "messageId/index required" }, { status: 400 });
  }
  try {
    const { content, mimeType } = await getICloudAttachment(messageId, box, index);
    return new NextResponse(new Uint8Array(content), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (e) {
    return icloudError(e);
  }
}
