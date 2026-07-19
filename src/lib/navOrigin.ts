"use client";

/**
 * Remembers where a navigation came from, so the arriving page can grow out of
 * that exact point instead of appearing from nowhere.
 *
 * Why not a real shared-element morph: `layoutId` needs the source and the
 * destination mounted simultaneously, and the Next App Router unmounts the
 * previous page on navigation. Keeping it alive means freezing router state —
 * fragile, and it breaks scroll restoration and focus. Recording the click
 * point gives the same "it came from there" read for none of that risk.
 *
 * Held in sessionStorage rather than a module variable: the tracker lives in
 * the layout and the reader in the route template, which are separate chunks,
 * and this way the hand-off can't depend on them sharing a module instance.
 */

const KEY = "ember-nav-origin";

type Handoff = { x: number; y: number; back: boolean };

function write(value: Handoff | null) {
  try {
    if (value) sessionStorage.setItem(KEY, JSON.stringify(value));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode — transitions just fall back to the neutral origin */
  }
}

/** Called on pointerdown over an internal link, before the route changes. */
export function recordNavOrigin(x: number, y: number) {
  write({ x, y, back: false });
}

/** Browser back/forward: the page should recede rather than grow. */
export function recordBackNav() {
  write({ x: 0, y: 0, back: true });
}

/**
 * Read and clear. Consumed once per route mount, so a page opened directly or
 * reached by keyboard falls back to a neutral origin.
 */
export function consumeNavOrigin(): { origin: { x: number; y: number } | null; back: boolean } {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { origin: null, back: false };
    write(null);
    const v = JSON.parse(raw) as Handoff;
    return { origin: v.back ? null : { x: v.x, y: v.y }, back: v.back };
  } catch {
    return { origin: null, back: false };
  }
}
