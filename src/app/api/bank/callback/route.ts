import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/server/session";
import { completeLink } from "@/lib/server/enablebanking";

/** the bank redirects here after the user authorizes (or aborts) the link */
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const back = (suffix: string) => NextResponse.redirect(`${appUrl()}/settings/connections${suffix}`);

  if (p.get("error")) return back("?error=bank_link_not_authorized");
  const code = p.get("code");
  if (!code) return back("?error=bank_link_not_authorized");

  try {
    const linked = await completeLink(code);
    return back(linked ? "?connected=bank" : "?error=bank_link_not_authorized");
  } catch (e) {
    console.error("[bank callback]", e);
    return back("?error=bank_callback_failed");
  }
}
