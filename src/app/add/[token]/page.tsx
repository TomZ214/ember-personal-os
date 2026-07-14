"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Flame, Loader2, Plus } from "lucide-react";
import { supabase } from "@/lib/cloud";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/inputs";

const SENDER_KEY = "ember-quickadd-name";

/**
 * Public quick-add page behind a share token — for family members.
 * Whoever has the link can drop a task into the owner's inbox and
 * nothing else: no data ever flows the other way.
 */
export default function QuickAddPage() {
  const { token } = useParams<{ token: string }>();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [sender, setSender] = useState("");
  const [phase, setPhase] = useState<"form" | "sending" | "done">("form");
  const [error, setError] = useState<string | null>(null);

  // remembered name — read after hydration so server and client HTML match
  useEffect(() => {
    const t = setTimeout(() => {
      const saved = localStorage.getItem(SENDER_KEY);
      if (saved) setSender(saved);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const send = async () => {
    const sb = supabase();
    if (!sb) {
      setError("Cloud-Sync ist auf diesem Server nicht eingerichtet.");
      return;
    }
    setPhase("sending");
    setError(null);
    localStorage.setItem(SENDER_KEY, sender.trim());
    const { error: err } = await sb.rpc("inbox_add_task", {
      share_token: token,
      task_title: title.trim(),
      task_notes: notes.trim() || null,
      sender_name: sender.trim() || null,
    });
    if (err) {
      setPhase("form");
      setError(
        err.message.includes("invalid token")
          ? "Dieser Link ist nicht mehr gültig. Bitte um einen neuen Link fragen."
          : `Senden fehlgeschlagen: ${err.message}`,
      );
      return;
    }
    setPhase("done");
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="glass-strong glass-edge relative w-full max-w-sm rounded-3xl p-6"
      >
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary/15 text-primary-bright shadow-[0_0_18px_-2px_oklch(0.60_0.185_27_/_0.5)]">
            <Flame size={16} strokeWidth={2.2} />
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-tight">Aufgabe schicken</p>
            <p className="text-xs text-muted">Landet direkt in Toms Aufgabenliste</p>
          </div>
        </div>

        {phase === "done" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <Check size={22} strokeWidth={2.5} />
            </span>
            <p className="text-sm font-medium">Aufgabe geschickt!</p>
            <p className="text-xs text-muted">Sie erscheint sofort in der Aufgabenliste.</p>
            <Button
              variant="ghost"
              onClick={() => {
                setTitle("");
                setNotes("");
                setPhase("form");
              }}
            >
              <Plus size={15} /> Noch eine schicken
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <label>
              <Label>Aufgabe</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z.B. Brot mitbringen"
                maxLength={300}
              />
            </label>
            <label>
              <Label>Notiz (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Details, falls nötig…"
              />
            </label>
            <label>
              <Label>Dein Name</Label>
              <Input
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                placeholder="z.B. Mama"
                maxLength={80}
              />
            </label>
            {error && <p className="text-[13px] text-danger">{error}</p>}
            <Button
              variant="primary"
              onClick={send}
              disabled={!title.trim() || phase === "sending"}
              className="w-full justify-center"
            >
              {phase === "sending" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Aufgabe schicken
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
