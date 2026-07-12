import { NextResponse, type NextRequest } from "next/server";
import { icloudError, listICloud } from "@/lib/server/icloud";
import type { GmailBox } from "@/lib/integrations/types";

export const maxDuration = 30;

const BOXES: GmailBox[] = ["inbox", "starred", "sent", "drafts", "archive", "trash", "spam"];

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const box = (p.get("box") ?? "inbox") as GmailBox;
  if (!BOXES.includes(box)) return NextResponse.json({ error: "unknown box" }, { status: 400 });
  try {
    return NextResponse.json(await listICloud(box, p.get("q") ?? ""));
  } catch (e) {
    return icloudError(e);
  }
}
