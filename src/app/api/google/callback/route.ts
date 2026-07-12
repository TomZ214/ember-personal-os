import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { appUrl, GOOGLE_SESSION, writeSession } from "@/lib/server/session";
import { exchangeCode } from "@/lib/server/google";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const back = (suffix: string) => NextResponse.redirect(`${appUrl()}/settings/connections${suffix}`);

  const error = url.searchParams.get("error");
  if (error) return back(`?error=${encodeURIComponent(error)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expected = store.get("ember.oauth_state")?.value;
  store.delete("ember.oauth_state");

  if (!code || !state || !expected || state !== expected) {
    return back("?error=oauth_state_mismatch");
  }

  try {
    const session = await exchangeCode(code);
    await writeSession(GOOGLE_SESSION, session);
    return back("?connected=google");
  } catch (e) {
    console.error("[google callback]", e);
    return back("?error=google_token_exchange_failed");
  }
}
