import { NextResponse } from "next/server";
import { googleError, googleJson } from "@/lib/server/google";

/** lightweight unread counter for the dashboard */
export async function GET() {
  try {
    const label = await googleJson<{ messagesUnread?: number }>(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX",
    );
    return NextResponse.json({ unread: label.messagesUnread ?? 0 });
  } catch (e) {
    return googleError(e);
  }
}
