"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useEmber } from "@/lib/store";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useT } from "@/lib/i18n";
import { EASE } from "@/lib/motion";
import { playCue } from "@/lib/sound";
import { Kbd } from "@/components/ui/misc";

/**
 * Keyboard shortcuts.
 *
 * A two-key "go to" chord — press G, then a letter — which is how Gmail,
 * Linear and Superhuman all do it. Single letters are deliberately avoided for
 * navigation: they fire by accident constantly, and there is no way to tell a
 * stray keystroke from an intended one.
 *
 * Nothing fires while the user is typing. That check has to cover
 * contenteditable and any open dialog too, not just <input> — otherwise
 * writing the letter "g" in a note quietly navigates away and loses it.
 */

/** how long the G chord stays armed before it gives up */
const CHORD_MS = 1400;

const GOTO: Record<string, string> = {
  h: "/",
  t: "/tasks",
  c: "/calendar",
  n: "/notes",
  m: "/mail",
  b: "/habits", // "behaviours" — h is taken by home
  g: "/goals",
  f: "/finance",
  v: "/vault",
  w: "/weather",
  s: "/settings",
};

/** a dialog that is actually on screen, not one mid-exit */
function dialogOpen(): boolean {
  const els = document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]');
  return Array.from(els).some((el) =>
    // checkVisibility is the precise answer; the fallback covers older engines,
    // where a mounted dialog is at worst a brief false positive
    el.checkVisibility
      ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : true,
  );
}

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function Shortcuts() {
  const router = useRouter();
  const setPaletteOpen = useEmber((s) => s.setPaletteOpen);
  const [help, setHelp] = useState(false);
  const [armed, setArmed] = useState(false);
  const t = useT();

  useEffect(() => {
    let timer: number | undefined;

    const onKey = (e: KeyboardEvent) => {
      // let the browser and the OS keep their own combinations
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // A dialog is open: its own Escape/Tab handling owns the keyboard.
      // Presence in the DOM is not enough — a closing dialog stays mounted for
      // the length of its exit animation, and treating that as "open" leaves
      // shortcuts dead for a beat after every dialog closes. checkVisibility
      // with opacityProperty sees through exactly that case.
      if (dialogOpen()) {
        if (e.key === "Escape") setHelp(false);
        return;
      }
      if (isTyping()) return;

      const key = e.key.toLowerCase();

      if (armed) {
        const href = GOTO[key];
        setArmed(false);
        window.clearTimeout(timer);
        if (href) {
          e.preventDefault();
          playCue("navigate");
          router.push(href);
        }
        return;
      }

      if (key === "g") {
        setArmed(true);
        timer = window.setTimeout(() => setArmed(false), CHORD_MS);
        return;
      }
      // "?" is shift+/ on most layouts, but not all — match the character
      if (e.key === "?") {
        e.preventDefault();
        setHelp((v) => !v);
        playCue("open");
        return;
      }
      if (key === "n") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === "Escape") setHelp(false);
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [armed, router, setPaletteOpen]);

  return (
    <>
      <ChordHint armed={armed} label={t("keys.goHint")} />
      <HelpSheet open={help} onClose={() => setHelp(false)} />
    </>
  );
}

/** the small "G …" pill that confirms the chord is listening */
function ChordHint({ armed, label }: { armed: boolean; label: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {armed && (
        <motion.div
          key="chord"
          aria-hidden
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.16, ease: EASE.out }}
          className="glass-strong pointer-events-none fixed bottom-24 left-1/2 z-(--z-toast) -translate-x-1/2 rounded-full px-4 py-2 text-[13px] text-muted shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)]"
        >
          {label}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const trap = useFocusTrap(open);
  const t = useT();

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);
  if (!mounted) return null;

  const rows: [string, string][] = [
    ["⌘ K", t("keys.palette")],
    ["N", t("keys.new")],
    ["G H", t("nav.home")],
    ["G T", t("nav.tasks")],
    ["G C", t("nav.calendar")],
    ["G N", t("nav.notes")],
    ["G M", t("nav.mail")],
    ["G B", t("nav.habits")],
    ["G G", t("nav.goals")],
    ["G F", t("nav.finance")],
    ["G V", t("nav.vault")],
    ["G W", t("nav.weather")],
    ["G S", t("nav.settings")],
    ["?", t("keys.help")],
  ];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="keys-root"
          className="fixed inset-0 z-(--z-modal) flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/55 backdrop-blur-[6px]"
          />
          <motion.div
            ref={trap}
            role="dialog"
            aria-modal="true"
            aria-label={t("keys.title")}
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
            className="glass-strong glass-edge relative max-h-[80dvh] w-full max-w-sm overflow-y-auto rounded-3xl p-6 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.7)]"
          >
            <h2 className="mb-4 text-lg font-semibold tracking-tight">{t("keys.title")}</h2>
            <ul className="flex flex-col gap-1">
              {rows.map(([combo, label]) => (
                <li
                  key={combo}
                  className="flex items-center justify-between gap-4 rounded-lg px-1 py-1.5"
                >
                  <span className="text-[13px] text-muted">{label}</span>
                  <span className="flex shrink-0 gap-1">
                    {combo.split(" ").map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
