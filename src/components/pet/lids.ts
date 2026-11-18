import * as THREE from "three";
import type { CoatId } from "@/lib/pet";
import { CM, EYES, LIDS, type CatModel } from "./catModel";

/**
 * Eyelids, made from the eyes themselves.
 *
 * The model's eyes are part of its one sculpted surface, and no sphere fits
 * them well enough to slide a lid over. So the lids are a copy of the
 * surface of each eye, lifted a hair off it, skinned exactly like it, and
 * drawn only where a lid would be: the upper lid comes down and the lower
 * lid comes up, as far as `close` says, and they meet in a gentle curve a
 * little below the middle. Where the lid is, the eye is fur coloured, with
 * the dark line of the lid margin along its edge.
 */

export interface Lids {
  mesh: THREE.SkinnedMesh;
  /** 0 open … 1 shut, per eye (left, right) */
  close: THREE.Vector2;
  setCoat(coat: CoatId): void;
  dispose(): void;
}

/** how far the copy floats over the eye, cm */
const LIFT = 0.05;

export function buildLids(model: CatModel, skeleton: THREE.Skeleton, parent: THREE.Object3D, coat: CoatId): Lids {
  const geo = model.geometry;
  const P = geo.getAttribute("position");
  const N = geo.getAttribute("normal");
  const SI = geo.getAttribute("skinIndex");
  const SW = geo.getAttribute("skinWeight");
  const M = model.matrix;
  const NM = new THREE.Matrix3().getNormalMatrix(M);

  // each eye's frame: across (u), up (v), out (n), from the middle of its opening
  const up = new THREE.Vector3(0, 1, 0);
  const frames = EYES.map((e) => {
    const n = new THREE.Vector3(...e.normal).normalize();
    const u = new THREE.Vector3().crossVectors(up, n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const o = new THREE.Vector3(...e.iris).addScaledVector(u, e.opening.at[0]).addScaledVector(v, e.opening.at[1]);
    return { n, u, v, o, half: e.opening.half };
  });

  // which vertices lie on an eye, and where on it
  const count = P.count;
  const which = new Int8Array(count).fill(-1);
  const coord = new Float32Array(count * 2);
  const world = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  const nn = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    p.fromBufferAttribute(P, i).applyMatrix4(M).multiplyScalar(1 / CM);
    nn.fromBufferAttribute(N, i).applyMatrix3(NM).normalize();
    frames.forEach((f, k) => {
      d.copy(p).sub(f.o);
      const x = d.dot(f.u) / f.half[0];
      const y = d.dot(f.v) / f.half[1];
      const depth = d.dot(f.n);
      // generous: the shader trims the lid to the opening
      if (x * x + y * y < 1.7 && depth > -1.2 && depth < 0.9 && nn.dot(f.n) > 0) {
        which[i] = k;
        coord[i * 2] = x;
        coord[i * 2 + 1] = y;
      }
    });
    p.addScaledVector(nn, LIFT).multiplyScalar(CM);
    world.set([p.x, p.y, p.z], i * 3);
    normal.set([nn.x, nn.y, nn.z], i * 3);
  }

  // the triangles of each eye, as their own small mesh
  const index = geo.getIndex();
  const tri = index ? index.count / 3 : count / 3;
  const remap = new Map<number, number>();
  const pos: number[] = [], nor: number[] = [], eye: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
  const vert = (i: number) => {
    let j = remap.get(i);
    if (j === undefined) {
      j = remap.size;
      remap.set(i, j);
      pos.push(world[i * 3], world[i * 3 + 1], world[i * 3 + 2]);
      nor.push(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]);
      eye.push(coord[i * 2], coord[i * 2 + 1], which[i]);
      si.push(SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i));
      sw.push(SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i));
    }
    return j;
  };
  for (let t = 0; t < tri; t++) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const k = which[a];
    if (k < 0 || which[b] !== k || which[c] !== k) continue;
    idx.push(vert(a), vert(b), vert(c));
  }
  const lidGeo = new THREE.BufferGeometry();
  lidGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  lidGeo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  lidGeo.setAttribute("eye", new THREE.Float32BufferAttribute(eye, 3));
  lidGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  lidGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  lidGeo.setIndex(idx);

  const close = new THREE.Vector2(0, 0);
  const colours = [new THREE.Color(LIDS[coat][0]), new THREE.Color(LIDS[coat][1])];
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.92 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uClose = { value: close };
    shader.uniforms.uLid0 = { value: colours[0] };
    shader.uniforms.uLid1 = { value: colours[1] };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 eye;\nvarying vec3 vEye;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvEye = eye;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vEye;
uniform vec2 uClose;
uniform vec3 uLid0;
uniform vec3 uLid1;
float lidHash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  float x = vEye.x;
  float y = vEye.y;
  bool second = vEye.z > 0.5;
  // only over the opening of the eye
  if (x * x + y * y > 1.0) discard;
  float c = second ? uClose.y : uClose.x;
  float rim = sqrt(max(0.0, 1.0 - x * x));
  // shut, the lids meet in a soft smile a little below the middle
  float meet = -0.28 - 0.1 * (1.0 - x * x);
  float top = mix(rim + 0.04, meet, c);
  float bottom = mix(-rim - 0.04, meet, c);
  if (y < top && y > bottom) discard;
  float edge = y >= top ? y - top : bottom - y;
  // short hairs running away from the lid's edge, and the dark margin along it
  float h1 = lidHash(floor(vec2(x * 90.0, y * 16.0 + lidHash(vec2(floor(x * 90.0), 3.0)) * 5.0)));
  float h2 = lidHash(floor(vec2(x * 31.0 + y * 4.0, y * 9.0)));
  vec3 fur = (second ? uLid1 : uLid0) * (0.9 + 0.12 * h1 + 0.08 * h2);
  // round, under the brow: a little darker toward the rim of the opening
  float r = sqrt(x * x + y * y);
  float shade = mix(0.72, 1.0, smoothstep(1.0, 0.55, r)) * (1.0 - 0.12 * max(0.0, y));
  diffuseColor.rgb = fur * shade * mix(0.08, 1.0, smoothstep(0.02, 0.2, edge));
}`,
      );
  };

  const mesh = new THREE.SkinnedMesh(lidGeo, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  parent.add(mesh);
  parent.updateMatrixWorld(true);
  mesh.bind(skeleton);

  return {
    mesh,
    close,
    setCoat(c: CoatId) {
      colours[0].set(LIDS[c][0]);
      colours[1].set(LIDS[c][1]);
    },
    dispose() {
      parent.remove(mesh);
      lidGeo.dispose();
      material.dispose();
    },
  };
}
