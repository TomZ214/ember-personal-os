import * as THREE from "three";
import type { CoatId } from "@/lib/pet";
import { BONES, CM, REST_TURN, TAIL_BONES, TAIL_TIP, loadCoat, type CatModel } from "./catModel";
import { shadowTexture } from "./coats";
import { buildLids, type Lids } from "./lids";
import { strideFor, type Frame, type Pose } from "./pose";

export { restPose } from "./pose";
export type { Frame, Pose } from "./pose";

/**
 * The cat, posed: a realistic sculpted and textured cat (catModel.ts) on a
 * skeleton, plus eyelids so it can blink and sleep.
 *
 * Each frame the body is set from the pose amounts (how much it sits, lies,
 * stretches…), and then each leg reaches for where its paw should be with
 * two-bone inverse kinematics: the paws stay planted on the floor whatever
 * the body does, and the gait moves them in the order a walking cat does
 * (hind, front, other hind, other front). The tail is steered by the
 * direction each segment should point, so the model's raised tail is no
 * constraint.
 *
 * Space: the cat faces +z, y is up, the floor is y = 0 at the root. The
 * root is placed and turned by the room; everything else happens here.
 */

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const damp = THREE.MathUtils.damp;
const cmv = (x: number, y: number, z: number) => new THREE.Vector3(x * CM, y * CM, z * CM);
const at = (name: string) => BONES.find((b) => b.name === name)!.at;

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

/** pose amounts, in centimetres and radians, for this cat's build */
const T = {
  /** how far the hips come down */
  drop: { sit: 13.5, loaf: 12.5, curl: 13.5, crouch: 8, eat: 1.5, run: 2.5 },
  /** a sitting cat's back, from the hips */
  sitPitch: -0.62,
  /** where a paw stands, from the joint at the top of its leg */
  wrist: { y: 4.6, z: -2.5, x: 0.92 },
  toes: { y: 1.4, z: -1.2, sitZ: 7.5 },
  /** the hock above and behind the toes standing, flat on the floor sitting */
  meta: { stand: [5.4, -4.6], crouch: [3.2, -6.0], sit: [1.0, -7.4] },
  /**
   * legs folded under the body (loaf, curled up): across and along from
   * chest or hips, turning with them, and down on the floor
   */
  tuckWrist: [3.0, 2.4, 3.5],
  tuckHock: [4.6, 1.8, -3.5],
  tuckToes: [4.2, 1.4, 4.5],
} as const;

export class CatRig {
  readonly root = new THREE.Group();
  /** what a pointer can stroke: invisible shapes round the body and head */
  readonly touchable: THREE.Object3D[] = [];

  private bone: Record<string, THREE.Bone> = {};
  private rest = new Map<THREE.Bone, THREE.Vector3>();
  private skeleton: THREE.Skeleton;
  private mesh: THREE.SkinnedMesh;
  private material: THREE.MeshStandardMaterial;
  private coat: CoatId;
  private legs: Leg[] = [];
  private lids: Lids;
  private shadow: THREE.Mesh;
  private disposables: { dispose(): void }[] = [];
  private disposed = false;

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

  constructor(model: CatModel, coat: CoatId) {
    this.coat = coat;
    const keep = <T extends { dispose(): void }>(x: T) => (this.disposables.push(x), x);

    /* ---- skeleton, in the model's own pose ---- */
    for (const def of BONES) {
      const b = new THREE.Bone();
      b.name = def.name;
      const p = def.parent ? at(def.parent) : [0, 0, 0];
      const local = cmv(def.at[0] - p[0], def.at[1] - p[1], def.at[2] - p[2]);
      b.position.copy(local);
      this.rest.set(b, local.clone());
      this.bone[def.name] = b;
      if (def.parent) this.bone[def.parent].add(b);
    }
    this.root.add(this.bone.root);
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(BONES.map((d) => this.bone[d.name]));

    /* ---- the body ---- */
    this.material = keep(model.material.clone());
    this.material.envMapIntensity = 0.65;
    this.mesh = new THREE.SkinnedMesh(model.geometry, this.material);
    this.mesh.applyMatrix4(model.matrix);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.root.add(this.mesh);
    this.root.updateMatrixWorld(true);
    this.mesh.bind(this.skeleton);

    /* ---- legs ---- */
    for (const s of [1, -1]) {
      const n = (x: string) => this.bone[`${x}${s > 0 ? "L" : "R"}`];
      // lateral-sequence walk: left hind, left fore, right hind, right fore
      this.legs.push(
        { front: true, side: s, a: n("upperArm"), b: n("forearm"), c: n("paw"), walk: s > 0 ? 0.25 : 0.75, bound: s > 0 ? 0 : 0.08 },
        { front: false, side: s, a: n("thigh"), b: n("shin"), c: n("foot"), d: n("toes"), walk: s > 0 ? 0 : 0.5, bound: s > 0 ? 0.5 : 0.58 },
      );
    }

    /* ---- eyelids, made from the eyes ---- */
    this.lids = buildLids(model, this.skeleton, this.root, coat);
    this.setCoat(coat);

    /* ---- something to stroke ---- */
    const proxyGeo = keep(new THREE.SphereGeometry(1, 12, 8));
    const proxyMat = keep(new THREE.MeshBasicMaterial({ visible: false }));
    const proxies: [string, [number, number, number], [number, number, number]][] = [
      ["chest", [0, -5, 0], [8.5, 9.5, 8.5]],
      ["spine1", [0, -4.5, 0], [8.5, 9, 9]],
      ["pelvis", [0, -3, -1], [8.5, 9, 8]],
      ["head", [3.0, 2.0, 4.5], [5.5, 5, 5.5]],
    ];
    for (const [bone, p, r] of proxies) {
      const m = new THREE.Mesh(proxyGeo, proxyMat);
      m.position.copy(cmv(p[0], p[1], p[2]));
      m.scale.copy(cmv(r[0], r[1], r[2]));
      this.bone[bone].add(m);
      this.touchable.push(m);
    }

    /* ---- a soft contact shadow under the body (the light casts the real one) ---- */
    const shadowMat = keep(new THREE.MeshBasicMaterial({ map: keep(shadowTexture()), transparent: true, depthWrite: false, opacity: 0.35 }));
    this.shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.002;
    this.shadow.renderOrder = -1;
    this.root.add(this.shadow);
  }

  /** change the coat in place: the texture loads, the lids follow */
  setCoat(coat: CoatId) {
    this.coat = coat;
    this.lids.setCoat(coat);
    void loadCoat(coat).then((tex) => {
      if (this.disposed || this.coat !== coat) return;
      this.material.map = tex;
      this.material.needsUpdate = true;
    });
  }

  /** the middle of the face, in world space */
  headWorld(out: THREE.Vector3) {
    return this.bone.head.localToWorld(out.set(3.4 * CM, 1.5 * CM, 5.0 * CM));
  }

  /** a slow blink, next time the eyes close: how cats say they feel safe */
  slowBlink() {
    this.slow = true;
    this.blinkAt = 0;
  }

  apply(P: Pose, f: Frame) {
    const { t, dt } = f;
    const b = this.bone;

    // from the model's pose, every frame
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
    const gaitBob = Math.sin(f.phase * 2) * 0.3 * walk;
    const D = T.drop;

    const pelvisDy = -D.sit * sit - D.loaf * P.loaf - D.curl * P.curl + 1.2 * P.stretch - D.crouch * P.crouch - D.eat * P.eat - D.run * run + gaitBob;
    const pelvisDz = 2.5 * sit + 1 * P.loaf - 1.5 * P.stretch + 2 * P.curl;
    b.pelvis.position.y += pelvisDy * CM + f.lift;
    b.pelvis.position.z += pelvisDz * CM;
    b.pelvis.position.x += Math.sin(t * 160) * 0.03 * CM * P.purr;
    this.setRot(
      b.pelvis,
      T.sitPitch * sit + 0.02 * P.loaf + 0.32 * P.stretch + 0.06 * P.crouch + 0.1 * P.eat - 0.12 * P.leap + Math.sin(f.phase) * 0.08 * run,
      Math.sin(t * 17) * 0.12 * f.wiggle - 0.45 * P.curl * side,
      // asleep: leaning on one hip
      0.2 * P.curl * side,
    );
    // asleep: curled round sideways into a ring, nose to tail
    const curl = 0.04 * P.curl;
    const curlYaw = 0.6 * P.curl * side;
    this.setRot(b.spine1, -0.12 * sit + 0.06 * P.stretch - 0.04 * P.crouch + curl - Math.sin(f.phase) * 0.06 * run, curlYaw + Math.sin(f.phase) * 0.03 * walk, 0);
    this.setRot(b.spine2, -0.08 * sit + 0.08 * P.stretch + curl + breath * 0.008, curlYaw, 0);
    this.setRot(b.chest, 0.24 * sit + 0.05 * P.loaf - 0.05 * P.stretch + 0.06 * P.eat + 0.05 * P.crouch + curl, curlYaw, 0);

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
      yawT = Math.max(-1.0, Math.min(1.0, yawT));
      pitchT = Math.max(-0.55, Math.min(0.5, pitchT));
    }
    this.lookYaw = damp(this.lookYaw, yawT * P.lookW, 6, dt);
    this.lookPitch = damp(this.lookPitch, pitchT * P.lookW, 6, dt);

    const chew = P.eat * Math.max(0, Math.sin(t * 10)) * 0.07;
    const lick = P.groom * Math.sin(t * 8.5) * 0.06;
    // a meow: the head lifts a little
    const voice = clamp01(P.mouth) * 0.12;
    const neckPitch = 0.36 * sit + 0.12 * P.loaf - 0.38 * P.stretch + 0.28 * P.crouch + 0.95 * P.eat + 0.42 * P.groom + 0.95 * P.curl - voice;
    const headPitch = 0.22 * sit - 0.2 * P.stretch - 0.3 * P.crouch + 0.35 * P.eat + 0.3 * P.groom + 0.5 * P.curl + P.headPitch + chew + lick - voice;
    const neckYaw = 0.7 * P.curl * side - 0.35 * P.groom;
    const headYaw = 0.45 * P.curl * side - 0.2 * P.groom + P.headYaw;
    this.setRot(b.neck, neckPitch + this.lookPitch * 0.4, REST_TURN.neck + neckYaw + this.lookYaw * 0.4, 0);
    this.setRot(b.head, headPitch + this.lookPitch * 0.6, REST_TURN.head + headYaw + this.lookYaw * 0.6, P.headRoll + 0.35 * P.curl * side + P.purr * 0.1 * Math.sin(t * 0.9));

    /* ---- tail ---- */
    this.poseTail(P, f);
    this.root.updateMatrixWorld(true);

    /* ---- legs: each paw reaches for its place ---- */
    const sitW = clamp01(sit + P.loaf + P.curl);
    // a planted paw sweeps back half a stride while the body moves over it
    const strideCm = ((strideFor(f.speed) / 4) * clamp01(f.speed / 0.08)) / CM;
    const rootQ = this.root.getWorldQuaternion(this.q3);
    for (const leg of this.legs) {
      const u = (f.phase / (Math.PI * 2) + mix(leg.walk, leg.bound, run)) * Math.PI * 2;
      const um = ((u % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const swing = um < Math.PI;
      // in the air the paw swings forward (eased); on the ground it sweeps back at
      // the body's own pace, so it does not slide
      const along = swing ? -Math.cos(um) * strideCm : strideCm * (1 - (2 * (um - Math.PI)) / Math.PI);
      const lift = swing ? Math.sin(um) * (2.4 + 2 * run) * walk : 0;
      // turning on the spot: little steps in place
      const shuffle = Math.max(0, Math.sin(t * 9 + leg.walk * 6.3)) * 1.2 * clamp01(Math.abs(f.turn) / 2) * (1 - walk);

      // the shoulder blade rides with the stride (before the leg reaches, so the paw still lands)
      if (leg.front) {
        const scap = b[`scapula${leg.side > 0 ? "L" : "R"}`];
        scap.rotateX(Math.sin(u) * 0.1 * walk);
        scap.updateMatrixWorld(true);
      }
      // the joint at the top of the leg, in cat space
      const top = leg.a.getWorldPosition(this.vw).applyMatrix4(this.inv);
      const pole = this.root.localToWorld(this.vc.copy(top).add(leg.front ? cmv(0, -4, -12) : cmv(0, -3, 12)));
      if (leg.front) {
        // wrist: under the shoulder on the floor, or tucked under the chest
        const target = this.vt.set(top.x * T.wrist.x, (T.wrist.y + lift + shuffle) * CM, top.z + (T.wrist.z + along) * CM);
        target.z += (10 * P.stretch + 7 * P.leap - 1.5 * P.crouch) * CM;
        target.y += 6 * P.leap * CM;
        this.root.localToWorld(target);
        if (tuck > 0.001) target.lerp(this.tucked(b.chest, T.tuckWrist, leg.side, this.vp), tuck);
        // the right paw: up to the mouth to wash, or out to swat the ball
        if (leg.side < 0 && (P.groom > 0.01 || P.bat > 0.01)) {
          target.lerp(b.head.localToWorld(this.vp.set(0.5 * CM, -2.6 * CM, 7.5 * CM)), P.groom * (0.92 + Math.sin(t * 8.5) * 0.05));
          const swat = this.root.localToWorld(this.vd.copy(top).add(cmv(0, mix(-2, -14, f.swipe), mix(9, 14, f.swipe))));
          target.lerp(swat, P.bat);
        }
        this.ik(leg.a, leg.b, leg.c, target, pole);
        // the paw stays flat on the floor, unless it is washing a face
        this.flat(leg.c, rootQ, leg.side < 0 ? P.groom : 0);
      } else {
        // toes on the floor; the hock above and behind them (standing) or down on the floor (sitting)
        const toes = this.vt.set(top.x, (T.toes.y + lift + shuffle) * CM, top.z + (T.toes.z + T.toes.sitZ * sitW + along) * CM);
        toes.z += (-3 * P.stretch - 6 * P.leap + 1.5 * P.crouch) * CM;
        toes.y += 2 * P.leap * CM;
        const m = T.meta;
        const hock = this.ve.set(
          toes.x,
          toes.y + mix(mix(m.stand[0], m.crouch[0], P.crouch), m.sit[0], sitW) * CM,
          toes.z + (mix(mix(m.stand[1], m.crouch[1], P.crouch), m.sit[1], sitW) - 3 * P.leap) * CM,
        );
        this.root.localToWorld(hock);
        this.root.localToWorld(toes);
        if (tuck > 0.001) {
          hock.lerp(this.tucked(b.pelvis, T.tuckHock, leg.side, this.vp), tuck);
          toes.lerp(this.tucked(b.pelvis, T.tuckToes, leg.side, this.vp), tuck);
        }
        this.ik(leg.a, leg.b, leg.c, hock, pole);
        this.aim(leg.c, leg.d!, toes);
        this.flat(leg.d!, rootQ, 0);
      }
    }

    /* ---- eyes: blinks, slow blinks, sleep ---- */
    if (t > this.blinkAt) {
      this.blinkStart = t;
      this.blinkLen = this.slow ? 0.8 : 0.14;
      this.slow = false;
      this.blinkAt = t + 2.5 + Math.random() * 4.5;
    }
    const bu = (t - this.blinkStart) / this.blinkLen;
    const blink = bu >= 0 && bu <= 1 ? Math.sin(bu * Math.PI) : 0;
    const open = clamp01(P.eyeOpen * (1 - blink));
    // relaxed and content: the lids come half down
    const lidOpen = open * mix(1, 0.45, clamp01(P.happyEyes));
    const shut = 1 - lidOpen;
    this.lids.close.set(shut, shut);
    this.lids.mesh.visible = shut > 0.03;

    /* ---- ears ---- */
    if (t > this.twitchAt) {
      this.twitchStart = t;
      this.twitchSide = Math.random() < 0.5 ? 1 : -1;
      this.twitchAt = t + 3 + Math.random() * 6;
    }
    const since = t - this.twitchStart;
    const tw = since < 0.5 ? Math.sin((since / 0.5) * Math.PI * 3) * Math.exp(-since * 5) : 0;
    const back = clamp01(P.earsBack + P.curl * 0.3);
    for (const [ear, s] of [[b.earL, 1], [b.earR, -1]] as const) {
      const twitch = s === this.twitchSide ? tw : 0;
      this.setRot(ear, -back * 0.6 + twitch * 0.3, s * back * 0.4, s * -back * 0.45 + twitch * s * 0.12);
    }

    /* ---- contact shadow ---- */
    const spread = 1 + tuck * 0.2;
    this.shadow.scale.set(0.5 * spread * (1 + P.curl * 0.3), 1.0 * spread * (1 - P.curl * 0.3) - sit * 0.3, 1);
    this.shadow.position.z = (-2 - sit * 8) * CM;
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.1, 0.35 - f.lift * 2);
  }

  /**
   * The tail, by direction: each segment is turned to point where the pose
   * wants it (down in a J, up with a hooked tip, curled round the paws),
   * whatever its direction in the model.
   */
  private poseTail(P: Pose, f: Frame) {
    const up = Math.max(-0.5, Math.min(1, P.tailUp));
    const up01 = clamp01(up);
    const wrap = clamp01(P.tailWrap);
    const side = f.wrapSide;
    const rootQ = this.root.getWorldQuaternion(this.q3);
    this.root.updateMatrixWorld(true);
    this.inv.copy(this.root.matrixWorld).invert();
    const floor = 1.4 * CM;
    const curl = clamp01(P.curl);
    // curled up asleep, the tail leaves the hips low and sideways and lies round to the nose
    let pitch = mix(mix(mix(-0.95, 1.2, up01), -1.15, wrap) + Math.min(0, up) * 0.5, -0.88, curl);
    let yaw = 0.45 * curl * side;
    for (let i = 0; i < TAIL_BONES; i++) {
      const k = i / (TAIL_BONES - 1);
      const wave = Math.sin(f.t * P.tailSpeed - k * 5) * P.tailSway * (0.25 + k) * 0.4;
      if (i > 0) {
        // hanging: a J that curls up at the end; up: straight, then a hook
        pitch += mix(mix(mix(0.14, k > 0.55 ? 0.42 : 0.03, up01), 0.2, wrap), 0.05, curl);
        yaw += side * mix(0.09 * (1 - wrap) * (1 - up01 * 0.5) + 0.42 * wrap, 0.52, curl);
      }
      const yw = yaw + wave;
      const bone = this.bone[`tail${i}`];
      const joint = bone.getWorldPosition(this.vb).applyMatrix4(this.inv);
      const end = (i < TAIL_BONES - 1 ? this.bone[`tail${i + 1}`].getWorldPosition(this.vc) : bone.localToWorld(this.vc.copy(this.tipLocal()))).applyMatrix4(this.inv);
      const len = end.distanceTo(joint);
      // the direction wanted, in cat space; lifted if it would go through the floor
      const want = this.vd.set(Math.sin(yw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yw) * Math.cos(pitch));
      if (joint.y + want.y * len < floor && len > 1e-6) {
        const needY = Math.max(-1, Math.min(1, (floor - joint.y) / len));
        const flat = Math.sqrt(Math.max(0, 1 - needY * needY));
        const hz = Math.hypot(want.x, want.z) || 1;
        want.set((want.x / hz) * flat, needY, (want.z / hz) * flat);
        pitch = Math.asin(needY);
      }
      const now = this.ve.copy(end).sub(joint).normalize();
      this.turnToward(bone, now.applyQuaternion(rootQ), want.applyQuaternion(rootQ).normalize());
    }
  }

  /**
   * Where a folded paw goes: `[across, height, along]` from `bone`, across
   * and along turning with the bone, the height above the floor. World space.
   */
  private tucked(bone: THREE.Bone, spot: readonly [number, number, number], side: number, out: THREE.Vector3) {
    bone.localToWorld(out.set(spot[0] * side * CM, 0, spot[2] * CM));
    out.applyMatrix4(this.inv);
    out.y = spot[1] * CM;
    return this.root.localToWorld(out);
  }

  /** the tail's tip, in the last tail bone's own space */
  private tipLocal() {
    const last = at(`tail${TAIL_BONES - 1}`);
    return this.vp.set((TAIL_TIP[0] - last[0]) * CM, (TAIL_TIP[1] - last[1]) * CM, (TAIL_TIP[2] - last[2]) * CM);
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
    const bend = this.ve.copy(pole).sub(A);
    bend.addScaledVector(dir, -bend.dot(dir));
    if (bend.lengthSq() < 1e-14) bend.set(0, 0, 1);
    bend.normalize();
    const cosA = Math.max(-1, Math.min(1, (lab * lab + dist * dist - lbc * lbc) / (2 * lab * dist)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    const knee = this.vp.copy(A).addScaledVector(dir, lab * cosA).addScaledVector(bend, lab * sinA);
    const end = A.clone().addScaledVector(dir, dist);
    this.turnToward(a, B.sub(A).normalize(), knee.clone().sub(A).normalize());
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
    this.disposed = true;
    this.lids.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.skeleton.dispose();
  }
}
