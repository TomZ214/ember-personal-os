import { NextResponse } from "next/server";
import { icloudError, markAllICloudRead } from "@/lib/server/icloud";

export const maxDuration = 30;

/** IMAP marks all unseen inbox mail in a single STORE — no batching needed */
export async function POST() {
  try {
    return NextResponse.json(await markAllICloudRead());
  } catch (e) {
    return icloudError(e);
  }
}
