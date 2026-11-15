"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { SPRING, type SpringName } from "@/lib/motion";

const whole = (n: number) => String(Math.round(n));

/** decimal places a number is written with, at most two */
function places(n: number): number {
  const text = String(n);
  if (text.includes("e")) return 2;
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : Math.min(2, text.length - dot - 1);
}

interface Props {
  value: number;
  /** how the number is written; called for every frame of a change */
  format?: (n: number) => string;
  /**
   * Count up from here when the number first appears. Leave it out and the
   * number is simply there on mount and only moves when it changes — the
   * right default: a balance that spins up from zero on every visit is a slot
   * machine. Set it where a ring or bar fills alongside (the score, calories).
   */
  from?: number;
  /** which spring carries it; pair `fill` with a ring that uses the same */
  spring?: SpringName;
  className?: string;
}

/**
 * A number that travels to its new value instead of being replaced by it.
 *
 * The text is written straight to the DOM by the animation; React renders
 * the element once and never re-renders per frame. The children React knows
 * about stay the first text for the life of the element, so a parent
 * re-render cannot stamp the final value over a number still in flight.
 */
export function AnimatedNumber({ value, format = whole, from, spring = "smooth", className }: Props) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(from ?? value);
  const write = useRef(format);
  const reduced = useReducedMotion();
  const [first] = useState(() => format(from ?? value));

  const running = useRef(false);

  // The latest formatter, without restarting a number in flight when a
  // parent passes a fresh closure. A number at rest is rewritten with it, so
  // a change of language or currency shows without the value changing.
  useEffect(() => {
    write.current = format;
    const node = el.current;
    if (!node || running.current) return;
    const text = format(shown.current);
    if (node.textContent !== text) node.textContent = text;
  });

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (reduced || shown.current === value || !Number.isFinite(value) || !Number.isFinite(shown.current)) {
      shown.current = value;
      node.textContent = write.current(value);
      return;
    }
    running.current = true;
    // In flight the number keeps the precision of where it is going: on the
    // way to 1 850 it reads 1 423, never 1 423.57. Formatters that show cents
    // only when there are some would otherwise flicker them on and off.
    const digits = places(value);
    const controls = animate(shown.current, value, {
      ...SPRING[spring],
      onUpdate: (v) => {
        shown.current = v;
        node.textContent = write.current(Number(v.toFixed(digits)));
      },
      onComplete: () => {
        running.current = false;
        shown.current = value;
        node.textContent = write.current(value);
      },
    });
    return () => {
      running.current = false;
      controls.stop();
    };
  }, [value, reduced, spring]);

  return (
    <span ref={el} className={className}>
      {first}
    </span>
  );
}
