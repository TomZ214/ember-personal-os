"use client";

import { create } from "zustand";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, TriangleAlert } from "lucide-react";
import { playCue, type Cue } from "@/lib/sound";

type Kind = "success" | "info" | "error";

interface Toast {
  id: number;
  text: string;
  kind: Kind;
}

/**
 * A failure should never look like a notice. Errors get their own colour, their
 * own icon, their own sound, and longer on screen — a message you missed is a
 * message that never happened.
 */
const DISMISS_MS: Record<Kind, number> = {
  success: 3200,
  info: 3200,
  error: 6000,
};

const useToasts = create<{
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  remove: (id: number) => void;
}>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
      DISMISS_MS[t.kind],
    );
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

const DEFAULT_CUE: Record<Kind, Cue> = {
  success: "success",
  info: "notify",
  error: "error",
};

export const toast = (text: string, kind: Kind = "success", cue?: Cue) => {
  // every toast is feedback, so this is the natural place to sound one.
  // `cue` lets a caller be specific (sent / synced) instead of falling back to
  // the kind's default blip.
  playCue(cue ?? DEFAULT_CUE[kind]);
  useToasts.getState().push({ text, kind });
};

const STYLES: Record<Kind, string> = {
  success: "bg-success/20 text-success",
  info: "bg-info/20 text-info",
  error: "bg-danger/20 text-[oklch(0.78_0.13_25)]",
};

export function Toaster() {
  const { toasts, remove } = useToasts();
  const hasError = toasts.some((t) => t.kind === "error");

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-(--z-toast) flex flex-col items-center gap-2 md:bottom-24"
      // Toasts were silent to screen readers entirely. "assertive" while an
      // error is up so a failure interrupts; "polite" otherwise so routine
      // confirmations wait their turn.
      role={hasError ? "alert" : "status"}
      aria-live={hasError ? "assertive" : "polite"}
      aria-atomic="false"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onClick={() => remove(t.id)}
            className="glass-strong pointer-events-auto flex max-w-[92vw] items-center gap-2.5 rounded-full py-2 pl-3 pr-4 text-left text-sm shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)]"
          >
            <span
              aria-hidden
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${STYLES[t.kind]}`}
            >
              {t.kind === "success" ? (
                <Check size={12} strokeWidth={3} />
              ) : t.kind === "error" ? (
                <TriangleAlert size={12} strokeWidth={2.6} />
              ) : (
                <Info size={12} strokeWidth={3} />
              )}
            </span>
            {t.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
