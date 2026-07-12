import { NextResponse } from "next/server";
import { bankError, bankSession, getAccounts } from "@/lib/server/enablebanking";

export async function GET() {
  const session = await bankSession();
  if (!session?.linked) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  try {
    return NextResponse.json({ accounts: await getAccounts(session) });
  } catch (e) {
    return bankError(e);
  }
}
