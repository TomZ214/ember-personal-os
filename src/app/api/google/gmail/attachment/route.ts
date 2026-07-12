import { NextResponse, type NextRequest } from "next/server";
import { googleError } from "@/lib/server/google";
import { getAttachment } from "@/lib/server/google-gmail";

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const messageId = p.get("messageId");
  const attachmentId = p.get("attachmentId");
  const filename = p.get("filename") ?? "attachment";
  const mimeType = p.get("mimeType") ?? "application/octet-stream";
  if (!messageId || !attachmentId) {
    return NextResponse.json({ error: "messageId/attachmentId required" }, { status: 400 });
  }
  try {
    const buf = await getAttachment(messageId, attachmentId);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (e) {
    return googleError(e);
  }
}
