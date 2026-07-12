import { NextResponse } from "next/server";
import { bankConfigured, bankSession } from "@/lib/server/enablebanking";
import type { ConnectionStatus } from "@/lib/integrations/types";

export async function GET() {
  const { ready, missing } = bankConfigured();
  const session = ready ? await bankSession() : null;
  const status: ConnectionStatus = {
    configured: ready,
    missing,
    connected: !!session?.linked,
    needsReconnect: !!session && !session.linked,
    account: session?.institutionName,
  };
  return NextResponse.json(status);
}
