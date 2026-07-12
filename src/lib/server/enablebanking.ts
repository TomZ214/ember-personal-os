import "server-only";
import { readFileSync } from "node:fs";
import { sign } from "node:crypto";
import { NextResponse } from "next/server";
import { appUrl, BANK_SESSION, clearSession, readSession, writeSession } from "./session";
import { categorize, cleanMerchant } from "@/lib/finance/categorize";
import type { BankAccount, BankInstitution, BankTxn } from "@/lib/integrations/types";

/**
 * Enable Banking (enablebanking.com) — PSD2/Open Banking access to 2,500+
 * European banks including Sparkasse Heidelberg. Self-serve signup, free for
 * your own accounts ("restricted production"). Replaces GoCardless, which
 * closed new signups. No scraping — SCA happens at the bank itself; we only
 * ever get read-only account information.
 *
 * Auth: a short-lived JWT (RS256) signed with an RSA private key you generate.
 * The private key lives only on the server (a PEM file, never in a bundle);
 * the app id + key path come from env.
 */

const BASE = "https://api.enablebanking.com";

export const BANK_ENV = ["ENABLEBANKING_APP_ID", "TOKEN_ENCRYPTION_KEY"];

function privateKeyPath(): string {
  return process.env.ENABLEBANKING_PRIVATE_KEY_PATH || "enablebanking_private.pem";
}

/**
 * Load the RSA private key. Two ways, so it works both locally and on
 * serverless hosts (Netlify/Vercel) where there is no persistent filesystem:
 *   1. ENABLEBANKING_PRIVATE_KEY env var — raw PEM, PEM with escaped "\n",
 *      or base64-encoded PEM (easiest to paste into a host's env UI).
 *   2. a PEM file on disk (default: enablebanking_private.pem) — the local
 *      default from `npm run bank:keys`.
 */
function loadPrivateKey(): string | null {
  const env = process.env.ENABLEBANKING_PRIVATE_KEY?.trim();
  if (env) {
    let pem = env.includes("BEGIN") ? env : safeBase64(env);
    pem = pem.replace(/\\n/g, "\n");
    if (pem.includes("BEGIN")) return pem;
  }
  try {
    return readFileSync(privateKeyPath(), "utf8");
  } catch {
    return null;
  }
}

function safeBase64(s: string): string {
  try {
    return Buffer.from(s, "base64").toString("utf8");
  } catch {
    return s;
  }
}

export function bankConfigured(): { ready: boolean; missing: string[] } {
  const missing = BANK_ENV.filter((v) => !process.env[v]);
  if (!loadPrivateKey()) missing.push("ENABLEBANKING_PRIVATE_KEY (run: npm run bank:keys)");
  return { ready: missing.length === 0, missing };
}

export interface BankSession {
  /** set after /auth, before the user returns from their bank */
  authorizationId?: string;
  state: string;
  institutionName: string;
  institutionCountry: string;
  institutionLogo: string;
  /** set after /sessions once the bank link is authorized */
  sessionId?: string;
  accountUids?: string[];
  linked: boolean;
  connectedAt: string;
}

export class BankError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

/* ---------- JWT ---------- */

let cachedJwt: { token: string; exp: number } | null = null;

function jwt(): string {
  if (cachedJwt && Date.now() / 1000 < cachedJwt.exp - 60) return cachedJwt.token;
  const appId = process.env.ENABLEBANKING_APP_ID!;
  const pem = loadPrivateKey();
  if (!pem) throw new BankError("Enable Banking private key missing — run `npm run bank:keys`", 500);
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ typ: "JWT", alg: "RS256", kid: appId });
  const body = enc({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp });
  const signingInput = `${head}.${body}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), pem).toString("base64url");
  const token = `${signingInput}.${signature}`;
  cachedJwt = { token, exp };
  return token;
}

async function eb<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (res.status === 401) throw new BankError("Enable Banking rejected the request — check your App ID and key", 401);
  if (res.status === 429) throw new BankError("Bank API rate limit reached — try again shortly", 429);
  if (!res.ok) throw new BankError(`Enable Banking ${path} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ---------- institutions ---------- */

interface RawAspsp {
  name: string;
  country: string;
  logo?: string;
}

export async function searchInstitutions(query: string): Promise<BankInstitution[]> {
  const data = await eb<{ aspsps: RawAspsp[] }>(`/aspsps?country=DE`);
  const q = query.toLowerCase();
  return (data.aspsps ?? [])
    .filter((a) => !q || a.name.toLowerCase().includes(q))
    .slice(0, 12)
    // id encodes name+country so we can round-trip it back into /auth
    .map((a) => ({ id: `${a.name}|${a.country}`, name: a.name, logo: a.logo ?? "" }));
}

/* ---------- connect flow ---------- */

export async function startConnection(institution: BankInstitution): Promise<string> {
  const [name, country] = institution.id.split("|");
  const state = crypto.randomUUID();
  const validUntil = new Date(Date.now() + 90 * 86_400_000).toISOString();

  const res = await eb<{ url: string; authorization_id: string }>(`/auth`, {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name, country: country || "DE" },
      state,
      redirect_url: `${appUrl()}/api/bank/callback`,
      psu_type: "personal",
    }),
  });

  await writeSession(BANK_SESSION, {
    authorizationId: res.authorization_id,
    state,
    institutionName: name,
    institutionCountry: country || "DE",
    institutionLogo: institution.logo,
    linked: false,
    connectedAt: new Date().toISOString(),
  } satisfies BankSession, 90);

  return res.url;
}

/** called from the callback with the code the bank returned; creates the session */
export async function completeLink(code: string): Promise<boolean> {
  const session = await readSession<BankSession>(BANK_SESSION);
  if (!session) return false;
  const res = await eb<{ session_id: string; accounts: { uid: string }[] }>(`/sessions`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  await writeSession(
    BANK_SESSION,
    { ...session, sessionId: res.session_id, accountUids: res.accounts.map((a) => a.uid), linked: true },
    90,
  );
  return true;
}

export async function bankSession(): Promise<BankSession | null> {
  return readSession<BankSession>(BANK_SESSION);
}

export async function disconnectBank(): Promise<void> {
  const session = await readSession<BankSession>(BANK_SESSION);
  if (session?.sessionId) {
    // revoke the session at the provider (best effort)
    await eb(`/sessions/${session.sessionId}`, { method: "DELETE" }).catch(() => {});
  }
  await clearSession(BANK_SESSION);
}

/* ---------- data ---------- */

interface RawBalance {
  balance_amount: { amount: string; currency: string };
  balance_type?: string;
}

interface RawAccountDetails {
  account_id?: { iban?: string };
  name?: string;
  product?: string;
  currency?: string;
  cash_account_type?: string;
}

export async function getAccounts(session: BankSession): Promise<BankAccount[]> {
  const uids = session.accountUids ?? [];
  return Promise.all(
    uids.map(async (uid) => {
      const [details, balances] = await Promise.all([
        eb<RawAccountDetails>(`/accounts/${uid}/details`).catch(() => ({}) as RawAccountDetails),
        eb<{ balances: RawBalance[] }>(`/accounts/${uid}/balances`),
      ]);
      // prefer interim-available, then closing-booked, then the first reported
      const preferred =
        balances.balances.find((b) => b.balance_type === "ITAV") ??
        balances.balances.find((b) => b.balance_type === "CLBD") ??
        balances.balances.find((b) => b.balance_type === "XPCD") ??
        balances.balances[0];
      return {
        id: uid,
        iban: details.account_id?.iban ?? "",
        name: details.name ?? details.product ?? session.institutionName,
        currency: details.currency ?? preferred?.balance_amount.currency ?? "EUR",
        balance: parseFloat(preferred?.balance_amount.amount ?? "0"),
        balanceType: preferred?.balance_type ?? "unknown",
      };
    }),
  );
}

interface RawTxn {
  entry_reference?: string;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator?: "CRDT" | "DBIT";
  status?: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  remittance_information?: string[];
  creditor?: { name?: string };
  debtor?: { name?: string };
}

function mapTxn(raw: RawTxn, accountId: string): BankTxn {
  // Enable Banking reports a positive amount + a direction indicator
  const magnitude = parseFloat(raw.transaction_amount.amount);
  const amount = raw.credit_debit_indicator === "DBIT" ? -magnitude : magnitude;
  const remit = (raw.remittance_information ?? []).join(" ");
  const counterparty = (amount < 0 ? raw.creditor?.name : raw.debtor?.name) ?? "";
  const merchant = cleanMerchant(counterparty || remit);
  return {
    id: raw.entry_reference ?? crypto.randomUUID(),
    accountId,
    amount,
    currency: raw.transaction_amount.currency,
    date: raw.booking_date ?? raw.value_date ?? raw.transaction_date ?? new Date().toISOString().slice(0, 10),
    merchant,
    raw: remit || counterparty,
    category: categorize(merchant, remit, amount),
    pending: raw.status === "PDNG",
  };
}

export async function getTransactions(session: BankSession): Promise<BankTxn[]> {
  const uids = session.accountUids ?? [];
  const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const perAccount = await Promise.all(
    uids.map(async (uid) => {
      // one page of the last 90 days is plenty for the dashboard + finance views
      const data = await eb<{ transactions: RawTxn[] }>(
        `/accounts/${uid}/transactions?date_from=${from}`,
      );
      return (data.transactions ?? []).map((t) => mapTxn(t, uid));
    }),
  );
  return perAccount.flat().sort((a, b) => b.date.localeCompare(a.date));
}

export function bankError(e: unknown): NextResponse {
  if (e instanceof BankError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("[bank]", e);
  return NextResponse.json({ error: "bank_api_error", detail: String(e) }, { status: 502 });
}
