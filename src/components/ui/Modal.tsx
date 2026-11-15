"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { X } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useT } from "@/lib/i18n";
import { dialog, scrim, sheet } from "@/lib/motion";
import { playCue } from "@/lib/sound";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}

/** a sheet dragged this far (px) or flicked this fast (px/s) is dismissed */
const DISMISS_OFFSET = 110;
const DISMISS_VELOCITY = 650;

/**
 * Centered dialog on desktop and tablet, bottom sheet on a phone.
 *
 * The two move differently because they are different objects. The dialog
 * grows the last few percent into place on the surface spring, fading as it
 * goes. The sheet rides up from the edge fully opaque, and can be pulled back
 * down by its header: it follows the finger, and a pull past a third of the
 * way or a flick lets it go.
 *
 * Rendered through a portal onto <body>: page-transition transforms would
 * otherwise become the containing block for position:fixed and drag the
 * dialog off-screen.
 */
export function Modal({ open, onClose, title, children, wide }: Props) {
  const [mounted, setMounted] = useState(false);
  const trap = useFocusTrap(open);
  // below Tailwind's `sm`, where the layout below turns into a sheet
  const isSheet = useMediaQuery("(max-width: 639.98px)");
  const drag = useDragControls();
  const tr = useT();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    playCue("open");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      playCue("close");
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-root"
          // sized to the visible area (see ViewportFix) so the on-screen
          // keyboard never covers the bottom of the dialog
          className="fixed inset-x-0 top-[var(--vv-top,0px)] z-(--z-modal) flex h-[var(--vv-height,100dvh)] items-end justify-center sm:items-center"
        >
          <motion.div {...scrim} onClick={onClose} className="absolute inset-0 bg-black/55 backdrop-blur-[6px]" />
          <motion.div
            ref={trap}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            {...(isSheet ? sheet : dialog)}
            // the sheet is pulled by its header only: the body below scrolls
            drag={isSheet ? "y" : false}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.8 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) onClose();
            }}
            className={`glass-strong glass-edge relative flex max-h-[calc(var(--vv-height,100dvh)*0.92)] w-full flex-col overflow-hidden rounded-t-3xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.7)] sm:m-4 sm:max-h-[calc(var(--vv-height,100dvh)-3rem)] sm:rounded-3xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
          >
            {/* header stays put — only the form area scrolls, so the top can never drift off-screen */}
            <div
              onPointerDown={(e) => {
                // not from the close button: that is a tap, not the start of a pull
                if (isSheet && !(e.target as HTMLElement).closest("button")) drag.start(e);
              }}
              className={`relative flex shrink-0 items-center justify-between px-5 pb-4 pt-5 sm:px-6 sm:pt-6 ${isSheet ? "touch-none" : ""}`}
            >
              {/* the grabber: says "this pulls down" without a word */}
              <span aria-hidden className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-white/20 sm:hidden" />
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <button
                onClick={onClose}
                aria-label={tr("action.close")}
                className="rounded-lg p-1.5 text-muted hover:bg-white/[0.08] hover:text-ink"
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
