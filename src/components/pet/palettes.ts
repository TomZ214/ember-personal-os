import type { CoatId } from "@/lib/pet";

/**
 * The colours of each coat, as plain data for the coat picker in Settings:
 * it shows a swatch without loading three.js or a texture. Picked from the
 * coats in public/pet/.
 */

interface Swatch {
  base: string;
  /** stripes, patches */
  mark: string;
  /** second patch colour (calico) */
  mark2?: string;
  /** the paler fur of the muzzle and chest */
  light: string;
}

const SWATCHES: Record<CoatId, Swatch> = {
  tabby: { base: "#a08670", mark: "#3d3129", light: "#ece2d3" },
  ginger: { base: "#d98f4e", mark: "#a65624", light: "#f7e6cd" },
  black: { base: "#211f24", mark: "#151417", light: "#2b292f" },
  white: { base: "#f2eee7", mark: "#e5dfd5", light: "#fbf9f5" },
  grey: { base: "#7f8792", mark: "#5c636d", light: "#a6adb6" },
  calico: { base: "#f4efe7", mark: "#d27b36", mark2: "#2b2624", light: "#fbf8f3" },
};

/** swatch for the coat picker: what the coat looks like, as a CSS background */
export function coatSwatch(id: CoatId): string {
  const p = SWATCHES[id];
  switch (id) {
    case "tabby":
    case "ginger":
      return `repeating-linear-gradient(115deg, ${p.base} 0 5px, ${p.mark} 5px 8px)`;
    case "calico":
      return `radial-gradient(circle at 28% 30%, ${p.mark} 0 26%, transparent 27%), radial-gradient(circle at 72% 68%, ${p.mark2} 0 24%, transparent 25%), ${p.base}`;
    default:
      return `radial-gradient(circle at 35% 30%, ${p.light}, ${p.base} 60%)`;
  }
}
