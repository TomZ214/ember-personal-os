import { NextResponse } from "next/server";
import { GOOGLE_SESSION, readSession } from "@/lib/server/session";
import { googleConfigured, type GoogleSession } from "@/lib/server/google";
import type { ConnectionStatus } from "@/lib/integrations/types";

export async function GET() {
  const { ready, missing } = googleConfigured();
  const session = ready ? await readSession<GoogleSession>(GOOGLE_SESSION) : null;
  const status: ConnectionStatus = {
    configured: ready,
    missing,
    connected: !!session,
    needsReconnect: session?.broken,
    account: session?.email,
  };
  return NextResponse.json(status);
}
