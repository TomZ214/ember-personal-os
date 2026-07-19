"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { consumeNavOrigin } from "@/lib/navOrigin";
import { DURATION, EASE } from "@/lib/motion";

/**
 * Per-route entrance.
 *
 * Rather than a uniform fade, the arriving page expands from wherever the
 * navigation was triggered — tap a dashboard card and the destination grows
 * out of that card. Going back reverses it: the page settles down from
 * slightly larger, as if receding to where it came from.
 *
 * This re-mounts on every route change (that is what a template does), so the
 * origin is consumed once per mount and never leaks into the next navigation.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
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

  return (
    <motion.div
      // Viewport pixels are close enough: this element starts near the top-left
      // of the content area, and the scale is subtle enough that a few pixels
      // of drift is imperceptible.
      style={{ transformOrigin: origin ? `${origin.x}px ${origin.y}px` : "50% 25%" }}
      initial={
        back
          ? { opacity: 0, scale: 1.03, filter: "blur(4px)" }
          : { opacity: 0, scale: 0.955, y: 6, filter: "blur(5px)" }
      }
      animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: DURATION.base, ease: EASE.out }}
    >
      {children}
    </motion.div>
  );
}
