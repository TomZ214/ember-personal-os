"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  AlertCircle, CalendarDays, Check, Cloud, HardDrive, Landmark, Loader2, Mail, RefreshCw, Users,
} from "lucide-react";
import { invalidateApi, useApi } from "@/hooks/useApi";
import { markSynced, useBank, useGoogleStatus } from "@/hooks/useIntegrations";
import { cloudSyncNow, useCloudStatus } from "@/hooks/useCloudSync";
import { toast } from "@/components/ui/toast";

const LAST_FULL_SYNC = "ember-last-full-sync";

type StepState = "pending" | "running" | "done" | "error" | "skipped";

interface Step {
  id: string;
  label: string;
  icon: typeof Cloud;
  run: () => Promise<string | void>;
  enabled: boolean;
  note?: string;
}

/** Settings → Data Sync: one button that brings every connected service up to date. */
export function DataSync() {
  const google = useGoogleStatus();
  const icloud = useApi<{ connected: boolean; account?: string }>("/api/icloud/status");
  const bank = useBank();
  const cloud = useCloudStatus();
  const [states, setStates] = useState<Record<string, { state: StepState; detail?: string }>>({});
  const [running, setRunning] = useState(false);
  const [lastFull, setLastFull] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setLastFull(localStorage.getItem(LAST_FULL_SYNC)), 0);
    return () => clearTimeout(t);
  }, []);

  const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
  const googleOn = !!google.data?.connected;

  const pullJson = async (url: string, label: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${label}: ${(await res.json().catch(() => ({}))).error ?? res.status}`);
    return res.json();
  };

  const steps: Step[] = [
    {
      id: "calendar", label: "Google Calendar", icon: CalendarDays, enabled: googleOn,
      run: async () => {
        const from = new Date(Date.now() - 45 * 86_400_000).toISOString();
        const to = new Date(Date.now() + 90 * 86_400_000).toISOString();
        const d = await pullJson(
          `/api/google/calendar?timeMin=${encodeURIComponent(from)}&timeMax=${encodeURIComponent(to)}&tz=${encodeURIComponent(tz())}`,
          "Calendar",
        );
        invalidateApi("/api/google/calendar");
        markSynced("calendar");
        return `${d.events?.length ?? 0} events`;
      },
    },
    {
      id: "gmail", label: "Gmail", icon: Mail, enabled: googleOn,
      run: async () => {
        const d = await pullJson("/api/google/gmail?box=inbox", "Gmail");
        invalidateApi("/api/google/gmail");
        markSynced("gmail");
        return `${d.unreadInbox ?? 0} unread`;
      },
    },
    {
      id: "contacts", label: "Google Contacts", icon: Users, enabled: googleOn,
      run: async () => {
        const d = await pullJson("/api/google/contacts", "Contacts");
        invalidateApi("/api/google/contacts");
        markSynced("contacts");
        return `${d.contacts?.length ?? 0} contacts`;
      },
    },
    {
      id: "icloud", label: `iCloud Mail${icloud.data?.account ? ` · ${icloud.data.account}` : ""}`, icon: Mail,
      enabled: !!icloud.data?.connected,
      run: async () => {
        const d = await pullJson("/api/icloud/mail?box=inbox", "iCloud");
        invalidateApi("/api/icloud/mail");
        markSynced("icloud");
        return `${d.unreadInbox ?? 0} unread`;
      },
    },
    {
      id: "bank", label: `Bank${bank.status?.account ? ` · ${bank.status.account}` : ""}`, icon: Landmark,
      enabled: bank.connected,
      run: async () => {
        await bank.sync();
        return "balances + transactions";
      },
    },
    {
      id: "cloud", label: "Cloud database", icon: Cloud, enabled: cloud.configured && cloud.signedIn,
      run: async () => {
        await cloudSyncNow();
        const err = useCloudStatus.getState().error;
        if (err) throw new Error(err);
        return "pushed & pulled";
      },
    },
    {
      id: "local", label: "This device", icon: HardDrive, enabled: true,
      run: async () => "tasks, notes, habits & goals live locally — always current",
    },
  ];

  const active = steps.filter((s) => s.enabled);
  const connectedCount = active.length - 1; // minus the local row

  const runAll = async () => {
    setRunning(true);
    setStates(Object.fromEntries(active.map((s) => [s.id, { state: "pending" as StepState }])));
    let failed = 0;
    for (const step of active) {
      setStates((prev) => ({ ...prev, [step.id]: { state: "running" } }));
      try {
        const detail = await step.run();
        setStates((prev) => ({ ...prev, [step.id]: { state: "done", detail: detail || undefined } }));
      } catch (e) {
        failed++;
        setStates((prev) => ({
          ...prev,
          [step.id]: { state: "error", detail: e instanceof Error ? e.message : String(e) },
        }));
      }
    }
    const now = new Date().toISOString();
    localStorage.setItem(LAST_FULL_SYNC, now);
    setLastFull(now);
    setRunning(false);
    toast(failed === 0 ? "Everything is up to date" : `Sync finished — ${failed} service${failed === 1 ? "" : "s"} failed`, failed === 0 ? "success" : "info");
  };

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Data Sync</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {connectedCount > 0
              ? `Pulls the latest from ${connectedCount} connected service${connectedCount === 1 ? "" : "s"} and pushes local changes`
              : "No services connected yet — local data is always live. Connect services to sync them here."}
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={runAll}
          disabled={running}
          className="relative flex h-10 items-center gap-2 overflow-hidden rounded-full bg-[image:var(--grad-sunset)] px-5 text-sm font-semibold text-(--on-sunset) shadow-[0_2px_18px_-2px_var(--primary-glow)] transition-[filter] hover:brightness-110 disabled:cursor-wait"
        >
          <motion.span
            animate={running ? { rotate: 360 } : { rotate: 0 }}
            transition={running ? { repeat: Infinity, duration: 1, ease: "linear" } : { duration: 0.2 }}
            className="flex"
          >
            <RefreshCw size={15} />
          </motion.span>
          {running ? "Syncing…" : "Sync Data"}
        </motion.button>
      </div>

      <AnimatePresence>
        {Object.keys(states).length > 0 && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-4 flex flex-col gap-1 overflow-hidden border-t border-white/[0.06] pt-4"
          >
            {active.map((step, i) => {
              const st = states[step.id]?.state ?? "pending";
              const detail = states[step.id]?.detail;
              const Icon = step.icon;
              return (
                <motion.li
                  key={step.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 rounded-xl px-2 py-1.5"
                >
                  <Icon size={15} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm">{step.label}</span>
                  {detail && st !== "error" && <span className="hidden truncate text-xs text-faint sm:block">{detail}</span>}
                  {st === "error" && <span className="truncate text-xs text-danger">{detail}</span>}
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {st === "pending" && <span className="h-1.5 w-1.5 rounded-full bg-white/20" />}
                    {st === "running" && <Loader2 size={15} className="animate-spin text-accent" />}
                    {st === "done" && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}>
                        <Check size={15} className="text-success" />
                      </motion.span>
                    )}
                    {st === "error" && <AlertCircle size={15} className="text-danger" />}
                  </span>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>

      <p className="mt-3 text-xs text-faint">
        {lastFull
          ? `Last full sync ${formatDistanceToNow(parseISO(lastFull), { addSuffix: true })}`
          : "Never synced on this device"}
        {cloud.configured && cloud.signedIn && cloud.lastSync && (
          <> · cloud {formatDistanceToNow(parseISO(cloud.lastSync), { addSuffix: true })}</>
        )}
      </p>
    </section>
  );
}
