"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { THEME_PARTICLES } from "@/lib/motion";

/**
 * Cinematic cold-start: the ember ignites, its glow lifts the room out of
 * darkness, then the app is revealed behind it.
 *
 * Plays on a real page load only — first launch, refresh, sign-in. This lives
 * in Shell, which survives client-side navigation, so moving between pages
 * never replays it.
 *
 * Why pure CSS keyframes (see "Boot sequence" in globals.css): start-up is
 * exactly when the main thread is busiest — hydrating React, reading the
 * saved state, syncing, fetching. A JavaScript-driven animation got ~18 fps
 * there with freezes of a third of a second on an iPad. Transform/opacity
 * keyframes run on the compositor, are untouched by that work, and start
 * with the first paint instead of after hydration. No CSS blur either: a
 * blurred 600px layer re-rasterised every frame at 2x was the other cost.
 *
 * Rules it must obey:
 *  • never delay interactivity — the app renders underneath the whole time
 *  • skippable with a tap/key for anyone who just wants in
 *  • fully skipped under prefers-reduced-motion (CSS hides it before paint)
 *  • guaranteed to unmount, so it can never eat clicks
 */

/** when the curtain starts lifting, measured from navigation start */
export const BOOT_REVEAL_MS = 2150;
const UNMOUNT_AT = 2950; // hard guarantee it is gone

/** ms until the curtain is out of the way; 0 when it never plays */
export function bootRemaining(): number {
  if (typeof window === "undefined") return 0;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  return Math.max(0, BOOT_REVEAL_MS + 300 - performance.now());
}

const EMBERS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const dist = 90 + (i % 5) * 26;
  return {
    size: 3 + (i % 3),
    dx: Math.round(Math.cos(angle) * dist),
    dy: Math.round(Math.sin(angle) * dist - 40),
    delay: Math.round((0.2 + (i % 7) * 0.06) * 100) / 100,
    color: THEME_PARTICLES[i % THEME_PARTICLES.length],
  };
});

export function BootSequence() {
  const [gone, setGone] = useState(false);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    // counted from navigation start, like the CSS timeline, so a slow
    // hydration can't keep the layer around longer than it is visible
    const t = setTimeout(() => setGone(true), Math.max(0, UNMOUNT_AT - performance.now()));
    const skip = () => setSkipped(true);
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden
      // pointer-events-none: the app behind stays usable even mid-animation
      className="boot-curtain pointer-events-none fixed inset-0 z-(--z-tooltip) flex items-center justify-center overflow-hidden bg-bg-deep"
      data-skipped={skipped ? "" : undefined}
    >
      {/* the glow that lifts the background out of black: a soft gradient,
          not a blurred disc, so it never has to be re-rasterised */}
      <div
        className="boot-glow absolute h-[38rem] w-[38rem] rounded-full"
        style={{
          background:
            "radial-gradient(circle closest-side, color-mix(in oklch, var(--primary) 42%, transparent), color-mix(in oklch, var(--primary) 22%, transparent) 38%, color-mix(in oklch, var(--primary) 7%, transparent) 68%, transparent)",
        }}
      />

      {/* No panes here. Two attempts at "the interface assembling" both read as
          rectangles rather than as an interface: glass has nothing to refract
          against an opaque curtain, and softening them only made softer
          rectangles. The ember and the beam carry the sequence on their own. */}

      {/* the light that travels across the dark (hidden by CSS with glass off
          or reduced effects — those flags are on <html> before first paint) */}
      <span
        className="boot-beam absolute inset-y-0 left-0 w-1/3"
        style={{
          background:
            "linear-gradient(100deg, transparent 8%, color-mix(in oklch, var(--primary-bright) 14%, transparent) 32%, color-mix(in oklch, var(--primary-bright) 30%, transparent) 50%, color-mix(in oklch, var(--primary-bright) 14%, transparent) 68%, transparent 92%)",
        }}
      />

      {/* theme-coloured embers drifting up past the mark */}
      {EMBERS.map((e, i) => (
        <span
          key={i}
          className="boot-ember absolute rounded-full"
          style={
            {
              width: e.size,
              height: e.size,
              background: e.color,
              "--dx": `${e.dx}px`,
              "--dy": `${e.dy}px`,
              animationDelay: `${e.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}

      {/* the mark itself */}
      <div className="boot-mark relative flex flex-col items-center gap-3">
        <span
          className="boot-icon flex h-20 w-20 items-center justify-center rounded-[26px] bg-primary/12 text-primary-bright"
          style={{ boxShadow: "0 0 60px -6px var(--primary-glow)" }}
        >
          <Flame size={38} strokeWidth={1.7} />
        </span>
        <span className="boot-word text-[15px] font-semibold tracking-[0.2em] text-ink/90">EMBER</span>
      </div>
    </div>
  );
}
