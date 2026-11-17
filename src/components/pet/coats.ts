import * as THREE from "three";
import type { CoatId } from "@/lib/pet";
import { PALETTES } from "./palettes";

/**
 * Coats: the fur patterns painted onto the body and head at run time (a few
 * small canvases, drawn once per coat), from the colours in palettes.ts.
 * Nothing is downloaded.
 */

/* ---- painted fur ------------------------------------------------------- */

/** a seeded random, so a coat looks the same every time it is drawn */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

/** soft-edged shapes: a blur halo in the shape's own colour */
function soft(ctx: CanvasRenderingContext2D, color: string, blur: number) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** fine short hairs, lighter and darker, so the colour is not flat plastic */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number, dark = false) {
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  for (let i = 0; i < (w * h) / 22; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const up = rand() < 0.5;
    ctx.strokeStyle = up ? `rgba(255,255,255,${dark ? 0.05 : 0.07})` : `rgba(0,0,0,${dark ? 0.08 : 0.045})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 2, y + 2 + rand() * 3);
    ctx.stroke();
  }
}

/** draw `fn` at x and at x ± width, so shapes wrap across the texture's seam */
function wrapX(w: number, fn: (dx: number) => void) {
  fn(0);
  fn(-w);
  fn(w);
}

function finish(c: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * The body is a sphere turned so its poles lie along the spine: the
 * texture's rows run from the chest (top) to the rump (bottom), and its
 * columns go round the body — 0 the left flank, ¼ the belly, ½ the right
 * flank, ¾ the back.
 */
export function bodyTexture(id: CoatId): THREE.CanvasTexture {
  const p = PALETTES[id];
  const W = 256, H = 128;
  const [c, ctx] = canvas(W, H);
  const rand = rng(id.length * 7919 + 17);

  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, W, H);

  // the belly: a soft lighter band underneath
  const belly = ctx.createLinearGradient(0, 0, W, 0);
  belly.addColorStop(0.08, `${p.base}00`);
  belly.addColorStop(0.25, p.belly);
  belly.addColorStop(0.42, `${p.base}00`);
  ctx.fillStyle = belly;
  ctx.fillRect(0, 0, W, H);

  if (id === "tabby" || id === "ginger") {
    // stripes from flank over the back to the other flank, like ribs
    soft(ctx, p.mark, 5);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const y = 14 + (i / (n - 1)) * (H - 26) + (rand() - 0.5) * 5;
      const thick = 3.2 + rand() * 2.5;
      ctx.lineWidth = thick;
      ctx.lineCap = "round";
      ctx.globalAlpha = id === "ginger" ? 0.55 : 0.85;
      wrapX(W, (dx) => {
        ctx.beginPath();
        // from the right flank (½) across the back (¾) to the left flank (1)
        for (let k = 0; k <= 16; k++) {
          const u = 0.47 + (k / 16) * 0.6;
          const x = u * W + dx;
          // the stripe bends back toward the rump as it climbs the flank
          const bend = Math.cos(((u - 0.75) / 0.3) * (Math.PI / 2)) * 6;
          const yy = y + bend + Math.sin(k * 1.7 + i) * 1.4;
          if (k === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;
    // a darker line down the spine
    soft(ctx, p.mark, 8);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0.75 * W - 5, 4, 10, H - 8);
    ctx.globalAlpha = 1;
  }

  if (id === "calico") {
    const blobs: [number, number, number, string][] = [
      [0.7, 0.3, 26, p.mark],
      [0.86, 0.68, 22, p.mark2!],
      [0.55, 0.78, 18, p.mark],
      [0.98, 0.22, 16, p.mark2!],
      [0.62, 0.52, 12, p.mark2!],
    ];
    for (const [u, v, r, col] of blobs) {
      soft(ctx, col, 6);
      wrapX(W, (dx) => {
        ctx.beginPath();
        for (let k = 0; k <= 20; k++) {
          const a = (k / 20) * Math.PI * 2;
          const rr = r * (0.8 + 0.25 * Math.sin(a * 3 + u * 9) + 0.1 * Math.cos(a * 5));
          const x = u * W + dx + Math.cos(a) * rr * 1.3;
          const y = v * H + Math.sin(a) * rr * 0.8;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.fill();
      });
    }
  }

  if (id === "black" || id === "grey") {
    // a faint lighter sheen along the back, darker toward the belly
    const back = ctx.createLinearGradient(0, 0, W, 0);
    back.addColorStop(0.55, `${p.sheen}00`);
    back.addColorStop(0.75, `${p.sheen}22`);
    back.addColorStop(0.95, `${p.sheen}00`);
    ctx.fillStyle = back;
    ctx.fillRect(0, 0, W, H);
  }

  grain(ctx, W, H, rand, id === "black");
  return finish(c);
}

/**
 * The head is an upright sphere: rows from the crown (top) to the chin,
 * columns round the head — ¼ is the face, ¾ the back of the head.
 */
export function headTexture(id: CoatId): THREE.CanvasTexture {
  const p = PALETTES[id];
  const W = 256, H = 128;
  const [c, ctx] = canvas(W, H);
  const rand = rng(id.length * 104729 + 3);

  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, W, H);

  // lighter cheeks and chin round the face
  const face = ctx.createRadialGradient(0.25 * W, 0.78 * H, 2, 0.25 * W, 0.78 * H, 54);
  face.addColorStop(0, p.muzzle);
  face.addColorStop(0.55, `${p.muzzle}aa`);
  face.addColorStop(1, `${p.muzzle}00`);
  if (id !== "black" && id !== "grey") {
    ctx.fillStyle = face;
    ctx.fillRect(0, 0, W, H);
  }

  if (id === "tabby" || id === "ginger") {
    soft(ctx, p.mark, 3);
    ctx.globalAlpha = id === "ginger" ? 0.6 : 0.9;
    ctx.lineCap = "round";
    // the "M" on the forehead: three short strokes down from the crown
    for (const [u, len, w] of [[0.205, 26, 3.2], [0.25, 32, 3.6], [0.295, 26, 3.2]] as const) {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(u * W, 6);
      ctx.quadraticCurveTo(u * W + (u - 0.25) * 30, 6 + len * 0.6, u * W + (u - 0.25) * 18, 6 + len);
      ctx.stroke();
    }
    // stripes over the crown to the nape
    for (let i = 0; i < 4; i++) {
      ctx.lineWidth = 3.5;
      const u = 0.6 + i * 0.09;
      ctx.beginPath();
      ctx.moveTo(u * W, 4);
      ctx.lineTo(u * W + 4, 40 + rand() * 12);
      ctx.stroke();
    }
    // cheek lines beside each eye
    for (const side of [-1, 1]) {
      for (const dy of [0, 9]) {
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        const x0 = (0.25 + side * 0.105) * W;
        ctx.moveTo(x0, 0.56 * H + dy);
        ctx.lineTo(x0 + side * 18, 0.53 * H + dy + 3);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  if (id === "calico") {
    // one ear-side orange, the other dark: the classic split face
    soft(ctx, p.mark, 6);
    ctx.beginPath();
    ctx.ellipse(0.15 * W, 0.22 * H, 34, 26, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.75 * W, 0.3 * H, 40, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    soft(ctx, p.mark2!, 6);
    ctx.beginPath();
    ctx.ellipse(0.37 * W, 0.18 * H, 26, 24, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.55 * W, 0.24 * H, 22, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  grain(ctx, W, H, rand, id === "black");
  return finish(c);
}

/** a round soft-edged dark spot for the blob shadow */
export function shadowTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.45, "rgba(0,0,0,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/** wound yarn for the ball */
export function yarnTexture(color: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 64);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 64);
  const rand = rng(99);
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 46; i++) {
    ctx.strokeStyle = rand() < 0.5 ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.18)";
    ctx.beginPath();
    const y = rand() * 64;
    const tilt = (rand() - 0.5) * 40;
    ctx.moveTo(-4, y);
    ctx.bezierCurveTo(40, y + tilt, 88, y - tilt, 132, y + tilt * 0.3);
    ctx.stroke();
  }
  return finish(c);
}

/** sprites: a heart, a "z", a sparkle */
export function glyphTexture(kind: "heart" | "z" | "spark"): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  ctx.translate(32, 32);
  if (kind === "heart") {
    ctx.fillStyle = "#ff6f9c";
    ctx.shadowColor = "rgba(255,111,156,0.6)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.bezierCurveTo(-30, -2, -18, -26, 0, -12);
    ctx.bezierCurveTo(18, -26, 30, -2, 0, 18);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(-9, -9, 4, 2.5, -0.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "z") {
    ctx.font = "700 40px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(20,24,36,0.35)";
    ctx.strokeText("z", 0, 0);
    ctx.fillStyle = "#c9d3f2";
    ctx.fillText("z", 0, 0);
  } else {
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 7 : 22;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
