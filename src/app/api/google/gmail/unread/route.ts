import { NextResponse } from "next/server";
import { googleError, googleJson } from "@/lib/server/google";

/**
 * Lightweight unread counter for the dashboard + welcome alert.
 * Both numbers ride along in one browser round-trip; the Sparkasse probe asks
 * Gmail for nothing but the result count (fields=resultSizeEstimate), so no
 * message bodies are ever fetched.
 */
export async function GET() {
  try {
    const [label, important] = await Promise.all([
      googleJson<{ messagesUnread?: number }>(
        "https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX",
      ),
      googleJson<{ resultSizeEstimate?: number }>(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages" +
          `?q=${encodeURIComponent("is:unread in:inbox from:sparkasse")}` +
          "&maxResults=1&fields=resultSizeEstimate",
      ).catch(() => ({ resultSizeEstimate: 0 })),
    ]);
    return NextResponse.json({
      unread: label.messagesUnread ?? 0,
      important: important.resultSizeEstimate ?? 0,
    });
  } catch (e) {
    return googleError(e);
  }
}
