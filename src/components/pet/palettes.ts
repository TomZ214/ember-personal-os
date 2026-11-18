import type { CoatId } from "@/lib/pet";

/**
 * The colours of each coat, as plain data: the coat picker uses them without
 * loading three.js; the fur shader paints the cat from them. Taken from real
 * cats: a brown mackerel tabby, a ginger tabby, a black cat with gold eyes,
 * a white cat with blue eyes, a blue-grey with copper eyes, a calico.
 */

export interface CoatPalette {
  base: string;
  /** stripes, patches */
  mark: string;
  /** second patch colour (calico) */
  mark2?: string;
  /** belly, chest and the insides of the legs */
  belly: string;
  /** muzzle, chin, round the eyes */
  muzzle: string;
  /** the dark lines of the face and the rims of the eyes */
  line: string;
  nose: string;
  innerEar: string;
  /** iris: the outer colour and the paler colour round the pupil */
  iris: string;
  irisIn: string;
  whisker: string;
}

export const PALETTES: Record<CoatId, CoatPalette> = {
  tabby: {
    base: "#a08670",
    mark: "#3d3129",
    belly: "#ddcdb8",
    muzzle: "#ece2d3",
    line: "#2b221d",
    nose: "#c47c74",
    innerEar: "#d9a59c",
    iris: "#8e9b3f",
    irisIn: "#cdb85a",
    whisker: "#f4efe6",
  },
  ginger: {
    base: "#d98f4e",
    mark: "#a65624",
    belly: "#f2d6b2",
    muzzle: "#f7e6cd",
    line: "#6a3a1f",
    nose: "#d77f6c",
    innerEar: "#e8ab98",
    iris: "#c3862b",
    irisIn: "#e6bb4d",
    whisker: "#fff8ee",
  },
  black: {
    base: "#211f24",
    mark: "#151417",
    belly: "#28262b",
    muzzle: "#2b292f",
    line: "#0a090b",
    nose: "#2f282b",
    innerEar: "#4b3d43",
    iris: "#c69826",
    irisIn: "#e8c64c",
    whisker: "#ece9ef",
  },
  white: {
    base: "#f2eee7",
    mark: "#e5dfd5",
    belly: "#f8f5f0",
    muzzle: "#fbf9f5",
    line: "#b0958c",
    nose: "#e6a0a4",
    innerEar: "#efb6b7",
    iris: "#5b92c8",
    irisIn: "#a8cbe9",
    whisker: "#d6d0c8",
  },
  grey: {
    base: "#7f8792",
    mark: "#5c636d",
    belly: "#9aa1ab",
    muzzle: "#a6adb6",
    line: "#383c42",
    nose: "#8a7178",
    innerEar: "#c49aa1",
    iris: "#c58a2b",
    irisIn: "#e5b348",
    whisker: "#eef1f4",
  },
  calico: {
    base: "#f4efe7",
    mark: "#d27b36",
    mark2: "#2b2624",
    belly: "#f8f5ef",
    muzzle: "#fbf8f3",
    line: "#7a5a4e",
    nose: "#e39d9c",
    innerEar: "#eeb2ae",
    iris: "#b68a2e",
    irisIn: "#dcb851",
    whisker: "#f5f0e8",
  },
};

/** swatch for the coat picker: what the coat looks like, as a CSS background */
export function coatSwatch(id: CoatId): string {
  const p = PALETTES[id];
  switch (id) {
    case "tabby":
    case "ginger":
      return `repeating-linear-gradient(115deg, ${p.base} 0 5px, ${p.mark} 5px 8px)`;
    case "calico":
      return `radial-gradient(circle at 28% 30%, ${p.mark} 0 26%, transparent 27%), radial-gradient(circle at 72% 68%, ${p.mark2} 0 24%, transparent 25%), ${p.base}`;
    default:
      return `radial-gradient(circle at 35% 30%, ${p.muzzle}, ${p.base} 60%)`;
  }
}
