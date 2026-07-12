import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appUrl } from "@/lib/server/session";
import { authUrl, googleConfigured } from "@/lib/server/google";

export async function GET() {
  const { ready } = googleConfigured();
  if (!ready) {
    return NextResponse.redirect(`${appUrl()}/settings/connections?error=google_not_configured`);
  }
  const state = crypto.randomUUID();
  const store = await cookies();
  store.set("ember.oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return NextResponse.redirect(authUrl(state));
}
