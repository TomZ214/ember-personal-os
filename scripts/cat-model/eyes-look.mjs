// a front photo of each eye (texels near it, splatted onto its tangent plane, grid every 0.5 cm): to measure the openings in catModel.ts EYES
import sharp from "sharp";
import { readFileSync } from "node:fs";
const base = await sharp("base.jpg").raw().toBuffer({ resolveWithObject: true });
const S = base.info.width, src = base.data;
const pos = new Float32Array(readFileSync("posmap.bin").buffer.slice(0));
const nor = new Float32Array(readFileSync("normap.bin").buffer.slice(0));
const eyes = JSON.parse(readFileSync("eyes.json", "utf8"));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const W = 300, half = 2.5; // cm shown each way
for (const [k, e] of eyes.entries()) {
  const n = e.normal; let u = cross([0, 1, 0], n); const ul = Math.hypot(...u); u = u.map((x) => x / ul); const v = cross(n, u);
  const img = Buffer.alloc(W * W * 3, 40); const depth = new Float32Array(W * W).fill(-1e9);
  for (let i = 0; i < S * S; i++) {
    const x = pos[i * 3]; if (Number.isNaN(x)) continue;
    const p = [x - e.iris[0], pos[i * 3 + 1] - e.iris[1], pos[i * 3 + 2] - e.iris[2]];
    const a = dot(p, u), b = dot(p, v), d = dot(p, n);
    if (Math.abs(a) > half || Math.abs(b) > half || d < -2.5) continue;
    // facing the viewer only
    if (nor[i * 3] * n[0] + nor[i * 3 + 1] * n[1] + nor[i * 3 + 2] * n[2] < 0.1) continue;
    const px = Math.round(((a + half) / (2 * half)) * (W - 1)), py = Math.round(((half - b) / (2 * half)) * (W - 1));
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const q = (py + dy) * W + px + dx; if (px + dx >= W || py + dy >= W) continue;
      if (d < depth[q]) continue; depth[q] = d;
      img[q * 3] = src[i * 3]; img[q * 3 + 1] = src[i * 3 + 1]; img[q * 3 + 2] = src[i * 3 + 2];
    }
  }
  // grid every 0.5 cm
  for (let g = -half; g <= half; g += 0.5) { const c = Math.round(((g + half) / (2 * half)) * (W - 1)); for (let t = 0; t < W; t += 3) { for (const q of [t * W + c, c * W + t]) { img[q * 3] = 255; img[q * 3 + 1] = 0; img[q * 3 + 2] = 255; } } }
  await sharp(img, { raw: { width: W, height: W, channels: 3 } }).png().toFile(`eye-${k}.png`);
}
