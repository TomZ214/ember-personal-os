/**
 * A translucent tint of the page's "white".
 *
 * On the dark page that is white, as written. In the light appearance
 * globals.css re-points `--color-white` to ink, so the same tint reads as a
 * soft grey there instead of vanishing, white on white. Tailwind's `white/…`
 * utilities are built from that variable and follow by themselves; this is
 * for the few places that set a colour in a style or an SVG and cannot use a
 * class. `percent` is 0–100.
 */
export const tint = (percent: number) => `color-mix(in oklab, var(--color-white) ${percent}%, transparent)`;
