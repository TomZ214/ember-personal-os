import * as THREE from "three";
import type { CoatId } from "@/lib/pet";
import { bodyTexture, headTexture, shadowTexture } from "./coats";
import { PALETTES } from "./palettes";

/**
 * The cat, built from soft primitives and posed by numbers.
 *
 * Proportions are a kitten's: a big round head, wide-set eyes, a short
 * body, short legs. Every part is a sphere, capsule or cone with a
 * velvety (sheen) material, so it reads as plush rather than plastic.
 *
 * Space: the cat faces +Z, y is up, the floor is y = 0 at the root. The
 * root is placed and turned by the brain; everything else here.
 *
 *   root ── hip (pivot at the haunches: sitting pitches the body up round it)
 *            └ torso ── body, bib, haunches
 *                     ├ neck ── head ── ears, eyes, muzzle, nose, mouth, whiskers
 *                     └ four legs (pivot at shoulder / hip, paws stay on the floor)
 *       ── tail (a chain of spheres laid out in root space, so it can lie on the floor)
 *       ── shadow
 */

export const STAND_Y = 0.37;

/** smoothed pose amounts: mostly 0..1 blends, a few angle offsets */
export interface Pose {
  sit: number;
  loaf: number;
  curl: number;
  stretch: number;
  crouch: number;
  eat: number;
  groom: number;
  bat: number;
  leap: number;
  tailUp: number;
  tailWrap: number;
  tailSway: number;
  tailSpeed: number;
  earsBack: number;
  eyeOpen: number;
  happyEyes: number;
  mouth: number;
  purr: number;
  pupil: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  lookW: number;
}

export const restPose = (): Pose => ({
  sit: 0, loaf: 0, curl: 0, stretch: 0, crouch: 0, eat: 0, groom: 0, bat: 0, leap: 0,
  tailUp: 0.3, tailWrap: 0, tailSway: 0.25, tailSpeed: 1.4,
  earsBack: 0, eyeOpen: 1, happyEyes: 0, mouth: 0, purr: 0, pupil: 0.3,
  headPitch: 0, headYaw: 0, headRoll: 0, lookW: 1,
});

/** what changes every frame and is not smoothed */
export interface Frame {
  t: number;
  dt: number;
  /** gait phase in radians */
  phase: number;
  /** ground speed, units/s */
  speed: number;
  /** turning in place, rad/s */
  turn: number;
  /** height of a leap */
  lift: number;
  /** 0..1 hind-end wiggle before a pounce */
  wiggle: number;
  /** 0 paw raised … 1 paw swiped down */
  swipe: number;
  /** where to look, in root space, or null */
  look: THREE.Vector3 | null;
  /** which side the tail wraps to: 1 or -1 */
  wrapSide: number;
}

interface Leg {
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  paw: THREE.Mesh;
  front: boolean;
  /** +1 on the cat's left (+x), -1 on its right */
  side: number;
  len: number;
  /** pivot → bottom of the paw, at scale 1 */
  reach: number;
  /** gait phase offset (trot) and when bounding */
  trot: number;
  bound: number;
}

interface Eye {
  group: THREE.Group;
  open: THREE.Group;
  closed: THREE.Mesh;
  pupil: THREE.Mesh;
  side: number;
}

const HEAD = new THREE.Vector3(0.235, 0.205, 0.2);
const TAIL_N = 22;
const TAIL_SEG = 0.031;
/** per-segment amounts were tuned for 12 segments; keep the shape when the count changes */
const PER = 12 / (TAIL_N - 1);

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const damp = THREE.MathUtils.damp;

/** a point on the head's ellipsoid surface, seen from the front, and its normal */
function onHead(x: number, y: number, sink = 0) {
  const z = HEAD.z * Math.sqrt(Math.max(0, 1 - (x / HEAD.x) ** 2 - (y / HEAD.y) ** 2));
  const n = new THREE.Vector3(x / HEAD.x ** 2, y / HEAD.y ** 2, z / HEAD.z ** 2).normalize();
  const p = new THREE.Vector3(x, y, z).addScaledVector(n, -sink);
  return { p, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n) };
}

export class CatRig {
  readonly root = new THREE.Group();
  readonly hip = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly neck = new THREE.Group();
  readonly head = new THREE.Group();
  /** every mesh you can stroke */
  readonly touchable: THREE.Object3D[] = [];

  private earL = new THREE.Group();
  private earR = new THREE.Group();
  private eyes: Eye[] = [];
  private mouthOpen!: THREE.Mesh;
  private tongue!: THREE.Mesh;
  private legs: Leg[] = [];
  private haunches: THREE.Mesh[] = [];
  private tail: THREE.Mesh[] = [];
  private tailRadius: number[] = [];
  private tailBase = new THREE.Object3D();
  private shadow!: THREE.Mesh;
  private disposables: { dispose(): void }[] = [];

  // little lives of their own
  private blinkAt = 1.5;
  private blinkLen = 0.14;
  private twitchAt = 3;
  private twitchSide = 1;
  private twitchStart = -10;
  private lookYaw = 0;
  private lookPitch = 0;

  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private inv = new THREE.Matrix4();

  constructor(coat: CoatId) {
    const p = PALETTES[coat];
    const keep = <T extends { dispose(): void }>(x: T) => (this.disposables.push(x), x);

    const sphere = keep(new THREE.SphereGeometry(1, 40, 28));
    const small = keep(new THREE.SphereGeometry(1, 18, 12));
    const bodyGeo = keep(new THREE.SphereGeometry(1, 40, 28));
    // poles along the spine, so the painted stripes run round the body
    bodyGeo.rotateX(Math.PI / 2);

    const furCache = new Map<string, THREE.Material>();
    const fur = (color: string) => {
      let m = furCache.get(color);
      if (!m) {
        m = keep(
          new THREE.MeshPhysicalMaterial({
            color, roughness: 0.88, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(p.sheen),
          }),
        );
        furCache.set(color, m);
      }
      return m;
    };
    const painted = (tex: THREE.Texture) =>
      keep(
        new THREE.MeshPhysicalMaterial({
          map: keep(tex), roughness: 0.88, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(p.sheen),
        }),
      );
    const flat = (color: string, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
      keep(new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, ...extra }));

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, s: [number, number, number], pos: [number, number, number] = [0, 0, 0], touch = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(...s);
      m.position.set(...pos);
      if (touch) this.touchable.push(m);
      return m;
    };

    /* ---- body ---- */
    this.root.add(this.hip);
    this.hip.add(this.torso);
    this.torso.position.set(0, 0, 0.17);
    this.torso.add(mesh(bodyGeo, painted(bodyTexture(coat)), [0.2, 0.19, 0.33], [0, 0, -0.03]));
    this.torso.add(mesh(sphere, fur(p.bib), [0.135, 0.15, 0.12], [0, -0.035, 0.2]));
    for (const side of [1, -1]) {
      const h = mesh(sphere, fur(p.base), [0.085, 0.13, 0.14], [side * 0.112, -0.05, -0.19]);
      this.haunches.push(h);
      this.torso.add(h);
    }

    /* ---- legs ---- */
    const legDefs = [
      { front: true, side: 1, at: [0.097, -0.07, 0.19], r: 0.056, len: 0.238, trot: 0, bound: 0, paw: p.paws[0] },
      { front: true, side: -1, at: [-0.097, -0.07, 0.19], r: 0.056, len: 0.238, trot: Math.PI, bound: 0.35, paw: p.paws[1] },
      { front: false, side: 1, at: [0.112, -0.09, -0.21], r: 0.058, len: 0.219, trot: Math.PI, bound: Math.PI, paw: p.paws[2] },
      { front: false, side: -1, at: [-0.112, -0.09, -0.21], r: 0.058, len: 0.219, trot: 0, bound: Math.PI + 0.35, paw: p.paws[3] },
    ] as const;
    for (const d of legDefs) {
      const geo = keep(new THREE.CapsuleGeometry(d.r, d.len, 6, 14));
      geo.translate(0, -d.len / 2, 0);
      const pivot = new THREE.Group();
      pivot.position.set(d.at[0], d.at[1], d.at[2]);
      // the leg is the paw's colour toward the bottom only in spirit: a
      // sock would need a second mesh, the paw carries the colour instead
      const legMesh = mesh(geo, fur(d.front ? p.base : p.base), [1, 1, 1]);
      const paw = mesh(sphere, fur(d.paw), [d.r * 1.18, d.r * 0.74, d.r * 1.42], [0, -(d.len + d.r * 0.3), d.r * 0.35]);
      pivot.add(legMesh, paw);
      this.torso.add(pivot);
      this.legs.push({
        pivot, mesh: legMesh, paw, front: d.front, side: d.side, len: d.len,
        reach: d.len + d.r * 0.3 + d.r * 0.74, trot: d.trot, bound: d.bound,
      });
    }

    /* ---- head ---- */
    this.neck.position.set(0, 0.11, 0.22);
    this.neck.rotation.order = "YXZ";
    this.torso.add(this.neck);
    this.head.position.set(0, 0.12, 0.08);
    this.neck.add(this.head);
    this.head.add(mesh(sphere, painted(headTexture(coat)), [HEAD.x, HEAD.y, HEAD.z]));
    // cheeks: a little fluff at the jaw line widens the face
    for (const side of [1, -1]) {
      this.head.add(mesh(sphere, fur(p.base), [0.07, 0.062, 0.075], [side * 0.142, -0.075, 0.05]));
    }

    // muzzle, chin, nose
    for (const side of [1, -1]) this.head.add(mesh(sphere, fur(p.muzzle), [0.052, 0.046, 0.05], [side * 0.036, -0.07, 0.165]));
    this.head.add(mesh(sphere, fur(p.muzzle), [0.036, 0.03, 0.034], [0, -0.112, 0.15]));
    const nose = mesh(sphere, flat(p.nose, { roughness: 0.35, clearcoat: 0.6 }), [0.026, 0.017, 0.016], [0, -0.032, 0.206]);
    nose.rotation.x = 0.25;
    this.head.add(nose);

    // the mouth: ω when closed, a small open mouth beneath it for meows
    const lineMat = flat(p.line, { roughness: 0.5 });
    const arc = keep(new THREE.TorusGeometry(0.016, 0.0042, 6, 16, Math.PI));
    for (const side of [1, -1]) {
      const a = new THREE.Mesh(arc, lineMat);
      a.position.set(side * 0.016, -0.08, 0.211);
      a.rotation.z = Math.PI; // ∪
      this.head.add(a);
    }
    this.mouthOpen = new THREE.Mesh(sphere, flat("#5b2c35", { roughness: 0.7 }));
    this.mouthOpen.position.set(0, -0.1, 0.196);
    this.mouthOpen.scale.set(0.03, 0.0001, 0.02);
    this.tongue = new THREE.Mesh(sphere, flat("#f08b9b", { roughness: 0.45 }));
    this.tongue.position.set(0, -0.11, 0.203);
    this.tongue.scale.set(0.019, 0.0001, 0.012);
    this.head.add(this.mouthOpen, this.tongue);

    // whiskers
    const whiskerGeo = keep(new THREE.CylinderGeometry(0.0022, 0.0009, 0.21, 4));
    const whiskerMat = keep(new THREE.MeshBasicMaterial({ color: p.whisker, transparent: true, opacity: 0.85 }));
    for (const side of [1, -1]) {
      for (const [dy, dz] of [[0.13, 0.22], [0, 0.16], [-0.12, 0.2]]) {
        const dir = new THREE.Vector3(side, dy, dz).normalize();
        const w = new THREE.Mesh(whiskerGeo, whiskerMat);
        w.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        w.position.set(side * 0.07, -0.078, 0.18).addScaledVector(dir, 0.105);
        this.head.add(w);
      }
    }

    // eyes: a dark rim, the iris, a pupil that widens when hunting, two glints
    const irisMat = flat(p.iris, { roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
    const pupilMat = flat("#0d0b10", { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
    const rimMat = flat(p.line === "#9a8a84" ? "#6b5d58" : "#1a1519", { roughness: 0.4 });
    const glint = keep(new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    const closedGeo = keep(new THREE.TorusGeometry(0.04, 0.0072, 6, 18, Math.PI));
    for (const side of [1, -1]) {
      const { p: at, q } = onHead(side * 0.088, 0.008, 0.014);
      const group = new THREE.Group();
      group.position.copy(at);
      group.quaternion.copy(q);
      const open = new THREE.Group();
      open.add(mesh(sphere, rimMat, [0.056, 0.064, 0.022], [0, 0, -0.004], false));
      open.add(mesh(sphere, irisMat, [0.05, 0.058, 0.026], [0, 0, 0], false));
      const pupil = mesh(sphere, pupilMat, [0.022, 0.045, 0.014], [0, 0, 0.016], false);
      open.add(pupil);
      open.add(mesh(small, glint, [0.013, 0.013, 0.006], [side * 0.016 + 0.004, 0.022, 0.027], false));
      open.add(mesh(small, glint, [0.0065, 0.0065, 0.004], [-side * 0.012, -0.018, 0.027], false));
      const closed = new THREE.Mesh(closedGeo, lineMat);
      closed.scale.set(1, 0.55, 1);
      closed.position.z = 0.012;
      closed.visible = false;
      group.add(open, closed);
      this.head.add(group);
      this.eyes.push({ group, open, closed, pupil, side });
    }

    // ears
    const earGeo = keep(new THREE.ConeGeometry(0.098, 0.15, 20));
    earGeo.translate(0, 0.075, 0);
    const innerGeo = keep(new THREE.ConeGeometry(0.066, 0.108, 16));
    innerGeo.translate(0, 0.054, 0);
    for (const [ear, side] of [[this.earL, 1], [this.earR, -1]] as const) {
      ear.position.set(side * 0.122, 0.13, 0.04);
      const outer = mesh(earGeo, fur(coat === "calico" ? (side > 0 ? p.mark : p.mark2!) : p.base), [1, 1, 0.48]);
      const inner = mesh(innerGeo, fur(p.innerEar), [1, 1, 0.36], [0, 0.01, 0.026]);
      ear.add(outer, inner);
      this.head.add(ear);
    }

    /* ---- tail ---- */
    this.tailBase.position.set(0, 0.06, -0.34);
    this.torso.add(this.tailBase);
    for (let i = 0; i < TAIL_N; i++) {
      const k = i / (TAIL_N - 1);
      const r = mix(0.05, 0.031, k * k) * (i === TAIL_N - 1 ? 0.92 : 1);
      let color = p.base;
      if (p.ringed && Math.floor(i / 2) % 2 === 1) color = p.mark;
      if (i >= TAIL_N - 3) color = p.tip;
      const seg = mesh(sphere, fur(color), [r, r, r]);
      this.tail.push(seg);
      this.tailRadius.push(r);
      this.root.add(seg);
    }

    /* ---- shadow ---- */
    const shadowMat = keep(
      new THREE.MeshBasicMaterial({ map: keep(shadowTexture()), transparent: true, depthWrite: false, opacity: 0.55 }),
    );
    const plane = keep(new THREE.PlaneGeometry(1, 1));
    this.shadow = new THREE.Mesh(plane, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.002;
    this.shadow.renderOrder = -1;
    this.root.add(this.shadow);
  }

  /** the head's position in world space */
  headWorld(out: THREE.Vector3) {
    return this.head.getWorldPosition(out);
  }

  apply(P: Pose, f: Frame) {
    const { t, dt } = f;

    /* ---- the body ---- */
    const walk = clamp01(f.speed / 0.45);
    const run = clamp01((f.speed - 0.85) / 0.6);
    const breath = Math.sin(t * mix(2.5, 1.3, Math.max(P.curl, P.loaf * 0.6)));
    const bob = Math.abs(Math.sin(f.phase)) * 0.016 * walk * (1 - run * 0.4);
    const lying = Math.max(P.loaf, P.curl);

    const hipY =
      STAND_Y - P.sit * 0.2 - P.loaf * 0.18 - P.curl * 0.205 - P.crouch * 0.13 + P.stretch * 0.035 - P.eat * 0.02 + f.lift + bob;
    const pitch =
      P.sit * -0.62 + P.stretch * 0.42 + P.eat * 0.2 + P.crouch * 0.06 - P.leap * 0.18 + Math.sin(f.phase) * 0.1 * run;
    this.hip.position.set(Math.sin(t * 157) * 0.0012 * P.purr, hipY, -0.17);
    this.hip.rotation.set(pitch, Math.sin(t * 17) * 0.11 * f.wiggle, P.curl * 0.22);
    this.torso.scale.set(
      1 + P.curl * 0.1 + breath * 0.006,
      1 - P.curl * 0.08 + breath * 0.014,
      1 - P.curl * 0.2,
    );
    for (const h of this.haunches) h.scale.y = 0.13 * (1 + P.sit * 0.1);

    // where everything is now, before the legs reach for the floor
    this.root.updateMatrixWorld(true);
    this.inv.copy(this.root.matrixWorld).invert();

    /* ---- legs ---- */
    const amp = 0.42 * walk + 0.25 * run;
    for (const leg of this.legs) {
      const ph = f.phase + mix(leg.trot, leg.bound, run);
      const swing = Math.sin(ph) * amp + Math.sin(f.t * 9 + leg.trot) * 0.08 * clamp01(Math.abs(f.turn) / 2) * (1 - walk);
      // the swinging leg lifts off the ground on its way forward
      const lift = Math.max(0, -Math.cos(ph)) * 0.05 * walk;
      const isRight = leg.side < 0;
      let world: number;
      let roll = 0;
      let plant = 1;
      if (leg.front) {
        world = -swing + P.stretch * -1.05 + P.loaf * -1.32 + P.curl * -1.3 + P.leap * -0.95 + P.crouch * -0.3 + P.eat * -0.12;
        plant -= lying + P.leap + P.stretch * 0.6;
        if (isRight) {
          // grooming: the paw comes up to the mouth and back, a lick at a time
          const g = P.groom;
          world = mix(world, -2.05 + Math.sin(t * 8.5) * 0.12, g);
          roll += 0.3 * g;
          // batting the ball: up, then a quick swipe down and forward
          world = mix(world, mix(-2.1, -0.75, f.swipe), P.bat);
          plant -= g + P.bat;
        }
      } else {
        world = swing + P.sit * -1.42 + P.loaf * -1.4 + P.curl * -1.35 + P.leap * 0.85 + P.stretch * 0.32 + P.crouch * -0.35;
        plant -= lying + P.sit + P.leap;
      }
      const tilt = this.hip.rotation.x;
      leg.pivot.rotation.set(world - tilt, 0, roll * (isRight ? 1 : -1) - P.curl * 0.2 * leg.side);

      // paw planting: stretch or shorten a touch so the paw meets the floor
      leg.pivot.getWorldPosition(this.tmp).applyMatrix4(this.inv);
      const cos = Math.cos(world);
      const need = (this.tmp.y - lift) / Math.max(0.2, leg.reach * cos);
      const s = mix(1, Math.min(1.28, Math.max(0.78, need)), clamp01(plant));
      leg.mesh.scale.y = s;
      leg.paw.position.y = -(leg.reach - leg.paw.scale.y) * s;
      // sinking into a loaf, the legs fold away under the body
      const fold = 1 - lying * 0.35;
      leg.pivot.scale.set(1, fold, 1);
    }

    /* ---- head ---- */
    const torsoTilt = this.hip.rotation.x;
    let yawT = 0;
    let pitchT = 0;
    if (f.look && P.lookW > 0.01) {
      this.head.getWorldPosition(this.tmp).applyMatrix4(this.inv);
      this.tmp2.copy(f.look).sub(this.tmp);
      yawT = Math.atan2(this.tmp2.x, this.tmp2.z);
      pitchT = Math.atan2(-this.tmp2.y, Math.hypot(this.tmp2.x, this.tmp2.z));
      // something behind the cat: turn as far as a neck turns, no further
      yawT = Math.max(-1.05, Math.min(1.05, yawT));
      pitchT = Math.max(-0.55, Math.min(0.6, pitchT));
    }
    this.lookYaw = damp(this.lookYaw, yawT * P.lookW, 7, dt);
    this.lookPitch = damp(this.lookPitch, pitchT * P.lookW, 7, dt);

    const chew = P.eat * Math.max(0, Math.sin(t * 11)) * 0.09;
    const lick = P.groom * Math.sin(t * 8.5) * 0.08;
    this.neck.position.set(0, 0.11 - P.curl * 0.12 - P.eat * 0.05 - P.stretch * 0.04, 0.22 + P.eat * 0.03 - P.curl * 0.03);
    this.neck.rotation.set(
      -torsoTilt * 0.88 + this.lookPitch + P.headPitch + P.eat * 0.95 + P.groom * 0.2 + P.curl * 0.62 + P.loaf * 0.05 - P.stretch * 0.5 + chew + lick,
      this.lookYaw + P.headYaw + P.curl * 1.15 + P.groom * -0.45,
      P.headRoll + P.curl * 0.5 + P.purr * 0.14 * Math.sin(t * 0.9),
    );

    /* ---- face ---- */
    // blinks: quick ones at random, and the slow "I trust you" blink on request
    if (t > this.blinkAt) {
      this.blinkStart = t;
      this.blinkLen = this.slow ? 0.75 : 0.13;
      this.slow = false;
      this.blinkAt = t + 2 + Math.random() * 4.5;
    }
    const bu = (t - this.blinkStart) / this.blinkLen;
    const lastBlink = bu >= 0 && bu <= 1 ? Math.sin(bu * Math.PI) : 0;
    const open = P.eyeOpen * (1 - lastBlink);
    for (const e of this.eyes) {
      const shut = open < 0.16;
      e.open.visible = !shut;
      e.closed.visible = shut;
      e.open.scale.y = Math.max(0.12, open);
      // happy ∩, sleepy ∪
      e.closed.rotation.z = P.happyEyes > 0.5 ? 0 : Math.PI;
      e.closed.position.y = P.happyEyes > 0.5 ? -0.012 : 0.006;
      // pupils: wide when hunting, and following the gaze a little
      e.pupil.scale.x = mix(0.016, 0.034, P.pupil);
      e.pupil.position.x = Math.max(-0.012, Math.min(0.012, this.lookYaw * 0.014));
      e.pupil.position.y = Math.max(-0.01, Math.min(0.01, -this.lookPitch * 0.014));
    }
    const m = clamp01(P.mouth);
    this.mouthOpen.scale.y = Math.max(0.0001, 0.03 * m);
    this.tongue.scale.y = Math.max(0.0001, 0.011 * m);
    this.mouthOpen.visible = this.tongue.visible = m > 0.03;

    // ears: back when low, an idle twitch now and then
    if (t > this.twitchAt) {
      this.twitchStart = t;
      this.twitchSide = Math.random() < 0.5 ? 1 : -1;
      this.twitchAt = t + 3 + Math.random() * 6;
    }
    const tw = t - this.twitchStart < 0.5 ? Math.sin(((t - this.twitchStart) / 0.5) * Math.PI * 3) * Math.exp(-(t - this.twitchStart) * 5) : 0;
    const back = clamp01(P.earsBack + P.curl * 0.25);
    for (const [ear, side] of [[this.earL, 1], [this.earR, -1]] as const) {
      const twitch = side === this.twitchSide ? tw * 0.5 : 0;
      ear.rotation.set(0.16 - back * 0.6 + twitch * 0.4, side * back * 0.35, -side * (0.34 + back * 0.55) + twitch * side * 0.2);
    }

    /* ---- tail ---- */
    this.tailBase.getWorldPosition(this.tmp).applyMatrix4(this.inv);
    let px = this.tmp.x, py = this.tmp.y, pz = this.tmp.z;
    const up = P.tailUp;
    const wrap = clamp01(P.tailWrap);
    let pitchA = mix(mix(-0.7, 1.12, clamp01(up)), -0.75, wrap) + Math.min(0, up) * 0.6;
    let yawA = 0;
    const upness = clamp01(up);
    for (let i = 0; i < TAIL_N; i++) {
      const k = i / (TAIL_N - 1);
      // a wave travelling down the tail; the tip moves most
      const wave = Math.sin(t * P.tailSpeed - k * 5) * P.tailSway * (0.25 + k * 0.9);
      if (i > 0) {
        // low: a J that sweeps out and curls up; up: straight, the tip hooks over
        pitchA += mix(0.1, k > 0.62 ? 0.34 : 0.02, upness) * (1 - wrap) * PER;
        // wrapped: lie down along the floor and curl round the paws
        pitchA = mix(pitchA, -0.05, wrap * 0.35 * PER);
        // never a straight stick: always a little curve to one side
        yawA += f.wrapSide * (0.24 * wrap + 0.07 * (1 - wrap) * (1 - upness * 0.25)) * PER + wave * 0.16 * PER;
      }
      const yaw = yawA + wave * 0.3;
      const cp = Math.cos(pitchA);
      const seg = this.tail[i];
      const r = this.tailRadius[i];
      px += Math.sin(yaw) * cp * (i ? TAIL_SEG : 0);
      py += Math.sin(pitchA) * (i ? TAIL_SEG : 0);
      pz += -Math.cos(yaw) * cp * (i ? TAIL_SEG : 0);
      if (py < r) py = r;
      seg.position.set(px, py, pz);
    }

    /* ---- shadow ---- */
    const spread = 1 + lying * 0.25 + P.sit * 0.05;
    this.shadow.scale.set(0.72 * spread * (1 + P.curl * 0.2), 1.25 * spread * (1 - P.curl * 0.25) - P.sit * 0.25, 1);
    this.shadow.position.z = -0.03 - P.sit * 0.1;
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 0.6 - f.lift * 1.6);
  }

  private blinkStart = -10;
  private slow = false;

  /** a slow blink, next time the eyes close: how cats say they feel safe */
  slowBlink() {
    this.slow = true;
    this.blinkAt = 0;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
