"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { routeReady } from "@/lib/routeTransition";

/**
 * The first mount is the cold start: the boot curtain covers the page, so an
 * entrance there is never seen. Module state, client only: on the server
 * every request is a first mount, and the server must never flip this.
 */
let mountedOnce = false;
// a pure read, so React may call it twice (Strict Mode); the flag is only
// set after the first mount has committed
const isFirstMount = () => typeof window === "undefined" || !mountedOnce;

/**
 * Per-route transition, kept deliberately quiet and cheap:
 *
 *  • The screen crossfades. That is a root View Transition (lib/
 *    routeTransition.ts) — one viewport-sized snapshot of the old screen
 *    under the live new one — released here the moment the page mounts.
 *  • The new content settles up into place (`.page-rise`, a transform-only
 *    CSS animation on the compositor).
 *
 * Why not animate the page itself as a View Transition: a named element is
 * captured in isolation, so every glass panel on it lost its frosting for
 * the length of the animation and popped back at the end — and the whole
 * page, below the fold too, had to be rasterised at 2x. Transforms are not
 * a backdrop root, so the panels stay frosted while they move.
 * Keyframes: "Route transitions" in globals.css.
 */
export default function Template({ children }: { children: ReactNode }) {
  const [first] = useState(isFirstMount);

  // the new page is in the DOM: the waiting View Transition may crossfade now
  useLayoutEffect(() => {
    routeReady();
  }, []);

  useEffect(() => {
    mountedOnce = true;
    // the direction flag NavOriginTracker sets is only good for this transition
    const t = setTimeout(() => {
      delete document.documentElement.dataset.nav;
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={first ? "relative" : "page-rise relative"}>{children}</div>
  );
}
