"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlarmClock, Check, CheckSquare, Columns3, GripVertical, List, Loader2, Plus, RefreshCw, Tag, Trash2,
} from "lucide-react";
import { cloudSyncNow, useCloudStatus } from "@/hooks/useCloudSync";
import { useEmber, useHydrated } from "@/lib/store";
import { friendlyDay, todayKey } from "@/lib/dates";
import { PRIORITY_META, type Priority, type Task, type TaskStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Select, Textarea } from "@/components/ui/inputs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

const COLUMNS: { status: TaskStatus; label: string; hint: string }[] = [
  { status: "backlog", label: "Backlog", hint: "Someday, maybe" },
  { status: "todo", label: "To do", hint: "Committed" },
  { status: "doing", label: "In progress", hint: "Right now" },
  { status: "done", label: "Done", hint: "Shipped" },
];

export default function TasksPage() {
  const hydrated = useHydrated();
  const tasks = useEmber((s) => s.tasks);
  const cloud = useCloudStatus();
  const [view, setView] = useState<"board" | "list">("board");
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const openCount = tasks.filter((t) => t.status !== "done").length;

  const sync = async () => {
    await cloudSyncNow();
    const { error } = useCloudStatus.getState();
    toast(error ? `Sync failed: ${error}` : "Tasks synced", error ? "info" : undefined);
  };

  if (!hydrated)
    return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  return (
    <div>
      <PageHeader
        title="Tasks"
        sub={`${openCount} open`}
        actions={
          <>
            {cloud.signedIn && (
              <Button onClick={sync} disabled={cloud.syncing} aria-label="Sync tasks">
                {cloud.syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                <span className="hidden sm:inline">Sync</span>
              </Button>
            )}
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New task
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
              className={`relative flex h-8 items-center gap-1.5 rounded-[9px] px-3.5 text-[13px] font-medium capitalize transition-colors ${
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
                {v}
              </span>
            </button>
          ))}
        </div>
        {view === "board" && (
          <span className="hidden text-xs text-faint sm:block">Drag cards between columns</span>
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

  const drop = () => {
    if (dragId && over) moveTask(dragId, over.status, over.beforeId);
    setDragId(null);
    setOver(null);
  };

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = tasks
          .filter((t) => t.status === col.status)
          .sort((a, b) => a.order - b.order);
        const isOver = over?.status === col.status;
        return (
          <section
            key={col.status}
            aria-label={col.label}
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
                {col.label} <span className="num ml-1 font-normal text-faint">{items.length}</span>
              </h2>
              <span className="text-[11px] text-faint">{col.hint}</span>
            </header>
            <div className="flex min-h-24 flex-1 flex-col gap-2">
              <AnimatePresence initial={false}>
                {items.map((t) => (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: dragId === t.id ? 0.35 : 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  >
                    {over?.status === col.status && over.beforeId === t.id && dragId && (
                      <div className="mb-2 h-0.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
                    )}
                    <TaskCard
                      task={t}
                      onClick={() => onEdit(t)}
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      onDragOverCard={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOver({ status: col.status, beforeId: t.id });
                      }}
                      onDrop={drop}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              {items.length === 0 && (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/[0.08] py-6 text-xs text-faint">
                  {dragId ? "Drop here" : "Empty"}
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
      {(task.due || task.tags.length > 0 || task.subtasks.length > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-faint">
          <span className="flex items-center gap-1" style={{ color: PRIORITY_META[task.priority].color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: PRIORITY_META[task.priority].color }} />
            {PRIORITY_META[task.priority].label}
          </span>
          {task.due && (
            <span className={`flex items-center gap-1 ${overdue ? "font-medium text-danger" : ""}`}>
              <AlarmClock size={11} /> {friendlyDay(task.due)}
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

function ListView({ onEdit }: { onEdit: (t: Task) => void }) {
  const tasks = useEmber((s) => s.tasks);
  const updateTask = useEmber((s) => s.updateTask);
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
        <EmptyState icon={<CheckSquare size={20} />} title="No tasks yet" hint="Press ⌘K or the button above to add your first task." />
      </div>
    );

  return (
    <div className="panel divide-y divide-white/[0.05] overflow-hidden">
      {sorted.map((t) => {
        const done = t.status === "done";
        const overdue = t.due && t.due < todayKey() && !done;
        return (
          <div
            key={t.id}
            className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
            onClick={() => onEdit(t)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateTask(t.id, { status: done ? "todo" : "done" });
              }}
              aria-label={done ? "Reopen" : "Complete"}
              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-all ${
                done ? "border-success bg-success/20 text-success" : "border-white/25 text-transparent hover:border-success hover:text-success"
              }`}
            >
              <Check size={12} strokeWidth={3} />
            </button>
            <span className={`min-w-0 flex-1 truncate text-sm ${done ? "text-faint line-through" : ""}`}>{t.title}</span>
            {t.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="hidden items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-faint sm:flex">
                <Tag size={10} /> {tag}
              </span>
            ))}
            {t.due && (
              <span className={`num shrink-0 text-xs ${overdue ? "font-medium text-danger" : "text-faint"}`}>
                {friendlyDay(t.due)}
              </span>
            )}
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: PRIORITY_META[t.priority].color }}
              title={PRIORITY_META[t.priority].label}
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

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [due, setDue] = useState("");
  const [tags, setTags] = useState("");
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
      setTags(task?.tags.join(", ") ?? "");
      setSubs(task?.subtasks ?? []);
      setNewSub("");
    }
  }

  const save = () => {
    if (!title.trim()) return;
    const patch = {
      title: title.trim(),
      notes: notes.trim() || undefined,
      status,
      priority,
      due: due || undefined,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      subtasks: subs,
    };
    if (task) {
      updateTask(task.id, patch);
      toast("Task updated");
    } else {
      addTask(patch);
      toast("Task added");
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={task ? "Edit task" : "New task"}>
      <div className="flex flex-col gap-4">
        <label>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" autoFocus />
        </label>
        <label>
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional details…" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {COLUMNS.map((c) => (
                <option key={c.status} value={c.status}>{c.label}</option>
              ))}
            </Select>
          </label>
          <label>
            <Label>Priority</Label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {Object.entries(PRIORITY_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>Due date</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label>
            <Label>Tags</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="work, errands" />
          </label>
        </div>

        <div>
          <Label>Subtasks</Label>
          <div className="flex flex-col gap-1.5">
            {subs.map((s) => (
              <div key={s.id} className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] px-3 py-2">
                <button
                  onClick={() => setSubs(subs.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                  aria-label="Toggle subtask"
                  className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                    s.done ? "border-success bg-success/20 text-success" : "border-white/25 text-transparent"
                  }`}
                >
                  <Check size={10} strokeWidth={3} />
                </button>
                <span className={`flex-1 text-sm ${s.done ? "text-faint line-through" : ""}`}>{s.title}</span>
                <button
                  onClick={() => setSubs(subs.filter((x) => x.id !== s.id))}
                  aria-label="Remove subtask"
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
                placeholder="Add a step, press Enter"
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
                toast("Task deleted", "info");
                onClose();
              }}
            >
              <Trash2 size={14} /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={!title.trim()}>
              {task ? "Save changes" : "Add task"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
