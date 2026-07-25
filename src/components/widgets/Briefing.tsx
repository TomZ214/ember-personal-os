"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Sparkles } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useApi } from "@/hooks/useApi";
import { useCalendarSource, useGmailUnread } from "@/hooks/useIntegrations";
import { useLang, useT } from "@/lib/i18n";
import { minutesToLabel, todayKey } from "@/lib/dates";
import { EASE } from "@/lib/motion";
import { toast } from "@/components/ui/toast";

/**
 * The daily briefing.
 *
 * Everything it needs is already on this device — the widget assembles a
 * snapshot of today and asks the server route to turn it into two or three
 * sentences. It is written once per day and cached in the store; the refresh
 * button is there for when the day changes shape.
 */
export function BriefingWidget() {
  const t = useT();
  const lang = useLang();
  const ai = useApi<{ configured: boolean }>("/api/ai");
  const briefing = useEmber((s) => s.briefing);
  const setBriefing = useEmber((s) => s.setBriefing);
  const tasks = useEmber((s) => s.tasks);
  const habits = useEmber((s) => s.habits);
  const alarms = useEmber((s) => s.alarms);
  const mails = useEmber((s) => s.mails);
  const settings = useEmber((s) => s.settings);
  const cal = useCalendarSource();
  const gmail = useGmailUnread();
  const [busy, setBusy] = useState(false);

  const today = todayKey();
  const fresh = briefing?.date === today ? briefing : null;

  const run = async () => {
    setBusy(true);
    try {
      const open = tasks.filter((x) => x.status !== "done");
      const res = await fetch("/api/ai/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang,
          name: settings.userName,
          hour: new Date().getHours(),
          weekday: new Date().toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", { weekday: "long" }),
          tasks: open
            .filter((x) => x.due && x.due <= today)
            .map((x) => ({
              title: x.title,
              overdue: !!x.due && x.due < today,
              time: x.time,
              priority: x.priority,
            })),
          events: cal.events
            .filter((e) => e.date === today)
            .map((e) => ({ title: e.title, time: e.allDay ? undefined : minutesToLabel(e.start) })),
          habits: habits.filter((h) => !h.log[today]).map((h) => h.name),
          alarms: alarms
            .filter((a) => a.enabled && (a.days.length === 0 || a.days.includes(new Date().getDay())))
            .map((a) => ({ time: a.time, label: a.label || undefined })),
          unread: gmail.connected
            ? (gmail.unread ?? 0)
            : mails.filter((m) => m.folder === "inbox" && !m.read).length,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? t("brief.failed"));
      setBriefing({ date: today, text: body.briefing, createdAt: new Date().toISOString() });
    } catch (e) {
      toast(e instanceof Error ? e.message : t("brief.failed"), "error");
    }
    setBusy(false);
  };

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
          <Sparkles size={14} /> {t("brief.title")}
        </p>
        {ai.data?.configured && (
          <button
            onClick={run}
            disabled={busy}
            aria-label={fresh ? t("brief.regenerate") : t("brief.generate")}
            className="-mx-1 -my-2 flex items-center gap-1.5 px-1 py-2 text-xs text-faint transition-colors hover:text-accent disabled:cursor-wait"
          >
            <motion.span
              animate={busy ? { rotate: 360 } : { rotate: 0 }}
              transition={busy ? { repeat: Infinity, duration: 1, ease: "linear" } : { duration: 0.2 }}
              className="flex"
            >
              <RefreshCw size={12} />
            </motion.span>
            {busy ? t("brief.writing") : fresh ? t("brief.regenerate") : t("brief.generate")}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!ai.data?.configured ? (
          <motion.p
            key="unconfigured"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[13px] leading-relaxed text-faint"
          >
            {t("brief.needsKey")}{" "}
            <Link href="/settings/connections" className="text-accent underline underline-offset-2">
              {t("conn.title")}
            </Link>
          </motion.p>
        ) : fresh ? (
          <motion.p
            key={fresh.createdAt}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE.out }}
            className="text-[13px] leading-relaxed text-ink/90"
          >
            {fresh.text}
          </motion.p>
        ) : (
          <motion.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[13px] leading-relaxed text-faint"
          >
            {busy ? t("brief.writingLong") : t("brief.hint")}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
