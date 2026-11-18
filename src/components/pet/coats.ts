import * as THREE from "three";

/**
 * Small textures drawn at run time on canvases: the cat's soft shadow, the
 * yarn of its ball, and the hearts, z's and sparkles that float up. Nothing
 * is downloaded.
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

function finish(c: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
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
