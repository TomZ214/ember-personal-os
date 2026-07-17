"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlarmClock, Check, CheckSquare, Columns3, GripVertical, List, Loader2, Plus, RefreshCw, Repeat,
  Tag, Trash2,
} from "lucide-react";
import { parseISO } from "date-fns";
import { cloudSyncNow, useCloudStatus } from "@/hooks/useCloudSync";
import { useEmber, useHydrated } from "@/lib/store";
import { friendlyDay, todayKey } from "@/lib/dates";
import { reminderKey, useLang, useT } from "@/lib/i18n";
import { defaultRule, repeats, repeatShort, ruleForTask } from "@/lib/recurrence";
import {
  PRIORITY_META, REMINDER_OPTIONS, type Priority, type RepeatRule, type Task, type TaskRecurrence,
  type TaskStatus,
} from "@/lib/types";
import { RepeatPicker } from "@/components/tasks/RepeatPicker";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Select, Textarea } from "@/components/ui/inputs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { celebrate } from "@/components/ui/celebrate";
import { toast } from "@/components/ui/toast";

const COLUMNS: { status: TaskStatus }[] = [
  { status: "backlog" }, { status: "todo" }, { status: "doing" }, { status: "done" },
];

export default function TasksPage() {
  const hydrated = useHydrated();
  const tasks = useEmber((s) => s.tasks);
  const cloud = useCloudStatus();
  const [view, setView] = useState<"board" | "list">("board");
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const openCount = tasks.filter((t) => t.status !== "done").length;
  const t = useT();

  const sync = async () => {
    await cloudSyncNow();
    const { error } = useCloudStatus.getState();
    toast(error ? `${t("tasks.syncFailed")}: ${error}` : t("tasks.synced"), error ? "info" : undefined);
  };

  if (!hydrated)
    return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  return (
    <div>
      <PageHeader
        title={t("tasks.title")}
        sub={`${openCount} ${t("tasks.open")}`}
        actions={
          <>
            {cloud.signedIn && (
              <Button onClick={sync} disabled={cloud.syncing} aria-label={t("tasks.sync")}>
                {cloud.syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                <span className="hidden sm:inline">{t("tasks.sync")}</span>
              </Button>
            )}
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> {t("tasks.new")}
            </Button>
          </>
        }
      />

      {/* toolbar row — mirrors the Calendar page's layout rhythm */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-[11px] border border-white/[0.08] bg-white/[0.04] p-0.5">
          {(["board", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`relative flex h-8 items-center gap-1.5 rounded-[9px] px-3.5 text-[13px] font-medium transition-colors ${
                view === v ? "text-ink" : "text-faint hover:text-muted"
              }`}
            >
              {view === v && (
                <motion.span
                  layoutId="task-view"
                  className="absolute inset-0 rounded-[9px] bg-white/[0.09]"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {v === "board" ? <Columns3 size={14} /> : <List size={14} />}
                {t(`tasks.${v}`)}
              </span>
            </button>
          ))}
        </div>
        {view === "board" && (
          <span className="hidden text-xs text-faint sm:block">{t("tasks.dragHint")}</span>
        )}
      </div>

      {view === "board" ? <Board onEdit={setEditing} /> : <ListView onEdit={setEditing} />}

      <TaskEditor open={creating} onClose={() => setCreating(false)} />
      <TaskEditor open={!!editing} task={editing ?? undefined} onClose={() => setEditing(null)} />
    </div>
  );
}

/* ---------------- board ---------------- */

function Board({ onEdit }: { onEdit: (t: Task) => void }) {
  const tasks = useEmber((s) => s.tasks);
  const moveTask = useEmber((s) => s.moveTask);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: TaskStatus; beforeId?: string } | null>(null);
  const t = useT();

  const drop = (e?: React.DragEvent) => {
    if (dragId && over) {
      const moved = tasks.find((x) => x.id === dragId);
      moveTask(dragId, over.status, over.beforeId);
      // dropping into Done counts as completing it
      if (moved && over.status === "done" && moved.status !== "done") {
        celebrate(moved.title, e ? { x: e.clientX, y: e.clientY } : undefined);
      }
    }
    setDragId(null);
    setOver(null);
  };

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = tasks
          .filter((x) => x.status === col.status)
          .sort((a, b) => a.order - b.order);
        const isOver = over?.status === col.status;
        const colLabel = t(`tasks.col.${col.status}`);
        return (
          <section
            key={col.status}
            aria-label={colLabel}
            onDragOver={(e) => {
              e.preventDefault();
              if (!over || over.status !== col.status) setOver({ status: col.status });
            }}
            onDrop={drop}
            className={`flex w-[78vw] max-w-xs shrink-0 snap-center flex-col rounded-2xl border p-2 transition-colors duration-150 sm:w-auto sm:max-w-none ${
              isOver && dragId ? "border-accent/40 bg-white/[0.04]" : "border-white/[0.06] bg-white/[0.02]"
            }`}
          >
            <header className="flex items-baseline justify-between px-2 pb-2 pt-1.5">
              <h2 className="text-[13px] font-semibold">
                {colLabel} <span className="num ml-1 font-normal text-faint">{items.length}</span>
              </h2>
              <span className="text-[11px] text-faint">{t(`tasks.col.${col.status}Hint`)}</span>
            </header>
            <div className="flex min-h-24 flex-1 flex-col gap-2">
              <AnimatePresence initial={false}>
                {items.map((task) => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: dragId === task.id ? 0.35 : 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  >
                    {over?.status === col.status && over.beforeId === task.id && dragId && (
                      <div className="mb-2 h-0.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
                    )}
                    <TaskCard
                      task={task}
                      onClick={() => onEdit(task)}
                      onDragStart={() => setDragId(task.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      onDragOverCard={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOver({ status: col.status, beforeId: task.id });
                      }}
                      onDrop={drop}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              {items.length === 0 && (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/[0.08] py-6 text-xs text-faint">
                  {dragId ? t("tasks.dropHere") : t("tasks.empty")}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TaskCard({
  task, onClick, onDragStart, onDragEnd, onDragOverCard, onDrop,
}: {
  task: Task;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverCard: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const overdue = task.due && task.due < todayKey() && task.status !== "done";
  const doneSubs = task.subtasks.filter((s) => s.done).length;
  const rule = ruleForTask(task);
  const isRepeating = repeats(rule);
  const t = useT();
  const lang = useLang();
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOverCard}
      onDrop={onDrop}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="panel panel-hover group cursor-grab p-3.5 active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <p className={`flex-1 text-sm font-medium leading-snug ${task.status === "done" ? "text-muted line-through decoration-white/25" : ""}`}>
          {task.title}
        </p>
        <GripVertical size={14} className="mt-0.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      {(task.due || task.tags.length > 0 || task.subtasks.length > 0 || isRepeating) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-faint">
          <span className="flex items-center gap-1" style={{ color: PRIORITY_META[task.priority].color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: PRIORITY_META[task.priority].color }} />
            {t(`priority.${task.priority}`)}
          </span>
          {task.due && (
            <span className={`flex items-center gap-1 ${overdue ? "font-medium text-danger" : ""}`}>
              <AlarmClock size={11} /> {friendlyDay(task.due, lang)}{task.time ? ` · ${task.time}` : ""}
            </span>
          )}
          {isRepeating && (
            <span className="flex items-center gap-1 text-accent">
              <Repeat size={11} /> {repeatShort(rule, lang)}
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span className="num flex items-center gap-1">
              <Check size={11} /> {doneSubs}/{task.subtasks.length}
            </span>
          )}
          {task.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-white/[0.06] px-2 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- list ---------------- */

function ListView({ onEdit }: { onEdit: (task: Task) => void }) {
  const tasks = useEmber((s) => s.tasks);
  const updateTask = useEmber((s) => s.updateTask);
  const t = useT();
  const lang = useLang();
  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
        return (a.due ?? "9999").localeCompare(b.due ?? "9999");
      }),
    [tasks],
  );

  if (sorted.length === 0)
    return (
      <div className="panel">
        <EmptyState icon={<CheckSquare size={20} />} title={t("tasks.noneYet")} hint={t("tasks.noneYetHint")} />
      </div>
    );

  return (
    <div className="panel divide-y divide-white/[0.05] overflow-hidden">
      {sorted.map((task) => {
        const done = task.status === "done";
        const overdue = task.due && task.due < todayKey() && !done;
        return (
          <div
            key={task.id}
            className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
            onClick={() => onEdit(task)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateTask(task.id, { status: done ? "todo" : "done" });
                if (!done) {
                  // burst from the centre of the checkbox that was just ticked
                  const r = e.currentTarget.getBoundingClientRect();
                  celebrate(task.title, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                }
              }}
              aria-label={done ? t("tasks.reopen") : t("tasks.complete")}
              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-all ${
                done ? "border-success bg-success/20 text-success" : "border-white/25 text-transparent hover:border-success hover:text-success"
              }`}
            >
              <Check size={12} strokeWidth={3} />
            </button>
            <span className={`min-w-0 flex-1 truncate text-sm ${done ? "text-faint line-through" : ""}`}>{task.title}</span>
            {task.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="hidden items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-faint sm:flex">
                <Tag size={10} /> {tag}
              </span>
            ))}
            {task.due && (
              <span className={`num shrink-0 text-xs ${overdue ? "font-medium text-danger" : "text-faint"}`}>
                {friendlyDay(task.due, lang)}{task.time ? ` · ${task.time}` : ""}
              </span>
            )}
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: PRIORITY_META[task.priority].color }}
              title={t(`priority.${task.priority}`)}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- editor ---------------- */

function TaskEditor({ open, task, onClose }: { open: boolean; task?: Task; onClose: () => void }) {
  const addTask = useEmber((s) => s.addTask);
  const updateTask = useEmber((s) => s.updateTask);
  const deleteTask = useEmber((s) => s.deleteTask);
  const t = useT();
  const lang = useLang();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [due, setDue] = useState("");
  const [time, setTime] = useState("");
  const [tags, setTags] = useState("");
  const [repeat, setRepeat] = useState<RepeatRule>(defaultRule());
  const [reminder, setReminder] = useState<number | null>(null);
  const [subs, setSubs] = useState<Task["subtasks"]>([]);
  const [newSub, setNewSub] = useState("");
  const [inited, setInited] = useState<string | null>(null);

  // (re)initialize the form when a different task opens
  const initKey = open ? (task?.id ?? "new") : null;
  if (initKey !== inited) {
    setInited(initKey);
    if (initKey) {
      setTitle(task?.title ?? "");
      setNotes(task?.notes ?? "");
      setStatus(task?.status ?? "todo");
      setPriority(task?.priority ?? "medium");
      setDue(task?.due ?? "");
      setTime(task?.time ?? "");
      setTags(task?.tags.join(", ") ?? "");
      setRepeat(task ? ruleForTask(task) : defaultRule());
      setReminder(task?.reminder ?? null);
      setSubs(task?.subtasks ?? []);
      setNewSub("");
    }
  }

  const dueWeekday = due ? parseISO(due).getDay() : undefined;

  const save = () => {
    if (!title.trim()) return;
    const patch = {
      title: title.trim(),
      notes: notes.trim() || undefined,
      status,
      priority,
      due: due || undefined,
      time: due && time ? time : undefined, // a time only makes sense with a date
      tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
      repeat: repeat.freq === "none" ? undefined : repeat,
      recurrence: "none" as TaskRecurrence, // superseded by `repeat`
      reminder: due ? reminder : null, // reminders need a due date
      subtasks: subs,
    };
    const justCompleted = status === "done" && task?.status !== "done";
    if (task) {
      updateTask(task.id, patch);
      if (!justCompleted) toast(t("tasks.updated"));
    } else {
      addTask(patch);
      if (!justCompleted) toast(t("tasks.added"));
    }
    // the celebration replaces the plain toast when something gets finished
    if (justCompleted) celebrate(title.trim());
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={task ? t("tasks.edit") : t("tasks.new")}>
      <div className="flex flex-col gap-4">
        <label>
          <Label>{t("tasks.fTitle")}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("tasks.fTitlePh")} autoFocus />
        </label>
        <label>
          <Label>{t("tasks.fNotes")}</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t("tasks.fNotesPh")} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>{t("tasks.fStatus")}</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {COLUMNS.map((c) => (
                <option key={c.status} value={c.status}>{t(`tasks.col.${c.status}`)}</option>
              ))}
            </Select>
          </label>
          <label>
            <Label>{t("tasks.fPriority")}</Label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {Object.keys(PRIORITY_META).map((k) => (
                <option key={k} value={k}>{t(`priority.${k}`)}</option>
              ))}
            </Select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>{t("tasks.fDue")}</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label>
            <Label>{t("tasks.fTime")}</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={!due}
              aria-label={t("tasks.fTime")}
            />
          </label>
        </div>

        <label>
          <Label>{t("tasks.fReminder")}</Label>
          <Select
            value={reminder === null || reminder === undefined ? "none" : String(reminder)}
            onChange={(e) => setReminder(e.target.value === "none" ? null : Number(e.target.value))}
            disabled={!due}
          >
            <option value="none">{t("reminder.none")}</option>
            {REMINDER_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{t(reminderKey(r.value))}</option>
            ))}
          </Select>
          {!due && <p className="mt-1 text-xs text-faint">{t("tasks.reminderNeedsDue")}</p>}
        </label>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <RepeatPicker value={repeat} onChange={setRepeat} dueWeekday={dueWeekday} lang={lang} />
        </div>

        <label>
          <Label>{t("tasks.fTags")}</Label>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("tasks.fTagsPh")} />
        </label>
        {repeat.freq !== "none" && (
          <p className="-mt-1 flex items-center gap-1.5 text-xs text-faint">
            <Repeat size={12} className="shrink-0 text-accent" />
            {t("tasks.repeatHint")}
          </p>
        )}

        <div>
          <Label>{t("tasks.fSubtasks")}</Label>
          <div className="flex flex-col gap-1.5">
            {subs.map((s) => (
              <div key={s.id} className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] px-3 py-2">
                <button
                  onClick={() => setSubs(subs.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                  aria-label={t("tasks.complete")}
                  className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                    s.done ? "border-success bg-success/20 text-success" : "border-white/25 text-transparent"
                  }`}
                >
                  <Check size={10} strokeWidth={3} />
                </button>
                <span className={`flex-1 text-sm ${s.done ? "text-faint line-through" : ""}`}>{s.title}</span>
                <button
                  onClick={() => setSubs(subs.filter((x) => x.id !== s.id))}
                  aria-label={t("action.delete")}
                  className="text-faint transition-colors hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSub.trim()) {
                    setSubs([...subs, { id: crypto.randomUUID(), title: newSub.trim(), done: false }]);
                    setNewSub("");
                  }
                }}
                placeholder={t("tasks.fSubtaskPh")}
                className="h-9"
              />
            </div>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          {task ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                deleteTask(task.id);
                toast(t("tasks.deleted"), "info");
                onClose();
              }}
            >
              <Trash2 size={14} /> {t("action.delete")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>{t("action.cancel")}</Button>
            <Button variant="primary" onClick={save} disabled={!title.trim()}>
              {task ? t("tasks.save") : t("tasks.new")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
