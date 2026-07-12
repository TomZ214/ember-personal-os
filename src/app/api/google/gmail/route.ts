import { NextResponse, type NextRequest } from "next/server";
import { googleError } from "@/lib/server/google";
import { listMessages } from "@/lib/server/google-gmail";
import type { GmailBox } from "@/lib/integrations/types";

const BOXES: GmailBox[] = ["inbox", "starred", "sent", "drafts", "archive", "trash", "spam"];

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const box = (p.get("box") ?? "inbox") as GmailBox;
  if (!BOXES.includes(box)) return NextResponse.json({ error: "unknown box" }, { status: 400 });
  try {
    return NextResponse.json(await listMessages(box, p.get("q") ?? ""));
  } catch (e) {
    return googleError(e);
  }
}
