import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { writeFileSync } from "node:fs";
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read("cat-step2.glb");
const mat = doc.getRoot().listMaterials()[0];
writeFileSync("base.jpg", mat.getBaseColorTexture().getImage());
writeFileSync("normal.jpg", mat.getNormalTexture().getImage());
writeFileSync("mr.jpg", mat.getMetallicRoughnessTexture().getImage());
console.log("ok", mat.getBaseColorFactor(), mat.getRoughnessFactor(), mat.getMetallicFactor());
