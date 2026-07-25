"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useEmber } from "@/lib/store";
import { THEME_PARTICLES } from "@/lib/motion";

/**
 * The room's ambience: a handful of theme-coloured embers drifting slowly
 * upward behind everything, forever.
 *
 * Three deliberate choices:
 *  • CSS keyframes, not Framer Motion — an infinite decorative loop belongs on
 *    the compositor, where it costs no main-thread frame budget and is immune
 *    to React re-renders.
 *  • Deterministic layout derived from the index, so server and client render
 *    identically and hydration never mismatches.
 *  • Unmounted while the tab/window is hidden, so a minimised desktop app
 *    isn't animating to nobody.
 *
 * Colours come from THEME_PARTICLES (CSS variables), so switching theme
 * re-tints the whole drift with no work here.
 */

/** Tuned for a desktop canvas; CSS drops the tail on phones. */
const COUNT = 30;

/** cheap deterministic pseudo-random in [0,1) — stable across SSR/CSR */
function rand(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const PARTICLES = Array.from({ length: COUNT }, (_, i) => {
  const a = rand(i + 1);
  const b = rand(i + 7.3);
  const c = rand(i + 19.1);
  const size = 2.5 + b * 4;
  return {
    id: i,
    left: a * 100,
    size,
    duration: 20 + c * 22,
    // negative delay: the drift is already mid-flight on first paint instead
    // of every particle launching from the floor at once
    delay: -(a * 40),
    drift: `${(b - 0.5) * 90}px`,
    opacity: 0.28 + c * 0.34,
    // the halo scales with the ember, which is what sells the colour
    glow: `${size * 2.4}px`,
    color: THEME_PARTICLES[i % THEME_PARTICLES.length],
  };
});

export function AmbientParticles() {
  const pathname = usePathname();
  const enabled = useEmber((s) => s.settings.ambientParticles ?? true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // The weather page brings its own full-screen atmosphere (rain, snow, fog);
  // stacking embers on top of that reads as noise rather than ambience.
  if (!enabled || !visible || pathname.startsWith("/weather")) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden"
    >
      {PARTICLES.map((p) => (
        <span
          key={p.id}
          className="ambient-particle"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              // `color` drives both the dot and its glow, so one theme
              // variable tints the whole ember
              color: p.color,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              "--p-drift": p.drift,
              "--p-opacity": p.opacity,
              "--p-glow": p.glow,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
