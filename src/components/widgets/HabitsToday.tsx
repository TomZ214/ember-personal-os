"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Flame } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CheckMark } from "@/components/ui/CheckMark";
import { sparkle } from "@/components/ui/celebrate";
import { CHECK_PULSE } from "@/lib/motion";
import { playCue } from "@/lib/sound";
import { useEmber } from "@/lib/store";
import { dayKey, todayKey } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { CATEGORY_VAR, type Habit } from "@/lib/types";
import { subDays } from "date-fns";

export function streak(h: Habit): number {
  let n = 0;
  let d = new Date();
  // today counts if done, but doesn't break the streak if still pending
  if (h.log[dayKey(d)]) n++;
  d = subDays(d, 1);
  while (h.log[dayKey(d)]) {
    n++;
    d = subDays(d, 1);
  }
  return n;
}

export function HabitsTodayWidget() {
  const habits = useEmber((s) => s.habits);
  const toggleHabit = useEmber((s) => s.toggleHabit);
  const t = useT();
  const today = todayKey();
  const done = habits.filter((h) => h.log[today]).length;

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">
          {t("w.habits")} <span className="text-faint">· {done}/{habits.length}</span>
        </p>
        <Link href="/habits" className="-mx-1 -my-2 flex items-center gap-1 px-1 py-2 text-xs text-faint transition-colors hover:text-accent">
          {t("w.streaks")} <ArrowUpRight size={13} />
        </Link>
      </div>

      {habits.length === 0 && (
        <Link href="/habits" className="flex flex-1 flex-col items-center justify-center gap-1.5 py-6 text-center">
          <p className="text-sm font-medium">{t("w.noHabits")}</p>
          <p className="max-w-[26ch] text-xs text-muted">{t("w.noHabitsHint")}</p>
        </Link>
      )}
      <ul className="flex flex-col gap-1">
        {habits.slice(0, 5).map((h) => {
          const checked = !!h.log[today];
          const s = streak(h);
          const c = CATEGORY_VAR[h.color];
          return (
            <li key={h.id}>
              <button
                onClick={(e) => {
                  toggleHabit(h.id, today);
                  // fireworks on the way in only — un-ticking is a correction,
                  // not an achievement, and celebrating it would read as mockery
                  if (checked) return;
                  playCue("success");
                  const dot = e.currentTarget.querySelector("[data-check]");
                  if (dot) {
                    const r = dot.getBoundingClientRect();
                    sparkle({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
                  }
                }}
                aria-pressed={checked}
                // a wide row presses less than a small button would
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left [--press-scale:0.985] ${
                  checked
                    ? "border-transparent bg-white/[0.07]"
                    : "border-white/[0.06] bg-transparent hover:bg-white/[0.04]"
                }`}
              >
                <motion.span
                  animate={checked ? CHECK_PULSE.animate : { scale: 1 }}
                  transition={CHECK_PULSE.transition}
                  className="text-lg"
                  aria-hidden
                >
                  {h.emoji}
                </motion.span>
                <span className={`flex-1 text-sm ${checked ? "text-muted line-through decoration-white/30" : ""}`}>
                  {h.name}
                </span>
                {s > 1 && (
                  <span className="num flex items-center gap-1 text-xs" style={{ color: c }}>
                    <Flame size={12} className="lit" style={{ "--lit-glow": "5px" } as React.CSSProperties} /> <AnimatedNumber value={s} />
                  </span>
                )}
                <CheckMark checked={checked} color={c} shape="round" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
