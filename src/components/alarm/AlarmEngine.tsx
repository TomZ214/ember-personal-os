"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { AlarmClock, BellOff, Moon } from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { todayKey } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { EASE, THEME_PARTICLES } from "@/lib/motion";
import { playCue } from "@/lib/sound";
import { nativeNotify } from "@/lib/desktop";
import type { Alarm } from "@/lib/types";

/**
 * Watches the clock and rings.
 *
 * Honest limitation: this only fires while EmberOS is open — a web page can't
 * wake itself up. On the desktop app (which starts with Windows and lives in
 * the tray) that's most of the day; in a browser tab it isn't. A truly
 * offline alarm would need the alarms stored server-side and the push cron
 * firing them, which is a bigger piece of work.
 *
 * A missed alarm is skipped rather than fired late — an alarm going off three
 * hours after you needed it is worse than silence.
 */

const SNOOZE_MINUTES = 5;
const TICK_MS = 15_000;

const pad = (n: number) => String(n).padStart(2, "0");

export function AlarmEngine() {
  const hydrated = useHydrated();
  const alarms = useEmber((s) => s.alarms);
  const updateAlarm = useEmber((s) => s.updateAlarm);
  const [ringing, setRinging] = useState<Alarm | null>(null);
  // snoozed alarms, id -> timestamp before which they must stay quiet
  const snoozed = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!hydrated) return;

    const check = () => {
      // don't stack a second alarm on top of one already demanding attention
      if (ringing) return;
      const now = new Date();
      const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const today = todayKey();

      for (const a of alarms) {
        if (!a.enabled || a.time !== hhmm) continue;
        if (a.days.length > 0 && !a.days.includes(now.getDay())) continue;
        if (a.lastFired === today) continue; // already rang today
        if ((snoozed.current[a.id] ?? 0) > Date.now()) continue;

        setRinging(a);
        // stamping the day here is what stops it re-firing every tick for the
        // rest of the minute
        updateAlarm(a.id, { lastFired: today });
        return;
      }
    };

    check();
    const timer = setInterval(check, TICK_MS);
    return () => clearInterval(timer);
  }, [hydrated, alarms, ringing, updateAlarm]);

  const stop = () => {
    if (ringing && ringing.days.length === 0) {
      // a one-shot alarm has done its job
      updateAlarm(ringing.id, { enabled: false });
    }
    setRinging(null);
  };

  const snooze = () => {
    if (!ringing) return;
    snoozed.current[ringing.id] = Date.now() + SNOOZE_MINUTES * 60_000;
    const id = ringing.id;
    const alarm = ringing;
    setRinging(null);
    // clearing lastFired would let the normal check re-fire it, but only after
    // the snooze window — simpler to just re-raise it ourselves
    window.setTimeout(() => {
      if ((snoozed.current[id] ?? 0) <= Date.now()) setRinging(alarm);
    }, SNOOZE_MINUTES * 60_000);
  };

  if (!ringing) return null;
  return <Ringing alarm={ringing} onStop={stop} onSnooze={snooze} />;
}

function Ringing({
  alarm,
  onStop,
  onSnooze,
}: {
  alarm: Alarm;
  onStop: () => void;
  onSnooze: () => void;
}) {
  const t = useT();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const m = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(m);
  }, []);

  // ring until answered, and buzz on phones
  useEffect(() => {
    const ring = () => {
      playCue("alarm", { force: true });
      navigator.vibrate?.([300, 200, 300]);
    };
    ring();
    // also surface it at OS level, in case the window is behind something
    void nativeNotify(alarm.label || t("alarm.ringing"), alarm.time);
    const loop = setInterval(ring, 1600);
    // Escape stops it, like any other dialog
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onStop();
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(loop);
      window.removeEventListener("keydown", onKey);
    };
  }, [onStop, alarm.label, alarm.time, t]);

  if (!mounted) return null;

  return createPortal(
    <motion.div
      role="alertdialog"
      aria-label={alarm.label || t("alarm.ringing")}
      className="fixed inset-0 z-(--z-tooltip) flex flex-col items-center justify-center gap-8 bg-bg-deep/95 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: EASE.out }}
    >
      {/* theme-coloured pulse behind the clock */}
      <motion.div
        aria-hidden
        className="absolute h-[30rem] w-[30rem] rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--primary) 40%, transparent), transparent 62%)",
          filter: "blur(60px)",
        }}
        animate={{ opacity: [0.35, 0.8, 0.35], scale: [0.95, 1.08, 0.95] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.span
        aria-hidden
        className="relative flex h-20 w-20 items-center justify-center rounded-[26px] bg-primary/15 text-primary-bright"
        style={{ boxShadow: "0 0 60px -8px var(--primary-glow)" }}
        animate={{ rotate: [-9, 9, -9] }}
        transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
      >
        <AlarmClock size={38} strokeWidth={1.7} />
      </motion.span>

      <div className="relative text-center">
        <p className="num text-6xl font-semibold tracking-tight sm:text-7xl">{alarm.time}</p>
        {alarm.label && <p className="mt-2 text-[15px] text-muted">{alarm.label}</p>}
      </div>

      <div className="relative flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onSnooze}
          className="flex h-12 items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.06] px-6 text-sm font-medium text-ink transition-colors hover:bg-white/[0.1]"
        >
          <Moon size={16} /> {t("alarm.snooze").replace("{n}", String(SNOOZE_MINUTES))}
        </button>
        <button
          onClick={onStop}
          className="flex h-12 items-center gap-2 rounded-full bg-[image:var(--grad-sunset)] px-7 text-sm font-semibold text-(--on-sunset) shadow-[0_2px_20px_-2px_var(--primary-glow)] transition-[filter] hover:brightness-110"
        >
          <BellOff size={16} /> {t("alarm.stop")}
        </button>
      </div>

      {/* embers, in the active theme */}
      {Array.from({ length: 10 }, (_, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{
            left: `${8 + i * 9}%`,
            bottom: 0,
            background: THEME_PARTICLES[i % THEME_PARTICLES.length],
          }}
          animate={{ y: [0, -420], opacity: [0, 0.7, 0] }}
          transition={{ duration: 4 + (i % 4), repeat: Infinity, delay: i * 0.35, ease: "linear" }}
        />
      ))}
    </motion.div>,
    document.body,
  );
}

