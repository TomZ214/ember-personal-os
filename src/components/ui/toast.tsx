"use client";

import { create } from "zustand";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Info } from "lucide-react";
import { playCue } from "@/lib/sound";

interface Toast {
  id: number;
  text: string;
  kind: "success" | "info";
}

const useToasts = create<{ toasts: Toast[]; push: (t: Omit<Toast, "id">) => void; remove: (id: number) => void }>(
  (set) => ({
    toasts: [],
    push: (t) => {
      const id = Date.now() + Math.random();
      set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 3200);
    },
    remove: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  }),
);

export const toast = (text: string, kind: "success" | "info" = "success") => {
  // every toast is a piece of feedback, so this is the natural place to sound one
  playCue(kind === "success" ? "success" : "notify");
  useToasts.getState().push({ text, kind });
};

export function Toaster() {
  const { toasts, remove } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-(--z-toast) flex flex-col items-center gap-2 md:bottom-24">
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
            className="glass-strong pointer-events-auto flex items-center gap-2.5 rounded-full py-2 pl-3 pr-4 text-sm shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)]"
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full ${
                t.kind === "success" ? "bg-success/20 text-success" : "bg-info/20 text-info"
              }`}
            >
              {t.kind === "success" ? <Check size={12} strokeWidth={3} /> : <Info size={12} strokeWidth={3} />}
            </span>
            {t.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
