import type { CoatId } from "@/lib/pet";

/**
 * The colours of each coat, as plain data: the settings swatches use them
 * without loading three.js; coats.ts paints the fur from them.
 */

export interface CoatPalette {
  base: string;
  /** stripes, patches */
  mark: string;
  /** second patch colour (calico) */
  mark2?: string;
  belly: string;
  /** chest bib and muzzle */
  bib: string;
  muzzle: string;
  /** colour of the four paws (white socks or not) */
  paws: [string, string, string, string];
  innerEar: string;
  nose: string;
  /** the line of the mouth and closed eyes */
  line: string;
  iris: string;
  whisker: string;
  /** the soft rim the fur catches in the light */
  sheen: string;
  /** tail rings: every other segment in `mark` */
  ringed: boolean;
  /** tail tip colour */
  tip: string;
}

export const PALETTES: Record<CoatId, CoatPalette> = {
  tabby: {
    base: "#a98c74",
    mark: "#5f4a3c",
    belly: "#e9dccd",
    bib: "#efe5d8",
    muzzle: "#f3ebe1",
    paws: ["#efe5d8", "#efe5d8", "#a98c74", "#a98c74"],
    innerEar: "#eab1ad",
    nose: "#df8f92",
    line: "#4a3a33",
    iris: "#a7c25a",
    whisker: "#f6f1ea",
    sheen: "#f1dcc5",
    ringed: true,
    tip: "#4f3e33",
  },
  ginger: {
    base: "#e59a55",
    mark: "#c06a2c",
    belly: "#f8dfc2",
    bib: "#fbe7cf",
    muzzle: "#fcefdf",
    paws: ["#fbe7cf", "#fbe7cf", "#fbe7cf", "#fbe7cf"],
    innerEar: "#f3b3a6",
    nose: "#ea8c7d",
    line: "#7a4426",
    iris: "#dca533",
    whisker: "#fff7ee",
    sheen: "#ffd9b0",
    ringed: true,
    tip: "#bf6a2d",
  },
  black: {
    base: "#2c2b31",
    mark: "#232227",
    belly: "#34333a",
    bib: "#36353c",
    muzzle: "#3a3940",
    paws: ["#2c2b31", "#2c2b31", "#2c2b31", "#2c2b31"],
    innerEar: "#5a4a52",
    nose: "#4b3c42",
    line: "#141317",
    iris: "#e3be3f",
    whisker: "#e9e7ef",
    sheen: "#8a90a8",
    ringed: false,
    tip: "#2c2b31",
  },
  white: {
    base: "#f5f1ea",
    mark: "#e9e3da",
    belly: "#fbf9f5",
    bib: "#fdfbf8",
    muzzle: "#fdfbf8",
    paws: ["#fbf9f5", "#fbf9f5", "#fbf9f5", "#fbf9f5"],
    innerEar: "#f4bcc0",
    nose: "#efa3ab",
    line: "#9a8a84",
    iris: "#79aee0",
    whisker: "#cfc8bf",
    sheen: "#ffffff",
    ringed: false,
    tip: "#f5f1ea",
  },
  grey: {
    base: "#8e98a6",
    mark: "#7d8795",
    belly: "#b8c0ca",
    bib: "#c4cbd4",
    muzzle: "#c9d0d8",
    paws: ["#8e98a6", "#8e98a6", "#8e98a6", "#8e98a6"],
    innerEar: "#d9a9b1",
    nose: "#a8848d",
    line: "#4c525d",
    iris: "#8cc46f",
    whisker: "#eef1f5",
    sheen: "#dbe4f0",
    ringed: false,
    tip: "#7d8795",
  },
  calico: {
    base: "#f6f1e9",
    mark: "#e3893f",
    mark2: "#35302f",
    belly: "#fbf8f3",
    bib: "#fcfaf6",
    muzzle: "#fcfaf6",
    paws: ["#fcfaf6", "#fcfaf6", "#fcfaf6", "#fcfaf6"],
    innerEar: "#f1b4b2",
    nose: "#eb9ea2",
    line: "#6b5148",
    iris: "#c7a63a",
    whisker: "#f4efe7",
    sheen: "#fff3e3",
    ringed: false,
    tip: "#35302f",
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
      return `radial-gradient(circle at 35% 30%, ${p.sheen}, ${p.base} 60%)`;
  }
}
