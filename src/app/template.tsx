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

/** the cascade is over by now: 9 steps of 34 ms plus the spring's settle */
const ENTRANCE_MS = 1000;

/**
 * Per-route transition, kept deliberately quiet and cheap:
 *
 *  • The screen crossfades. That is a root View Transition (lib/
 *    routeTransition.ts) — one viewport-sized snapshot of the old screen
 *    under the live new one — released here the moment the page mounts.
 *  • The new page's blocks settle into place one after another (`.page-enter`,
 *    transform-only CSS animations on the compositor).
 *
 * Why not animate the page itself as a View Transition: a named element is
 * captured in isolation, so every glass panel on it lost its frosting for
 * the length of the animation and popped back at the end — and the whole
 * page, below the fold too, had to be rasterised at 2x. Transforms are not
 * a backdrop root, so the panels stay frosted while they move.
 * Keyframes: "Route transitions" in globals.css.
 */
export default function Template({ children }: { children: ReactNode }) {
  const [entering, setEntering] = useState(() => !isFirstMount());

  // the new page is in the DOM: the waiting View Transition may crossfade now
  useLayoutEffect(() => {
    routeReady();
  }, []);

  useEffect(() => {
    mountedOnce = true;
    // The entrance belongs to the route change only. Once it has played, the
    // class goes, so content that mounts later on this page (a view switch,
    // a new card) appears in place instead of replaying the cascade. The
    // direction flag NavOriginTracker sets is spent by then as well.
    const t = setTimeout(() => {
      setEntering(false);
      delete document.documentElement.dataset.nav;
    }, ENTRANCE_MS);
    return () => clearTimeout(t);
  }, []);

  return <div className={entering ? "page-enter relative" : "relative"}>{children}</div>;
}
