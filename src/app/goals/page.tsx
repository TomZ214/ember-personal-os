"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { differenceInDays, parseISO } from "date-fns";
import { Check, Flag, Plus, Trash2 } from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { CATEGORY_VAR, type CategoryColor, type Goal } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Textarea } from "@/components/ui/inputs";
import { EmptyState, PageHeader, ProgressRing } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

const COLORS: CategoryColor[] = ["ember", "amber", "sage", "sky", "lilac", "rose"];

export default function GoalsPage() {
  const hydrated = useHydrated();
  const goals = useEmber((s) => s.goals);
  const t = useT();
  const [adding, setAdding] = useState(false);

  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  const milestonesDone = goals.reduce((a, g) => a + g.milestones.filter((m) => m.done).length, 0);
  const milestonesAll = goals.reduce((a, g) => a + g.milestones.length, 0);

  return (
    <div>
      <PageHeader
        title={t("goals.title")}
        sub={goals.length ? `${goals.length} ${t("goals.active")} · ${milestonesDone}/${milestonesAll} ${t("goals.milestonesReached")}` : t("goals.sub")}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> {t("goals.new")}
          </Button>
        }
      />

      {goals.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<Flag size={20} />}
            title={t("goals.none")}
            hint={t("goals.noneHint")}
            action={<Button variant="primary" onClick={() => setAdding(true)}>{t("goals.setFirst")}</Button>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {goals.map((g, i) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, type: "spring", stiffness: 280, damping: 26 }}
            >
              <GoalCard goal={g} />
            </motion.div>
          ))}
        </div>
      )}

      <AddGoal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const t = useT();
  const toggleMilestone = useEmber((s) => s.toggleMilestone);
  const deleteGoal = useEmber((s) => s.deleteGoal);
  const c = CATEGORY_VAR[goal.color];
  const done = goal.milestones.filter((m) => m.done).length;
  const pct = goal.milestones.length ? done / goal.milestones.length : 0;
  const daysLeft = goal.deadline ? differenceInDays(parseISO(goal.deadline), new Date()) : null;

  return (
    <div className="panel panel-hover group flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-snug">{goal.title}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{goal.why}</p>
        </div>
        <ProgressRing value={pct} size={54} stroke={5} color={c}>
          <span className="num text-xs font-semibold">{Math.round(pct * 100)}%</span>
        </ProgressRing>
      </div>

      <ul className="mt-4 flex flex-1 flex-col gap-1">
        {goal.milestones.map((m) => (
          <li key={m.id}>
            <button
              onClick={() => toggleMilestone(goal.id, m.id)}
              aria-pressed={m.done}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
            >
              <span
                className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border transition-all ${
                  m.done ? "border-transparent text-white" : "border-white/25 text-transparent"
                }`}
                style={m.done ? { background: c } : undefined}
              >
                <Check size={11} strokeWidth={3} />
              </span>
              <span className={`text-sm ${m.done ? "text-faint line-through decoration-white/25" : ""}`}>{m.title}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
        <span className="num text-xs text-faint">
          {daysLeft === null ? t("goals.noDeadline") : daysLeft >= 0 ? `${daysLeft} ${t("goals.daysLeft")}` : `${-daysLeft} ${t("goals.daysOverdue")}`}
        </span>
        <button
          onClick={() => { deleteGoal(goal.id); toast(t("goals.removed"), "info"); }}
          aria-label={`${t("action.delete")} ${goal.title}`}
          className="rounded-lg p-1.5 text-faint opacity-0 transition-all hover:text-danger group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function AddGoal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const addGoal = useEmber((s) => s.addGoal);
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [deadline, setDeadline] = useState("");
  const [color, setColor] = useState<CategoryColor>("amber");
  const [milestones, setMilestones] = useState("");

  const save = () => {
    if (!title.trim()) return;
    addGoal({
      title: title.trim(),
      why: why.trim(),
      deadline: deadline || undefined,
      color,
      milestones: milestones
        .split("\n")
        .map((m) => m.trim())
        .filter(Boolean)
        .map((m) => ({ id: crypto.randomUUID(), title: m, done: false })),
    });
    toast(t("goals.created"));
    setTitle(""); setWhy(""); setDeadline(""); setMilestones("");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={t("goals.new")}>
      <div className="flex flex-col gap-4">
        <label>
          <Label>{t("goals.goal")}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("goals.goalPh")} autoFocus />
        </label>
        <label>
          <Label>{t("goals.why")}</Label>
          <Textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2}
            placeholder={t("goals.whyPh")} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>{t("goals.deadline")}</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
          <div>
            <Label>{t("goals.color")}</Label>
            <div className="flex h-10 items-center gap-2">
              {COLORS.map((cc) => (
                <button key={cc} onClick={() => setColor(cc)} aria-label={cc} aria-pressed={color === cc}
                  className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${color === cc ? "ring-2 ring-white/70 ring-offset-2 ring-offset-[#1c1a19]" : ""}`}
                  style={{ background: CATEGORY_VAR[cc] }} />
              ))}
            </div>
          </div>
        </div>
        <label>
          <Label>{t("goals.milestones")}</Label>
          <Textarea value={milestones} onChange={(e) => setMilestones(e.target.value)} rows={4}
            placeholder={t("goals.milestonesPh")} />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("action.cancel")}</Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>{t("goals.set")}</Button>
        </div>
      </div>
    </Modal>
  );
}
