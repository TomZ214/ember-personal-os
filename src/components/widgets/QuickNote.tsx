"use client";

import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { useEmber } from "@/lib/store";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

export function QuickNoteWidget() {
  const folders = useEmber((s) => s.folders);
  const addNote = useEmber((s) => s.addNote);
  const updateNote = useEmber((s) => s.updateNote);
  const [text, setText] = useState("");
  const t = useT();

  const save = () => {
    if (!text.trim()) return;
    const folder = folders[0];
    if (!folder) return;
    const id = addNote(folder.id);
    const [first, ...rest] = text.trim().split("\n");
    updateNote(id, { title: first.slice(0, 60), body: rest.join("\n") || first });
    setText("");
    toast(t("w.savedToNotes"));
  };

  return (
    <div className="panel flex h-full flex-col p-5">
      <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-muted">
        <NotebookPen size={14} /> {t("w.quickNote")}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("w.quickNotePh")}
        className="min-h-24 flex-1 resize-none bg-transparent text-sm leading-relaxed placeholder:text-faint focus:outline-none"
        aria-label={t("w.quickNote")}
      />
      <div className="mt-3 flex justify-end border-t border-white/[0.06] pt-3">
        <Button size="sm" variant={text.trim() ? "primary" : "subtle"} disabled={!text.trim()} onClick={save}>
          {t("w.saveNote")}
        </Button>
      </div>
    </div>
  );
}
