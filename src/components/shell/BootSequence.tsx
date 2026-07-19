"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Flame } from "lucide-react";
import { useEmber } from "@/lib/store";
import { DURATION, EASE, THEME_PARTICLES } from "@/lib/motion";

/**
 * Cinematic cold-start: the ember ignites, its glow lifts the room out of
 * darkness, then the app is revealed behind it.
 *
 * Plays on a real page load only — first launch, refresh, sign-in. This lives
 * in Shell, which survives client-side navigation, so moving between pages
 * never replays it.
 *
 * Rules it must obey:
 *  • never delay interactivity — the app renders underneath the whole time
 *  • skippable with a tap/key for anyone who just wants in
 *  • fully skipped under prefers-reduced-motion
 *  • guaranteed to unmount, so it can never eat clicks
 */

const REVEAL_AT = 2150; // when the curtain starts lifting
const UNMOUNT_AT = 2950; // hard guarantee it is gone

export function BootSequence() {
  const reduced = useReducedMotion();
  const glass = useEmber((s) => s.settings.liquidGlass ?? true);
  const lite = useEmber((s) => s.settings.reducedEffects ?? false);
  const [gone, setGone] = useState(false);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setGone(true), UNMOUNT_AT);
    const skip = () => setSkipped(true);
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, []);

  // A reduced-motion user gets no curtain at all, and once it's done the
  // component renders nothing — no stray full-screen layer left behind.
  if (reduced || gone) return null;

  return (
    <motion.div
      aria-hidden
      // pointer-events-none: the app behind stays usable even mid-animation
      className="pointer-events-none fixed inset-0 z-(--z-tooltip) flex items-center justify-center overflow-hidden bg-bg-deep"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{
        duration: DURATION.slow,
        delay: skipped ? 0 : REVEAL_AT / 1000,
        ease: EASE.out,
      }}
    >
      {/* the glow that lifts the background out of black */}
      <motion.div
        className="absolute h-[38rem] w-[38rem] rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--primary) 45%, transparent), transparent 62%)",
          filter: "blur(60px)",
        }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 0.85, 0.5], scale: [0.5, 1.15, 1] }}
        transition={{ duration: 1.9, ease: EASE.entrance, times: [0, 0.55, 1] }}
      />

      {/* No panes here. Two attempts at "the interface assembling" both read as
          rectangles rather than as an interface: glass has nothing to refract
          against an opaque curtain, and softening them only made softer
          rectangles. The ember and the beam carry the sequence on their own. */}

      {/* the light that travels across the dark */}
      {glass && !lite && (
        <motion.span
          aria-hidden
          className="absolute inset-y-0 w-1/4"
          style={{
            background:
              "linear-gradient(100deg, transparent, color-mix(in oklch, var(--primary-bright) 40%, transparent), transparent)",
            filter: "blur(26px)",
          }}
          initial={{ x: "-160%", opacity: 0 }}
          animate={{ x: "520%", opacity: [0, 1, 0] }}
          transition={{ duration: 1.15, delay: 1.05, ease: EASE.out }}
        />
      )}

      {/* theme-coloured embers drifting up past the mark */}
      {Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{
              width: 3 + (i % 3),
              height: 3 + (i % 3),
              background: THEME_PARTICLES[i % THEME_PARTICLES.length],
            }}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
            animate={{
              opacity: [0, 0.9, 0],
              x: Math.cos(angle) * (90 + (i % 5) * 26),
              y: Math.sin(angle) * (90 + (i % 5) * 26) - 40,
              scale: [0.4, 1, 0.3],
            }}
            transition={{
              duration: 1.8,
              delay: 0.2 + (i % 7) * 0.06,
              ease: EASE.entrance,
            }}
          />
        );
      })}

      {/* the mark itself */}
      <motion.div
        className="relative flex flex-col items-center gap-3"
        initial={{ opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18, delay: 0.05 }}
      >
        <motion.span
          className="flex h-20 w-20 items-center justify-center rounded-[26px] bg-primary/12 text-primary-bright"
          style={{ boxShadow: "0 0 60px -6px var(--primary-glow)" }}
          animate={{ rotate: [-3, 3, -3], scale: [1, 1.04, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Flame size={38} strokeWidth={1.7} />
        </motion.span>
        <motion.span
          className="text-[15px] font-semibold tracking-[0.2em] text-ink/90"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.base, delay: 0.28, ease: EASE.out }}
        >
          EMBER
        </motion.span>
      </motion.div>
    </motion.div>
  );
}
