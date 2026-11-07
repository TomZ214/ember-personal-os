"use client";

import { ViewTransition, useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { consumeNavOrigin } from "@/lib/navOrigin";
import { useEmber } from "@/lib/store";
import { DURATION, EASE } from "@/lib/motion";

/**
 * The first mount is the cold start: the boot curtain covers the page, so an
 * entrance animation there is never seen — it only competed with hydration
 * for the GPU. Module state, client only: on the server every request is a
 * first mount, and the server must never flip this.
 */
let mountedOnce = false;
// a pure read, so React may call it twice (Strict Mode); the flag is only
// set after the first mount has committed
const isFirstMount = () => typeof window === "undefined" || !mountedOnce;

/** Animating `filter: blur()` on a whole page of glass panels repaints all of
 *  it every frame; a desktop GPU shrugs that off, a tablet's does not. */
const canAffordBlur = () =>
  typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;

const hasViewTransitions = () =>
  typeof document !== "undefined" && typeof document.startViewTransition === "function";

/** the hand-off NavOriginTracker leaves on <html> for the transition CSS */
const HANDOFF_VARS = ["--nav-x", "--nav-y", "--nav-old-x", "--nav-old-y"];

/** a soft light that wipes across the arriving page once (CSS, compositor only) */
function Sheen() {
  return (
    // its own clipping container — deliberately NOT overflow-hidden on the
    // content wrapper, which would clip any sticky or fixed child inside
    <span aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden" style={{ borderRadius: 18 }}>
      <span
        className="page-sheen absolute inset-y-0 left-0 w-1/3"
        style={{
          background:
            "linear-gradient(105deg, transparent 6%, color-mix(in oklch, var(--primary-bright) 10%, transparent) 30%, color-mix(in oklch, var(--primary-bright) 22%, transparent) 50%, color-mix(in oklch, var(--primary-bright) 10%, transparent) 70%, transparent 94%)",
        }}
      />
    </span>
  );
}

/**
 * Per-route transition.
 *
 * Where the browser has View Transitions (Safari 18+, Chrome, Edge), a route
 * change is one: the leaving page tips back and falls away while the new one
 * swings up out of the point that was tapped — out of the dock icon, out of a
 * dashboard card — and a sheen crosses it as it lands. Going back plays the
 * reverse. Both pages are compositor snapshots for the duration, so this
 * costs no main thread and no repaints (keyframes: "Route transitions" in
 * globals.css). Only mounting/unmounting this template animates — a
 * useDeferredValue or other transition inside a page never does.
 *
 * Elsewhere the arriving page grows out of the tap point with Framer Motion,
 * as before.
 *
 * This re-mounts on every route change (that is what a template does), so the
 * origin is consumed once per mount and never leaks into the next navigation.
 */
export default function Template({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const glass = useEmber((s) => s.settings.liquidGlass ?? true);
  const lite = useEmber((s) => s.settings.reducedEffects ?? false);
  // lazy initialisers: read the recorded origin and the mount kind exactly once
  const [{ origin, back }] = useState(() => consumeNavOrigin());
  const [first] = useState(isFirstMount);
  const [blur] = useState(canAffordBlur);
  const [native] = useState(hasViewTransitions);

  useEffect(() => {
    mountedOnce = true;
    // once this transition has played, forget where it came from, so a later
    // keyboard or command-palette navigation starts from the neutral origin
    const t = setTimeout(() => {
      const root = document.documentElement;
      HANDOFF_VARS.forEach((v) => root.style.removeProperty(v));
      delete root.dataset.nav;
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  const sheen = glass && !lite && !reduced;
  let content: ReactNode;

  if (first || native) {
    // identical markup on the server and in the hydrating client; the View
    // Transition animates the snapshots, the page itself stays still
    content = (
      <div className="relative">
        {!first && sheen && <Sheen />}
        {children}
      </div>
    );
  } else if (reduced) {
    content = (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: DURATION.fast }}>
        {children}
      </motion.div>
    );
  } else {
    const frost = (px: number) => (blur ? `blur(${px}px)` : "blur(0px)");
    content = (
      <motion.div
        className="relative"
        // Viewport pixels are close enough: this element starts near the top-left
        // of the content area, and the scale is subtle enough that a few pixels
        // of drift is imperceptible.
        style={{ transformOrigin: origin ? `${origin.x}px ${origin.y}px` : "50% 25%" }}
        initial={
          back
            ? { opacity: 0, scale: 1.03, filter: frost(glass ? 7 : 4) }
            : { opacity: 0, scale: 0.955, y: 6, filter: frost(glass ? 9 : 5) }
        }
        // transitionEnd drops the filter entirely: even blur(0px) makes this
        // wrapper a backdrop root, and every .panel inside it would then blur
        // only the wrapper's own transparent paint instead of the page
        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
        transition={{ duration: glass ? DURATION.slow : DURATION.base, ease: EASE.out }}
      >
        {sheen && <Sheen />}
        {children}
      </motion.div>
    );
  }

  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {content}
    </ViewTransition>
  );
}
