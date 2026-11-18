/**
 * The cat's body, as anatomy rather than as a stack of balls.
 *
 * The shape is a signed distance field: ellipsoids and rounded cones placed
 * where a cat's chest, ribs, loins, hips, shoulders, legs, head and tail are,
 * melted into one another with smooth unions (and the eye sockets pressed in
 * with a smooth subtraction). The field is sampled on a grid, turned into a
 * single closed mesh (surface nets), the vertices are pulled onto the exact
 * surface, and every vertex is bound to the skeleton by how close it is to
 * each part — so a knee bends like a knee and the belly follows the ribs.
 *
 * Measurements are a real domestic cat's, in centimetres (shoulder ~25 cm,
 * nose to rump ~47 cm, tail ~29 cm), scaled into scene units by CM.
 *
 * Plain arithmetic, no three.js: it runs in a web worker (anatomy.worker.ts),
 * off the main thread, once per page load; catGeometry.ts turns the arrays
 * into a geometry.
 */

/** centimetres → scene units */
export const CM = 1 / 60;

export type V3 = readonly [number, number, number];

export interface BoneDef {
  name: string;
  parent: string | null;
  /** rest position, in centimetres, cat space (+z forward, y up, floor at 0) */
  at: V3;
}

export const TAIL_BONES = 10;
const TAIL_STEP = 2.9;

const sideName = (s: number, n: string) => `${n}${s > 0 ? "L" : "R"}`;

export const BONES: BoneDef[] = (() => {
  const b: BoneDef[] = [
    { name: "root", parent: null, at: [0, 0, 0] },
    { name: "pelvis", parent: "root", at: [0, 23.5, -14] },
    { name: "spine1", parent: "pelvis", at: [0, 25, -5] },
    { name: "spine2", parent: "spine1", at: [0, 25, 3.5] },
    { name: "chest", parent: "spine2", at: [0, 24.5, 10.5] },
    { name: "neck", parent: "chest", at: [0, 24, 15] },
    { name: "head", parent: "neck", at: [0, 29.5, 19.5] },
    { name: "jaw", parent: "head", at: [0, 29.3, 21.8] },
  ];
  for (const s of [1, -1]) {
    b.push(
      { name: sideName(s, "scapula"), parent: "chest", at: [4.0 * s, 23.5, 11] },
      { name: sideName(s, "upperArm"), parent: sideName(s, "scapula"), at: [5.0 * s, 18, 13.4] },
      { name: sideName(s, "forearm"), parent: sideName(s, "upperArm"), at: [5.0 * s, 12.5, 10.2] },
      { name: sideName(s, "paw"), parent: sideName(s, "forearm"), at: [4.8 * s, 3.2, 12.4] },
      { name: sideName(s, "thigh"), parent: "pelvis", at: [5.0 * s, 21, -13.5] },
      { name: sideName(s, "shin"), parent: sideName(s, "thigh"), at: [5.5 * s, 12.5, -9.8] },
      { name: sideName(s, "foot"), parent: sideName(s, "shin"), at: [5.2 * s, 7.0, -18.6] },
      { name: sideName(s, "toes"), parent: sideName(s, "foot"), at: [5.0 * s, 1.6, -14.8] },
    );
  }
  for (let i = 0; i < TAIL_BONES; i++) {
    b.push({ name: `tail${i}`, parent: i ? `tail${i - 1}` : "pelvis", at: [0, 23.6, -18.6 - i * TAIL_STEP] });
  }
  return b;
})();

export const BONE_INDEX: Record<string, number> = Object.fromEntries(BONES.map((b, i) => [b.name, i]));

/** what part of the cat a vertex belongs to, for the fur pattern */
export const REGION = { body: 0, head: 1, leg: 2, tail: 3, muzzle: 4 } as const;

interface Ell {
  kind: "ell";
  c: V3;
  r: V3;
  /** tilt about the x axis, radians (positive: front end down) */
  rx?: number;
}
interface Cone {
  kind: "cone";
  a: V3;
  b: V3;
  ra: number;
  rb: number;
}
type Shape = (Ell | Cone) & {
  bone: string;
  /** blend radius into what came before, cm */
  k: number;
  sub?: boolean;
  region: number;
  /** fur length factor */
  fur: number;
};

const ell = (c: V3, r: V3, bone: string, k: number, region: number, fur: number, rx?: number): Shape =>
  ({ kind: "ell", c, r, rx, bone, k, region, fur });
const cone = (a: V3, b: V3, ra: number, rb: number, bone: string, k: number, region: number, fur: number): Shape =>
  ({ kind: "cone", a, b, ra, rb, bone, k, region, fur });

const { body: B, head: H, leg: LG, tail: T, muzzle: M } = REGION;

export const SHAPES: Shape[] = (() => {
  const s: Shape[] = [
    // trunk: chest deeper than the waist, a rounded rump
    ell([0, 20.0, 7.5], [5.9, 7.4, 8.0], "chest", 3, B, 1),
    ell([0, 19.5, 0.5], [6.3, 7.1, 7.5], "spine2", 3, B, 1),
    ell([0, 21.0, -6.5], [5.3, 5.7, 7.0], "spine1", 3, B, 1),
    ell([0, 21.3, -13], [5.6, 6.0, 6.3], "pelvis", 3, B, 1),
    ell([0, 21.0, -17.3], [4.6, 4.8, 3.2], "pelvis", 2, B, 1),
    ell([0, 15.8, -2.5], [4.9, 3.6, 7.5], "spine1", 3, B, 1.2),
    ell([0, 16.8, 12.0], [4.0, 4.6, 3.6], "chest", 2.5, B, 1.2),
    ell([3.3, 22.5, 10.2], [2.4, 4.3, 4.0], "scapulaL", 2, B, 1),
    ell([-3.3, 22.5, 10.2], [2.4, 4.3, 4.0], "scapulaR", 2, B, 1),
    // neck, with a little ruff underneath
    cone([0, 22.5, 12.8], [0, 28.5, 18.8], 4.3, 3.5, "neck", 2.5, B, 1.1),
    ell([0, 22.2, 16.0], [3.4, 3.2, 3.4], "neck", 2.2, B, 1.2),
    // head: round skull, wide cheeks, a short muzzle with whisker pads
    ell([0, 32.0, 21.0], [4.2, 3.7, 4.4], "head", 1.4, H, 0.6),
    ell([0, 30.4, 22.6], [4.9, 3.1, 3.3], "head", 1.4, H, 0.7),
    ell([0, 29.5, 25.6], [2.4, 1.8, 2.0], "head", 1.0, M, 0.35),
    ell([1.0, 29.2, 26.75], [1.2, 1.0, 1.05], "head", 0.6, M, 0.4),
    ell([-1.0, 29.2, 26.75], [1.2, 1.0, 1.05], "head", 0.6, M, 0.4),
    cone([0, 32.0, 24.2], [0, 30.7, 27.0], 1.3, 0.78, "head", 0.9, H, 0.45),
    ell([1.9, 32.9, 24.4], [1.35, 0.9, 1.1], "head", 0.8, H, 0.5),
    ell([-1.9, 32.9, 24.4], [1.35, 0.9, 1.1], "head", 0.8, H, 0.5),
    ell([0, 28.15, 25.6], [1.25, 0.85, 1.35], "jaw", 0.8, M, 0.4),
    // eye sockets, pressed in
    { ...ell([1.8, 31.7, 25.5], [1.15, 1.0, 1.0], "head", 0.6, H, 0.5), sub: true },
    { ...ell([-1.8, 31.7, 25.5], [1.15, 1.0, 1.0], "head", 0.6, H, 0.5), sub: true },
  ];
  for (const x of [1, -1]) {
    const n = (b: string) => sideName(x, b);
    s.push(
      // front leg: muscled upper arm, slim forearm, round paw
      cone([5.0 * x, 18.3, 13.2], [5.0 * x, 12.7, 10.3], 3.0, 2.0, n("upperArm"), 2.4, LG, 0.8),
      cone([5.0 * x, 12.4, 10.3], [4.85 * x, 3.6, 12.3], 1.85, 1.25, n("forearm"), 1.2, LG, 0.6),
      ell([4.8 * x, 1.3, 13.7], [1.55, 1.25, 2.05], n("paw"), 1.0, LG, 0.5),
      // hind leg: a big thigh, the shin back to the hock, then down to the paw
      ell([5.0 * x, 16.5, -11.8], [3.0, 6.2, 4.7], n("thigh"), 3, LG, 1, 0.35),
      cone([5.5 * x, 12.6, -10.0], [5.2 * x, 7.1, -18.3], 2.3, 1.35, n("shin"), 1.5, LG, 0.8),
      cone([5.2 * x, 7.0, -18.6], [5.0 * x, 2.0, -15.0], 1.25, 1.1, n("foot"), 0.8, LG, 0.55),
      ell([5.0 * x, 1.3, -13.8], [1.55, 1.25, 2.2], n("toes"), 1.0, LG, 0.5),
    );
  }
  // tail: tapering, blended into the rump at the root
  for (let i = 0; i < TAIL_BONES; i++) {
    const z0 = -18.6 - i * TAIL_STEP;
    const z1 = i === TAIL_BONES - 1 ? z0 - TAIL_STEP * 0.8 : z0 - TAIL_STEP;
    const r0 = 1.45 - (i / TAIL_BONES) * 0.6;
    const r1 = 1.45 - ((i + 1) / TAIL_BONES) * 0.6;
    s.push(cone([0, 23.6, z0], [0, 23.6, z1], r0, r1, `tail${i}`, i ? 0.5 : 2, T, 1.3));
  }
  return s;
})();

/* ---- distance functions (Inigo Quilez's, in centimetres) ------------------ */

function sdEllipsoid(px: number, py: number, pz: number, s: Ell) {
  const x = px - s.c[0];
  let y = py - s.c[1], z = pz - s.c[2];
  if (s.rx) {
    const c = Math.cos(-s.rx), n = Math.sin(-s.rx);
    const y2 = y * c - z * n;
    z = y * n + z * c;
    y = y2;
  }
  const [rx, ry, rz] = s.r;
  const ax = x / rx, ay = y / ry, az = z / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx, by = ay / ry, bz = az / rz;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

function sdRoundCone(px: number, py: number, pz: number, s: Cone) {
  const [ax, ay, az] = s.a;
  const bax = s.b[0] - ax, bay = s.b[1] - ay, baz = s.b[2] - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = s.ra - s.rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - s.rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - s.ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - s.ra;
}

const shapeDistance = (s: Shape, x: number, y: number, z: number) =>
  s.kind === "ell" ? sdEllipsoid(x, y, z, s) : sdRoundCone(x, y, z, s);

/** polynomial smooth minimum */
function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

function bounds(s: Shape, pad: number): Box {
  if (s.kind === "ell") {
    const r = Math.max(...s.r) + pad;
    return { min: [s.c[0] - r, s.c[1] - r, s.c[2] - r], max: [s.c[0] + r, s.c[1] + r, s.c[2] + r] };
  }
  const r = Math.max(s.ra, s.rb) + pad;
  return {
    min: [Math.min(s.a[0], s.b[0]) - r, Math.min(s.a[1], s.b[1]) - r, Math.min(s.a[2], s.b[2]) - r],
    max: [Math.max(s.a[0], s.b[0]) + r, Math.max(s.a[1], s.b[1]) + r, Math.max(s.a[2], s.b[2]) + r],
  };
}

const BOXES = SHAPES.map((s) => bounds(s, s.k + 1));
/** the same boxes, flat, for the hot loops: min x y z, max x y z */
const FLAT = new Float64Array(SHAPES.length * 6);
BOXES.forEach((b, i) => FLAT.set([...b.min, ...b.max], i * 6));
/** wider boxes for skin weights, which look further than the blend */
const WFLAT = new Float64Array(SHAPES.length * 6);
SHAPES.forEach((s, i) => {
  const b = bounds(s, 4.5);
  WFLAT.set([...b.min, ...b.max], i * 6);
});
const inFlat = (f: Float64Array, i: number, x: number, y: number, z: number) => {
  const o = i * 6;
  return x >= f[o] && x <= f[o + 3] && y >= f[o + 1] && y <= f[o + 4] && z >= f[o + 2] && z <= f[o + 5];
};

/** the whole cat's distance field at a point (cm) */
export function catSdf(x: number, y: number, z: number): number {
  let d = 1e9;
  for (let i = 0; i < SHAPES.length; i++) {
    if (!inFlat(FLAT, i, x, y, z)) continue;
    const s = SHAPES[i];
    const di = shapeDistance(s, x, y, z);
    d = s.sub ? -smin(-d, di, s.k) : smin(d, di, s.k);
  }
  return d;
}

/* ---- meshing --------------------------------------------------------------- */

const GRID = { min: [-9.5, -0.6, -50] as const, max: [9.5, 39.5, 30.5] as const };

/** the cut-off between a hair's root shade and the bone weights' blend, cm */
const WEIGHT_SOFTNESS = 1.0;

/** which way the fur lies, per bone (rest space, before projecting onto the skin) */
function combFor(bone: string): V3 {
  if (bone === "head") return [0, 0.15, -1];
  if (bone === "jaw") return [0, -0.6, -0.5];
  if (bone === "neck") return [0, -0.5, -1];
  if (bone.startsWith("tail")) return [0, 0, -1];
  if (/^(upperArm|forearm|paw|thigh|shin|foot|toes)/.test(bone)) return [0, -1, 0.05];
  return [0, -0.3, -1];
}

/** the body as typed arrays: positions in scene units, `rest` in centimetres */
export interface CatArrays {
  position: Float32Array;
  normal: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  rest: Float32Array;
  comb: Float32Array;
  fur: Float32Array;
  region: Float32Array;
  index: Uint32Array;
  /** milliseconds it took */
  ms: number;
}

export function buildCatArrays(h = 0.45): CatArrays {
  const t0 = performance.now();
  const [x0, y0, z0] = GRID.min;
  const nx = Math.ceil((GRID.max[0] - x0) / h) + 1;
  const ny = Math.ceil((GRID.max[1] - y0) / h) + 1;
  const nz = Math.ceil((GRID.max[2] - z0) / h) + 1;
  const field = new Float32Array(nx * ny * nz).fill(1e9);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);

  // each shape writes only into the part of the grid it can affect
  for (let si = 0; si < SHAPES.length; si++) {
    const s = SHAPES[si];
    const b = BOXES[si];
    const i0 = Math.max(0, Math.floor((b.min[0] - x0) / h)), i1 = Math.min(nx - 1, Math.ceil((b.max[0] - x0) / h));
    const j0 = Math.max(0, Math.floor((b.min[1] - y0) / h)), j1 = Math.min(ny - 1, Math.ceil((b.max[1] - y0) / h));
    const k0 = Math.max(0, Math.floor((b.min[2] - z0) / h)), k1 = Math.min(nz - 1, Math.ceil((b.max[2] - z0) / h));
    for (let k = k0; k <= k1; k++) {
      const z = z0 + k * h;
      for (let j = j0; j <= j1; j++) {
        const y = y0 + j * h;
        let p = at(i0, j, k);
        for (let i = i0; i <= i1; i++, p++) {
          const di = shapeDistance(s, x0 + i * h, y, z);
          const d = field[p];
          field[p] = s.sub ? -smin(-d, di, s.k) : smin(d, di, s.k);
        }
      }
    }
  }

  // surface nets: one vertex per cell the surface passes through
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const pos: number[] = [];
  const corner = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float32Array(8);
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const val = field[at(i + corner[c][0], j + corner[c][1], k + corner[c][2])];
          v[c] = val;
          if (val < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of edges) {
          if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t;
          sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t;
          sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t;
          n++;
        }
        cellVert[i + cx * (j + cy * k)] = pos.length / 3;
        pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
      }
    }
  }

  // one quad per grid edge that crosses the surface
  const idx: number[] = [];
  const cell = (i: number, j: number, k: number) => cellVert[i + cx * (j + cy * k)];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < cz; k++) {
    for (let j = 1; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        const inside = field[at(i, j, k)] < 0;
        if (inside === field[at(i + 1, j, k)] < 0) continue;
        quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), inside);
      }
    }
  }
  for (let k = 1; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 1; i < cx; i++) {
        const inside = field[at(i, j, k)] < 0;
        if (inside === field[at(i, j + 1, k)] < 0) continue;
        quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), inside);
      }
    }
  }
  for (let k = 0; k < cz; k++) {
    for (let j = 1; j < cy; j++) {
      for (let i = 1; i < cx; i++) {
        const inside = field[at(i, j, k)] < 0;
        if (inside === field[at(i, j, k + 1)] < 0) continue;
        quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), inside);
      }
    }
  }

  // pull every vertex onto the exact surface, and take its normal from the field
  const count = pos.length / 3;
  const normals = new Float32Array(count * 3);
  const e = 0.03;
  for (let vi = 0; vi < count; vi++) {
    let x = pos[vi * 3], y = pos[vi * 3 + 1], z = pos[vi * 3 + 2];
    // one Newton step lands within a hair of the surface; its gradient is the normal
    const d = catSdf(x, y, z);
    const gx = catSdf(x + e, y, z) - catSdf(x - e, y, z);
    const gy = catSdf(x, y + e, z) - catSdf(x, y - e, z);
    const gz = catSdf(x, y, z + e) - catSdf(x, y, z - e);
    const gl = gx * gx + gy * gy + gz * gz;
    if (gl > 1e-12) {
      const f = (d * 2 * e) / gl;
      x -= gx * f;
      y -= gy * f;
      z -= gz * f;
    }
    pos[vi * 3] = x;
    pos[vi * 3 + 1] = y;
    pos[vi * 3 + 2] = z;
    const l = Math.sqrt(gl) || 1;
    normals[vi * 3] = gx / l;
    normals[vi * 3 + 1] = gy / l;
    normals[vi * 3 + 2] = gz / l;
  }

  // triangles face out: check each against the field's normal
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    const nx_ = normals[a * 3] + normals[b * 3] + normals[c * 3];
    const ny_ = normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1];
    const nz_ = normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2];
    if (fx * nx_ + fy * ny_ + fz * nz_ < 0) {
      idx[t + 1] = c;
      idx[t + 2] = b;
    }
  }

  // bind to the skeleton: each shape near a vertex pulls it toward its bone
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const comb = new Float32Array(count * 3);
  const fur = new Float32Array(count);
  const region = new Float32Array(count);
  const rest = new Float32Array(count * 3);
  const boneW = new Float32Array(BONES.length);
  const ds = new Float64Array(SHAPES.length);
  const combs = SHAPES.map((s) => combFor(s.bone));
  const boneOf = SHAPES.map((s) => BONE_INDEX[s.bone]);
  for (let vi = 0; vi < count; vi++) {
    const x = pos[vi * 3], y = pos[vi * 3 + 1], z = pos[vi * 3 + 2];
    boneW.fill(0);
    let best = 1e9;
    for (let si = 0; si < SHAPES.length; si++) {
      const s = SHAPES[si];
      const d = s.sub || !inFlat(WFLAT, si, x, y, z) ? 1e9 : shapeDistance(s, x, y, z);
      ds[si] = d;
      if (d < best) best = d;
    }
    let total = 0, furSum = 0, regionBest = 0, regionW = -1;
    let cx_ = 0, cy_ = 0, cz_ = 0;
    for (let si = 0; si < SHAPES.length; si++) {
      const d = ds[si];
      if (d > best + WEIGHT_SOFTNESS * 4) continue;
      const w = Math.exp(-(d - best) / WEIGHT_SOFTNESS);
      const s = SHAPES[si];
      boneW[boneOf[si]] += w;
      total += w;
      furSum += s.fur * w;
      if (w > regionW) {
        regionW = w;
        regionBest = s.region;
      }
      const c = combs[si];
      cx_ += c[0] * w;
      cy_ += c[1] * w;
      cz_ += c[2] * w;
    }
    // the four strongest bones, normalised
    const top: [number, number][] = [];
    for (let bi = 0; bi < boneW.length; bi++) if (boneW[bi] > 0) top.push([bi, boneW[bi]]);
    top.sort((a, b) => b[1] - a[1]);
    const four = top.slice(0, 4);
    const sum = four.reduce((acc, [, w]) => acc + w, 0) || 1;
    for (let q = 0; q < 4; q++) {
      skinIndex[vi * 4 + q] = four[q]?.[0] ?? 0;
      skinWeight[vi * 4 + q] = four[q] ? four[q][1] / sum : 0;
    }
    fur[vi] = furSum / (total || 1);
    region[vi] = regionBest;
    // fur lies along the skin
    const nX = normals[vi * 3], nY = normals[vi * 3 + 1], nZ = normals[vi * 3 + 2];
    const dot = cx_ * nX + cy_ * nY + cz_ * nZ;
    let tx = cx_ - nX * dot, ty = cy_ - nY * dot, tz = cz_ - nZ * dot;
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tl > 1e-6) {
      tx /= tl;
      ty /= tl;
      tz /= tl;
    } else {
      tx = 0;
      ty = 0;
      tz = 0;
    }
    comb[vi * 3] = tx;
    comb[vi * 3 + 1] = ty;
    comb[vi * 3 + 2] = tz;
    rest[vi * 3] = x;
    rest[vi * 3 + 1] = y;
    rest[vi * 3 + 2] = z;
  }

  const position = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) position[i] = pos[i] * CM;
  return {
    position, normal: normals, skinIndex, skinWeight, rest, comb, fur, region,
    index: Uint32Array.from(idx),
    ms: performance.now() - t0,
  };
}
