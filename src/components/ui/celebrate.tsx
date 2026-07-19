"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { useEmber } from "@/lib/store";
import { todayKey } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { THEME_PARTICLES } from "@/lib/motion";
import { playCue } from "@/lib/sound";

/**
 * The task-completion celebration: an ember spark burst at the checkbox, a
 * progress pill, and a milestone moment when the day's list is finally clear.
 *
 * Everything animates opacity/transform only so it composites on the GPU, and
 * the whole thing collapses to a plain pill under prefers-reduced-motion.
 */

interface Burst {
  id: number;
  x: number;
  y: number;
}
interface Pill {
  id: number;
  title: string;
  done: number;
  total: number;
}

interface CelebrationState {
  bursts: Burst[];
  pill: Pill | null;
  milestone: number | null; // id, or null
}

const useCelebration = create<CelebrationState>(() => ({ bursts: [], pill: null, milestone: null }));
const set = useCelebration.setState;

/**
 * Sparks inherit the active theme. These were hardcoded sunset hexes, which
 * meant the celebration still burst orange/pink while the app was running the
 * tide, crimson or orchid theme.
 */
const SPARK_COLORS = [...THEME_PARTICLES, "var(--success)"];

/** how the day looks right now: finished vs. still-open (due today or overdue) */
function dayProgress() {
  const today = todayKey();
  const tasks = useEmber.getState().tasks;
  const doneToday = tasks.filter((t) => t.status === "done" && t.completedAt?.slice(0, 10) === today).length;
  // completed today that actually had a due date on/before today — the "day's list"
  const clearedDue = tasks.filter(
    (t) => t.status === "done" && t.completedAt?.slice(0, 10) === today && t.due && t.due <= today,
  ).length;
  const openDue = tasks.filter((t) => t.status !== "done" && t.due && t.due <= today).length;
  return { doneToday, clearedDue, openDue, total: doneToday + openDue };
}

/**
 * Fire the celebration. `origin` is the screen point the burst radiates from
 * (usually the checkbox that was just ticked); omit it for a centred moment.
 */
export function celebrate(title: string, origin?: { x: number; y: number }) {
  playCue("success");
  const id = Date.now() + Math.random();
  const { doneToday, clearedDue, openDue, total } = dayProgress();

  if (origin) {
    set((s) => ({ bursts: [...s.bursts.slice(-3), { id, x: origin.x, y: origin.y }] }));
    setTimeout(() => set((s) => ({ bursts: s.bursts.filter((b) => b.id !== id) })), 900);
  }

  set({ pill: { id, title, done: doneToday, total: Math.max(total, 1) } });
  setTimeout(() => set((s) => (s.pill?.id === id ? { pill: null } : s)), 2800);

  // the day's list just went clear — that deserves more than a pill.
  // Only when a real due list was emptied, not on stray undated tasks.
  if (openDue === 0 && clearedDue > 0) {
    set({ milestone: id });
    setTimeout(() => set((s) => (s.milestone === id ? { milestone: null } : s)), 3200);
  }

  // a tiny tap of haptic feedback on phones
  navigator.vibrate?.(12);
}

export function Celebrations() {
  const { bursts, pill, milestone } = useCelebration();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);
  if (!mounted) return null;

  return createPortal(
    <>
      <AnimatePresence>
        {bursts.map((b) => (
          <SparkBurst key={b.id} x={b.x} y={b.y} />
        ))}
      </AnimatePresence>
      <AnimatePresence>{pill && <ProgressPill key={pill.id} pill={pill} />}</AnimatePresence>
      <AnimatePresence>{milestone && <Milestone key={milestone} />}</AnimatePresence>
    </>,
    document.body,
  );
}

/* ---------------- the burst ---------------- */

function SparkBurst({ x, y }: { x: number; y: number }) {
  const reduced = useReducedMotion();
  const [sparks] = useState(() =>
    Array.from({ length: 14 }, (_, i) => {
      const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 34 + Math.random() * 54;
      return {
        id: i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        size: 3 + Math.random() * 3.5,
        color: SPARK_COLORS[i % SPARK_COLORS.length],
        delay: Math.random() * 0.05,
      };
    }),
  );
  if (reduced) return null;

  return (
    <div className="pointer-events-none fixed z-(--z-toast)" style={{ left: x, top: y }} aria-hidden>
      {/* ring pulse */}
      <motion.span
        className="absolute rounded-full border-2"
        style={{ borderColor: "var(--success)", width: 26, height: 26, marginLeft: -13, marginTop: -13 }}
        initial={{ scale: 0.5, opacity: 0.9 }}
        animate={{ scale: 2.8, opacity: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* sparks */}
      {sparks.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full"
          style={{ width: s.size, height: s.size, background: s.color, marginLeft: -s.size / 2, marginTop: -s.size / 2 }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: s.dx, y: s.dy, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.7, delay: s.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  );
}

/* ---------------- the pill ---------------- */

function ProgressPill({ pill }: { pill: Pill }) {
  const t = useT();
  const pct = Math.round((pill.done / pill.total) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className="glass-strong pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-(--z-toast) mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-full py-2 pl-2.5 pr-4 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)] md:bottom-24"
    >
      <motion.span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/20 text-success"
        initial={{ scale: 0.4 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 600, damping: 18 }}
      >
        <Check size={13} strokeWidth={3.5} />
      </motion.span>
      {/* the message itself, with the task that earned it underneath — every
          completion says so, not just the one that clears the day */}
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium leading-tight">{t("celebrate.taskDone")}</span>
        <span className="truncate text-xs leading-tight text-faint line-through decoration-white/30">
          {pill.title}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="h-1 w-14 overflow-hidden rounded-full bg-white/[0.12]">
          <motion.span
            className="block h-full rounded-full bg-[image:var(--grad-sunset)]"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: pct / 100 }}
            style={{ transformOrigin: "left" }}
            transition={{ type: "spring", stiffness: 90, damping: 18 }}
          />
        </span>
        <span className="num shrink-0 text-xs text-faint">
          {pill.done}/{pill.total} {t("celebrate.today")}
        </span>
      </span>
    </motion.div>
  );
}

/* ---------------- the milestone ---------------- */

function Milestone() {
  const t = useT();
  const reduced = useReducedMotion();
  const [sparks] = useState(() =>
    Array.from({ length: 22 }, (_, i) => {
      const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 70 + Math.random() * 120;
      return {
        id: i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        size: 4 + Math.random() * 4,
        color: SPARK_COLORS[i % SPARK_COLORS.length],
        delay: Math.random() * 0.12,
      };
    }),
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-(--z-modal) flex items-center justify-center" aria-live="polite">
      <div className="relative">
        {!reduced &&
          sparks.map((s) => (
            <motion.span
              key={s.id}
              aria-hidden
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{ width: s.size, height: s.size, background: s.color }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: s.dx, y: s.dy, opacity: 0, scale: 0.3 }}
              transition={{ duration: 1.1, delay: s.delay, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 10 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className="glass-strong glass-edge relative flex flex-col items-center gap-2 rounded-3xl px-8 py-6 text-center shadow-[0_28px_80px_-16px_rgba(0,0,0,0.75)]"
        >
          {!reduced && (
            <motion.div
              aria-hidden
              animate={{ opacity: [0.35, 0.65, 0.35], scale: [1, 1.08, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute -inset-5 -z-10 rounded-[2rem]"
              style={{
                background: "radial-gradient(60% 60% at 50% 50%, color-mix(in oklch, var(--accent) 42%, transparent), transparent 70%)",
                filter: "blur(26px)",
              }}
            />
          )}
          <motion.span
            initial={{ scale: 0.3, rotate: -18 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 16, delay: 0.06 }}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/15 text-success shadow-[0_0_26px_-4px_var(--success)]"
          >
            <Sparkles size={22} />
          </motion.span>
          <p className="text-[17px] font-semibold tracking-tight">{t("celebrate.allDoneTitle")}</p>
          <p className="max-w-[26ch] text-[13px] text-muted">{t("celebrate.allDoneSub")}</p>
        </motion.div>
      </div>
    </div>
  );
}
