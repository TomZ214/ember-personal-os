import { NextResponse } from "next/server";
import { bankError, bankSession, getTransactions } from "@/lib/server/enablebanking";
import { detectSubscriptions } from "@/lib/finance/categorize";

export async function GET() {
  const session = await bankSession();
  if (!session?.linked) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  try {
    const transactions = await getTransactions(session);
    return NextResponse.json({
      transactions,
      subscriptions: detectSubscriptions(transactions),
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    return bankError(e);
  }
}
