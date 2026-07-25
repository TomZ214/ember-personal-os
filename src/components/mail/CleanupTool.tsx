"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format, subYears } from "date-fns";
import { AlertTriangle, Check, Eraser, Loader2, Trash2, Undo2, X } from "lucide-react";
import { invalidateApi } from "@/hooks/useApi";
import { useLang, useT } from "@/lib/i18n";
import { dfLocale } from "@/lib/dates";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label } from "@/components/ui/inputs";
import { toast } from "@/components/ui/toast";

type Scope = "inbox" | "promotions" | "social" | "updates" | "spam";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "promotions", label: "Promotions" },
  { id: "social", label: "Social" },
  { id: "updates", label: "Updates" },
  { id: "spam", label: "Spam" },
];

const AGE_PRESETS = [
  { label: "1 year", years: 1 },
  { label: "2 years", years: 2 },
  { label: "3 years", years: 3 },
  { label: "5 years", years: 5 },
];

const fmtBytes = (b: number) =>
  b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.round(b / 1e3)} KB`;

type Phase = "configure" | "previewing" | "confirm" | "running" | "done";

interface Progress {
  total: number;
  done: number;
  startedAt: number;
  seconds?: number;
  cancelled?: boolean;
}

/** Mail → Tools: bulk-clean old email, safely (Trash, not permanent delete). */
export function CleanupTool({ open, onClose, onFinished }: { open: boolean; onClose: () => void; onFinished: () => void }) {
  const t = useT();
  const lang = useLang();
  const fmtDate = (d: Date) => format(d, lang === "de" ? "d. MMM yyyy" : "MMM d, yyyy", { locale: dfLocale(lang) });
  const [phase, setPhase] = useState<Phase>("configure");
  const [before, setBefore] = useState(() => format(subYears(new Date(), 1), "yyyy-MM-dd"));
  const [preset, setPreset] = useState<number | "custom">(1);
  const [include, setInclude] = useState<Set<Scope>>(new Set(["promotions", "social", "updates"]));
  const [excludeLabels, setExcludeLabels] = useState("");
  const [preview, setPreview] = useState<{ count: number; avgBytes: number } | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const options = () => ({
    before,
    include: [...include],
    excludeLabels: excludeLabels.split(",").map((l) => l.trim()).filter(Boolean),
  });

  const reset = () => {
    setPhase("configure");
    setPreview(null);
    setProgress(null);
    setError(null);
  };

  const close = () => {
    if (phase === "running") return; // use the cancel button first
    reset();
    onClose();
  };

  const toggleScope = (s: Scope) =>
    setInclude((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const runPreview = async () => {
    setPhase("previewing");
    setError(null);
    try {
      const res = await fetch("/api/google/gmail/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", options: options() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "preview failed");
      setPreview(body);
      setPhase("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("configure");
    }
  };

  const run = async () => {
    if (!preview) return;
    cancelled.current = false;
    setPhase("running");
    setProgress({ total: preview.count, done: 0, startedAt: Date.now() });
    let done = 0;
    let failures = 0;

    while (!cancelled.current) {
      try {
        const res = await fetch("/api/google/gmail/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "batch", options: options() }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "batch failed");
        done += body.trashed;
        failures = 0;
        setProgress((p) => (p ? { ...p, done, total: Math.max(p.total, done + body.remaining) } : p));
        if (body.trashed === 0 || body.remaining === 0) break;
        // stay friendly to Gmail's per-user quota
        await new Promise((r) => setTimeout(r, 400));
      } catch (e) {
        failures++;
        if (failures >= 3) {
          setError(e instanceof Error ? e.message : String(e));
          break;
        }
        await new Promise((r) => setTimeout(r, 1200 * failures));
      }
    }

    setProgress((p) =>
      p ? { ...p, done, seconds: Math.max(1, Math.round((Date.now() - p.startedAt) / 1000)), cancelled: cancelled.current } : p,
    );
    setPhase("done");
    invalidateApi("/api/google/gmail");
    onFinished();
  };

  const pct = progress && progress.total > 0 ? Math.min(100, (progress.done / progress.total) * 100) : 0;

  return (
    <Modal open={open} onClose={close} title={t("clean.title")} wide>
      <AnimatePresence mode="wait" initial={false}>
        {(phase === "configure" || phase === "previewing") && (
          <motion.div key="cfg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-5">
            <div>
              <Label>{t("clean.olderThan")}</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {AGE_PRESETS.map((p) => (
                  <button
                    key={p.years}
                    onClick={() => {
                      setPreset(p.years);
                      setBefore(format(subYears(new Date(), p.years), "yyyy-MM-dd"));
                    }}
                    aria-pressed={preset === p.years}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                      preset === p.years ? "bg-accent/15 text-accent" : "bg-white/[0.05] text-muted hover:bg-white/[0.08] hover:text-ink"
                    }`}
                  >
                    {t(`clean.y${p.years}`)}
                  </button>
                ))}
                <button
                  onClick={() => setPreset("custom")}
                  aria-pressed={preset === "custom"}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                    preset === "custom" ? "bg-accent/15 text-accent" : "bg-white/[0.05] text-muted hover:bg-white/[0.08] hover:text-ink"
                  }`}
                >
                  {t("clean.customDate")}
                </button>
                {preset === "custom" && (
                  <Input type="date" value={before} onChange={(e) => setBefore(e.target.value)} className="h-9 w-40" />
                )}
              </div>
              <p className="mt-1.5 text-xs text-faint">
                {t("clean.affectedBefore").replace("{date}", fmtDate(new Date(before)))}
              </p>
            </div>

            <div>
              <Label>{t("clean.searchIn")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {SCOPES.map((s) => {
                  const on = include.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleScope(s.id)}
                      aria-pressed={on}
                      className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                        on ? "bg-accent/15 text-accent" : "bg-white/[0.05] text-muted hover:bg-white/[0.08] hover:text-ink"
                      }`}
                    >
                      {on && <Check size={12} />}
                      {t(`clean.scope.${s.id}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            <label>
              <Label>{t("clean.neverTouch")}</Label>
              <Input
                value={excludeLabels}
                onChange={(e) => setExcludeLabels(e.target.value)}
                placeholder={t("clean.neverTouchPh")}
              />
            </label>

            <p className="flex items-start gap-2 rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-xs leading-relaxed text-muted">
              <Undo2 size={14} className="mt-0.5 shrink-0 text-success" />
              {t("clean.safetyNote")}
            </p>

            {error && <p className="text-[13px] text-danger">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>{t("clean.cancel")}</Button>
              <Button variant="primary" onClick={runPreview} disabled={include.size === 0 || phase === "previewing"}>
                {phase === "previewing" ? <Loader2 size={14} className="animate-spin" /> : <Eraser size={14} />}
                {phase === "previewing" ? t("clean.counting") : t("clean.previewCleanup")}
              </Button>
            </div>
          </motion.div>
        )}

        {phase === "confirm" && preview && (
          <motion.div key="confirm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/[0.04] p-4 text-center">
                <p className="num text-2xl font-semibold tracking-tight">{preview.count.toLocaleString(lang === "de" ? "de-DE" : "en")}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-faint">{t("clean.emails")}</p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-4 text-center">
                <p className="num text-2xl font-semibold tracking-tight">≈ {fmtBytes(preview.count * preview.avgBytes)}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-faint">{t("clean.storageFreed")}</p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-4 text-center">
                <p className="truncate text-sm font-medium leading-8">{[...include].map((s) => t(`clean.scope.${s}`)).join(" · ")}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-faint">{t("clean.affected")}</p>
              </div>
            </div>
            <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
              {t("clean.confirmNote")
                .replace("{date}", fmtDate(new Date(before)))
                .replace("{extra}", options().excludeLabels.length > 0 ? t("clean.andLabels").replace("{labels}", options().excludeLabels.join(", ")) : "")}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={reset}>{t("clean.back")}</Button>
              <Button variant="danger" onClick={run} disabled={preview.count === 0}>
                <Trash2 size={14} /> {t("clean.moveToTrash").replace("{n}", preview.count.toLocaleString(lang === "de" ? "de-DE" : "en"))}
              </Button>
            </div>
          </motion.div>
        )}

        {phase === "running" && progress && (
          <motion.div key="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-4">
            <p className="num text-3xl font-semibold tracking-tight">
              {progress.done.toLocaleString(lang === "de" ? "de-DE" : "en")}
              <span className="text-muted"> / {progress.total.toLocaleString(lang === "de" ? "de-DE" : "en")}</span>
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.07]">
              <motion.div
                className="h-full rounded-full bg-[image:var(--grad-sunset)]"
                animate={{ width: `${pct}%` }}
                transition={{ type: "spring", stiffness: 60, damping: 20 }}
              />
            </div>
            <p className="text-xs text-faint">{t("clean.working")}</p>
            <Button
              size="sm"
              onClick={() => {
                cancelled.current = true;
                toast(t("clean.stopping"), "info");
              }}
            >
              <X size={14} /> {t("clean.cancel")}
            </Button>
          </motion.div>
        )}

        {phase === "done" && progress && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4 py-4 text-center">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className={`flex h-14 w-14 items-center justify-center rounded-full ${error ? "bg-danger/15 text-danger" : "bg-success/15 text-success"}`}
            >
              {error ? <AlertTriangle size={24} /> : <Check size={26} strokeWidth={2.5} />}
            </motion.span>
            <div>
              <p className="text-lg font-semibold">
                {t("clean.movedToTrash").replace("{n}", progress.done.toLocaleString(lang === "de" ? "de-DE" : "en"))}
              </p>
              <p className="mt-1 text-sm text-muted">
                {t("clean.freed").replace("{size}", fmtBytes(progress.done * (preview?.avgBytes ?? 0))).replace("{secs}", String(progress.seconds))}
                {progress.cancelled && t("clean.cancelledResume")}
                {error && t("clean.stopped").replace("{error}", error)}
              </p>
            </div>
            <div className="flex gap-2">
              {(progress.cancelled || error) && (
                <Button onClick={reset}>{t("clean.resume")}</Button>
              )}
              <Button variant="primary" onClick={close}>{t("clean.done")}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
