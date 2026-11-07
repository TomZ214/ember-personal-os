"use client";

import { useEffect, useState } from "react";
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

/**
 * Per-route entrance.
 *
 * Rather than a uniform fade, the arriving page expands from wherever the
 * navigation was triggered — tap a dashboard card and the destination grows
 * out of that card. Going back reverses it: the page settles down from
 * slightly larger, as if receding to where it came from.
 *
 * With Liquid Glass on it also resolves *through* glass: the page arrives
 * frosted and a sheen wipes across it once as it clears, so a navigation
 * reads as a pane sliding into place rather than a crossfade.
 *
 * This re-mounts on every route change (that is what a template does), so the
 * origin is consumed once per mount and never leaks into the next navigation.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const glass = useEmber((s) => s.settings.liquidGlass ?? true);
  const lite = useEmber((s) => s.settings.reducedEffects ?? false);
  // lazy initialisers: read the recorded origin and the mount kind exactly once
  const [{ origin, back }] = useState(() => consumeNavOrigin());
  const [first] = useState(isFirstMount);
  const [blur] = useState(canAffordBlur);
  useEffect(() => { mountedOnce = true; }, []);

  // identical markup on the server and in the hydrating client
  if (first) return <div className="relative">{children}</div>;

  if (reduced) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.fast }}
      >
        {children}
      </motion.div>
    );
  }

  // the sheen is the one glass-specific flourish; a CSS transform/opacity
  // animation of a soft gradient, so it composites and costs no main thread
  const sheen = glass && !lite;
  const frost = (px: number) => (blur ? `blur(${px}px)` : "blur(0px)");

  return (
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
      {sheen && (
        // Its own clipping container — deliberately NOT overflow-hidden on the
        // content wrapper, which would clip any sticky or fixed child inside
        // the page.
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ borderRadius: 18 }}
        >
          <span
            className="page-sheen absolute inset-y-0 left-0 w-1/3"
            style={{
              background:
                "linear-gradient(105deg, transparent 6%, color-mix(in oklch, var(--primary-bright) 10%, transparent) 30%, color-mix(in oklch, var(--primary-bright) 22%, transparent) 50%, color-mix(in oklch, var(--primary-bright) 10%, transparent) 70%, transparent 94%)",
            }}
          />
        </span>
      )}
      {children}
    </motion.div>
  );
}
