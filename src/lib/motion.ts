/**
 * Motion design tokens.
 *
 * One place for the curves and timings the whole app animates on, so a card,
 * a modal and a page transition all move with the same personality instead of
 * each component inventing its own spring.
 */

/** Easing curves. `out` is the house curve — fast start, long soft settle. */
export const EASE = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  entrance: [0.16, 1, 0.3, 1],
} as const;

export const DURATION = {
  instant: 0.12,
  fast: 0.18,
  base: 0.28,
  slow: 0.5,
  ambient: 1.1,
} as const;

/** Springs, by feel rather than by number. */
export const SPRING = {
  /** UI that should feel immediate: buttons, toggles, tabs */
  snappy: { type: "spring", stiffness: 420, damping: 34 },
  /** Panels and cards settling into place */
  soft: { type: "spring", stiffness: 260, damping: 30 },
  /** Large or heavy things — sheets, hero elements */
  gentle: { type: "spring", stiffness: 160, damping: 22 },
} as const;

/**
 * Particle / energy colours.
 *
 * These are CSS custom properties, not literals, so every burst automatically
 * inherits the active theme — sunset, tide, crimson or orchid. Nothing here
 * may ever be a hardcoded hex, otherwise the effects go on looking "orange"
 * in a blue theme.
 */
export const THEME_PARTICLES = [
  "var(--sunset-from)",
  "var(--sunset-to)",
  "var(--primary-bright)",
  "var(--accent)",
] as const;

/** Stagger helper for lists/grids that should cascade in. */
export const stagger = (each = 0.05, delay = 0) => ({
  animate: { transition: { staggerChildren: each, delayChildren: delay } },
});

/** The matching child variant for a staggered container. */
export const riseIn = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: SPRING.soft },
};
