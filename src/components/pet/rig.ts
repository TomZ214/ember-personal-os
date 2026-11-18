import * as THREE from "three";
import type { CoatId } from "@/lib/pet";
import { BONES, CM, TAIL_BONES } from "./anatomy";
import { catGeometry } from "./catGeometry";
import { coatUniforms, eyeMaterial, furMaterial } from "./fur";
import { PALETTES } from "./palettes";
import { shadowTexture } from "./coats";
import { strideFor, type Frame, type Pose } from "./pose";

export { restPose } from "./pose";
export type { Frame, Pose } from "./pose";

/**
 * The cat, posed: a skeleton under one skinned, furred body, plus the parts
 * a skin cannot make — eyes with lids, ears, the nose leather, whiskers.
 *
 * Each frame the body is set from the pose amounts (how much it sits, lies,
 * stretches…), and then each leg reaches for where its paw should be with
 * two-bone inverse kinematics: the paws stay planted on the floor whatever
 * the body does, and the gait moves them in the order a walking cat does
 * (hind, front, other hind, other front).
 *
 * Space: the cat faces +z, y is up, the floor is y = 0 at the root. The
 * root is placed and turned by the room; everything else happens here.
 */

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const damp = THREE.MathUtils.damp;
const cmv = (x: number, y: number, z: number) => new THREE.Vector3(x * CM, y * CM, z * CM);

interface Eye {
  group: THREE.Group;
  ball: THREE.Mesh;
  upper: THREE.Group;
  lower: THREE.Group;
}

interface Leg {
  front: boolean;
  /** +1 the cat's left (+x), -1 its right */
  side: number;
  a: THREE.Bone;
  b: THREE.Bone;
  c: THREE.Bone;
  /** hind legs: the toes, which the foot aims at */
  d?: THREE.Bone;
  /** gait offset, a fraction of a cycle: walking and bounding */
  walk: number;
  bound: number;
}

export interface RigOptions {
  /** fur layers; fewer for small views */
  shells?: number;
}

export class CatRig {
  readonly root = new THREE.Group();
  /** what a pointer can stroke: invisible shapes round the body and head */
  readonly touchable: THREE.Object3D[] = [];

  private bone: Record<string, THREE.Bone> = {};
  private rest = new Map<THREE.Bone, THREE.Vector3>();
  private skeleton: THREE.Skeleton;
  private legs: Leg[] = [];
  private eyes: Eye[] = [];
  private earL = new THREE.Group();
  private earR = new THREE.Group();
  private mouth!: THREE.Mesh;
  private shadow!: THREE.Mesh;
  private dilate: THREE.IUniform;
  private disposables: { dispose(): void }[] = [];

  // lives of their own
  private blinkAt = 1.5;
  private blinkStart = -10;
  private blinkLen = 0.14;
  private slow = false;
  private twitchAt = 3;
  private twitchSide = 1;
  private twitchStart = -10;
  private lookYaw = 0;
  private lookPitch = 0;

  // scratch
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private q3 = new THREE.Quaternion();
  private qp = new THREE.Quaternion();
  private va = new THREE.Vector3();
  private vb = new THREE.Vector3();
  private vc = new THREE.Vector3();
  private vd = new THREE.Vector3();
  private ve = new THREE.Vector3();
  private vt = new THREE.Vector3();
  private vp = new THREE.Vector3();
  private vw = new THREE.Vector3();
  private e = new THREE.Euler(0, 0, 0, "YXZ");
  private inv = new THREE.Matrix4();

  constructor(coat: CoatId, opts: RigOptions = {}) {
    const p = PALETTES[coat];
    const keep = <T extends { dispose(): void }>(x: T) => (this.disposables.push(x), x);

    /* ---- skeleton ---- */
    for (const def of BONES) {
      const b = new THREE.Bone();
      b.name = def.name;
      const parent = def.parent ? BONES.find((x) => x.name === def.parent)! : null;
      const local = parent
        ? cmv(def.at[0] - parent.at[0], def.at[1] - parent.at[1], def.at[2] - parent.at[2])
        : cmv(def.at[0], def.at[1], def.at[2]);
      b.position.copy(local);
      this.rest.set(b, local.clone());
      this.bone[def.name] = b;
      if (def.parent) this.bone[def.parent].add(b);
    }
    this.root.add(this.bone.root);
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(BONES.map((d) => this.bone[d.name]));

    /* ---- the body: skin plus layers of fur ---- */
    const geometry = catGeometry();
    const shared = coatUniforms(coat);
    const shells = opts.shells ?? 14;
    for (let i = 0; i <= shells; i++) {
      const mesh = new THREE.SkinnedMesh(geometry, keep(furMaterial(shared, i / shells)));
      mesh.frustumCulled = false;
      mesh.bind(this.skeleton, new THREE.Matrix4());
      this.root.add(mesh);
    }

    /* ---- legs ---- */
    for (const s of [1, -1]) {
      const n = (x: string) => this.bone[`${x}${s > 0 ? "L" : "R"}`];
      // lateral-sequence walk: left hind, left fore, right hind, right fore
      this.legs.push(
        { front: true, side: s, a: n("upperArm"), b: n("forearm"), c: n("paw"), walk: s > 0 ? 0.25 : 0.75, bound: s > 0 ? 0 : 0.08 },
        { front: false, side: s, a: n("thigh"), b: n("shin"), c: n("foot"), d: n("toes"), walk: s > 0 ? 0 : 0.5, bound: s > 0 ? 0.5 : 0.58 },
      );
    }

    /* ---- eyes, with lids ---- */
    const head = this.bone.head;
    const headAt = BONES.find((x) => x.name === "head")!.at;
    const local = (x: number, y: number, z: number) => cmv(x - headAt[0], y - headAt[1], z - headAt[2]);
    const { material: eyeMat, dilate } = eyeMaterial(coat);
    keep(eyeMat);
    this.dilate = dilate;
    const R = 1.0 * CM;
    const ballGeo = keep(new THREE.SphereGeometry(R, 32, 24));
    const upperGeo = keep(new THREE.SphereGeometry(R * 1.04, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2));
    const lowerGeo = keep(new THREE.SphereGeometry(R * 1.04, 28, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2));
    const rimGeo = keep(new THREE.TorusGeometry(R * 1.04, 0.08 * CM, 6, 40));
    // the lids are fur: the coat's colour, a shade lighter, as the fur round a cat's eyes is
    const lidColor = new THREE.Color(p.base).lerp(new THREE.Color(p.muzzle), 0.3);
    const lidMat = keep(new THREE.MeshStandardMaterial({ color: lidColor, roughness: 0.9 }));
    const rimMat = keep(new THREE.MeshStandardMaterial({ color: p.line, roughness: 0.55 }));
    for (const s of [1, -1]) {
      const group = new THREE.Group();
      group.position.copy(local(1.8 * s, 31.68, 25.12));
      // cats look straight ahead; the eyes turn out only a touch
      group.rotation.set(0.04, 0.12 * s, 0, "YXZ");
      const ball = new THREE.Mesh(ballGeo, eyeMat);
      const upper = new THREE.Group();
      const lower = new THREE.Group();
      upper.add(new THREE.Mesh(upperGeo, lidMat));
      lower.add(new THREE.Mesh(lowerGeo, lidMat));
      for (const lid of [upper, lower]) {
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.rotation.x = Math.PI / 2;
        lid.add(rim);
      }
      group.add(ball, upper, lower);
      head.add(group);
      this.eyes.push({ group, ball, upper, lower });
    }

    /* ---- ears ---- */
    const earMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
    for (const [ear, s] of [[this.earL, 1], [this.earR, -1]] as const) {
      ear.position.copy(local(2.85 * s, 33.9, 20.8));
      ear.add(new THREE.Mesh(keep(earGeometry(coat, s)), earMat));
      head.add(ear);
    }

    /* ---- nose leather, mouth, whiskers ---- */
    const noseShape = new THREE.Shape();
    noseShape.moveTo(-0.62, 0.34);
    noseShape.quadraticCurveTo(0, 0.5, 0.62, 0.34);
    noseShape.quadraticCurveTo(0.68, 0.2, 0.12, -0.4);
    noseShape.quadraticCurveTo(0, -0.48, -0.12, -0.4);
    noseShape.quadraticCurveTo(-0.68, 0.2, -0.62, 0.34);
    const noseGeo = keep(
      new THREE.ExtrudeGeometry(noseShape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.14, bevelSegments: 3, curveSegments: 10 }),
    );
    noseGeo.scale(CM, CM, CM);
    const nose = new THREE.Mesh(noseGeo, keep(new THREE.MeshPhysicalMaterial({ color: p.nose, roughness: 0.42, clearcoat: 0.4 })));
    nose.position.copy(local(0, 30.28, 27.62));
    nose.rotation.x = -0.4;
    head.add(nose);

    this.mouth = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 16, 10)), keep(new THREE.MeshStandardMaterial({ color: "#3a1c22", roughness: 0.6 })));
    const jawAt = BONES.find((x) => x.name === "jaw")!.at;
    this.mouth.position.copy(cmv(0, 28.8 - jawAt[1], 26.9 - jawAt[2]));
    this.mouth.scale.set(1.1 * CM, 0.0001, 0.6 * CM);
    this.mouth.visible = false;
    this.bone.jaw.add(this.mouth);

    head.add(whiskers(p.whisker, local, keep));

    /* ---- something to stroke ---- */
    const proxyGeo = keep(new THREE.SphereGeometry(1, 12, 8));
    const proxyMat = keep(new THREE.MeshBasicMaterial({ visible: false }));
    const proxies: [string, [number, number, number], [number, number, number]][] = [
      ["chest", [0, -4, -2], [7, 8, 9]],
      ["spine1", [0, -4, 0], [6.5, 7.5, 8]],
      ["pelvis", [0, -2, 0], [6.5, 7.5, 7]],
      ["head", [0, 1.5, 3], [5, 4.5, 5.5]],
    ];
    for (const [bone, at, r] of proxies) {
      const m = new THREE.Mesh(proxyGeo, proxyMat);
      m.position.copy(cmv(at[0], at[1], at[2]));
      m.scale.copy(cmv(r[0], r[1], r[2]));
      this.bone[bone].add(m);
      this.touchable.push(m);
    }

    /* ---- shadow ---- */
    const shadowMat = keep(new THREE.MeshBasicMaterial({ map: keep(shadowTexture()), transparent: true, depthWrite: false, opacity: 0.5 }));
    this.shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.002;
    this.shadow.renderOrder = -1;
    this.root.add(this.shadow);
  }

  /** the middle of the face, in world space */
  headWorld(out: THREE.Vector3) {
    return this.bone.head.localToWorld(out.set(0, 1.5 * CM, 4 * CM));
  }

  /** a slow blink, next time the eyes close: how cats say they feel safe */
  slowBlink() {
    this.slow = true;
    this.blinkAt = 0;
  }

  apply(P: Pose, f: Frame) {
    const { t, dt } = f;
    const b = this.bone;

    // from rest, every frame
    for (const [bone, pos] of this.rest) {
      bone.position.copy(pos);
      bone.quaternion.identity();
    }

    /* ---- the body ---- */
    const walk = clamp01(f.speed / 0.35);
    const run = clamp01((f.speed - 0.8) / 0.55);
    const tuck = Math.max(P.loaf, P.curl);
    const sit = clamp01(P.sit);
    const breath = Math.sin(t * mix(2.4, 1.4, tuck));
    const side = f.wrapSide;
    const gaitBob = Math.sin(f.phase * 2) * 0.25 * walk;

    const pelvisDy = -14.5 * sit - 12.6 * P.loaf - 16.5 * P.curl + 1.2 * P.stretch - 8.5 * P.crouch - 1.2 * P.eat + gaitBob;
    const pelvisDz = 1.5 * sit + 1 * P.loaf - 1.5 * P.stretch + 2 * P.curl;
    b.pelvis.position.y += pelvisDy * CM + f.lift;
    b.pelvis.position.z += pelvisDz * CM;
    b.pelvis.position.x += Math.sin(t * 160) * 0.03 * CM * P.purr;
    this.setRot(
      b.pelvis,
      -0.76 * sit + 0.03 * P.loaf + 0.36 * P.stretch + 0.07 * P.crouch + 0.1 * P.eat - 0.12 * P.leap + Math.sin(f.phase) * 0.08 * run,
      Math.sin(t * 17) * 0.12 * f.wiggle,
      // asleep: on its side, and curled belly-in into a ring
      1.15 * P.curl * side,
    );
    const curl = 0.6 * P.curl;
    const curlYaw = 0.12 * P.curl * side;
    this.setRot(b.spine1, -0.1 * sit + 0.06 * P.stretch - 0.04 * P.crouch + curl - Math.sin(f.phase) * 0.06 * run, curlYaw + Math.sin(f.phase) * 0.03 * walk, 0);
    this.setRot(b.spine2, -0.08 * sit + 0.08 * P.stretch + curl + breath * 0.008, curlYaw, 0);
    this.setRot(b.chest, 0.28 * sit + 0.05 * P.loaf - 0.05 * P.stretch + 0.06 * P.eat + 0.05 * P.crouch + curl, curlYaw, 0);

    /* ---- head: posture, then where it is looking ---- */
    this.root.updateMatrixWorld(true);
    this.inv.copy(this.root.matrixWorld).invert();
    let yawT = 0;
    let pitchT = 0;
    if (f.look && P.lookW > 0.01) {
      const h = b.head.getWorldPosition(this.va).applyMatrix4(this.inv);
      this.vb.copy(f.look).sub(h);
      yawT = Math.atan2(this.vb.x, this.vb.z) - curlYaw * 3;
      pitchT = Math.atan2(-this.vb.y, Math.sqrt(this.vb.x * this.vb.x + this.vb.z * this.vb.z));
      // a cat turns its head so far, then it would turn its body
      yawT = Math.max(-1.1, Math.min(1.1, yawT));
      pitchT = Math.max(-0.6, Math.min(0.55, pitchT));
    }
    this.lookYaw = damp(this.lookYaw, yawT * P.lookW, 6, dt);
    this.lookPitch = damp(this.lookPitch, pitchT * P.lookW, 6, dt);

    const chew = P.eat * Math.max(0, Math.sin(t * 10)) * 0.08;
    const lick = P.groom * Math.sin(t * 8.5) * 0.07;
    const neckPitch = 0.4 * sit + 0.1 * P.loaf - 0.4 * P.stretch + 0.28 * P.crouch + 0.95 * P.eat + 0.42 * P.groom + 0.8 * P.curl;
    const headPitch = 0.25 * sit - 0.2 * P.stretch - 0.3 * P.crouch + 0.35 * P.eat + 0.3 * P.groom + 0.45 * P.curl + P.headPitch + chew + lick;
    const neckYaw = 0.15 * P.curl * side - 0.35 * P.groom;
    const headYaw = 0.1 * P.curl * side - 0.2 * P.groom + P.headYaw;
    this.setRot(b.neck, neckPitch + this.lookPitch * 0.4, neckYaw + this.lookYaw * 0.4, 0);
    this.setRot(b.head, headPitch + this.lookPitch * 0.6, headYaw + this.lookYaw * 0.6, P.headRoll + 0.15 * P.curl * side + P.purr * 0.12 * Math.sin(t * 0.9));
    const m = clamp01(P.mouth);
    this.setRot(b.jaw, 0.34 * m, 0, 0);
    this.mouth.visible = m > 0.04;
    this.mouth.scale.y = Math.max(0.0001, 0.75 * CM * m);

    /* ---- tail ---- */
    this.poseTail(P, f);
    this.root.updateMatrixWorld(true);

    /* ---- legs: each paw reaches for its place ---- */
    const sitW = clamp01(sit + P.loaf + P.curl);
    // a planted paw sweeps back half a stride while the body moves over it
    const strideCm = ((strideFor(f.speed) / 4) * walk) / CM;
    const rootQ = this.root.getWorldQuaternion(this.q3);
    for (const leg of this.legs) {
      const u = (f.phase / (Math.PI * 2) + mix(leg.walk, leg.bound, run)) * Math.PI * 2;
      // swing (paw in the air, going forward) for the first half, stance after
      const along = -Math.cos(u) * strideCm;
      const lift = Math.max(0, Math.sin(u)) * (2.2 + 2 * run) * walk;
      // turning on the spot: little steps in place
      const shuffle = Math.max(0, Math.sin(t * 9 + leg.walk * 6.3)) * 1.2 * clamp01(Math.abs(f.turn) / 2) * (1 - walk);

      // the shoulder blade rides with the stride (before the leg reaches, so the paw still lands)
      if (leg.front) {
        b[`scapula${leg.side > 0 ? "L" : "R"}`].rotateX(Math.sin(u) * 0.1 * walk);
        b[`scapula${leg.side > 0 ? "L" : "R"}`].updateMatrixWorld(true);
      }
      // the joint at the top of the leg, in cat space
      const top = leg.a.getWorldPosition(this.vw).applyMatrix4(this.inv);
      const pole = this.root.localToWorld(this.vc.copy(top).add(leg.front ? cmv(0, -4, -12) : cmv(0, -3, 12)));
      if (leg.front) {
        // wrist: under the shoulder on the floor, or tucked under the chest
        const target = this.vt.set(top.x * 0.96, (3.2 + lift + shuffle) * CM, top.z + (-1.0 + along) * CM);
        target.z += (9.5 * P.stretch + 7 * P.leap - 1.5 * P.crouch) * CM;
        target.y += 6 * P.leap * CM;
        this.root.localToWorld(target);
        target.lerp(b.chest.localToWorld(this.vp.set(3.2 * leg.side * CM, -10.5 * CM, -2.5 * CM)), tuck);
        // the right paw: up to the mouth to wash, or out to swat the ball
        if (leg.side < 0 && (P.groom > 0.01 || P.bat > 0.01)) {
          target.lerp(b.head.localToWorld(this.vp.set(-0.6 * CM, -2.4 * CM, 6.0 * CM)), P.groom * (0.92 + Math.sin(t * 8.5) * 0.05));
          const swat = this.root.localToWorld(this.vd.copy(top).add(cmv(0, mix(-2, -13, f.swipe), mix(9, 13, f.swipe))));
          target.lerp(swat, P.bat);
        }
        this.ik(leg.a, leg.b, leg.c, target, pole);
        // the paw stays flat on the floor, unless it is washing a face
        this.flat(leg.c, rootQ, leg.side < 0 ? P.groom : 0);
      } else {
        // toes on the floor; the hock above and behind them (standing) or down on the floor (sitting)
        const toes = this.vt.set(top.x, (1.6 + lift + shuffle) * CM, top.z + (-1.3 + 6.5 * sitW + along) * CM);
        toes.z += (-3 * P.stretch - 6 * P.leap + 1.5 * P.crouch) * CM;
        toes.y += 2 * P.leap * CM;
        const hock = this.ve.set(
          toes.x,
          toes.y + mix(mix(5.4, 3.0, P.crouch), 0.9, sitW) * CM,
          toes.z + (mix(mix(-3.8, -5.6, P.crouch), -6.7, sitW) - 3 * P.leap) * CM,
        );
        this.root.localToWorld(hock);
        this.root.localToWorld(toes);
        hock.lerp(b.pelvis.localToWorld(this.vp.set(4.6 * leg.side * CM, -10.8 * CM, 3.5 * CM)), tuck);
        toes.lerp(b.pelvis.localToWorld(this.vp.set(4.2 * leg.side * CM, -12.2 * CM, 9.5 * CM)), tuck);
        this.ik(leg.a, leg.b, leg.c, hock, pole);
        this.aim(leg.c, leg.d!, toes);
        this.flat(leg.d!, rootQ, 0);
      }
    }

    /* ---- face ---- */
    if (t > this.blinkAt) {
      this.blinkStart = t;
      this.blinkLen = this.slow ? 0.8 : 0.14;
      this.slow = false;
      this.blinkAt = t + 2.5 + Math.random() * 4.5;
    }
    const bu = (t - this.blinkStart) / this.blinkLen;
    const blink = bu >= 0 && bu <= 1 ? Math.sin(bu * Math.PI) : 0;
    const open = clamp01(P.eyeOpen * (1 - blink));
    // relaxed and content: the lids sit lower, the cat looks at you through slits
    const lidOpen = open * mix(1, 0.5, clamp01(P.happyEyes));
    for (const e of this.eyes) {
      // almond, not round: the lids never open all the way
      e.upper.rotation.x = -0.74 * lidOpen;
      e.lower.rotation.x = 0.34 * lidOpen;
      e.ball.rotation.set(-this.lookPitch * 0.25, this.lookYaw * 0.25, 0);
    }
    this.dilate.value = clamp01(P.pupil);

    if (t > this.twitchAt) {
      this.twitchStart = t;
      this.twitchSide = Math.random() < 0.5 ? 1 : -1;
      this.twitchAt = t + 3 + Math.random() * 6;
    }
    const since = t - this.twitchStart;
    const tw = since < 0.5 ? Math.sin((since / 0.5) * Math.PI * 3) * Math.exp(-since * 5) : 0;
    const back = clamp01(P.earsBack + P.curl * 0.3);
    for (const [ear, s] of [[this.earL, 1], [this.earR, -1]] as const) {
      const twitch = s === this.twitchSide ? tw : 0;
      ear.rotation.set(-0.12 - back * 0.7 + twitch * 0.35, s * (0.32 + back * 0.5), s * (-0.28 - back * 0.45) + twitch * s * 0.15, "YXZ");
    }

    /* ---- shadow ---- */
    const spread = 1 + tuck * 0.15;
    this.shadow.scale.set(0.42 * spread * (1 + P.curl * 0.35), 0.95 * spread * (1 - P.curl * 0.35) - sit * 0.25, 1);
    this.shadow.position.z = (-2 - sit * 8) * CM;
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 0.55 - f.lift * 2.5);
  }

  private poseTail(P: Pose, f: Frame) {
    const up = Math.max(-0.5, Math.min(1, P.tailUp));
    const up01 = clamp01(up);
    const wrap = clamp01(P.tailWrap);
    const side = f.wrapSide;
    for (let i = 0; i < TAIL_BONES; i++) {
      const k = i / (TAIL_BONES - 1);
      const wave = Math.sin(f.t * P.tailSpeed - k * 5) * P.tailSway * (0.25 + k) * 0.32;
      // hanging: a J that curls up at the end; up: straight, then a hook
      const pitch =
        i === 0
          ? mix(mix(-0.95, 1.2, up01), -1.2, wrap) + Math.min(0, up) * 0.5
          : mix(mix(0.1, k > 0.6 ? 0.34 : 0.03, up01), 0.16, wrap) - 0.42 * P.curl;
      const yaw = side * (0.07 * (1 - wrap) * (1 - up01 * 0.5) + 0.3 * wrap) + wave;
      this.setRot(this.bone[`tail${i}`], pitch, yaw, 0);
    }
    // a tail lies on the floor, it does not go through it
    this.root.updateMatrixWorld(true);
    this.inv.copy(this.root.matrixWorld).invert();
    for (let i = 0; i < TAIL_BONES - 1; i++) {
      const bone = this.bone[`tail${i}`];
      const next = this.bone[`tail${i + 1}`].getWorldPosition(this.va).applyMatrix4(this.inv);
      const floor = 1.6 * CM;
      if (next.y < floor) {
        bone.rotateX(Math.asin(Math.min(1, (floor - next.y) / (2.9 * CM))));
        bone.updateMatrixWorld(true);
      }
    }
  }

  private setRot(bone: THREE.Bone, x: number, y: number, z: number) {
    this.e.set(x, y, z, "YXZ");
    bone.quaternion.setFromEuler(this.e);
  }

  /**
   * Two-bone inverse kinematics: turn `a` and `b` so that `c` (the end of the
   * chain) lands on `target`, bending toward `pole`. All in world space.
   */
  private ik(a: THREE.Bone, b: THREE.Bone, c: THREE.Bone, target: THREE.Vector3, pole: THREE.Vector3) {
    const A = a.getWorldPosition(this.va);
    const B = b.getWorldPosition(this.vb);
    const C = c.getWorldPosition(this.vc.clone());
    const lab = A.distanceTo(B);
    const lbc = B.distanceTo(C);
    const toT = this.vd.copy(target).sub(A);
    const dist = Math.min(Math.max(toT.length(), Math.abs(lab - lbc) + 1e-5), lab + lbc - 1e-5);
    const dir = toT.normalize();
    // the bend plane: from the chain's root toward the pole, square to the reach
    const bend = this.ve.copy(pole).sub(A);
    bend.addScaledVector(dir, -bend.dot(dir));
    if (bend.lengthSq() < 1e-14) bend.set(0, 0, 1);
    bend.normalize();
    const cosA = Math.max(-1, Math.min(1, (lab * lab + dist * dist - lbc * lbc) / (2 * lab * dist)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    const knee = this.vp.copy(A).addScaledVector(dir, lab * cosA).addScaledVector(bend, lab * sinA);
    const end = A.clone().addScaledVector(dir, dist);

    // the upper bone puts the middle joint on the knee…
    this.turnToward(a, B.sub(A).normalize(), knee.clone().sub(A).normalize());
    // …and the lower one puts the end on the target
    const B2 = b.getWorldPosition(this.vb);
    const C2 = c.getWorldPosition(this.vc);
    this.turnToward(b, C2.sub(B2).normalize(), end.sub(B2).normalize());
  }

  /** point bone `a` so its child `child` sits in the direction of `target` */
  private aim(a: THREE.Bone, child: THREE.Bone, target: THREE.Vector3) {
    const A = a.getWorldPosition(this.va);
    const C = child.getWorldPosition(this.vc);
    this.turnToward(a, C.sub(A).normalize(), this.vd.copy(target).sub(A).normalize());
  }

  /** rotate `bone` in world space by the turn that takes `from` to `to` */
  private turnToward(bone: THREE.Bone, from: THREE.Vector3, to: THREE.Vector3) {
    const turn = this.q.setFromUnitVectors(from, to);
    const world = bone.getWorldQuaternion(this.q2);
    const parent = bone.parent!.getWorldQuaternion(this.qp).invert();
    bone.quaternion.copy(parent.multiply(turn.multiply(world)));
    bone.updateMatrixWorld(true);
  }

  /** a paw flat on the floor (`free` 1: left to follow the leg) */
  private flat(bone: THREE.Bone, rootQ: THREE.Quaternion, free: number) {
    if (free > 0.99) return;
    const want = bone.parent!.getWorldQuaternion(this.qp).invert().multiply(rootQ);
    bone.quaternion.slerp(want, 1 - free);
    bone.updateMatrixWorld(true);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.skeleton.dispose();
  }
}

/* ---- parts ------------------------------------------------------------------ */

/**
 * An ear: a thin, cupped triangle with a rounded tip, the inside pale and
 * pink, the back the colour of the coat (darker on a tabby). Built in
 * centimetres from the base, which sits on the head.
 */
function earGeometry(coat: CoatId, side: number) {
  const p = PALETTES[coat];
  const H = 4.9, W = 2.35, U = 18, V = 24;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const inner = new THREE.Color(p.innerEar);
  const pale = new THREE.Color(p.muzzle);
  const striped = coat === "tabby" || coat === "ginger";
  const outer = new THREE.Color(striped ? p.mark : coat === "calico" ? (side > 0 ? p.mark : p.mark2!) : p.base);
  if (striped) outer.lerp(new THREE.Color(p.base), 0.45);
  const c = new THREE.Color();
  for (let i = 0; i <= U; i++) {
    const u = i / U;
    const w = W * Math.pow(1 - u, 0.8) + 0.12 * (1 - u);
    const th = 0.32 * (1 - u * 0.7);
    const cup = 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.2));
    for (let j = 0; j <= V; j++) {
      const phi = (j / V) * Math.PI * 2;
      const cs = Math.cos(phi), sn = Math.sin(phi);
      const front = sn > 0;
      const x = w * cs;
      const z = th * sn - (front ? cup * sn * sn : 0);
      // leaning a little forward toward the tip
      pos.push(x * CM, u * H * CM, (z + u * u * 0.4) * CM);
      // pink skin inside, paler fur round the rim; the coat outside
      if (front) c.copy(inner).lerp(outer, 0.25).lerp(pale, Math.pow(Math.abs(cs), 2.5) * 0.75 + u * 0.15);
      else c.copy(outer);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < U; i++) {
    for (let j = 0; j < V; j++) {
      const a = i * (V + 1) + j, b = a + V + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** whiskers from the pads, and a few over the eyes, as fine lines */
function whiskers(color: string, local: (x: number, y: number, z: number) => THREE.Vector3, keep: <T extends { dispose(): void }>(x: T) => T) {
  const pts: number[] = [];
  const add = (start: THREE.Vector3, dir: THREE.Vector3, len: number, droop: number) => {
    const n = 10;
    let prev = start.clone();
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const p = start.clone().addScaledVector(dir, len * t);
      p.y -= droop * t * t * CM;
      p.z += 0.5 * t * t * CM;
      pts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
    }
  };
  for (const s of [1, -1]) {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const start = local((1.25 + c * 0.32) * s, 29.65 - r * 0.32, 27.4 - c * 0.35);
        const spread = (r - 1.5) * 0.16 + (c - 1) * 0.05;
        const dir = new THREE.Vector3(s, spread, 0.22 + c * 0.1).normalize();
        add(start, dir, (6.2 + (1.5 - Math.abs(r - 1.5)) * 0.6 - c * 0.4) * CM, 0.6 + r * 0.25);
      }
    }
    for (let k = 0; k < 3; k++) {
      const start = local((1.6 + k * 0.35) * s, 33.0, 24.9 - k * 0.3);
      add(start, new THREE.Vector3(0.45 * s, 0.85, 0.3).normalize(), (2.6 - k * 0.3) * CM, -0.2);
    }
  }
  const g = keep(new THREE.BufferGeometry());
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const m = keep(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 }));
  return new THREE.LineSegments(g, m);
}
