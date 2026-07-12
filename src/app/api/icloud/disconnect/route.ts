import { NextResponse } from "next/server";
import { disconnectICloud } from "@/lib/server/icloud";

export async function POST() {
  await disconnectICloud();
  return NextResponse.json({ ok: true });
}
