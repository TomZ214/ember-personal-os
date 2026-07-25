"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  ArrowLeft, Bell, BellOff, CalendarDays, ChevronRight, Cloud, Copy, HeartHandshake, Landmark,
  Loader2, LogOut, Mail, MailCheck, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, Unplug,
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
import { useLang, useT } from "@/lib/i18n";
import { dfLocale } from "@/lib/dates";
import { DEFAULT_NOTIFICATIONS } from "@/lib/types";
import { invalidateApi, useApi } from "@/hooks/useApi";
import type { BankInstitution } from "@/lib/integrations/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/inputs";
import { PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/Switch";

export default function ConnectionsPage() {
  return (
    <Suspense>
      <Connections />
    </Suspense>
  );
}

function Connections() {
  const router = useRouter();
  const params = useSearchParams();
  const announced = useRef(false);
  const t = useT();

  useEffect(() => {
    if (announced.current) return;
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected || error) {
      announced.current = true;
      if (connected === "google") toast(t("conn.googleConnected"));
      if (connected === "bank") toast(t("conn.bankConnected"));
      if (error) toast(t(`conn.err.${error}`, t("conn.connectionFailed").replace("{error}", error)), "error");
      router.replace("/settings/connections");
    }
  }, [params, router, t]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} /> {t("nav.settings")}
      </Link>
      <PageHeader
        title={t("conn.title")}
        sub={t("conn.sub")}
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
  const t = useT();
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
      if (!res.ok) throw new Error(body.error ?? t("conn.connectFailedToast"));
      setPassword("");
      setFormOpen(false);
      invalidateApi("/api/icloud");
      await refresh();
      toast(t("conn.icloudConnected"));
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
    toast(t("conn.icloudDisconnected"), "info");
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
            {loading && !data ? t("conn.checking") :
              data?.connected ? t("conn.icloudSecondInbox").replace("{account}", data.account ?? "") :
              t("conn.icloudAlongside")}
          </p>
        </div>
        {data?.connected ? (
          <Button size="sm" onClick={disconnect} disabled={busy}>
            <Unplug size={13} /> {t("conn.disconnect")}
          </Button>
        ) : (
          !formOpen && (
            <Button variant="primary" onClick={() => setFormOpen(true)}>
              {t("conn.connectIcloud")}
            </Button>
          )
        )}
      </div>

      {!data?.connected && formOpen && (
        <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4">
          <p className="text-[13px] leading-relaxed text-muted">
            {t("conn.icloudInstrPre")}{" "}
            <a href="https://account.apple.com/account/manage" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
              account.apple.com
            </a>{" "}
            {t("conn.icloudInstrPost")}
          </p>
          <div className="flex max-w-lg flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@icloud.com"
              aria-label={t("conn.icloudAddr")}
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connect()}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              aria-label={t("conn.appPassword")}
            />
            <Button variant="primary" onClick={connect} disabled={busy || !email.includes("@") || password.length < 8} className="shrink-0">
              {busy ? <Loader2 size={14} className="animate-spin" /> : null} {t("conn.connect")}
            </Button>
          </div>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <p className="text-xs text-faint">
            {t("conn.icloudVerifiedNote")}
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
  const t = useT();
  return (
    <div className="mt-3 rounded-xl border border-warning/20 bg-warning/[0.06] px-4 py-3 text-[13px] leading-relaxed text-muted">
      {t("conn.missingEnvPre")}{" "}
      {missing.map((m, i) => (
        <span key={m}>
          <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-xs text-ink">{m}</code>
          {i < missing.length - 1 ? ", " : ""}
        </span>
      ))}{" "}
      <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-xs text-ink">.env.local</code>{" "}
      {t("conn.missingEnvPost")} <span className="font-medium text-ink">SETUP.md</span>.
    </div>
  );
}

function SyncRow({ label }: { label: string }) {
  const t = useT();
  const lang = useLang();
  const at = lastSynced(label);
  return (
    <span className="text-xs text-faint">
      {at ? t("conn.lastSync").replace("{rel}", formatDistanceToNow(parseISO(at), { addSuffix: true, locale: dfLocale(lang) })) : t("conn.notSynced")}
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
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [, bump] = useState(0);
  const run = async () => {
    setBusy(true);
    try {
      await pull();
      markSynced(sync);
      toast(t("conn.syncedToast").replace("{label}", label));
    } catch {
      toast(t("conn.syncFailedToast").replace("{label}", label), "error");
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
        aria-label={t("conn.syncLabelNow").replace("{label}", label)}
        title={t("conn.syncNow")}
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
  const t = useT();
  const [busy, setBusy] = useState(false);

  const disconnect = async () => {
    setBusy(true);
    await fetch("/api/google/disconnect", { method: "POST" });
    invalidateApi("/api/google");
    await refresh();
    setBusy(false);
    toast(t("conn.googleDisconnected"), "info");
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
            {loading ? t("conn.checking") :
              !data?.configured ? t("conn.notConfigured") :
              data.connected ? (data.needsReconnect ? t("conn.googleExpired").replace("{account}", data.account ?? "") : data.account) :
              t("conn.googleTagline")}
          </p>
        </div>
        {data?.configured && !data.connected && (
          <Button variant="primary" onClick={() => (window.location.href = "/api/google/auth")}>
            {t("conn.connectGoogle")}
          </Button>
        )}
        {data?.connected && (
          <div className="flex gap-2">
            {data.needsReconnect && (
              <Button variant="primary" size="sm" onClick={() => (window.location.href = "/api/google/auth")}>
                <RefreshCw size={13} /> {t("conn.reconnect")}
              </Button>
            )}
            <Button size="sm" onClick={disconnect} disabled={busy}>
              <Unplug size={13} /> {t("conn.disconnect")}
            </Button>
          </div>
        )}
      </div>

      {data && !data.configured && <MissingEnv missing={data.missing} />}

      {data?.connected && (
        <div className="mt-4 grid grid-cols-1 gap-2 border-t border-white/[0.06] pt-4 sm:grid-cols-3">
          <ServiceRow icon={CalendarDays} label={t("conn.svcCalendar")} sync="calendar" pull={async () => {
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
        </div>
      )}
    </section>
  );
}

/* ---------------- bank ---------------- */

function BankCard() {
  const bank = useBank();
  const t = useT();
  const lang = useLang();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const disconnect = async () => {
    setBusy(true);
    await fetch("/api/bank/disconnect", { method: "POST" });
    bank.clearCache();
    invalidateApi("/api/bank");
    setBusy(false);
    toast(t("conn.bankDisconnected"), "info");
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
            {!bank.status ? t("conn.checking") :
              !bank.status.configured ? t("conn.notConfigured") :
              bank.connected ? t("conn.bankAccounts").replace("{account}", bank.status.account ?? "").replace("{n}", String(bank.accounts.length || "…")).replace("{accounts}", bank.accounts.length === 1 ? t("conn.account") : t("conn.accounts")) :
              bank.status.needsReconnect ? t("conn.bankLinkStarted") :
              t("conn.bankTagline")}
          </p>
        </div>
        {bank.status?.configured && !bank.connected && (
          <Button variant="primary" onClick={() => setPicking(true)}>
            {t("conn.connectBank")}
          </Button>
        )}
        {bank.connected && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => bank.sync()} disabled={bank.syncing}>
              {bank.syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {t("conn.syncNow")}
            </Button>
            <Button size="sm" onClick={disconnect} disabled={busy}>
              <Unplug size={13} /> {t("conn.disconnect")}
            </Button>
          </div>
        )}
      </div>

      {bank.status && !bank.status.configured && <MissingEnv missing={bank.status.missing} />}
      {bank.syncError && (
        <p className="mt-3 rounded-xl border border-danger/20 bg-danger/[0.06] px-4 py-2.5 text-[13px] text-muted">
          {t("conn.bankSyncFailed").replace("{error}", bank.syncError)}
        </p>
      )}
      {bank.connected && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/[0.06] pt-3.5 text-xs text-faint">
          <span>{bank.syncedAt ? t("conn.lastSync").replace("{rel}", formatDistanceToNow(parseISO(bank.syncedAt), { addSuffix: true, locale: dfLocale(lang) })) : t("conn.notSynced")}</span>
          <span>{t("conn.txnsCached").replace("{n}", String(bank.transactions.length))}</span>
          <span>{t("conn.consent90")}</span>
          <span className="flex items-center gap-1"><ShieldCheck size={11} /> {t("conn.readOnly")}</span>
        </div>
      )}

      <InstitutionPicker open={picking} onClose={() => setPicking(false)} />
    </section>
  );
}

function InstitutionPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
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
      toast(e instanceof Error ? e.message : t("conn.connectFailedToast"), "error");
      setConnecting(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("conn.chooseBank")}>
      <p className="mb-3 text-[13px] leading-relaxed text-muted">
        {t("conn.bankRedirectNote")}
      </p>
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" placeholder={t("conn.searchBanks")} autoFocus />
      </div>
      <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {loading && <p className="px-2 py-6 text-center text-sm text-muted">{t("conn.searching")}</p>}
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
          <p className="px-2 py-6 text-center text-sm text-muted">{t("conn.noBanks").replace("{q}", debounced)}</p>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- cloud sync ---------------- */

function CloudCard() {
  const cloud = useCloudStatus();
  const t = useT();
  const lang = useLang();
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
      toast(t("conn.signinEmailSent"));
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
      toast(t("conn.signedInLive"));
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
            {t("conn.cloudSync")} <StatusDot state={state} />
          </h2>
          <p className="truncate text-[13px] text-muted">
            {!cloud.configured ? t("conn.notConfigured") :
              cloud.authLoading ? t("conn.checking") :
              cloud.signedIn ? t("conn.cloudRealtime").replace("{email}", cloud.email ?? "") :
              t("conn.cloudTagline")}
          </p>
        </div>
        {cloud.signedIn && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => cloudSyncNow()} disabled={cloud.syncing}>
              {cloud.syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {t("conn.syncNow")}
            </Button>
            <Button size="sm" onClick={async () => { await cloudSignOut(); toast(t("conn.signedOut"), "info"); }}>
              <LogOut size={13} /> {t("conn.signOut")}
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
                  {t("conn.emailSentTo")} <span className="font-medium text-ink">{email}</span> {t("conn.emailSentRest")}
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
                  aria-label={t("conn.code6")}
                  className="num tracking-[0.2em]"
                />
                <Button variant="primary" onClick={verifyCode} disabled={busy || code.replace(/\s/g, "").length < 6} className="shrink-0">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null} {t("conn.signIn")}
                </Button>
              </div>
              <button onClick={() => setSent(false)} className="self-start text-xs text-faint underline underline-offset-2 hover:text-ink">
                {t("conn.differentEmail")}
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
                aria-label={t("conn.emailForSignin")}
              />
              <Button variant="primary" onClick={sendLink} disabled={busy || !email.includes("@")} className="shrink-0">
                {busy ? <Loader2 size={14} className="animate-spin" /> : null} {t("conn.sendMagicLink")}
              </Button>
            </div>
          )}
          <p className="mt-2 text-xs text-faint">
            {t("conn.cloudPrivacyNote")}
          </p>
        </div>
      )}

      {cloud.signedIn && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/[0.06] pt-3.5 text-xs text-faint">
          <span>{cloud.lastSync ? t("conn.lastSync").replace("{rel}", formatDistanceToNow(parseISO(cloud.lastSync), { addSuffix: true, locale: dfLocale(lang) })) : t("conn.notSynced")}</span>
          <span>{t("conn.cloudDataList")}</span>
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
  const t = useT();
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
        toast(t("conn.signInCloudFirst"), "info");
        return;
      }
      const err = await enablePush(uid);
      if (err) toast(err, "info");
      else {
        setSubscribed(true);
        toast(t("conn.notifOn"));
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
      toast(t("conn.notifOffToast"), "info");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    const err = await sendTestPush();
    setBusy(false);
    if (err) toast(err, "info");
    else toast(t("conn.testSent"));
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
            {t("conn.notifications")} <StatusDot state={subscribed ? "on" : "off"} />
          </h2>
          <p className="text-[13px] text-muted">
            {subscribed
              ? t("conn.notifSubbed")
              : t("conn.notifTagline")}
          </p>
        </div>
        {cloud.signedIn && supported && !needsHomeScreen && (
          <div className="flex gap-2">
            {subscribed && (
              <Button size="sm" onClick={test} disabled={busy}>{t("conn.sendTest")}</Button>
            )}
            <Button size="sm" variant={subscribed ? "subtle" : "primary"} onClick={subscribed ? disable : enable} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : subscribed ? <BellOff size={13} /> : <Bell size={13} />}
              {subscribed ? t("conn.turnOff") : t("conn.turnOn")}
            </Button>
          </div>
        )}
      </div>

      {!cloud.signedIn ? (
        <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] text-muted">
          {t("conn.notifNeedCloud")}
        </p>
      ) : needsHomeScreen ? (
        <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] text-muted">
          {t("conn.notifIos")}
        </p>
      ) : !supported ? (
        <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] text-muted">
          {t("conn.notifUnsupported")}
        </p>
      ) : subscribed ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4">
          {/* switch on the right, label on the left — the iOS settings order.
              The time picker sits between them and is not inside the label, so
              choosing an hour cannot toggle the row. */}
          <div className="flex items-center gap-3">
            <label className="flex-1 text-[13px]">{t("conn.notifDigest")}</label>
            <Select
              value={String(prefs.digestHour)}
              onChange={(e) => setPrefs({ digestHour: Number(e.target.value) })}
              disabled={!prefs.digest}
              aria-label={t("conn.digestTimeAria")}
              className="h-9 w-24"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </Select>
            <Switch
              checked={prefs.digest}
              onChange={(v) => setPrefs({ digest: v })}
              label={t("conn.notifDigest")}
            />
          </div>
          <label className="flex items-center gap-3">
            <span className="flex-1 text-[13px]">{t("conn.notifTaskRemind")}</span>
            <Switch
              checked={prefs.taskReminders}
              onChange={(v) => setPrefs({ taskReminders: v })}
              label={t("conn.notifTaskRemind")}
            />
          </label>
          <label className="flex items-center gap-3">
            <span className="flex-1 text-[13px]">{t("conn.notifEventRemind")}</span>
            <Switch
              checked={prefs.eventReminders}
              onChange={(v) => setPrefs({ eventReminders: v })}
              label={t("conn.notifEventRemind")}
            />
          </label>
          <p className="text-xs text-faint">
            {t("conn.notifFootnote")}
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
  const t = useT();
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
      if (!uid) throw new Error(t("conn.notSignedIn"));
      const link = await createShareLink(uid, "Familie");
      setLinks([...(links ?? []), link]);
      toast(t("conn.familyCreated"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/share_links/.test(msg)) setSetupNeeded(true);
      else toast(msg, "info");
    }
    setBusy(false);
  };

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/add/${token}`);
    toast(t("conn.linkCopied"));
  };

  const remove = async (token: string) => {
    try {
      await deleteShareLink(token);
      setLinks((links ?? []).filter((l) => l.token !== token));
      toast(t("conn.linkDeleted"), "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
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
            {t("conn.familyTitle")} <StatusDot state={(links?.length ?? 0) > 0 ? "on" : "off"} />
          </h2>
          <p className="text-[13px] text-muted">
            {t("conn.familyTagline")}
          </p>
        </div>
        {cloud.signedIn && !setupNeeded && (
          <Button size="sm" onClick={create} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {t("conn.newLink")}
          </Button>
        )}
      </div>

      {!cloud.signedIn && (
        <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] text-muted">
          {t("conn.familyNeedCloud")}
        </p>
      )}

      {setupNeeded && (
        <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] text-muted">
          {t("conn.familySetupPre")} <span className="font-medium text-ink">supabase/family.sql</span> {t("conn.familySetupPost")}
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
                <Copy size={13} /> {t("conn.copyLink")}
              </Button>
              <Button size="sm" variant="ghost" aria-label={t("conn.deleteLink")} onClick={() => remove(l.token)}>
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
  const t = useT();
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
              ? t("conn.aiLive")
              : t("conn.aiTagline")}
          </p>
        </div>
      </div>
      {data && !data.configured && <MissingEnv missing={["ANTHROPIC_API_KEY or OPENAI_API_KEY"]} />}
    </section>
  );
}
