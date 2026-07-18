"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}

/**
 * Centered dialog on desktop, bottom sheet on mobile.
 * Rendered through a portal onto <body>: page-transition transforms would
 * otherwise become the containing block for position:fixed and drag the
 * dialog off-screen.
 */
export function Modal({ open, onClose, title, children, wide }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-root"
          className="fixed inset-0 z-(--z-modal) flex items-end justify-center sm:items-center"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/55 backdrop-blur-[6px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 48, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className={`glass-strong glass-edge relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.7)] sm:m-4 sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
          >
            {/* header stays put — only the form area scrolls, so the top can never drift off-screen */}
            <div className="flex shrink-0 items-center justify-between px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/[0.08] hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
