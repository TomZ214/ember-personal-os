import { NextResponse, type NextRequest } from "next/server";
import { actICloud, getICloudMessage, icloudError, type ICloudAction } from "@/lib/server/icloud";
import type { GmailBox } from "@/lib/integrations/types";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const id = p.get("id");
  const box = (p.get("box") ?? "inbox") as GmailBox;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    return NextResponse.json(await getICloudMessage(id, box));
  } catch (e) {
    return icloudError(e);
  }
}

const ACTIONS: ICloudAction[] = ["read", "unread", "star", "unstar", "archive", "unarchive", "trash", "untrash", "spam"];

export async function POST(req: NextRequest) {
  try {
    const { id, action, box } = (await req.json()) as { id: string; action: ICloudAction; box?: GmailBox };
    if (!id || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }
    await actICloud(id, box ?? "inbox", action);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return icloudError(e);
  }
}
