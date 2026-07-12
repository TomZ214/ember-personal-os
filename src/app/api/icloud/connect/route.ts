import { NextResponse, type NextRequest } from "next/server";
import { connectICloud, icloudError } from "@/lib/server/icloud";

export const maxDuration = 30;

/**
 * Verifies the Apple ID + app-specific password with a real IMAP login and
 * only then stores them (AES-256-GCM, httpOnly). The password is never
 * included in any response.
 */
export async function POST(req: NextRequest) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email?.includes("@") || !password || password.length < 8) {
    return NextResponse.json({ error: "Enter your iCloud address and an app-specific password" }, { status: 400 });
  }
  try {
    await connectICloud(email, password);
    return NextResponse.json({ ok: true, account: email.trim() });
  } catch (e) {
    return icloudError(e);
  }
}
