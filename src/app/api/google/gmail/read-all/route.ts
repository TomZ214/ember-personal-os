import { NextResponse } from "next/server";
import { googleError } from "@/lib/server/google";
import { markAllReadBatch } from "@/lib/server/google-gmail";

/**
 * Marks one batch (≤1000) of unread inbox mail as read and reports what's
 * left. The client keeps calling until `remaining` is 0 — full-mailbox
 * "read all" with progress, no timeouts, quota-friendly.
 */
export async function POST() {
  try {
    return NextResponse.json(await markAllReadBatch());
  } catch (e) {
    return googleError(e);
  }
}
