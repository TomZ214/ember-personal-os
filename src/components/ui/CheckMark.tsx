"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CHECK_PULSE, EXIT, TICK_DRAW } from "@/lib/motion";

interface Props {
  checked: boolean;
  /** what it fills with once checked; a habit or a goal brings its own colour */
  color?: string;
  shape?: "box" | "round";
  size?: number;
  className?: string;
}

/**
 * The tick, the same everywhere a thing gets done: tasks, habits, milestones.
 *
 * Checking it is three small events in one beat: the box fills with colour,
 * gives a single pulse, and the tick is drawn on stroke first, the way a hand
 * would make it. Nothing plays on mount: a list of things done yesterday must
 * not congratulate itself every time the page opens.
 *
 * Presentation only. The button, the label and the hit area belong to the
 * caller, because a tick is sometimes the control and sometimes one part of
 * a wider row that is.
 */
export function CheckMark({ checked, color = "var(--success)", shape = "box", size = 18, className = "" }: Props) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      data-check
      initial={false}
      animate={checked && !reduced ? CHECK_PULSE.animate : { scale: 1 }}
      transition={CHECK_PULSE.transition}
      className={`relative flex shrink-0 items-center justify-center border transition-[background-color,border-color,box-shadow] duration-200 ${
        shape === "round" ? "rounded-full" : "rounded-md"
      } ${checked ? "border-transparent" : "border-white/25"} ${className}`}
      // the fill is a colour, not a `background` shorthand, and the glow
      // lives in CSS: that leaves room for the solid styles to shade the
      // tick into a little sphere (globals.css, "Depth")
      data-checked={checked || undefined}
      style={
        {
          width: size,
          height: size,
          "--check-color": color,
          ...(checked ? { backgroundColor: color } : null),
        } as React.CSSProperties
      }
    >
      <AnimatePresence initial={false}>
        {checked && (
          <motion.svg
            key="tick"
            width={Math.round(size * 0.6)}
            height={Math.round(size * 0.6)}
            viewBox="0 0 10 10"
            fill="none"
            exit={{ opacity: 0, transition: EXIT }}
          >
            <motion.path
              d="M2 5.5L4 7.5L8 3"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={reduced ? { duration: 0 } : TICK_DRAW}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.span>
  );
}
