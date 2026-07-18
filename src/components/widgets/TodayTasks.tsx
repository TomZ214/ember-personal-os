"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Check, CheckSquare, Plus } from "lucide-react";
import { useEmber } from "@/lib/store";
import { todayKey } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { PRIORITY_META } from "@/lib/types";
import { celebrate } from "@/components/ui/celebrate";
import { EmptyState } from "@/components/ui/misc";

export function TodayTasksWidget() {
  const tasks = useEmber((s) => s.tasks);
  const updateTask = useEmber((s) => s.updateTask);
  const addTask = useEmber((s) => s.addTask);
  const [draft, setDraft] = useState("");
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
          <EmptyState icon={<CheckSquare size={20} />} title={tr("w.firstTask")} hint={tr("w.firstTaskHint")} />
        ) : (
          <EmptyState icon={<CheckSquare size={20} />} title={tr("w.allClear")} hint={tr("w.allClearHint")} />
        )
      ) : (
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {open.map((t) => {
              const overdue = t.due && t.due < today;
              return (
                <motion.li
                  key={t.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0, x: 24 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="group overflow-hidden"
                >
                  <div className="flex items-center gap-3 py-1.5">
                    <button
                      onClick={(e) => {
                        updateTask(t.id, { status: "done" });
                        const r = e.currentTarget.getBoundingClientRect();
                        celebrate(t.title, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                      }}
                      aria-label={`Complete "${t.title}"`}
                      // 18px is far below a comfortable tap target, but growing
                      // the box would change the design — so the hit area is
                      // extended invisibly to ~34px via a pseudo-element.
                      className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border border-white/25 text-transparent transition-all before:absolute before:-inset-2 before:content-[''] hover:border-success hover:bg-success/15 hover:text-success"
                    >
                      <Check size={12} strokeWidth={3} />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
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
