import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplify, prune, dedup, textureCompress } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
// the source model (see README): node step1.mjs <source.glb> [keep ratio]
const doc = await io.read(process.argv[2] || "source/cat.glb");
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
// face +z, centred, metres -> scene units (1 unit = 60 cm)
const theta = Math.atan2(0.609, 0.793);
const c = Math.cos(theta), s = Math.sin(theta);
const S = 100 / 60;
const pos = prim.getAttribute("POSITION");
const nor = prim.getAttribute("NORMAL");
const P = pos.getArray(), N = nor.getArray();
const mx = -0.032, mz = -0.020;
for (let i = 0; i < P.length; i += 3) {
  const x = P[i] - mx, z = P[i + 2] - mz;
  P[i] = (x * c + z * s) * S; P[i + 1] *= S; P[i + 2] = (-x * s + z * c) * S;
  const nx = N[i], nz = N[i + 2];
  N[i] = nx * c + nz * s; N[i + 2] = -nx * s + nz * c;
}
pos.setArray(P); nor.setArray(N);
// centre left-right on the paws, put the middle of the body at z = 0
let xs = 0, cnt = 0, zmin = 1e9, zmax = -1e9;
for (let i = 0; i < P.length; i += 3) { if (P[i + 1] < 0.03) { xs += P[i]; cnt++; } zmin = Math.min(zmin, P[i + 2]); zmax = Math.max(zmax, P[i + 2]); }
const dx = xs / cnt;
for (let i = 0; i < P.length; i += 3) P[i] -= dx;
pos.setArray(P);
console.log("x shift", dx.toFixed(4), "z range", zmin.toFixed(3), zmax.toFixed(3));
const ratio = Number(process.argv[3] || 0.06);
await MeshoptSimplifier.ready;
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.0008 }), dedup(), prune(),
  textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [2048, 2048], quality: 86 }));
const out = doc.getRoot().listMeshes()[0].listPrimitives()[0];
console.log("tris", out.getIndices().getCount() / 3, "verts", out.getAttribute("POSITION").getCount());
for (const t of doc.getRoot().listTextures()) console.log("texture", t.getName(), t.getSize(), Math.round(t.getImage().byteLength / 1024) + "KB");
await io.write("cat-step1.glb", doc);
const { statSync } = await import("node:fs");
console.log("glb MB", (statSync("cat-step1.glb").size / 1e6).toFixed(2));
