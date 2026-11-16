"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/** long enough for the tick to be drawn and seen, short enough not to feel held up */
const HOLD_MS = 380;

/**
 * Ticking something that then leaves the list (a task that is filtered or
 * sorted away once done) gives the tick nothing to play on: the row is gone
 * in the same frame. This holds the row for a beat instead. `tick(id)` marks
 * it as being ticked, so it can draw its checkmark where it stands, and
 * `commit(id)` runs when the beat is over.
 *
 * A set rather than one slot, so ticking a second row while the first is
 * still drawing works. `tick` returns false for a row already being held: a
 * double click must not fire the celebration twice or race its own exit.
 */
export function useTickHold(commit: (id: string) => void) {
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  // id -> the timer that commits it
  const pending = useRef(new Map<string, number>());
  const latest = useRef(commit);
  const reduced = useReducedMotion();

  useEffect(() => {
    latest.current = commit;
  });
  // Leaving (another page, the widget unmounting) before the beat is over
  // must not drop the tick: the celebration has already played, so the task
  // is done. Commit whatever is still waiting.
  useEffect(() => {
    const waiting = pending.current;
    return () => {
      waiting.forEach((timer, id) => {
        clearTimeout(timer);
        latest.current(id);
      });
      waiting.clear();
    };
  }, []);

  const tick = useCallback(
    (id: string) => {
      if (pending.current.has(id)) return false;
      setHeld((prev) => new Set(prev).add(id));
      const timer = window.setTimeout(
        () => {
          // release the row first, or this id would block its own checkbox
          // forever if the item ever came back
          pending.current.delete(id);
          latest.current(id);
          setHeld((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
        reduced ? 0 : HOLD_MS,
      );
      pending.current.set(id, timer);
      return true;
    },
    [reduced],
  );

  return { held, tick };
}
