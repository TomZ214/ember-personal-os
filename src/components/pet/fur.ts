import * as THREE from "three";
import type { CoatId } from "@/lib/pet";
import { PALETTES } from "./palettes";

/**
 * Fur, eyes and the small parts of the face, as materials.
 *
 * Fur is shell rendering: the body is drawn several times, each copy pushed
 * a little further out along the skin and combed back, and each keeps only
 * the hairs that reach that high. From a distance that reads as a soft,
 * dense, short coat with a fuzzy silhouette, which is what makes the cat
 * look like an animal and not a toy. The coat's pattern (tabby stripes, the
 * forehead "M", calico patches, a pale belly) is painted in the shader from
 * each point's position on the resting body, so it moves with the skin.
 */

/** pattern ids, matched in the shader */
const PATTERN: Record<CoatId, number> = { tabby: 0, ginger: 1, black: 2, white: 3, grey: 4, calico: 5 };

const COMMON = /* glsl */ `
uniform float uPattern;
uniform vec3 uBase, uMark, uMark2, uBelly, uMuzzle, uLine;
uniform float uMarkAmt;
varying vec3 vRest;
varying vec3 vNrest;
varying float vRegion;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
float isRegion(float r, float id) { return 1.0 - smoothstep(0.35, 0.65, abs(r - id)); }

/* the coat at a point of the resting body (cm; +z forward, y up) */
vec3 coatColor(vec3 p, vec3 n, float region) {
  float dorsal = smoothstep(-0.2, 0.8, n.y);
  float ventral = smoothstep(-0.25, -0.8, n.y);
  float head = isRegion(region, 1.0);
  float leg = isRegion(region, 2.0);
  float tail = isRegion(region, 3.0);
  float muzzle = isRegion(region, 4.0);
  float body = isRegion(region, 0.0);
  vec3 col = uBase;
  float warp = fbm(p * 0.21 + 4.0) * 2.6;

  // pale underneath: belly, chest, chin, the inside of the legs
  float under = ventral * (body + leg * 0.8) + muzzle;
  // the chest bib
  under = max(under, smoothstep(17.5, 13.0, p.y) * smoothstep(9.0, 13.0, p.z) * body);
  col = mix(col, uBelly, clamp(under, 0.0, 1.0));
  col = mix(col, uMuzzle, muzzle * 0.85);

  if (uPattern < 1.5 || uPattern > 3.5 && uPattern < 4.5) {
    // tabby, ginger, and the ghost stripes of a grey
    float m = 0.0;
    // mackerel stripes down the flanks, a dark line along the spine
    float ribs = sin(p.z * 1.75 + warp - abs(p.x) * 0.2 + p.y * 0.25);
    m += smoothstep(0.45, 0.92, ribs) * (0.3 + 0.7 * dorsal) * (1.0 - ventral) * body;
    m += smoothstep(1.4, 0.5, abs(p.x)) * dorsal * body;
    // bars on the legs, outside more than inside
    float bars = sin(p.y * 1.5 + warp * 0.8);
    m += smoothstep(0.62, 0.95, bars) * 0.8 * leg * (1.0 - ventral) * smoothstep(1.8, 7.0, p.y);
    // rings on the tail and a dark tip
    float rings = sin(p.z * 1.5 + warp * 0.4);
    m += (smoothstep(0.35, 0.85, rings) + smoothstep(-44.0, -47.0, p.z)) * tail;
    // the forehead "M" and stripes over the crown
    float crown = smoothstep(32.6, 34.0, p.y) * smoothstep(17.0, 20.5, p.z);
    m += smoothstep(0.45, 0.9, sin(abs(p.x) * 2.7 + 0.4)) * crown * head;
    // a line from the outer corner of each eye back across the cheek
    float cheek = smoothstep(2.6, 3.4, abs(p.x)) * smoothstep(1.0, 0.25, abs(p.y - 30.9 + (p.z - 24.0) * 0.18));
    m += cheek * head * 0.9;
    col = mix(col, uMark, clamp(m, 0.0, 1.0) * uMarkAmt);
  }
  if (uPattern > 4.5) {
    // calico: white with orange and black islands, mostly over the back and head
    float a = fbm(p * 0.1 + 3.1);
    float b = fbm(p * 0.1 + 17.3);
    float top = (0.25 + 0.75 * dorsal) * (1.0 - leg * 0.6) * (1.0 - muzzle);
    col = mix(col, uMark, smoothstep(0.52, 0.56, a) * top);
    col = mix(col, uMark2, smoothstep(0.55, 0.59, b) * top);
  }
  // pale "spectacles" round the eyes
  float eye = smoothstep(2.2, 1.4, length(vec3(abs(p.x) - 1.8, p.y - 31.7, (p.z - 25.3) * 0.7)));
  col = mix(col, mix(col, uMuzzle, 0.55), eye * head);
  // the dark lines of the face: down from the nose, then out to the corners of the mouth
  float philtrum = smoothstep(0.11, 0.03, abs(p.x)) * smoothstep(26.9, 27.4, p.z) * smoothstep(28.85, 29.0, p.y) * smoothstep(29.8, 29.6, p.y);
  float mouth = smoothstep(0.09, 0.02, abs(p.y - 28.95 + p.x * p.x * 0.18)) * smoothstep(0.9, 0.55, abs(p.x)) * smoothstep(26.2, 26.9, p.z);
  col = mix(col, uLine, clamp(philtrum * 0.7 + mouth * 0.45, 0.0, 1.0) * (muzzle + head));
  // each hair a little different
  col *= 0.88 + 0.24 * vnoise(p * 3.1);
  return col;
}
`;

export interface FurUniforms {
  [key: string]: THREE.IUniform;
}

/** the uniforms every layer of one cat shares (the coat) */
export function coatUniforms(coat: CoatId): FurUniforms {
  const p = PALETTES[coat];
  const c = (hex: string) => new THREE.Color(hex);
  return {
    uPattern: { value: PATTERN[coat] },
    uBase: { value: c(p.base) },
    uMark: { value: c(p.mark) },
    uMark2: { value: c(p.mark2 ?? p.mark) },
    uBelly: { value: c(p.belly) },
    uMuzzle: { value: c(p.muzzle) },
    uLine: { value: c(p.line) },
    uMarkAmt: { value: coat === "grey" ? 0.12 : coat === "ginger" ? 0.5 : 0.7 },
    uFurLen: { value: 0.0068 },
    uDensity: { value: 10.5 },
  };
}

/**
 * One layer of fur: `shell` 0 is the skin (opaque, the coat's colour, a bit
 * dark as if seen between the hairs), up to 1 for the tips.
 */
export function furMaterial(shared: FurUniforms, shell: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, envMapIntensity: 0.7 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, { uShell: { value: shell } });
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec3 aRest;
        attribute vec3 aComb;
        attribute float aFur;
        attribute float aRegion;
        uniform float uShell;
        uniform float uFurLen;
        varying vec3 vRest;
        varying vec3 vNrest;
        varying float vRegion;`,
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
        float len = uFurLen * aFur;
        // out along the skin, then combed back and settling under its own weight
        transformed += normal * (uShell * len) + aComb * (uShell * uShell * len * 0.9);
        transformed.y -= uShell * uShell * len * 0.25;
        vRest = aRest;
        vNrest = normal;
        vRegion = aRegion;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uShell;
        uniform float uDensity;
        ${COMMON}`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `vec4 diffuseColor = vec4(coatColor(vRest, normalize(vNrest), vRegion), opacity);
        if (uShell > 0.0) {
          // each hair is a column through all the layers; taller layers keep fewer of them
          float hair = vnoise(vRest * uDensity) * 0.7 + vnoise(vRest * uDensity * 2.7) * 0.3;
          if (hair < 0.12 + uShell * 0.74) discard;
        }
        // light reaches the tips; the roots sit in the shade of the coat
        diffuseColor.rgb *= mix(0.62, 1.06, pow(uShell, 0.8));`,
      );
  };
  m.customProgramCacheKey = () => "ember-cat-fur";
  return m;
}

/**
 * The eye: an iris with fine radial fibres and a darker rim, a pupil that is
 * a slit in the light and opens wide when hunting, a glossy cornea on top.
 */
export function eyeMaterial(coat: CoatId): { material: THREE.MeshPhysicalMaterial; dilate: THREE.IUniform } {
  const p = PALETTES[coat];
  const dilate: THREE.IUniform = { value: 0.3 };
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDilate = dilate;
    sh.uniforms.uIrisIn = { value: new THREE.Color(p.irisIn) };
    sh.uniforms.uIrisOut = { value: new THREE.Color(p.iris) };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vEye;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvEye = normalize(position);");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vEye;
        uniform float uDilate;
        uniform vec3 uIrisIn, uIrisOut;`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `vec2 q = vEye.xy;
        float r = length(q);
        float a = atan(q.y, q.x);
        float irisR = 0.84;
        vec3 col = vec3(0.86, 0.8, 0.66);
        if (vEye.z > 0.0 && r < irisR) {
          float t = r / irisR;
          vec3 iris = mix(uIrisIn, uIrisOut, smoothstep(0.15, 0.95, t));
          iris *= 0.86 + 0.14 * sin(a * 37.0 + sin(a * 9.0) * 2.0);
          iris *= mix(1.0, 0.42, smoothstep(0.78, 1.0, t));
          col = iris;
          float pw = mix(0.07, 0.6, uDilate) * irisR;
          float ph = mix(0.78, 0.72, uDilate) * irisR;
          float e = (q.x * q.x) / (pw * pw) + (q.y * q.y) / (ph * ph);
          col = mix(vec3(0.008), col, smoothstep(0.8, 1.05, e));
        }
        vec4 diffuseColor = vec4(col, opacity);`,
      );
  };
  m.customProgramCacheKey = () => "ember-cat-eye";
  return { material: m, dilate };
}
