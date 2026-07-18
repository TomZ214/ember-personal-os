"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, CalendarPlus, CheckSquare, ListPlus, Mail, NotebookPen, Search, Sparkles, User,
  CalendarDays,
} from "lucide-react";
import { useEmber } from "@/lib/store";
import { parseQuickEvent } from "@/lib/nlp";
import { friendlyDay, minutesToLabel } from "@/lib/dates";
import { useLang, useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { Kbd } from "@/components/ui/misc";
import { NAV } from "./nav";

interface Result {
  id: string;
  group: string;
  title: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const open = useEmber((s) => s.paletteOpen);
  const setOpen = useEmber((s) => s.setPaletteOpen);
  const { tasks, notes, events, contacts, mails, addEvent, addTask } = useEmber();
  const tr = useT();
  const lang = useLang();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useEmber.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  // reset the query whenever the palette (re)opens — adjust state during render
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setQ("");
      setSel(0);
    }
  }

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const query = q.trim().toLowerCase();
    const out: Result[] = [];
    const go = (href: string) => () => {
      router.push(href);
      setOpen(false);
    };

    // smart create — natural language event
    if (query.length > 2) {
      const parsed = parseQuickEvent(q);
      if (parsed) {
        out.push({
          id: "nl-event",
          group: tr("cmd.gCreate"),
          title: tr("cmd.newEvent").replace("{title}", parsed.title),
          hint: `${friendlyDay(parsed.date, lang)} · ${minutesToLabel(parsed.start)}–${minutesToLabel(parsed.end)}`,
          icon: <CalendarPlus size={16} />,
          run: () => {
            addEvent({ ...parsed, color: "sky", recurrence: "none" });
            toast(tr("cmd.eventScheduled").replace("{title}", parsed.title));
            setOpen(false);
          },
        });
      }
      const taskTitle = q.trim().replace(/^todo:?\s*/i, "");
      out.push({
        id: "nl-task",
        group: tr("cmd.gCreate"),
        title: tr("cmd.newTask").replace("{title}", taskTitle),
        icon: <ListPlus size={16} />,
        run: () => {
          addTask({ title: taskTitle });
          toast(tr("cmd.taskAdded"));
          setOpen(false);
        },
      });
    }

    const match = (s: string) => query === "" || s.toLowerCase().includes(query);

    for (const n of NAV) {
      const label = tr(`nav.${n.key}`);
      if (match(n.label) || match(label)) {
        const Icon = n.icon;
        out.push({
          id: `nav-${n.href}`,
          group: tr("cmd.gGoTo"),
          title: label,
          icon: <Icon size={16} />,
          run: go(n.href),
        });
      }
    }

    if (query.length > 0) {
      for (const t of tasks.filter((t) => match(t.title)).slice(0, 4))
        out.push({
          id: `task-${t.id}`, group: tr("cmd.gTasks"), title: t.title,
          hint: t.status, icon: <CheckSquare size={16} />, run: go("/tasks"),
        });
      for (const n of notes.filter((n) => match(n.title) || match(n.body)).slice(0, 4))
        out.push({
          id: `note-${n.id}`, group: tr("cmd.gNotes"), title: n.title,
          icon: <NotebookPen size={16} />, run: go(`/notes?id=${n.id}`),
        });
      for (const e of events.filter((e) => match(e.title)).slice(0, 4))
        out.push({
          id: `event-${e.id}`, group: tr("cmd.gCalendar"), title: e.title,
          hint: `${friendlyDay(e.date, lang)} · ${minutesToLabel(e.start)}`,
          icon: <CalendarDays size={16} />, run: go("/calendar"),
        });
      for (const c of contacts.filter((c) => match(c.name)).slice(0, 3))
        out.push({
          id: `contact-${c.id}`, group: tr("cmd.gContacts"), title: c.name,
          hint: c.group, icon: <User size={16} />, run: go("/contacts"),
        });
      for (const m of mails.filter((m) => match(m.subject) || match(m.from)).slice(0, 3))
        out.push({
          id: `mail-${m.id}`, group: tr("cmd.gMail"), title: m.subject,
          hint: m.from, icon: <Mail size={16} />, run: go(`/mail?id=${m.id}`),
        });
    }
    return out.slice(0, 14);
  }, [q, tasks, notes, events, contacts, mails, addEvent, addTask, router, setOpen, tr, lang]);

  // new query -> selection back to the top (render-time adjustment)
  const [prevQ, setPrevQ] = useState(q);
  if (prevQ !== q) {
    setPrevQ(q);
    setSel(0);
  }
  const selIdx = Math.min(sel, Math.max(0, results.length - 1));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel(Math.min(selIdx + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel(Math.max(selIdx - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[selIdx]?.run();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${sel}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  let lastGroup = "";

  return (
    <AnimatePresence>
      {open && (
        // keyed motion child: AnimatePresence requires its direct children to
        // be keyed to track presence and run exit animations reliably
        <motion.div
          key="palette-root"
          className="fixed inset-0 z-(--z-palette) flex items-start justify-center px-4 pt-[14dvh]"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-[8px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: "spring", stiffness: 480, damping: 36 }}
            className="glass-strong glass-edge relative w-full max-w-xl overflow-hidden rounded-2xl shadow-[0_32px_90px_-16px_rgba(0,0,0,0.8)]"
            role="dialog"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
              <Search size={17} className="text-faint" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={tr("cmd.searchPh")}
                className="h-13 w-full bg-transparent py-4 text-[15px] text-ink placeholder:text-faint focus:outline-none"
                aria-label={tr("cmd.searchPh")}
              />
              <Kbd>esc</Kbd>
            </div>

            <div ref={listRef} className="max-h-[46dvh] overflow-y-auto p-2">
              {results.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Sparkles size={20} className="text-faint" />
                  <p className="text-sm text-muted">{tr("cmd.nothingFound").replace("{q}", q)}</p>
                  <p className="text-xs text-faint">{tr("cmd.tryHint")}</p>
                </div>
              )}
              {results.map((r, i) => {
                const showGroup = r.group !== lastGroup;
                lastGroup = r.group;
                return (
                  <div key={r.id}>
                    {showGroup && (
                      <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-faint">
                        {r.group}
                      </p>
                    )}
                    <button
                      data-idx={i}
                      onClick={r.run}
                      onMouseMove={() => setSel(i)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                        selIdx === i ? "bg-white/[0.09] text-ink" : "text-muted"
                      }`}
                    >
                      <span className={selIdx === i ? "text-accent" : "text-faint"}>{r.icon}</span>
                      <span className="flex-1 truncate">{r.title}</span>
                      {r.hint && <span className="shrink-0 text-xs capitalize text-faint">{r.hint}</span>}
                      {selIdx === i && <ArrowRight size={14} className="shrink-0 text-faint" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
