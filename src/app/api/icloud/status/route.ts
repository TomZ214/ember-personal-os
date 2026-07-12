import { NextResponse } from "next/server";
import { envReady } from "@/lib/server/session";
import { icloudSession } from "@/lib/server/icloud";
import type { ConnectionStatus } from "@/lib/integrations/types";

export async function GET() {
  const { ready, missing } = envReady(["TOKEN_ENCRYPTION_KEY"]);
  const session = ready ? await icloudSession() : null;
  const status: ConnectionStatus = {
    configured: ready,
    missing,
    connected: !!session,
    account: session?.email,
  };
  return NextResponse.json(status);
}
