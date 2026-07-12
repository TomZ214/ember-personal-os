import "server-only";
import { cookies } from "next/headers";
import { decrypt, encrypt } from "./crypto";

/**
 * Encrypted, httpOnly, sameSite=lax JSON cookies. One cookie per integration
 * so disconnecting one never touches another.
 */

export async function readSession<T>(name: string): Promise<T | null> {
  const store = await cookies();
  const raw = store.get(name)?.value;
  if (!raw) return null;
  const plain = decrypt(raw);
  if (!plain) return null;
  try {
    return JSON.parse(plain) as T;
  } catch {
    return null;
  }
}

export async function writeSession(name: string, value: unknown, maxAgeDays = 180): Promise<void> {
  const store = await cookies();
  store.set(name, encrypt(JSON.stringify(value)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeDays * 86_400,
  });
}

export async function clearSession(name: string): Promise<void> {
  const store = await cookies();
  store.delete(name);
}

export const GOOGLE_SESSION = "ember.google";
export const BANK_SESSION = "ember.bank";

/** true when the required env vars for an integration are present */
export function envReady(vars: string[]): { ready: boolean; missing: string[] } {
  const missing = vars.filter((v) => !process.env[v]);
  return { ready: missing.length === 0, missing };
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}
