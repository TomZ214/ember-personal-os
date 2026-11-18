// bind the model's skin to the skeleton in bones.json
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { readFileSync } from "node:fs";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read("cat-step1.glb");
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute("POSITION").getArray();
const n = P.length / 3, CMU = 60;
const bones = JSON.parse(readFileSync("bones.json", "utf8"));
const idx = Object.fromEntries(bones.map((b, i) => [b[0], i]));
const at = Object.fromEntries(bones.map(([name, , p]) => [name, p]));
const add = (a, d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]];
// each bone's segment (cm) and how thick the flesh around it is
const seg = {
  pelvis: [at.pelvis, [0, 24, -19.5], 8], spine1: [at.spine1, at.spine2, 8.5], spine2: [at.spine2, at.chest, 9], chest: [at.chest, at.neck, 8.5],
  neck: [at.neck, at.head, 4.5], head: [at.head, [8, 32.5, 21.3], 4.6],
  earL: [at.earL, [8.6, 43.2, 14.4], 0.8], earR: [at.earR, [0.6, 43.2, 21.0], 0.8],
  scapulaL: [at.scapulaL, at.upperArmL, 2.6], upperArmL: [at.upperArmL, at.forearmL, 2.4], forearmL: [at.forearmL, at.pawL, 1.6], pawL: [at.pawL, add(at.pawL, [0, -3.6, 2.6]), 1.3],
  scapulaR: [at.scapulaR, at.upperArmR, 2.6], upperArmR: [at.upperArmR, at.forearmR, 2.4], forearmR: [at.forearmR, at.pawR, 1.6], pawR: [at.pawR, add(at.pawR, [0, -3.6, 2.6]), 1.3],
  thighL: [at.thighL, at.shinL, 4], shinL: [at.shinL, at.footL, 2], footL: [at.footL, at.toesL, 1.3], toesL: [at.toesL, add(at.toesL, [0, -0.6, 3]), 1.2],
  thighR: [at.thighR, at.shinR, 4], shinR: [at.shinR, at.footR, 2], footR: [at.footR, at.toesR, 1.3], toesR: [at.toesR, add(at.toesR, [0, -0.6, 3]), 1.2],
};
for (let i = 0; i < 7; i++) {
  const next = i < 6 ? at[`tail${i + 1}`] : [1.5, 49, -18.5];
  seg[`tail${i}`] = [at[`tail${i}`], next, 1.6 - i * 0.12];
}
const names = Object.keys(seg);
function segDist(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
}
const B = names.length, TAU = 1.1;
let W = new Float32Array(n * B);
for (let v = 0; v < n; v++) {
  const p = [P[v * 3] * CMU, P[v * 3 + 1] * CMU, P[v * 3 + 2] * CMU];
  const d = names.map((k) => Math.max(0, segDist(p, seg[k][0], seg[k][1]) - seg[k][2]));
  const m = Math.min(...d);
  let s = 0;
  for (let b = 0; b < B; b++) { const w = d[b] - m < 4 * TAU ? Math.exp(-(d[b] - m) / TAU) : 0; W[v * B + b] = w; s += w; }
  for (let b = 0; b < B; b++) W[v * B + b] /= s;
}
// neighbours from the triangles; vertices split by texture seams count as one
const I = prim.getIndices().getArray();
const key = (v) => `${Math.round(P[v * 3] * 1e5)},${Math.round(P[v * 3 + 1] * 1e5)},${Math.round(P[v * 3 + 2] * 1e5)}`;
const group = new Map(); const gid = new Int32Array(n);
for (let v = 0; v < n; v++) { const k = key(v); if (!group.has(k)) group.set(k, group.size); gid[v] = group.get(k); }
const G = group.size;
const nb = Array.from({ length: G }, () => new Set());
for (let t = 0; t < I.length; t += 3) for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { nb[gid[a]].add(gid[b]); nb[gid[b]].add(gid[a]); }
let GW = new Float32Array(G * B); const cnt = new Float32Array(G);
for (let v = 0; v < n; v++) { cnt[gid[v]]++; for (let b = 0; b < B; b++) GW[gid[v] * B + b] += W[v * B + b]; }
for (let g = 0; g < G; g++) for (let b = 0; b < B; b++) GW[g * B + b] /= cnt[g];
// smooth over the surface: joints blend, separate limbs never touch
const nbl = nb.map((s) => [...s]);
for (let it = 0; it < 10; it++) {
  const next = new Float32Array(G * B);
  for (let g = 0; g < G; g++) {
    const L = nbl[g]; if (!L.length) { for (let b = 0; b < B; b++) next[g * B + b] = GW[g * B + b]; continue; }
    for (let b = 0; b < B; b++) { let s = 0; for (const u of L) s += GW[u * B + b]; next[g * B + b] = 0.5 * GW[g * B + b] + 0.5 * s / L.length; }
  }
  GW = next;
}
// four strongest bones per vertex
const J = new Uint16Array(n * 4), WW = new Float32Array(n * 4);
for (let v = 0; v < n; v++) {
  const g = gid[v];
  const top = names.map((k, b) => [idx[k], GW[g * B + b]]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const s = top.reduce((a, x) => a + x[1], 0) || 1;
  top.forEach(([bi, w], q) => { J[v * 4 + q] = bi; WW[v * 4 + q] = w / s; });
}
prim.setAttribute("JOINTS_0", doc.createAccessor().setType("VEC4").setArray(J).setBuffer(doc.getRoot().listBuffers()[0]));
prim.setAttribute("WEIGHTS_0", doc.createAccessor().setType("VEC4").setArray(WW).setBuffer(doc.getRoot().listBuffers()[0]));
await io.write("cat-step2.glb", doc);
console.log("verts", n, "position groups", G, "bones", B);
