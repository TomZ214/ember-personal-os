"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps keyboard focus inside a dialog while it is open, then hands it back.
 *
 * Without this, `aria-modal="true"` is a promise the code doesn't keep: Tab
 * walks straight out of the dialog and into the page behind the backdrop, so a
 * keyboard user ends up typing into a form they cannot see. It is the single
 * clearest tell that something is a web page rather than an app.
 *
 * Three jobs, in order:
 *   1. focus the first sensible thing when the dialog opens
 *   2. cycle Tab / Shift+Tab within it, wrapping at both ends
 *   3. return focus to whatever opened it, so the next Tab continues from
 *      where the user actually was
 *
 * The tabbable set is re-read on every Tab rather than cached, because dialog
 * content changes as the user types — a "Save" button that appears when a
 * field is filled must join the cycle immediately.
 */

const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function tabbable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    // offsetParent is null for anything display:none or inside a hidden
    // subtree — those are in the DOM but not reachable by Tab
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function useFocusTrap(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    // Prefer a text field — in a form dialog that is where the user is headed
    // anyway. Otherwise the first control; otherwise the dialog itself, so
    // focus is at least inside the trap rather than loose on the body.
    const items = tabbable(root);
    const field = items.find((el) => el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    // preventScroll rather than deferring a frame: the dialog mounts mid
    // transform, and the browser's default "scroll the focused thing into
    // view" would chase a position that is still moving. Doing it
    // synchronously also means focus is correct before the user's next
    // keystroke can land, which a deferred frame cannot guarantee.
    (field ?? items[0] ?? root).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = tabbable(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      // wrap at both ends, and pull focus back in if it somehow escaped
      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Only take focus back if it is still somewhere in the dialog. If the
      // user has already clicked elsewhere, yanking it would be worse than
      // leaving it — and the dialog is unmounting either way.
      const stillInside = root.contains(document.activeElement);
      if (stillInside && restoreTo.current?.isConnected) {
        restoreTo.current.focus();
      }
    };
  }, [active]);

  return ref;
}
