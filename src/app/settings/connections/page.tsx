"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  ArrowLeft, Bell, BellOff, CalendarDays, ChevronRight, Cloud, Copy, HeartHandshake, Landmark,
  Loader2, LogOut, Mail, MailCheck, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, Unplug,
  Users,
} from "lucide-react";
import {
  lastSynced, markSynced, useBank, useGoogleStatus,
} from "@/hooks/useIntegrations";
import { cloudSignIn, cloudSignOut, cloudSyncNow, cloudVerifyCode, useCloudStatus } from "@/hooks/useCloudSync";
import { createShareLink, deleteShareLink, listShareLinks, supabase, type ShareLink } from "@/lib/cloud";
import {
  currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushConfigured, pushSupported,
  sendTestPush,
} from "@/lib/push";
import { useEmber } from "@/lib/store";
import { DEFAULT_NOTIFICATIONS } from "@/lib/types";
import { invalidateApi, useApi } from "@/hooks/useApi";
import type { BankInstitution } from "@/lib/integrations/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/inputs";
import { PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

export default function ConnectionsPage() {
  return (
    <Suspense>
      <Connections />
    </Suspense>
  );
}

const ERROR_TEXT: Record<string, string> = {
  google_not_configured: "Google isn't configured yet — add the env vars from SETUP.md first.",
  oauth_state_mismatch: "Sign-in was interrupted (state mismatch). Try again.",
  google_token_exchange_failed: "Google rejected the sign-in. Check client ID/secret and redirect URI.",
  access_denied: "You cancelled the Google consent screen.",
  bank_link_not_authorized: "The bank link wasn't completed — you can retry anytime.",
  bank_callback_failed: "The bank confirmed nothing — try connecting again.",
};

function Connections() {
  const router = useRouter();
  const params = useSearchParams();
  const announced = useRef(false);

  useEffect(() => {
    if (announced.current) return;
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected || error) {
      announced.current = true;
      if (connected === "google") toast("Google account connected");
      if (connected === "bank") toast("Bank connected — first sync starting");
      if (error) toast(ERROR_TEXT[error] ?? `Connection failed: ${error}`, "info");
      router.replace("/settings/connections");
    }
  }, [params, router]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} /> Settings
      </Link>
      <PageHeader
        title="Connections"
        sub="Link real services. Tokens are AES-256 encrypted in httpOnly cookies — never exposed to the browser."
      />
      <div className="flex flex-col gap-4">
        <GoogleCard />
        <ICloudCard />
        <BankCard />
        <CloudCard />
        <NotificationsCard />
        <FamilyCard />
        <AiCard />
      </div>
    </div>
  );
}

/* ---------------- icloud mail ---------------- */

function ICloudCard() {
  const { data, loading, refresh } = useApi<{ configured: boolean; connected: boolean; account?: string }>("/api/icloud/status");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/icloud/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Connection failed");
      setPassword("");
      setFormOpen(false);
      invalidateApi("/api/icloud");
      await refresh();
      toast("iCloud Mail connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const disconnect = async () => {
    setBusy(true);
    await fetch("/api/icloud/disconnect", { method: "POST" });
    invalidateApi("/api/icloud");
    await refresh();
    setBusy(false);
    toast("iCloud disconnected", "info");
  };

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.05]">
          <Mail size={18} className="text-muted" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            iCloud Mail <StatusDot state={data?.connected ? "on" : "off"} />
          </h2>
          <p className="truncate text-[13px] text-muted">
            {loading && !data ? "Checking…" :
              data?.connected ? `${data.account} — second inbox in Mail` :
              "Your @icloud.com inbox alongside Gmail"}
          </p>
        </div>
        {data?.connected ? (
          <Button size="sm" onClick={disconnect} disabled={busy}>
            <Unplug size={13} /> Disconnect
          </Button>
        ) : (
          !formOpen && (
            <Button variant="primary" onClick={() => setFormOpen(true)}>
              Connect iCloud
            </Button>
          )
        )}
      </div>

      {!data?.connected && formOpen && (
        <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4">
          <p className="text-[13px] leading-relaxed text-muted">
            iCloud has no &quot;sign in with Apple&quot; for mail — instead you create an{" "}
            <span className="font-medium text-ink">app-specific password</span>: go to{" "}
            <a href="https://account.apple.com/account/manage" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
              account.apple.com
            </a>{" "}
            → Sign-In &amp; Security → App-Specific Passwords → create one (e.g. &quot;Ember&quot;) and paste it here.
            It only works for mail and you can revoke it anytime.
          </p>
          <div className="flex max-w-lg flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@icloud.com"
              aria-label="iCloud address"
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connect()}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              aria-label="App-specific password"
            />
            <Button variant="primary" onClick={connect} disabled={busy || !email.includes("@") || password.length < 8} className="shrink-0">
              {busy ? <Loader2 size={14} className="animate-spin" /> : null} Connect
            </Button>
          </div>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <p className="text-xs text-faint">
            Verified with a live sign-in before saving · stored AES-256-encrypted, server-side only · your real Apple ID password is never used.
          </p>
        </div>
      )}
    </section>
  );
}

/* ---------------- shared bits ---------------- */

function StatusDot({ state }: { state: "on" | "off" | "warn" }) {
  const c = state === "on" ? "var(--success)" : state === "warn" ? "var(--warning)" : "var(--faint)";
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: c, boxShadow: state !== "off" ? `0 0 8px ${c}` : undefined }}
      aria-hidden
    />
  );
}

function MissingEnv({ missing }: { missing: string[] }) {
  return (
    <div className="mt-3 rounded-xl border border-warning/20 bg-warning/[0.06] px-4 py-3 text-[13px] leading-relaxed text-muted">
      Not configured yet. Add{" "}
      {missing.map((m, i) => (
        <span key={m}>
          <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-xs text-ink">{m}</code>
          {i < missing.length - 1 ? ", " : ""}
        </span>
      ))}{" "}
      to <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-xs text-ink">.env.local</code> and
      restart — step-by-step instructions live in <span className="font-medium text-ink">SETUP.md</span>.
    </div>
  );
}

function SyncRow({ label }: { label: string }) {
  const at = lastSynced(label);
  return (
    <span className="text-xs text-faint">
      {at ? `Last sync ${formatDistanceToNow(parseISO(at), { addSuffix: true })}` : "Not synced yet"}
    </span>
  );
}

/** one connected sub-service: status, last sync, and its own "sync now" */
function ServiceRow({
  icon: Icon, label, sync, pull,
}: {
  icon: typeof Mail;
  label: string;
  sync: string;
  pull: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [, bump] = useState(0);
  const run = async () => {
    setBusy(true);
    try {
      await pull();
      markSynced(sync);
      toast(`${label} synced`);
    } catch {
      toast(`${label} sync failed`, "info");
    }
    setBusy(false);
    bump((n) => n + 1);
  };
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2.5">
      <Icon size={15} className="shrink-0 text-success" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[13px] font-medium">{label}</p>
        <SyncRow label={sync} />
      </div>
      <button
        onClick={run}
        disabled={busy}
        aria-label={`Sync ${label} now`}
        title="Sync now"
        className="shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-white/[0.07] hover:text-ink"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
      </button>
    </div>
  );
}

/* ---------------- google ---------------- */

function GoogleCard() {
  const { data, loading, refresh } = useGoogleStatus();
  const [busy, setBusy] = useState(false);

  const disconnect = async () => {
    setBusy(true);
    await fetch("/api/google/disconnect", { method: "POST" });
    invalidateApi("/api/google");
    await refresh();
    setBusy(false);
    toast("Google disconnected — access revoked", "info");
  };

  const state: "on" | "off" | "warn" = data?.connected
    ? data.needsReconnect ? "warn" : "on"
    : "off";

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.05] text-lg font-semibold">
          G
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            Google <StatusDot state={state} />
          </h2>
          <p className="truncate text-[13px] text-muted">
            {loading ? "Checking…" :
              !data?.configured ? "Awaiting configuration" :
              data.connected ? (data.needsReconnect ? `${data.account} — access expired, reconnect below` : data.account) :
              "Calendar, Gmail and Contacts in one sign-in"}
          </p>
        </div>
        {data?.configured && !data.connected && (
          <Button variant="primary" onClick={() => (window.location.href = "/api/google/auth")}>
            Connect Google
          </Button>
        )}
        {data?.connected && (
          <div className="flex gap-2">
            {data.needsReconnect && (
              <Button variant="primary" size="sm" onClick={() => (window.location.href = "/api/google/auth")}>
                <RefreshCw size={13} /> Reconnect
              </Button>
            )}
            <Button size="sm" onClick={disconnect} disabled={busy}>
              <Unplug size={13} /> Disconnect
            </Button>
          </div>
        )}
      </div>

      {data && !data.configured && <MissingEnv missing={data.missing} />}

      {data?.connected && (
        <div className="mt-4 grid grid-cols-1 gap-2 border-t border-white/[0.06] pt-4 sm:grid-cols-3">
          <ServiceRow icon={CalendarDays} label="Calendar" sync="calendar" pull={async () => {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const from = new Date(Date.now() - 45 * 86_400_000).toISOString();
            const to = new Date(Date.now() + 90 * 86_400_000).toISOString();
            await fetch(`/api/google/calendar?timeMin=${encodeURIComponent(from)}&timeMax=${encodeURIComponent(to)}&tz=${encodeURIComponent(tz)}`);
            invalidateApi("/api/google/calendar");
          }} />
          <ServiceRow icon={Mail} label="Gmail" sync="gmail" pull={async () => {
            await fetch("/api/google/gmail?box=inbox");
            invalidateApi("/api/google/gmail");
          }} />
          <ServiceRow icon={Users} label="Contacts" sync="contacts" pull={async () => {
            await fetch("/api/google/contacts");
            invalidateApi("/api/google/contacts");
          }} />
        </div>
      )}
    </section>
  );
}

/* ---------------- bank ---------------- */

function BankCard() {
  const bank = useBank();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const disconnect = async () => {
    setBusy(true);
    await fetch("/api/bank/disconnect", { method: "POST" });
    bank.clearCache();
    invalidateApi("/api/bank");
    setBusy(false);
    toast("Bank disconnected — requisition deleted at provider", "info");
  };

  const state: "on" | "off" | "warn" = bank.connected ? "on" : bank.status?.needsReconnect ? "warn" : "off";

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.05]">
          <Landmark size={19} className="text-muted" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            Bank <StatusDot state={state} />
          </h2>
          <p className="truncate text-[13px] text-muted">
            {!bank.status ? "Checking…" :
              !bank.status.configured ? "Awaiting configuration" :
              bank.connected ? `${bank.status.account} · ${bank.accounts.length || "…"} account${bank.accounts.length === 1 ? "" : "s"}` :
              bank.status.needsReconnect ? "Link started but not authorized — try again" :
              "PSD2 open banking via Enable Banking — Sparkasse Heidelberg ready"}
          </p>
        </div>
        {bank.status?.configured && !bank.connected && (
          <Button variant="primary" onClick={() => setPicking(true)}>
            Connect bank
          </Button>
        )}
        {bank.connected && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => bank.sync()} disabled={bank.syncing}>
              {bank.syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Sync now
            </Button>
            <Button size="sm" onClick={disconnect} disabled={busy}>
              <Unplug size={13} /> Disconnect
            </Button>
          </div>
        )}
      </div>

      {bank.status && !bank.status.configured && <MissingEnv missing={bank.status.missing} />}
      {bank.syncError && (
        <p className="mt-3 rounded-xl border border-danger/20 bg-danger/[0.06] px-4 py-2.5 text-[13px] text-muted">
          Sync failed: {bank.syncError}
        </p>
      )}
      {bank.connected && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/[0.06] pt-3.5 text-xs text-faint">
          <span>{bank.syncedAt ? `Last sync ${formatDistanceToNow(parseISO(bank.syncedAt), { addSuffix: true })}` : "Not synced yet"}</span>
          <span>{bank.transactions.length} transactions cached</span>
          <span>90-day consent · renew by reconnecting</span>
          <span className="flex items-center gap-1"><ShieldCheck size={11} /> read-only access</span>
        </div>
      )}

      <InstitutionPicker open={picking} onClose={() => setPicking(false)} />
    </section>
  );
}

function InstitutionPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("Sparkasse Heidelberg");
  const [debounced, setDebounced] = useState(query);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  const { data, loading, error } = useApi<{ institutions: BankInstitution[] }>(
    open ? `/api/bank/institutions?q=${encodeURIComponent(debounced)}` : null,
  );

  const connect = async (inst: BankInstitution) => {
    setConnecting(inst.id);
    try {
      const res = await fetch("/api/bank/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution: inst }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "connect failed");
      // off to the bank's own SCA flow
      window.location.assign(body.link);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Connection failed", "info");
      setConnecting(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Choose your bank">
      <p className="mb-3 text-[13px] leading-relaxed text-muted">
        You&apos;ll be redirected to your bank to authorize read-only access (PSD2). Ember never sees your
        banking credentials.
      </p>
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" placeholder="Search German banks…" autoFocus />
      </div>
      <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {loading && <p className="px-2 py-6 text-center text-sm text-muted">Searching…</p>}
        {error && <p className="px-2 py-6 text-center text-sm text-danger">{error}</p>}
        {data?.institutions.map((inst) => (
          <motion.button
            key={inst.id}
            whileTap={{ scale: 0.98 }}
            onClick={() => connect(inst)}
            disabled={!!connecting}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05] disabled:opacity-50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={inst.logo} alt="" className="h-8 w-8 rounded-lg bg-white/90 object-contain p-0.5" />
            <span className="flex-1 truncate text-sm font-medium">{inst.name}</span>
            {connecting === inst.id ? (
              <Loader2 size={15} className="animate-spin text-accent" />
            ) : (
              <ChevronRight size={15} className="text-faint" />
            )}
          </motion.button>
        ))}
        {data && data.institutions.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted">No banks match “{debounced}”.</p>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- cloud sync ---------------- */

function CloudCard() {
  const cloud = useCloudStatus();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const state: "on" | "off" | "warn" = cloud.signedIn ? (cloud.error ? "warn" : "on") : "off";

  const sendLink = async () => {
    if (!email.includes("@")) return;
    setBusy(true);
    const err = await cloudSignIn(email.trim());
    setBusy(false);
    if (err) toast(err, "info");
    else {
      setSent(true);
      toast("Sign-in email sent — check your inbox");
    }
  };

  const verifyCode = async () => {
    if (code.replace(/\s/g, "").length < 6) return;
    setBusy(true);
    const err = await cloudVerifyCode(email, code);
    setBusy(false);
    if (err) toast(err, "info");
    else {
      setSent(false);
      setCode("");
      toast("Signed in — sync is live");
    }
  };

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.05]">
          <Cloud size={18} className="text-muted" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            Cloud Sync <StatusDot state={state} />
          </h2>
          <p className="truncate text-[13px] text-muted">
            {!cloud.configured ? "Awaiting configuration" :
              cloud.authLoading ? "Checking…" :
              cloud.signedIn ? `${cloud.email} — realtime sync across your devices` :
              "Your data on every device, updated live (Supabase)"}
          </p>
        </div>
        {cloud.signedIn && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => cloudSyncNow()} disabled={cloud.syncing}>
              {cloud.syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Sync now
            </Button>
            <Button size="sm" onClick={async () => { await cloudSignOut(); toast("Signed out — this device is local-only again", "info"); }}>
              <LogOut size={13} /> Sign out
            </Button>
          </div>
        )}
      </div>

      {cloud.configured && !cloud.signedIn && !cloud.authLoading && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          {sent ? (
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-[13px] text-muted">
                <MailCheck size={15} className="shrink-0 text-success" />
                <span>
                  Email sent to <span className="font-medium text-ink">{email}</span> — click the link,{" "}
                  <span className="font-medium text-ink">or</span> type the 6-digit code from the same email
                  (required in the iPhone home-screen app, where links open in Safari instead).
                </span>
              </p>
              <div className="flex max-w-xs gap-2">
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                  placeholder="123456"
                  aria-label="6-digit sign-in code"
                  className="num tracking-[0.2em]"
                />
                <Button variant="primary" onClick={verifyCode} disabled={busy || code.replace(/\s/g, "").length < 6} className="shrink-0">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null} Sign in
                </Button>
              </div>
              <button onClick={() => setSent(false)} className="self-start text-xs text-faint underline underline-offset-2 hover:text-ink">
                Different email
              </button>
            </div>
          ) : (
            <div className="flex max-w-md gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendLink()}
                placeholder="you@example.com"
                aria-label="Email for sign-in"
              />
              <Button variant="primary" onClick={sendLink} disabled={busy || !email.includes("@")} className="shrink-0">
                {busy ? <Loader2 size={14} className="animate-spin" /> : null} Send magic link
              </Button>
            </div>
          )}
          <p className="mt-2 text-xs text-faint">
            No password — you sign in via a link in your email. Tokens and bank access never sync; the vault syncs only as encrypted ciphertext.
          </p>
        </div>
      )}

      {cloud.signedIn && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/[0.06] pt-3.5 text-xs text-faint">
          <span>{cloud.lastSync ? `Last sync ${formatDistanceToNow(parseISO(cloud.lastSync), { addSuffix: true })}` : "Not synced yet"}</span>
          <span>tasks · events · notes · habits · goals · finance · contacts · settings</span>
          {cloud.error && <span className="text-danger">{cloud.error}</span>}
        </div>
      )}

      {!cloud.configured && (
        <MissingEnv missing={["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]} />
      )}
    </section>
  );
}

/* ---------------- push notifications ---------------- */

function NotificationsCard() {
  const cloud = useCloudStatus();
  const settings = useEmber((s) => s.settings);
  const updateSettings = useEmber((s) => s.updateSettings);
  const prefs = { ...DEFAULT_NOTIFICATIONS, ...(settings.notifications ?? {}) };

  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setSubscribed(!!(await currentSubscription()));
      setReady(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const configured = pushConfigured();
  const supported = ready && pushSupported();
  const needsHomeScreen = ready && isIOS() && !isStandalone();

  const enable = async () => {
    setBusy(true);
    try {
      const uid = (await supabase()?.auth.getSession())?.data.session?.user.id;
      if (!uid) {
        toast("Sign in to Cloud Sync first", "info");
        return;
      }
      const err = await enablePush(uid);
      if (err) toast(err, "info");
      else {
        setSubscribed(true);
        toast("Notifications on — this device will get your reminders");
      }
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await disablePush();
      setSubscribed(false);
      toast("Notifications off for this device", "info");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    const err = await sendTestPush();
    setBusy(false);
    if (err) toast(err, "info");
    else toast("Test sent — it should land in a second");
  };

  const setPrefs = (patch: Partial<typeof prefs>) =>
    updateSettings({ notifications: { ...prefs, ...patch } });

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.05]">
          <Bell size={18} className="text-muted" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            Notifications <StatusDot state={subscribed ? "on" : "off"} />
          </h2>
          <p className="text-[13px] text-muted">
            {subscribed
              ? "This device gets your daily summary and event reminders"
              : "Get reminded even when Ember is closed"}
          </p>
        </div>
        {cloud.signedIn && supported && !needsHomeScreen && (
          <div className="flex gap-2">
            {subscribed && (
              <Button size="sm" onClick={test} disabled={busy}>Send test</Button>
            )}
            <Button size="sm" variant={subscribed ? "subtle" : "primary"} onClick={subscribed ? disable : enable} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : subscribed ? <BellOff size={13} /> : <Bell size={13} />}
              {subscribed ? "Turn off" : "Turn on"}
            </Button>
          </div>
        )}
      </div>

      {!cloud.signedIn ? (
        <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] text-muted">
          Sign in to Cloud Sync above first — reminders are sent from your synced data.
        </p>
      ) : needsHomeScreen ? (
        <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] text-muted">
          On iPhone, notifications only work from the installed app: tap <span className="font-medium text-ink">Share → Add to Home Screen</span>,
          open Ember from there, and this switch will appear.
        </p>
      ) : !supported ? (
        <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] text-muted">
          This browser doesn&apos;t support push notifications.
        </p>
      ) : subscribed ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={prefs.digest}
              onChange={(e) => setPrefs({ digest: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span className="flex-1 text-[13px]">Daily summary of what&apos;s due</span>
            <Select
              value={String(prefs.digestHour)}
              onChange={(e) => setPrefs({ digestHour: Number(e.target.value) })}
              disabled={!prefs.digest}
              aria-label="Time of the daily summary"
              className="h-9 w-24"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={prefs.taskReminders}
              onChange={(e) => setPrefs({ taskReminders: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span className="flex-1 text-[13px]">Remind me before a task&apos;s due time</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={prefs.eventReminders}
              onChange={(e) => setPrefs({ eventReminders: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span className="flex-1 text-[13px]">Remind me before a calendar event</span>
          </label>
          <p className="text-xs text-faint">
            Each task and event uses its own reminder time. The daily summary is skipped when nothing is due.
          </p>
        </div>
      ) : null}

      {!configured && <MissingEnv missing={["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "CRON_SECRET", "SUPABASE_SERVICE_ROLE_KEY"]} />}
    </section>
  );
}

/* ---------------- family quick-add ---------------- */

function FamilyCard() {
  const cloud = useCloudStatus();
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    if (!cloud.signedIn) {
      const t = setTimeout(() => setLinks(null), 0);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    listShareLinks()
      .then((l) => {
        if (!cancelled) setLinks(l);
      })
      .catch((e) => {
        // table missing → family.sql hasn't been run yet
        if (!cancelled && e instanceof Error && /share_links/.test(e.message)) setSetupNeeded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cloud.signedIn]);

  const create = async () => {
    setBusy(true);
    try {
      const uid = (await supabase()?.auth.getSession())?.data.session?.user.id;
      if (!uid) throw new Error("Not signed in");
      const link = await createShareLink(uid, "Familie");
      setLinks([...(links ?? []), link]);
      toast("Family link created — share it via WhatsApp or iMessage");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/share_links/.test(msg)) setSetupNeeded(true);
      else toast(msg, "info");
    }
    setBusy(false);
  };

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/add/${token}`);
    toast("Link copied");
  };

  const remove = async (token: string) => {
    try {
      await deleteShareLink(token);
      setLinks((links ?? []).filter((l) => l.token !== token));
      toast("Link deleted — it stops working immediately", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "info");
    }
  };

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.05]">
          <HeartHandshake size={18} className="text-muted" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            Family quick-add <StatusDot state={(links?.length ?? 0) > 0 ? "on" : "off"} />
          </h2>
          <p className="text-[13px] text-muted">
            A link that lets family members send tasks to your list — they see a single form, never your data.
          </p>
        </div>
        {cloud.signedIn && !setupNeeded && (
          <Button size="sm" onClick={create} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} New link
          </Button>
        )}
      </div>

      {!cloud.signedIn && (
        <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] text-muted">
          Sign in to Cloud Sync above first — tasks travel through your cloud inbox.
        </p>
      )}

      {setupNeeded && (
        <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] text-muted">
          One-time setup: run <span className="font-medium text-ink">supabase/family.sql</span> in the
          Supabase SQL editor (same as the original schema), then reload this page.
        </p>
      )}

      {cloud.signedIn && (links?.length ?? 0) > 0 && (
        <ul className="mt-4 flex flex-col gap-2 border-t border-white/[0.06] pt-4">
          {(links ?? []).map((l) => (
            <li key={l.token} className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3.5 py-2.5">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
                /add/{l.token.slice(0, 8)}…
              </span>
              <Button size="sm" onClick={() => copy(l.token)}>
                <Copy size={13} /> Copy link
              </Button>
              <Button size="sm" variant="ghost" aria-label="Delete link" onClick={() => remove(l.token)}>
                <Trash2 size={13} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------- ai ---------------- */

function AiCard() {
  const { data } = useApi<{ configured: boolean }>("/api/ai");
  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.05]">
          <Sparkles size={18} className="text-muted" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            AI <StatusDot state={data?.configured ? "on" : "off"} />
          </h2>
          <p className="text-[13px] text-muted">
            {data?.configured
              ? "Email summaries and smart replies are live"
              : "Powers mail summaries + smart replies — optional (Claude or ChatGPT)"}
          </p>
        </div>
      </div>
      {data && !data.configured && <MissingEnv missing={["ANTHROPIC_API_KEY or OPENAI_API_KEY"]} />}
    </section>
  );
}
