"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  ChevronLeft, Eye, FolderPlus, NotebookPen, Pencil, Pin, Plus, Search, Trash2,
} from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { renderMarkdown } from "@/lib/markdown";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/inputs";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

export default function NotesPage() {
  return (
    <Suspense>
      <Notes />
    </Suspense>
  );
}

function Notes() {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const { notes, folders, addNote, updateNote, deleteNote, addFolder } = useEmber();
  const [folderId, setFolderId] = useState<string | "all">("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(params.get("id"));
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [mobilePane, setMobilePane] = useState<"list" | "editor">(params.get("id") ? "editor" : "list");

  const active = notes.find((n) => n.id === activeId) ?? null;

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return notes
      .filter((n) => (folderId === "all" || n.folderId === folderId))
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, folderId, query]);

  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  const openNote = (id: string) => {
    setActiveId(id);
    setMode("preview");
    setMobilePane("editor");
  };

  const createNote = () => {
    const fid = folderId === "all" ? folders[0]?.id : folderId;
    if (!fid) return;
    const id = addNote(fid);
    setActiveId(id);
    setMode("edit");
    setMobilePane("editor");
  };

  return (
    <div className="flex h-[calc(100dvh-11.5rem)] min-h-[30rem] gap-4 md:h-[calc(100dvh-13rem)]">
      {/* list pane */}
      <div className={`w-full flex-col md:flex md:w-80 md:shrink-0 ${mobilePane === "list" ? "flex" : "hidden"}`}>
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes…" className="h-9 pl-9" aria-label="Search notes" />
          </div>
          <Button size="sm" variant="primary" onClick={createNote} aria-label="New note">
            <Plus size={15} />
          </Button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <FolderChip label="All" active={folderId === "all"} onClick={() => setFolderId("all")} />
          {folders.map((f) => (
            <FolderChip key={f.id} label={f.name} active={folderId === f.id} onClick={() => setFolderId(f.id)} />
          ))}
          <button
            onClick={() => {
              const name = prompt("Folder name");
              if (name?.trim()) addFolder(name.trim());
            }}
            aria-label="New folder"
            className="flex h-7 w-7 items-center justify-center rounded-full text-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <FolderPlus size={14} />
          </button>
        </div>

        <div className="panel flex-1 divide-y divide-white/[0.05] overflow-y-auto">
          {filtered.length === 0 && (
            <EmptyState icon={<NotebookPen size={20} />} title="No notes here" hint="Create one — first line becomes the title." />
          )}
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => openNote(n.id)}
              className={`block w-full px-4 py-3 text-left transition-colors ${
                activeId === n.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-2">
                {n.pinned && <Pin size={12} className="shrink-0 rotate-45 text-accent" />}
                <p className="truncate text-sm font-medium">{n.title || "Untitled"}</p>
              </div>
              <p className="mt-1 truncate text-xs text-faint">
                {n.body.replace(/[#*`>\-]/g, "").trim().slice(0, 80) || "Empty note"}
              </p>
              <p className="mt-1 text-[11px] text-faint">
                {formatDistanceToNow(parseISO(n.updatedAt), { addSuffix: true })}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* editor pane */}
      <div className={`min-w-0 flex-1 flex-col md:flex ${mobilePane === "editor" ? "flex" : "hidden"}`}>
        {!active ? (
          <div className="panel flex flex-1 items-center justify-center">
            <EmptyState icon={<NotebookPen size={20} />} title="Select a note" hint="Or create a new one — markdown supported." />
          </div>
        ) : (
          <div className="panel flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
              <button onClick={() => setMobilePane("list")} className="mr-1 text-muted md:hidden" aria-label="Back to list">
                <ChevronLeft size={18} />
              </button>
              <input
                value={active.title}
                onChange={(e) => updateNote(active.id, { title: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold tracking-tight focus:outline-none"
                placeholder="Untitled"
                aria-label="Note title"
              />
              <button
                onClick={() => updateNote(active.id, { pinned: !active.pinned })}
                aria-label={active.pinned ? "Unpin" : "Pin"}
                aria-pressed={active.pinned}
                className={`rounded-lg p-1.5 transition-colors ${active.pinned ? "text-accent" : "text-faint hover:text-ink"}`}
              >
                <Pin size={15} className={active.pinned ? "rotate-45" : ""} />
              </button>
              <button
                onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
                aria-label={mode === "edit" ? "Preview" : "Edit"}
                className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
              >
                {mode === "edit" ? <Eye size={13} /> : <Pencil size={13} />}
                {mode === "edit" ? "Preview" : "Edit"}
              </button>
              <button
                onClick={() => {
                  deleteNote(active.id);
                  setActiveId(null);
                  setMobilePane("list");
                  toast("Note deleted", "info");
                }}
                aria-label="Delete note"
                className="rounded-lg p-1.5 text-faint transition-colors hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {mode === "edit" ? (
                <motion.textarea
                  key="edit"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  value={active.body}
                  onChange={(e) => updateNote(active.id, { body: e.target.value })}
                  placeholder={"Write in markdown…\n\n# Heading\n- list item\n**bold** and *italic*\n```\ncode\n```"}
                  className="flex-1 resize-none bg-transparent p-5 font-mono text-[13px] leading-relaxed placeholder:text-faint focus:outline-none"
                  aria-label="Note body"
                  autoFocus
                />
              ) : (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="flex-1 overflow-y-auto p-5"
                  onDoubleClick={() => setMode("edit")}
                >
                  {active.body.trim() ? (
                    <div className="prose-ember text-[15px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(active.body) }} />
                  ) : (
                    <p className="text-sm text-faint">Empty note — double-click or hit Edit to start writing.</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function FolderChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-accent/15 text-accent" : "bg-white/[0.05] text-muted hover:bg-white/[0.08] hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
