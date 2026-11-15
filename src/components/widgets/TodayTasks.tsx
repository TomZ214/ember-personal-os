"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, CheckSquare, Plus } from "lucide-react";
import { useEmber } from "@/lib/store";
import { todayKey } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { PRIORITY_META } from "@/lib/types";
import { row } from "@/lib/motion";
import { useTickHold } from "@/hooks/useTickHold";
import { celebrate } from "@/components/ui/celebrate";
import { CheckMark } from "@/components/ui/CheckMark";
import { EmptyState } from "@/components/ui/misc";

export function TodayTasksWidget() {
  const tasks = useEmber((s) => s.tasks);
  const updateTask = useEmber((s) => s.updateTask);
  const addTask = useEmber((s) => s.addTask);
  const [draft, setDraft] = useState("");
  // A ticked task leaves this list at once (it only shows open ones), so it
  // is held for the beat its tick takes to draw, then marked done.
  const { held: checking, tick } = useTickHold((id) => updateTask(id, { status: "done" }));
  const tr = useT();

  const today = todayKey();
  const open = tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"))
    .slice(0, 6);
  const doneToday = tasks.filter((t) => t.completedAt?.slice(0, 10) === today).length;

  const submit = () => {
    if (!draft.trim()) return;
    addTask({ title: draft.trim(), due: today });
    setDraft("");
  };

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">
          {tr("w.tasks")} <span className="text-faint">· {tr("w.doneToday").replace("{n}", String(doneToday))}</span>
        </p>
        <Link href="/tasks" className="-mx-1 -my-2 flex items-center gap-1 px-1 py-2 text-xs text-faint transition-colors hover:text-accent">
          {tr("w.taskBoard")} <ArrowUpRight size={13} />
        </Link>
      </div>

      {open.length === 0 ? (
        tasks.length === 0 ? (
          <EmptyState size="sm" icon={<CheckSquare size={20} />} title={tr("w.firstTask")} hint={tr("w.firstTaskHint")} />
        ) : (
          <EmptyState size="sm" icon={<CheckSquare size={20} />} title={tr("w.allClear")} hint={tr("w.allClearHint")} />
        )
      ) : (
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {open.map((t) => {
              const overdue = t.due && t.due < today;
              return (
                <motion.li
                  key={t.id}
                  // opens and closes its own height (the rows below follow by
                  // themselves); a finished task leaves to the right as it
                  // closes, the direction "done" lives in
                  initial={row.initial}
                  animate={row.animate}
                  exit={{ ...row.exit, x: 24 }}
                  className="group overflow-hidden"
                >
                  <div className="flex items-center gap-3 py-1.5">
                    <button
                      onClick={(e) => {
                        if (!tick(t.id)) return;
                        const r = e.currentTarget.getBoundingClientRect();
                        celebrate(t.title, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                      }}
                      aria-label={`${tr("tasks.complete")}: ${t.title}`}
                      // 18px is far below a comfortable tap target, but growing
                      // the box would change the design — so the hit area is
                      // extended invisibly to ~34px via a pseudo-element.
                      className="group/check relative shrink-0 before:absolute before:-inset-2 before:content-['']"
                    >
                      <CheckMark
                        checked={checking.has(t.id)}
                        className={checking.has(t.id) ? "" : "group-hover/check:border-success group-hover/check:bg-success/15"}
                      />
                    </button>
                    {/* struck through for the beat the tick takes to draw */}
                    <span
                      className={`min-w-0 flex-1 truncate text-sm transition-colors duration-200 ${
                        checking.has(t.id) ? "text-faint line-through decoration-white/30" : ""
                      }`}
                    >
                      {t.title}
                    </span>
                    {t.due && (
                      <span className={`num shrink-0 text-[11px] ${overdue ? "font-medium text-danger" : "text-faint"}`}>
                        {overdue ? tr("w.overdue") : t.due === today ? tr("w.todayLower") : t.due.slice(5).replace("-", "/")}
                      </span>
                    )}
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: PRIORITY_META[t.priority].color }}
                      title={PRIORITY_META[t.priority].label}
                    />
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-white/[0.06] pt-3">
        <Plus size={15} className="shrink-0 text-faint" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={tr("w.quickAddPh")}
          // py-2 gives the bare input a ~36px tap target; the field is
          // transparent so nothing changes visually
          className="w-full bg-transparent py-2 text-sm placeholder:text-faint focus:outline-none"
          aria-label={tr("w.quickAddPh")}
        />
      </div>
    </div>
  );
}
