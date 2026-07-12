import { NextResponse } from "next/server";
import { disconnectGoogle } from "@/lib/server/google";

export async function POST() {
  await disconnectGoogle();
  return NextResponse.json({ ok: true });
}
