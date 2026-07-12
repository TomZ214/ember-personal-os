import { NextResponse } from "next/server";
import { googleError } from "@/lib/server/google";
import { listContacts } from "@/lib/server/google-contacts";

export async function GET() {
  try {
    return NextResponse.json({ contacts: await listContacts() });
  } catch (e) {
    return googleError(e);
  }
}
