import "server-only";
import { NextResponse } from "next/server";
import { appUrl, clearSession, envReady, GOOGLE_SESSION, readSession, writeSession } from "./session";

/**
 * Google OAuth2 (authorization-code flow with offline access) plus a fetch
 * wrapper that transparently refreshes the access token. Tokens live only in
 * the encrypted httpOnly session cookie — they are never sent to the client.
 */

export const GOOGLE_ENV = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"];

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

export interface GoogleSession {
  refreshToken: string;
  accessToken: string;
  /** epoch ms when accessToken expires */
  expiresAt: number;
  email: string;
  /** set when the refresh token stopped working — UI offers "Reconnect" */
  broken?: boolean;
}

export function googleConfigured() {
  return envReady(GOOGLE_ENV);
}

export function redirectUri(): string {
  return `${appUrl()}/api/google/callback`;
}

export function authUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  error?: string;
}

export async function exchangeCode(code: string): Promise<GoogleSession> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(`Google token exchange failed: ${data.error ?? res.status}`);
  }
  // identify the account for the connections UI
  const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  }).then((r) => r.json());

  return {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    email: info.email ?? "Google account",
  };
}

async function refresh(session: GoogleSession): Promise<GoogleSession> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: session.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    // refresh token revoked or expired — mark the session so the UI can offer reconnect
    const broken = { ...session, broken: true };
    await writeSession(GOOGLE_SESSION, broken);
    throw new GoogleAuthError("reconnect_required");
  }
  const next: GoogleSession = {
    ...session,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    broken: undefined,
  };
  await writeSession(GOOGLE_SESSION, next);
  return next;
}

export class GoogleAuthError extends Error {}

/** current session with a guaranteed-fresh access token */
export async function freshGoogleSession(): Promise<GoogleSession> {
  const session = await readSession<GoogleSession>(GOOGLE_SESSION);
  if (!session) throw new GoogleAuthError("not_connected");
  if (session.broken) throw new GoogleAuthError("reconnect_required");
  if (Date.now() < session.expiresAt) return session;
  return refresh(session);
}

/**
 * authenticated fetch against googleapis.com with one auto-refresh retry on
 * 401 and a short backoff retry on 429 (fresh Google Cloud projects have low
 * per-user concurrency quotas)
 */
export async function googleFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let session = await freshGoogleSession();
  const doFetch = (token: string) =>
    fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  let res = await doFetch(session.accessToken);
  if (res.status === 401) {
    session = await refresh(session);
    res = await doFetch(session.accessToken);
  }
  for (let attempt = 0; res.status === 429 && attempt < 2; attempt++) {
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    res = await doFetch(session.accessToken);
  }
  return res;
}

/** run async work over items with bounded concurrency (Google per-user limits) */
export async function googlePool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const idx = next++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export async function googleJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await googleFetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google API ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function disconnectGoogle(): Promise<void> {
  const session = await readSession<GoogleSession>(GOOGLE_SESSION);
  if (session) {
    // best effort: revoke at Google so the grant disappears from the account
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(session.refreshToken)}`,
      { method: "POST" },
    ).catch(() => {});
  }
  await clearSession(GOOGLE_SESSION);
}

/** uniform error → HTTP response mapping for google routes */
export function googleError(e: unknown): NextResponse {
  if (e instanceof GoogleAuthError) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  console.error("[google]", e);
  return NextResponse.json({ error: "google_api_error", detail: String(e) }, { status: 502 });
}
