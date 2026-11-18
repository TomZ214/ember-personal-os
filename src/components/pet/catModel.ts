import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { CoatId } from "@/lib/pet";

/**
 * The cat's body: a realistic, sculpted and textured domestic cat (Grab3D,
 * CC0 — see public/pet/README.md), slimmed for the web and bound to a
 * skeleton by scripts/cat-model. This module knows where its bones, eyes and
 * lids are, and loads the model and the coat chosen in Settings.
 *
 * Measurements are in centimetres in the model's own pose (standing, mid
 * stride, tail up, head turned to its left), +z forward, floor at y = 0.
 */

/** centimetres → scene units */
export const CM = 1 / 60;

export interface BoneDef {
  name: string;
  parent: string | null;
  at: readonly [number, number, number];
}

/** in the order of the model's JOINTS_0 indices */
export const BONES: BoneDef[] = [
  { name: "root", parent: null, at: [0, 0, 0] },
  { name: "pelvis", parent: "root", at: [0, 25.5, -14.5] },
  { name: "spine1", parent: "pelvis", at: [0, 26.5, -5.5] },
  { name: "spine2", parent: "spine1", at: [0, 26.5, 3] },
  { name: "chest", parent: "spine2", at: [0, 25.5, 9.5] },
  { name: "neck", parent: "chest", at: [0.5, 27, 12.5] },
  { name: "head", parent: "neck", at: [3.2, 33.0, 13.8] },
  { name: "earL", parent: "head", at: [7.6, 38.6, 14.6] },
  { name: "earR", parent: "head", at: [1.2, 38.6, 20.4] },
  { name: "scapulaL", parent: "chest", at: [3.6, 26, 11] },
  { name: "upperArmL", parent: "scapulaL", at: [4.4, 20.5, 14.5] },
  { name: "forearmL", parent: "upperArmL", at: [4.4, 13.5, 7.8] },
  { name: "pawL", parent: "forearmL", at: [3.9, 4.6, 9.6] },
  { name: "scapulaR", parent: "chest", at: [-3.8, 26, 11] },
  { name: "upperArmR", parent: "scapulaR", at: [-4.6, 20.5, 14.5] },
  { name: "forearmR", parent: "upperArmR", at: [-5.0, 13.5, 8.2] },
  { name: "pawR", parent: "forearmR", at: [-5.3, 4.6, 10.2] },
  { name: "thighL", parent: "pelvis", at: [4.6, 22.5, -14] },
  { name: "shinL", parent: "thighL", at: [5.4, 13.0, -9.6] },
  { name: "footL", parent: "shinL", at: [5.6, 6.8, -19.6] },
  { name: "toesL", parent: "footL", at: [6.0, 1.4, -15.0] },
  { name: "thighR", parent: "pelvis", at: [-4.6, 22.5, -14] },
  { name: "shinR", parent: "thighR", at: [-5.2, 13.0, -8.0] },
  { name: "footR", parent: "shinR", at: [-5.4, 6.8, -17.4] },
  { name: "toesR", parent: "footR", at: [-5.6, 1.4, -11.8] },
  { name: "tail0", parent: "pelvis", at: [1.0, 29.5, -17.6] },
  { name: "tail1", parent: "tail0", at: [1.5, 33.0, -19.8] },
  { name: "tail2", parent: "tail1", at: [2.0, 36.8, -21.8] },
  { name: "tail3", parent: "tail2", at: [2.3, 40.6, -23.4] },
  { name: "tail4", parent: "tail3", at: [2.5, 44.2, -24.3] },
  { name: "tail5", parent: "tail4", at: [2.4, 46.8, -23.2] },
  { name: "tail6", parent: "tail5", at: [2.0, 48.3, -20.8] },
];

export const TAIL_BONES = 7;
/** where the tail ends, past its last bone */
export const TAIL_TIP = [1.5, 49, -18.5] as const;

/**
 * In the model the head is turned about 55° to the cat's left. These turn
 * neck and head back to face straight ahead; every pose starts from there.
 */
export const REST_TURN = { neck: -0.45, head: -0.5 } as const;

/**
 * The irises (cm, model pose) and which way each eye looks: left eye first.
 * `opening` is the almond of the open eye, measured on the model: its middle
 * (across and up from the iris, cm; the irises look a little inward and up)
 * and its half width and half height.
 */
export const EYES = [
  { iris: [8.69, 35.51, 17.86], normal: [0.935, -0.007, 0.354], opening: { at: [0, -0.17], half: [1.04, 0.83] } },
  { iris: [5.71, 35.55, 22.03], normal: [0.751, -0.059, 0.658], opening: { at: [-0.12, -0.15], half: [1.12, 0.85] } },
] as const;

/** the colour of the fur round each eye, per coat: what the lids are made of */
export const LIDS: Record<CoatId, readonly [string, string]> = {
  tabby: ["#9c8266", "#977d64"],
  ginger: ["#c98650", "#c38250"],
  black: ["#242122", "#231f20"],
  white: ["#e6e1da", "#e5dfd7"],
  grey: ["#7d838e", "#797f8a"],
  calico: ["#dfbb9d", "#dfc2a9"],
};

export interface CatModel {
  geometry: THREE.BufferGeometry;
  /** the mesh's own transform (it undoes the compression of the positions) */
  matrix: THREE.Matrix4;
  /** fur relief and sheen from the sculpt; the colour comes from the coat */
  material: THREE.MeshStandardMaterial;
}

let model: Promise<CatModel> | null = null;

/** the model, fetched once per page load and shared */
export function loadCatModel(): Promise<CatModel> {
  if (!model) {
    const loading = new Promise<CatModel>((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      loader.load(
        "/pet/cat.glb",
        (gltf) => {
          let mesh: THREE.Mesh | null = null;
          gltf.scene.traverse((o) => {
            if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh;
          });
          if (!mesh) return reject(new Error("no mesh in cat.glb"));
          const m = mesh as THREE.Mesh;
          gltf.scene.updateMatrixWorld(true);
          resolve({ geometry: m.geometry, matrix: m.matrixWorld.clone(), material: m.material as THREE.MeshStandardMaterial });
        },
        undefined,
        reject,
      );
    });
    // a failed load (offline) must not poison every later attempt
    loading.catch(() => {
      if (model === loading) model = null;
    });
    model = loading;
  }
  return model;
}

const coats = new Map<CoatId, Promise<THREE.Texture>>();

/** a coat's colour texture, fetched when first chosen */
export function loadCoat(id: CoatId): Promise<THREE.Texture> {
  let p = coats.get(id);
  if (!p) {
    p = new THREE.TextureLoader().loadAsync(`/pet/coat-${id}.jpg`).then((tex) => {
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    });
    p.catch(() => coats.delete(id));
    coats.set(id, p);
  }
  return p;
}
