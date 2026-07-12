import { NextResponse } from "next/server";
import { disconnectBank } from "@/lib/server/enablebanking";

export async function POST() {
  await disconnectBank();
  return NextResponse.json({ ok: true });
}
