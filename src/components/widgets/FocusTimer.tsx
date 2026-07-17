"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEmber } from "@/lib/store";
import { toast } from "@/components/ui/toast";
import { ProgressRing } from "@/components/ui/misc";
import { todayKey } from "@/lib/dates";
import { useT } from "@/lib/i18n";

export function FocusTimer() {
  const focus = useEmber((s) => s.focus);
  const t = useT();
  const settings = useEmber((s) => s.settings);
  const startFocus = useEmber((s) => s.startFocus);
  const stopFocus = useEmber((s) => s.stopFocus);
  // wall-clock ticks live in state so render stays pure
  const [nowTs, setNowTs] = useState(0);

  const totalMs = (focus.mode === "focus" ? settings.focusMinutes : settings.breakMinutes) * 60_000;
  const remaining =
    focus.running && focus.endsAt ? Math.max(0, focus.endsAt - (nowTs || focus.endsAt - totalMs)) : totalMs;

  useEffect(() => {
    if (!focus.running) return;
    const raf = requestAnimationFrame(() => setNowTs(Date.now()));
    const t = setInterval(() => setNowTs(Date.now()), 500);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, [focus.running]);

  useEffect(() => {
    if (focus.running && remaining === 0) {
      const wasFocus = focus.mode === "focus";
      stopFocus(true);
      toast(wasFocus ? t("w.focusDone") : t("w.breakDone"));
    }
  }, [remaining, focus.running, focus.mode, stopFocus, t]);

  const mm = Math.floor(remaining / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1000);
  const sessions = focus.sessionsDate === todayKey() ? focus.sessionsToday : 0;

  return (
    <div className="panel flex h-full flex-col items-center justify-between gap-3 p-5">
      <div className="flex w-full items-center justify-between">
        <p className="text-[13px] font-medium text-muted">{t("w.focus")}</p>
        <p className="text-[11px] text-faint">
          {sessions} {sessions === 1 ? t("w.sessionOne") : t("w.sessionMany")}
        </p>
      </div>

      <ProgressRing
        value={focus.running ? 1 - remaining / totalMs : 0}
        size={132}
        stroke={7}
        color={focus.mode === "focus" ? "var(--primary-bright)" : "var(--c-sage)"}
      >
        <div className="text-center">
          <p className="num text-3xl font-semibold tracking-tight" suppressHydrationWarning>
            {mm}:{ss.toString().padStart(2, "0")}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-faint">
            {focus.mode === "focus" ? t("w.focusLower") : t("w.breakLower")}
          </p>
        </div>
      </ProgressRing>

      <div className="flex items-center gap-2">
        {focus.running ? (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => stopFocus(false)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.06] text-ink hover:bg-white/[0.1]"
            aria-label="Pause"
          >
            <Pause size={16} />
          </motion.button>
        ) : (
          <>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => startFocus("focus")}
              className="flex h-10 items-center gap-2 rounded-full bg-[image:var(--grad-sunset)] px-4 text-sm font-semibold text-(--on-sunset) shadow-[0_2px_18px_-2px_var(--primary-glow)] transition-[filter] hover:brightness-110"
            >
              <Play size={14} fill="currentColor" /> {t("w.focus")}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => startFocus("break")}
              className="flex h-10 items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.06] px-4 text-sm text-muted hover:text-ink"
            >
              <RotateCcw size={14} /> {t("w.break")}
            </motion.button>
          </>
        )}
      </div>
    </div>
  );
}
