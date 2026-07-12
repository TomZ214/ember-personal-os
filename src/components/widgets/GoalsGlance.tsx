"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useEmber } from "@/lib/store";
import { CATEGORY_VAR } from "@/lib/types";
import { ProgressBar } from "@/components/ui/misc";
import { differenceInDays, parseISO } from "date-fns";

export function GoalsGlanceWidget() {
  const goals = useEmber((s) => s.goals);

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">Goals</p>
        <Link href="/goals" className="flex items-center gap-1 text-xs text-faint transition-colors hover:text-accent">
          All goals <ArrowUpRight size={13} />
        </Link>
      </div>
      {goals.length === 0 && (
        <Link href="/goals" className="flex flex-1 flex-col items-center justify-center gap-1.5 py-6 text-center">
          <p className="text-sm font-medium">No goals yet</p>
          <p className="max-w-[28ch] text-xs text-muted">Pick one thing that matters this year — tap to set it.</p>
        </Link>
      )}
      <ul className="flex flex-1 flex-col justify-around gap-4">
        {goals.slice(0, 3).map((g) => {
          const done = g.milestones.filter((m) => m.done).length;
          const pct = g.milestones.length ? done / g.milestones.length : 0;
          const daysLeft = g.deadline ? differenceInDays(parseISO(g.deadline), new Date()) : null;
          const c = CATEGORY_VAR[g.color];
          return (
            <li key={g.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-medium">{g.title}</p>
                <span className="num shrink-0 text-xs text-faint">
                  {daysLeft !== null && daysLeft >= 0 ? `${daysLeft}d left` : `${done}/${g.milestones.length}`}
                </span>
              </div>
              <ProgressBar value={pct} color={c} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
