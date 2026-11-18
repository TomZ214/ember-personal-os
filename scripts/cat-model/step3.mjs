// bake where each texel sits on the body, find the eyes, and paint the coats
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
import { writeFileSync } from "node:fs";
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read("cat-step2.glb");
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute("POSITION").getArray(), N = prim.getAttribute("NORMAL").getArray(), UV = prim.getAttribute("TEXCOORD_0").getArray(), I = prim.getIndices().getArray();
const base = await sharp("base.jpg").raw().toBuffer({ resolveWithObject: true });
const S = base.info.width, src = base.data;
const CMU = 60;
// rasterise every triangle into texture space: position (cm) and normal per texel
const pos = new Float32Array(S * S * 3).fill(NaN), nor = new Float32Array(S * S * 3);
for (let t = 0; t < I.length; t += 3) {
  const a = I[t], b = I[t + 1], c = I[t + 2];
  const ax = UV[a * 2] * S, ay = UV[a * 2 + 1] * S, bx = UV[b * 2] * S, by = UV[b * 2 + 1] * S, cx = UV[c * 2] * S, cy = UV[c * 2 + 1] * S;
  const minx = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxx = Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx)));
  const miny = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxy = Math.min(S - 1, Math.ceil(Math.max(ay, by, cy)));
  const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(den) < 1e-9) continue;
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const px = x + 0.5, py = y + 0.5;
    const w1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, w3 = 1 - w1 - w2;
    if (w1 < -0.02 || w2 < -0.02 || w3 < -0.02) continue;
    const o = (y * S + x) * 3;
    for (let k = 0; k < 3; k++) { pos[o + k] = (P[a * 3 + k] * w1 + P[b * 3 + k] * w2 + P[c * 3 + k] * w3) * CMU; nor[o + k] = N[a * 3 + k] * w1 + N[b * 3 + k] * w2 + N[c * 3 + k] * w3; }
  }
}
// texels the rasteriser missed (island padding): take the nearest filled neighbour, a few passes
for (let pass = 0; pass < 6; pass++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const o = (y * S + x) * 3; if (!Number.isNaN(pos[o])) continue;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue; const q = (yy * S + xx) * 3; if (!Number.isNaN(pos[q])) { pos[o] = pos[q]; pos[o + 1] = pos[q + 1]; pos[o + 2] = pos[q + 2]; nor[o] = nor[q]; nor[o + 1] = nor[q + 1]; nor[o + 2] = nor[q + 2]; break; } }
}
const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx]; };
// the eyes: green-yellow iris texels in the head
const iris = [];
for (let i = 0; i < S * S; i++) {
  const r = src[i * 3] / 255, g = src[i * 3 + 1] / 255, b = src[i * 3 + 2] / 255; const [h, s, v] = hsv(r, g, b);
  const y = pos[i * 3 + 1];
  if (h > 55 && h < 120 && s > 0.35 && v > 0.25 && y > 32) iris.push(i);
}
let c = [[8, 35, 18], [3, 35, 21]];
for (let it = 0; it < 20; it++) {
  const acc = c.map(() => [0, 0, 0, 0, 0, 0, 0]);
  for (const i of iris) { const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]; const k = (p[0] - c[0][0]) ** 2 + (p[2] - c[0][2]) ** 2 < (p[0] - c[1][0]) ** 2 + (p[2] - c[1][2]) ** 2 ? 0 : 1; for (let q = 0; q < 3; q++) { acc[k][q] += p[q]; acc[k][q + 3] += nor[i * 3 + q]; } acc[k][6]++; }
  c = acc.map((a, k) => a[6] ? [a[0] / a[6], a[1] / a[6], a[2] / a[6]] : c[k]);
  if (it === 19) globalThis.eyeAcc = acc;
}
const eyes = globalThis.eyeAcc.map((a) => { const n = [a[3], a[4], a[5]]; const l = Math.hypot(...n); return { iris: [a[0] / a[6], a[1] / a[6], a[2] / a[6]], normal: n.map((x) => x / l), texels: a[6] }; });
console.log("iris texels", iris.length, JSON.stringify(eyes.map((e) => ({ iris: e.iris.map((x) => +x.toFixed(2)), normal: e.normal.map((x) => +x.toFixed(2)), texels: e.texels }))));
writeFileSync("eyes.json", JSON.stringify(eyes));
// save the maps for the coat painter
writeFileSync("posmap.bin", Buffer.from(pos.buffer)); writeFileSync("normap.bin", Buffer.from(nor.buffer));
console.log("size", S);
