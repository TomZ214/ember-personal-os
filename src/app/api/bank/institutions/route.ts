import { NextResponse, type NextRequest } from "next/server";
import { bankConfigured, bankError, searchInstitutions } from "@/lib/server/enablebanking";

export async function GET(req: NextRequest) {
  const { ready, missing } = bankConfigured();
  if (!ready) return NextResponse.json({ error: "not_configured", missing }, { status: 503 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ institutions: await searchInstitutions(q) });
  } catch (e) {
    return bankError(e);
  }
}
