"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { consumeNavOrigin } from "@/lib/navOrigin";
import { useEmber } from "@/lib/store";
import { DURATION, EASE } from "@/lib/motion";

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
  // lazy initialiser: read the recorded origin exactly once, at mount
  const [{ origin, back }] = useState(() => consumeNavOrigin());

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

  // the sheen is the one glass-specific flourish; it is transform + opacity
  // only, so it composites and costs nothing on the main thread
  const sheen = glass && !lite;

  return (
    <motion.div
      className="relative"
      // Viewport pixels are close enough: this element starts near the top-left
      // of the content area, and the scale is subtle enough that a few pixels
      // of drift is imperceptible.
      style={{ transformOrigin: origin ? `${origin.x}px ${origin.y}px` : "50% 25%" }}
      initial={
        back
          ? { opacity: 0, scale: 1.03, filter: glass ? "blur(7px)" : "blur(4px)" }
          : { opacity: 0, scale: 0.955, y: 6, filter: glass ? "blur(9px)" : "blur(5px)" }
      }
      animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
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
          <motion.span
            className="absolute inset-y-0 w-1/3"
            style={{
              background:
                "linear-gradient(105deg, transparent, color-mix(in oklch, var(--primary-bright) 22%, transparent), transparent)",
              filter: "blur(14px)",
            }}
            initial={{ x: "-140%", opacity: 0 }}
            animate={{ x: "420%", opacity: [0, 1, 0] }}
            transition={{ duration: 0.85, ease: EASE.out, delay: 0.05 }}
          />
        </span>
      )}
      {children}
    </motion.div>
  );
}
