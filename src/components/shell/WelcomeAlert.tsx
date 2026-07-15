"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { addDays } from "date-fns";
import {
  AnimatePresence, animate, motion, useMotionValue, useReducedMotion,
  type AnimationPlaybackControls,
} from "framer-motion";
import { CalendarClock, Check, Flame, X } from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { useGmailUnread } from "@/hooks/useIntegrations";
import { dayKey, occursOn, todayKey } from "@/lib/dates";
import { greetingFor, useLang, useT } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";

/**
 * The welcome alert — a Dynamic-Island-flavoured system notification that
 * greets the user with whatever actually needs attention right now.
 *
 * Everything it reads is already in memory (zustand) or already cached by the
 * dashboard's Gmail poll, so surfacing it costs no extra network requests.
 * It renders through a portal: the page-transition transform in template.tsx
 * would otherwise become the containing block for position:fixed.
 */

/** module-level, so it survives client-side navigation but resets on a real refresh */
let dismissedThisLoad = false;

const AUTO_DISMISS_MS = 10_000;
const DECIDE_DELAY_MS = 500; // let the page paint (and cached mail land) first

type Kind = "task" | "event" | "mail";

interface AlertItem {
  id: string;
  emoji: string;
  text: string;
  kind: Kind;
}

interface Snapshot {
  items: AlertItem[];
  hasTasks: boolean;
  hasEvent: boolean;
}

export function WelcomeAlert() {
  const hydrated = useHydrated();
  const tasks = useEmber((s) => s.tasks);
  const events = useEmber((s) => s.events);
  const userName = useEmber((s) => s.settings.userName);
  const gmail = useGmailUnread();

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [allClear, setAllClear] = useState(false);
  const [mounted, setMounted] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  /* ---- build the summary exactly once per page load ---- */
  const build = useCallback((): Snapshot => {
    const today = todayKey();
    const tomorrow = dayKey(addDays(new Date(), 1));
    const openTasks = tasks.filter((t) => t.status !== "done" && t.due);

    const overdue = openTasks.filter((t) => t.due! < today).length;
    const dueToday = openTasks.filter((t) => t.due === today).length;
    const dueTomorrow = openTasks.filter((t) => t.due === tomorrow).length;

    // the next event starting within the hour (recurrence-aware)
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const soon = events
      .filter((e) => occursOn(e, today))
      .map((e) => ({ e, inMin: e.start - nowMin }))
      .filter(({ inMin }) => inMin >= 0 && inMin <= 60)
      .sort((a, b) => a.inMin - b.inMin)[0];

    const items: AlertItem[] = [];
    if (overdue > 0)
      items.push({ id: "overdue", emoji: "⚠️", kind: "task", text: `${overdue} overdue task${overdue === 1 ? "" : "s"}` });
    if (dueToday > 0)
      items.push({ id: "today", emoji: "🔥", kind: "task", text: `${dueToday} task${dueToday === 1 ? "" : "s"} due today` });
    if (dueTomorrow > 0)
      items.push({ id: "soon", emoji: "⚡", kind: "task", text: `${dueTomorrow} task${dueTomorrow === 1 ? "" : "s"} due within 24 hours` });
    if (soon)
      items.push({
        id: "event",
        emoji: "📅",
        kind: "event",
        text: soon.inMin <= 1 ? `${soon.e.title} is starting now` : `${soon.e.title} in ${soon.inMin} minutes`,
      });
    if (gmail.important > 0)
      items.push({
        id: "mail",
        emoji: "🏦",
        kind: "mail",
        text: `${gmail.important} unread message${gmail.important === 1 ? "" : "s"} from the Sparkasse`,
      });

    return {
      items,
      hasTasks: items.some((i) => i.kind === "task"),
      hasEvent: items.some((i) => i.kind === "event"),
    };
  }, [tasks, events, gmail.important]);

  useEffect(() => {
    if (!hydrated || decided.current || dismissedThisLoad) return;
    const t = setTimeout(() => {
      if (decided.current) return;
      decided.current = true;
      const snap = build();
      if (snap.items.length > 0) {
        setSnapshot(snap);
        setOpen(true);
      } else {
        setAllClear(true);
        setTimeout(() => setAllClear(false), 4200);
      }
    }, DECIDE_DELAY_MS);
    return () => clearTimeout(t);
  }, [hydrated, build]);

  const close = useCallback(() => {
    dismissedThisLoad = true;
    setOpen(false);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <>
      <AnimatePresence>
        {open && snapshot && (
          <AlertCard snapshot={snapshot} userName={userName} onClose={close} />
        )}
      </AnimatePresence>
      <AnimatePresence>{allClear && <AllClearPill />}</AnimatePresence>
    </>,
    document.body,
  );
}

/* ---------------- the card ---------------- */

function AlertCard({
  snapshot, userName, onClose,
}: {
  snapshot: Snapshot;
  userName: string;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const lang = useLang();
  const { items, hasTasks, hasEvent } = snapshot;
  const multiple = items.length > 1;

  // auto-dismiss countdown, drawn as a GPU-only scaleX bar and paused on hover
  const progress = useMotionValue(1);
  const playback = useRef<AnimationPlaybackControls | null>(null);

  const run = useCallback(
    (from: number) => {
      playback.current?.stop();
      playback.current = animate(progress, 0, {
        duration: AUTO_DISMISS_MS * from / 1000,
        ease: "linear",
        onComplete: onClose,
      });
    },
    [progress, onClose],
  );

  useEffect(() => {
    run(1);
    return () => playback.current?.stop();
  }, [run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // primary route: everything at once → dashboard, calendar-only → calendar, else tasks
  const routes: { label: string; href: string }[] = [];
  if (multiple) routes.push({ label: "View Dashboard", href: "/" });
  if (hasTasks) routes.push({ label: "View Tasks", href: "/tasks" });
  if (hasEvent) routes.push({ label: "Open Calendar", href: "/calendar" });
  if (routes.length === 0) routes.push({ label: "Open Mail", href: "/mail" });
  const actions = routes.slice(0, 2);

  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: 40 + Math.random() * 60,
        size: 2 + Math.random() * 3,
        delay: Math.random() * 3,
        duration: 5 + Math.random() * 4,
        drift: (Math.random() - 0.5) * 30,
      })),
    [],
  );

  return (
    <div className="fixed inset-0 z-(--z-modal) flex items-center justify-center p-4">
      {/* 1 — the world softly darkens and blurs behind it */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[10px]"
      />

      <motion.div
        role="alertdialog"
        aria-label="Welcome summary"
        onMouseEnter={() => playback.current?.stop()}
        onMouseLeave={() => run(progress.get())}
        // only opacity + transform: both composite on the GPU, so the entrance
        // stays at 60fps and the card never becomes a backdrop root (which
        // would kill the glass blur behind it)
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 18 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 260, damping: 26, mass: 0.9 }}
        className="relative w-full max-w-md"
      >
        {/* 4 + 7 — breathing ember halo (its own layer, so the blurred glass never re-rasterizes) */}
        {!reduced && (
          <motion.div
            aria-hidden
            animate={{ opacity: [0.35, 0.6, 0.35], scale: [1, 1.035, 1] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem]"
            style={{
              background:
                "radial-gradient(60% 50% at 50% 40%, color-mix(in oklch, var(--accent) 38%, transparent), transparent 70%)",
              filter: "blur(28px)",
            }}
          />
        )}

        <div className="glass-strong glass-edge relative overflow-hidden rounded-[26px] p-6 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.75)] sm:p-7">
          {/* 5 — embers drifting up behind the content */}
          {!reduced && (
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              {particles.map((p) => (
                <motion.span
                  key={p.id}
                  className="absolute rounded-full"
                  style={{
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    width: p.size,
                    height: p.size,
                    background: "var(--accent)",
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.55, 0], y: [0, -70], x: [0, p.drift] }}
                  transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "easeOut" }}
                />
              ))}
            </div>
          )}

          <button
            onClick={onClose}
            aria-label="Dismiss"
            className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-faint transition-colors hover:bg-white/[0.08] hover:text-ink"
          >
            <X size={16} />
          </button>

          <div className="relative">
            <div className="flex items-center gap-3">
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.08 }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-accent/15 text-accent shadow-[0_0_22px_-4px_var(--accent)]"
              >
                <Flame size={18} strokeWidth={2.2} />
              </motion.span>
              <div className="min-w-0">
                <h2 className="truncate text-[19px] font-semibold tracking-tight">
                  {greetingFor(lang, userName)}
                </h2>
                <p className="text-[13px] text-muted">
                  {multiple ? "Here's what needs you." : "One thing needs you."}
                </p>
              </div>
            </div>

            <ul className="mt-5 flex flex-col gap-2">
              {items.map((item, i) => (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.14 + i * 0.07, type: "spring", stiffness: 380, damping: 30 }}
                  className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3.5 py-2.5"
                >
                  <span className="text-[15px] leading-none">{item.emoji}</span>
                  <span className="text-[14px] leading-snug text-ink">{item.text}</span>
                </motion.li>
              ))}
            </ul>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.14 + items.length * 0.07 + 0.05 }}
              className="mt-4 text-[13px] text-muted"
            >
              {multiple ? "Let's get everything under control." : "Let's take care of it."}
            </motion.p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {actions.map((a, i) => (
                <Link key={a.href} href={a.href} onClick={onClose}>
                  <Button variant={i === 0 ? "primary" : "subtle"}>{a.label}</Button>
                </Link>
              ))}
              <Button variant="ghost" onClick={onClose} className="ml-auto">
                Dismiss
              </Button>
            </div>
          </div>

          {/* auto-dismiss countdown — pure transform, pauses on hover */}
          <motion.div
            aria-hidden
            style={{ scaleX: progress, transformOrigin: "left" }}
            className="absolute inset-x-0 bottom-0 h-[2px] bg-[image:var(--grad-sunset)] opacity-70"
          />
        </div>
      </motion.div>
    </div>
  );
}

/* ---------------- empty state ---------------- */

function AllClearPill() {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 340, damping: 28 }}
      className="glass glass-edge fixed right-4 top-[calc(env(safe-area-inset-top)+4.25rem)] z-(--z-toast) flex items-center gap-2.5 rounded-full py-2.5 pl-3 pr-4 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)] sm:right-6"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
        <Check size={13} strokeWidth={3} />
      </span>
      <span className="text-[13px] font-medium">{t("dash.everythingUpToDate")}</span>
      <CalendarClock size={13} className="text-faint" />
    </motion.div>
  );
}
