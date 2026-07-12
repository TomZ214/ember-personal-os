import { NextResponse, type NextRequest } from "next/server";
import { bankConfigured, bankError, startConnection } from "@/lib/server/enablebanking";
import type { BankInstitution } from "@/lib/integrations/types";

export async function POST(req: NextRequest) {
  const { ready, missing } = bankConfigured();
  if (!ready) return NextResponse.json({ error: "not_configured", missing }, { status: 503 });
  try {
    const { institution } = (await req.json()) as { institution: BankInstitution };
    if (!institution?.id) return NextResponse.json({ error: "institution required" }, { status: 400 });
    const link = await startConnection(institution);
    return NextResponse.json({ link });
  } catch (e) {
    return bankError(e);
  }
}
