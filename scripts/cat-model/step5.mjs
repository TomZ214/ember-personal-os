// pack the rigged model for the web, and work out the eyelid colours per coat
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { quantize, reorder, prune, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
// node step5.mjs ../../public/pet
const out = process.argv[2] || "out"; mkdirSync(out, { recursive: true });
const doc = await io.read("cat-step2.glb");
const mat = doc.getRoot().listMaterials()[0];
// the coat is chosen at run time: no colour map in the model
const baseTex = mat.getBaseColorTexture(); mat.setBaseColorTexture(null); baseTex?.dispose();
mat.setDoubleSided(false);
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [1024, 1024], quality: 88 }),
  prune(), reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(`${out}/cat.glb`, doc);
console.log("cat.glb KB", Math.round(statSync(`${out}/cat.glb`).size / 1024));
for (const t of doc.getRoot().listTextures()) console.log(" texture", t.getSize(), Math.round(t.getImage().byteLength / 1024) + "KB");
// coats
for (const id of ["tabby", "ginger", "black", "white", "grey", "calico"]) {
  await sharp(`coats/coat-${id}.jpg`).jpeg({ quality: 80, mozjpeg: true }).toFile(`${out}/coat-${id}.jpg`);
  console.log(" coat", id, Math.round(statSync(`${out}/coat-${id}.jpg`).size / 1024) + "KB");
}
// eyelid colour per eye per coat: the fur in a ring round each eye
const pos = new Float32Array(readFileSync("posmap.bin").buffer.slice(0));
const eyes = JSON.parse(readFileSync("eyes.json", "utf8"));
const lids = {};
for (const id of ["tabby", "ginger", "black", "white", "grey", "calico"]) {
  const { data, info } = await sharp(`coats/coat-${id}.jpg`).raw().toBuffer({ resolveWithObject: true });
  lids[id] = eyes.map((e) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < info.width * info.height; i++) {
      const d = Math.hypot(pos[i * 3] - e.iris[0], pos[i * 3 + 1] - e.iris[1], pos[i * 3 + 2] - e.iris[2]);
      if (d > 1.35 && d < 2.0 && pos[i * 3 + 1] > e.iris[1]) { r += data[i * 3]; g += data[i * 3 + 1]; b += data[i * 3 + 2]; n++; }
    }
    return "#" + [r, g, b].map((x) => Math.round(x / n).toString(16).padStart(2, "0")).join("");
  });
}
// for LIDS in src/components/pet/catModel.ts
writeFileSync("lids.json", JSON.stringify(lids));
console.log("lids", JSON.stringify(lids));
