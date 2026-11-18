// paint the coats from the tabby texture, using where each texel sits on the body
import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
const out = process.argv[2] || "coats";
mkdirSync(out, { recursive: true });
const base = await sharp("base.jpg").raw().toBuffer({ resolveWithObject: true });
const S = base.info.width, src = base.data;
const pos = new Float32Array(readFileSync("posmap.bin").buffer.slice(0));
const eyes = JSON.parse(readFileSync("eyes.json", "utf8"));
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx]; };
const hsv2rgb = (h, s, v) => { const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)]; };
// deterministic 3D value noise
const hash = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const vnoise = (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); const xf = x - xi, yf = y - yi, zf = z - zi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf); let r = 0; for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) r += hash(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w); return r; };
const fbm = (x, y, z) => { let s = 0, a = 0.5; for (let i = 0; i < 4; i++) { s += a * vnoise(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return s; };

const COATS = {
  ginger: { fur: [[0.42, 0.17, 0.05], [0.99, 0.7, 0.42]], white: "keep", eye: null },
  black: { fur: [[0.03, 0.027, 0.03], [0.2, 0.18, 0.19]], white: "fur", pink: [0.32, 0.22, 0.23], eye: 46 },
  white: { fur: [[0.74, 0.71, 0.67], [0.99, 0.975, 0.95]], white: "fur", eye: 208 },
  grey: { fur: [[0.17, 0.19, 0.22], [0.66, 0.69, 0.74]], white: "fur", pink: [0.62, 0.5, 0.52], eye: 30 },
  calico: { fur: null, white: "keep", eye: 42 },
};
const ORANGE = [[0.45, 0.19, 0.06], [0.99, 0.66, 0.36]], BLACK = [[0.03, 0.027, 0.03], [0.22, 0.2, 0.21]], WHITE = [[0.82, 0.79, 0.75], [0.995, 0.98, 0.955]];
for (const [id, coat] of Object.entries(COATS)) {
  const dst = Buffer.alloc(S * S * 3);
  for (let i = 0; i < S * S; i++) {
    const r = src[i * 3] / 255, g = src[i * 3 + 1] / 255, b = src[i * 3 + 2] / 255;
    const [h, s, v] = hsv(r, g, b);
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
    let eyeD = 1e9;
    for (const e of eyes) eyeD = Math.min(eyeD, Math.hypot(px - e.iris[0], py - e.iris[1], pz - e.iris[2]));
    const eye = smooth(1.15, 0.85, eyeD); // inside the eye opening
    const pinkHue = (h > 330 || h < 22) && s > 0.16 && s < 0.72 && v > 0.42 && (py > 30 || py < 3);
    const white = smooth(0.26, 0.14, s) * smooth(0.55, 0.72, v);
    let col;
    const ramp = (rr) => mix(rr[0], rr[1], smooth(0.02, 0.78, L) * 0.85 + L * 0.15);
    if (id === "calico") {
      const o = fbm(px * 0.1 + 3.1, py * 0.1, pz * 0.1) , k = fbm(px * 0.1 + 17.3, py * 0.1 + 5, pz * 0.1 - 2);
      const top = smooth(10, 22, py) * (py > 34 ? 0.9 : 1);
      const orange = smooth(0.5, 0.56, o) * top, black = smooth(0.54, 0.6, k) * top;
      col = ramp(WHITE);
      col = mix(col, ramp(ORANGE), orange * (1 - white * 0.6));
      col = mix(col, ramp(BLACK), black * (1 - white * 0.6));
    } else {
      col = ramp(coat.fur);
      if (coat.white === "keep") col = mix(col, [r, g, b], white);
    }
    if (pinkHue) col = coat.pink ? coat.pink.map((x) => x * (0.6 + 0.6 * v)) : [r, g, b];
    // the eye: keep its shading, change the iris colour if this coat has its own
    let eyeCol = [r, g, b];
    if (coat.eye != null && h > 40 && h < 130 && s > 0.25) eyeCol = hsv2rgb(coat.eye, Math.min(1, s * 1.05), v);
    col = mix(col, eyeCol, eye);
    for (let q = 0; q < 3; q++) dst[i * 3 + q] = Math.round(clamp(col[q]) * 255);
  }
  await sharp(dst, { raw: { width: S, height: S, channels: 3 } }).jpeg({ quality: 82, mozjpeg: true }).toFile(`${out}/coat-${id}.jpg`);
  await sharp(dst, { raw: { width: S, height: S, channels: 3 } }).resize(512).png().toFile(`${out}/preview-${id}.png`);
}
await sharp("base.jpg").jpeg({ quality: 82, mozjpeg: true }).toFile(`${out}/coat-tabby.jpg`);
console.log("done");
