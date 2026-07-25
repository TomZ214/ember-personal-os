"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * The iOS switch.
 *
 * Three details separate this from a styled checkbox, and all three are what
 * make the control feel physical:
 *
 *  1. The knob *stretches* while held. Press and hold an iOS toggle and the
 *     pill elongates toward the direction it would travel; release and it
 *     springs back to a circle. Nothing else in the interface does this, and
 *     it is the single most recognisable part of the control.
 *  2. The travel is a spring, not a duration. The knob overshoots very
 *     slightly and settles.
 *  3. The track fills from the knob outward rather than cross-fading, so the
 *     colour arrives with the movement instead of underneath it.
 *
 * A real <input type="checkbox"> stays underneath, so this is still a
 * checkbox to a screen reader, still reachable by Tab, still toggled by
 * Space, and still labelable by wrapping it in a <label>.
 */

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  /** visually hidden label — set when a wrapping <label> already names it */
  hideLabel?: boolean;
  disabled?: boolean;
}

const TRACK_W = 46;
const TRACK_H = 28;
const KNOB = 24;
const PAD = 2;

export function Switch({ checked, onChange, label, hideLabel = true, disabled }: Props) {
  const reduced = useReducedMotion();
  const [held, setHeld] = useState(false);

  // the stretch: wider knob, and when it is on the right it has to grow
  // leftward, so the x offset compensates for the extra width
  const grow = held && !disabled && !reduced ? 6 : 0;
  const x = checked ? TRACK_W - KNOB - PAD - grow : PAD;

  return (
    <span
      className="relative inline-flex shrink-0 items-center"
      style={{ width: TRACK_W, height: TRACK_H }}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
        onBlur={() => setHeld(false)}
        aria-label={hideLabel ? label : undefined}
        // the real control, stretched over the whole track: it takes every
        // click and every keystroke, so none of the visual layers below need
        // to reimplement any of it
        className="absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />

      {/* track */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full"
        initial={false}
        animate={{
          backgroundColor: checked ? "var(--accent)" : "rgba(255,255,255,0.13)",
        }}
        transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        style={{ opacity: disabled ? 0.4 : 1 }}
      />
      {/* a hairline that keeps the off state visible on a light surface */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}
      />

      {/* knob */}
      <motion.span
        aria-hidden
        className="absolute rounded-full bg-white"
        style={{
          top: PAD,
          height: KNOB,
          // width lives in style, not only in `animate`. A value that exists
          // solely as an animation target is absent until the first frame
          // runs, which paints a zero-width knob — an invisible control for
          // however long that takes, and forever if animation is unavailable.
          width: KNOB,
          boxShadow: "0 1px 3px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(0,0,0,0.06)",
          opacity: disabled ? 0.5 : 1,
        }}
        // same reason: start from the resting state rather than from nothing
        initial={false}
        animate={{ x, width: KNOB + grow }}
        transition={
          reduced
            ? { duration: 0 }
            : { type: "spring", stiffness: 520, damping: 32, mass: 0.6 }
        }
      />
    </span>
  );
}
