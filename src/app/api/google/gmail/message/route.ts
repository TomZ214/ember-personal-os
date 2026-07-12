import { NextResponse, type NextRequest } from "next/server";
import { googleError } from "@/lib/server/google";
import { getMessage, modifyMessage, type GmailAction } from "@/lib/server/google-gmail";

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    return NextResponse.json(await getMessage(id));
  } catch (e) {
    return googleError(e);
  }
}

const ACTIONS: GmailAction[] = ["read", "unread", "star", "unstar", "archive", "unarchive", "trash", "untrash", "spam"];

export async function POST(req: NextRequest) {
  try {
    const { id, action } = (await req.json()) as { id: string; action: GmailAction };
    if (!id || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }
    await modifyMessage(id, action);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return googleError(e);
  }
}
