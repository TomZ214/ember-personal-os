import * as THREE from "three";
import { useEmber } from "@/lib/store";
import { tickPet, type CoatId } from "@/lib/pet";
import { CatBrain, type Ball, type CatStatus } from "./brain";
import { CatRig } from "./rig";
import { glyphTexture, yarnTexture } from "./coats";
import { meow, startPurr, stopPurr } from "./catSounds";

/**
 * The cat's room, as plain three.js: the rug, the bed, the bowl, the toys,
 * the cat, and the loop that runs them. React only mounts it, feeds it
 * settings and calls `frame` once per rendered frame; nothing in here
 * re-renders anything.
 */

export type RoomMode = "stage" | "widget";

/** the ball of yarn: about six centimetres across */
const BALL_R = 0.05;

export const LAYOUT = {
  stage: { radius: 1.1, camera: [0, 1.2, 2.85], target: [0, 0.26, -0.05], fov: 34, bed: { x: -0.82, z: -0.42 }, bowl: { x: 0.82, z: -0.18 } },
  widget: { radius: 0.42, camera: [0, 0.72, 1.75], target: [0, 0.28, 0], fov: 31, bed: null, bowl: null },
} as const;

interface Particle {
  sprite: THREE.Sprite;
  born: number;
  life: number;
  vx: number;
  vy: number;
  size: number;
}

interface FrameState {
  camera: THREE.Camera;
  size: { width: number; height: number };
}

export class Room {
  readonly group = new THREE.Group();
  /** steer the laser dot with the pointer */
  laser = false;
  onStatus: (s: CatStatus) => void = () => {};

  private mode: RoomMode;
  private R: number;
  private rig: CatRig;
  private coat: CoatId;
  private brain: CatBrain;
  private dom: HTMLElement;
  private camera: THREE.PerspectiveCamera;

  private t = 0;
  private status: CatStatus | null = null;
  private stats = tickPet(useEmber.getState().pet);
  private statsAt = 0;
  private pending = { stroke: 0, play: 0, at: 0 };
  private bowl: { x: number; z: number; food: number } | null;
  private treatDrop: { x: number; z: number; y: number; vy: number; landed?: boolean } | null = null;
  private ballState: (Ball & { y: number; vy: number }) | null = null;
  private particles: Particle[] = [];
  private nextFx = 0;
  private boopAt = 0;
  private framedFor = "";
  /** fur layers: fewer in the small widget, where nobody sees single hairs */
  private shells: number;
  private debugCam: string | null = null;

  // what the person is doing
  private ndc = new THREE.Vector2();
  private input = { inside: false, down: false, type: "mouse", lastMove: -1e9, lastAct: performance.now() };
  private stroke = { acc: 0, x: 0, y: 0, at: 0, last: -1e9, downX: 0, downY: 0, moved: 0 };

  // three.js bits that live as long as the room
  private disposables: { dispose(): void }[] = [];
  private tex: Record<"heart" | "z" | "spark", THREE.Texture>;
  private ballMesh: THREE.Mesh;
  private treatMesh: THREE.Group;
  private laserDot: THREE.Group;
  private kibble: THREE.InstancedMesh | null = null;
  private rugMat: THREE.MeshBasicMaterial;
  private accentMats: { mat: THREE.MeshPhysicalMaterial; toWhite: number }[] = [];
  private particleGroup = new THREE.Group();

  private ray = new THREE.Raycaster();
  private floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private facing = new THREE.Plane();
  private v = { hit: new THREE.Vector3(), look: new THREE.Vector3(), head: new THREE.Vector3(), dir: new THREE.Vector3(), axis: new THREE.Vector3(), tmp: new THREE.Vector3() };

  constructor(opts: { mode: RoomMode; scene: THREE.Scene; camera: THREE.PerspectiveCamera; dom: HTMLElement; coat: CoatId }) {
    this.mode = opts.mode;
    this.shells = opts.mode === "widget" ? 9 : 14;
    this.camera = opts.camera;
    this.dom = opts.dom;
    const L = LAYOUT[this.mode];
    this.R = L.radius;
    this.bowl = L.bowl ? { ...L.bowl, food: 0 } : null;
    const keep = <T extends { dispose(): void }>(x: T) => (this.disposables.push(x), x);

    this.tex = { heart: keep(glyphTexture("heart")), z: keep(glyphTexture("z")), spark: keep(glyphTexture("spark")) };

    /* ---- rug ---- */
    const rugCanvas = document.createElement("canvas");
    rugCanvas.width = rugCanvas.height = 256;
    const rctx = rugCanvas.getContext("2d")!;
    const g = rctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(0.62, "rgba(255,255,255,0.3)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    rctx.fillStyle = g;
    rctx.fillRect(0, 0, 256, 256);
    const rugTex = keep(new THREE.CanvasTexture(rugCanvas));
    rugTex.colorSpace = THREE.SRGBColorSpace;
    this.rugMat = keep(new THREE.MeshBasicMaterial({ map: rugTex, transparent: true, depthWrite: false, opacity: 0.5 }));
    const rug = new THREE.Mesh(keep(new THREE.CircleGeometry(this.R + (this.mode === "widget" ? 0.3 : 0.55), 72)), this.rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.renderOrder = -2;
    this.group.add(rug);

    /* ---- bed ---- */
    if (L.bed) {
      const bed = new THREE.Group();
      bed.position.set(L.bed.x, 0, L.bed.z);
      const fabric = (toWhite: number) => {
        const mat = keep(new THREE.MeshPhysicalMaterial({ roughness: 0.88, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color("#ffffff") }));
        this.accentMats.push({ mat, toWhite });
        return mat;
      };
      const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(0.31, 0.085, 18, 56)), fabric(0.45));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.062;
      rim.scale.set(1, 1, 0.72);
      const cushion = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.315, 0.315, 0.05, 48)), fabric(0.72));
      cushion.position.y = 0.025;
      bed.add(rim, cushion);
      this.group.add(bed);
    }

    /* ---- bowl and kibble ---- */
    if (L.bowl) {
      const bowl = new THREE.Group();
      bowl.position.set(L.bowl.x, 0, L.bowl.z);
      // about 15 cm across, like a real cat bowl
      bowl.scale.setScalar(0.56);
      const profile = [
        [0, 0], [0.17, 0], [0.2, 0.012], [0.235, 0.075], [0.24, 0.092], [0.232, 0.1],
        [0.215, 0.096], [0.185, 0.045], [0.16, 0.032], [0, 0.03],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      const glaze = keep(new THREE.MeshPhysicalMaterial({ roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide }));
      this.accentMats.push({ mat: glaze, toWhite: 0 });
      bowl.add(new THREE.Mesh(keep(new THREE.LatheGeometry(profile, 48)), glaze));
      const n = 22;
      this.kibble = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1, 10, 8)), keep(new THREE.MeshStandardMaterial({ color: "#a0633a", roughness: 0.7 })), n);
      const o = new THREE.Object3D();
      for (let i = 0; i < n; i++) {
        const a = i * 2.4;
        const r = Math.sqrt(i / n) * 0.14;
        o.position.set(Math.cos(a) * r, 0.045 + (1 - r / 0.14) * 0.035 + (i % 3) * 0.006, Math.sin(a) * r);
        o.rotation.set(i, i * 0.7, 0);
        o.scale.set(0.024, 0.016, 0.02);
        o.updateMatrix();
        this.kibble.setMatrixAt(i, o.matrix);
      }
      this.kibble.count = 0;
      bowl.add(this.kibble);
      this.group.add(bowl);
    }

    /* ---- yarn ball, treat, laser dot ---- */
    this.ballMesh = new THREE.Mesh(
      keep(new THREE.SphereGeometry(BALL_R, 24, 18)),
      keep(new THREE.MeshPhysicalMaterial({ map: keep(yarnTexture("#ff8fa3")), roughness: 0.9, sheen: 1, sheenColor: new THREE.Color("#ffd0da") })),
    );
    this.ballMesh.visible = false;

    this.treatMesh = new THREE.Group();
    const fishBody = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 14, 10)), keep(new THREE.MeshPhysicalMaterial({ color: "#f2a65a", roughness: 0.4, clearcoat: 0.6 })));
    fishBody.scale.set(0.026, 0.02, 0.045);
    const fishTail = new THREE.Mesh(keep(new THREE.ConeGeometry(0.022, 0.03, 8)), keep(new THREE.MeshPhysicalMaterial({ color: "#e48c3f", roughness: 0.4 })));
    fishTail.position.z = -0.05;
    fishTail.rotation.x = -Math.PI / 2;
    fishTail.scale.set(1, 1, 0.5);
    this.treatMesh.add(fishBody, fishTail);
    this.treatMesh.visible = false;

    this.laserDot = new THREE.Group();
    const dot = new THREE.Mesh(keep(new THREE.CircleGeometry(0.022, 20)), keep(new THREE.MeshBasicMaterial({ color: "#ff2b4a", toneMapped: false })));
    const glow = new THREE.Mesh(
      keep(new THREE.CircleGeometry(0.07, 24)),
      keep(new THREE.MeshBasicMaterial({ color: "#ff2b4a", transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false })),
    );
    dot.rotation.x = glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.001;
    this.laserDot.add(dot, glow);
    this.laserDot.visible = false;

    this.group.add(this.ballMesh, this.treatMesh, this.laserDot, this.particleGroup);

    /* ---- the cat ---- */
    this.coat = opts.coat;
    this.rig = new CatRig(this.coat, { shells: this.shells });
    this.group.add(this.rig.root);
    this.brain = this.makeBrain();

    if (process.env.NODE_ENV !== "production") {
      // /pet?pose=sit&cam=close: hold a pose and look at it up close
      const q = new URLSearchParams(window.location.search);
      const pose = q.get("pose");
      if (pose) {
        this.brain.hold = pose as never;
        this.brain.x = this.brain.z = 0;
        this.brain.heading = Number(q.get("turn") ?? 0.5);
      }
      this.debugCam = q.get("cam");
      (window as unknown as { __room: Room }).__room = this;
    }

    opts.scene.add(this.group);
    this.listen();
    useEmber.getState().seePet();
  }

  private makeBrain() {
    const L = LAYOUT[this.mode];
    const state = useEmber.getState();
    const now = Date.now();
    const pet = tickPet(state.pet, now);
    const away = now - state.pet.lastSeen;
    const hour = new Date().getHours();
    const night = hour >= 23 || hour < 6;
    const asleep = pet.energy < 30 || (night && Math.random() < 0.6);
    const start = asleep && L.bed ? L.bed : { x: (Math.random() - 0.5) * this.R, z: (Math.random() - 0.3) * this.R * 0.6 };
    return new CatBrain(
      {
        meow: (kind) => meow(kind),
        purr: (on) => (on ? startPurr() : stopPurr()),
        ateTreat: () => {
          const t = this.treatDrop;
          this.treatDrop = null;
          if (t) for (let i = 0; i < 3; i++) this.spawn("heart", this.v.tmp.set(t.x, 0.35 + i * 0.05, t.z), i * 0.12);
        },
        ateFood: (amount) => {
          if (this.bowl) this.bowl.food = Math.max(0, this.bowl.food - amount);
        },
        played: (seconds) => {
          this.pending.play += seconds;
        },
        caught: (x, z) => {
          for (let i = 0; i < 3; i++) this.spawn("spark", this.v.tmp.set(x, 0.08, z), i * 0.06);
        },
        bat: (vx, vz) => {
          const b = this.ballState;
          if (b) {
            b.vx = vx;
            b.vz = vz;
            b.vy = 0.9;
          }
        },
        slowBlink: () => this.rig.slowBlink(),
      },
      // away a while: it comes over to say hello (after waking, if it was asleep)
      { x: start.x, z: start.z, heading: Math.random() * 0.6 - 0.3, asleep, greet: away > 30 * 60_000 },
    );
  }

  get sleepy() {
    return this.brain.act === "sleep";
  }

  /* ---- settings ---- */

  setCoat(coat: CoatId) {
    if (coat === this.coat) return;
    this.coat = coat;
    this.group.remove(this.rig.root);
    this.rig.dispose();
    this.rig = new CatRig(coat, { shells: this.shells });
    this.group.add(this.rig.root);
  }

  setAccent(color: THREE.Color) {
    this.rugMat.color.copy(color);
    const white = new THREE.Color("#ffffff");
    for (const { mat, toWhite } of this.accentMats) mat.color.copy(color).lerp(white, toWhite);
  }

  /* ---- things the page asks for ---- */

  feed(): boolean {
    if (!this.bowl || this.bowl.food > 0.1) return false;
    this.bowl.food = 1;
    useEmber.getState().petAct({ kind: "feed" });
    this.input.lastAct = performance.now();
    return true;
  }

  treat(): boolean {
    if (this.treatDrop || useEmber.getState().pet.treats <= 0) return false;
    useEmber.getState().petAct({ kind: "treat" });
    const a = this.brain.heading + (Math.random() - 0.5) * 0.8;
    let x = this.brain.x + Math.sin(a) * 0.62;
    let z = this.brain.z + Math.cos(a) * 0.62;
    const r = Math.hypot(x, z);
    const max = this.R * 0.92;
    if (r > max) {
      x *= max / r;
      z *= max / r;
    }
    this.treatDrop = { x, z, y: 0.9, vy: 0 };
    this.input.lastAct = performance.now();
    return true;
  }

  ball() {
    const R = this.R;
    const from = (Math.random() - 0.5) * R;
    const to = { x: (Math.random() - 0.5) * R * 0.8, z: (Math.random() - 0.5) * R * 0.6 };
    const a = Math.atan2(to.x - from, to.z - R);
    this.ballState = { x: from, z: R * 0.95, y: 0.55, vy: 0.6, vx: Math.sin(a) * 2, vz: Math.cos(a) * 2, live: true };
    this.input.lastAct = performance.now();
  }

  call() {
    this.brain.call();
    this.input.lastAct = performance.now();
  }

  /* ---- the person's pointer ---- */

  private listen() {
    const el = this.dom;
    el.addEventListener("pointermove", this.onMove, { passive: true });
    el.addEventListener("pointerdown", this.onDown, { passive: true });
    window.addEventListener("pointerup", this.onUp, { passive: true });
    el.addEventListener("pointercancel", this.onLeave, { passive: true });
    el.addEventListener("pointerleave", this.onLeave, { passive: true });
  }

  private toNdc(e: PointerEvent) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  /** is the pointer over the cat? */
  private overCat() {
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.intersectObjects(this.rig.touchable, false).length > 0;
  }

  private onMove = (e: PointerEvent) => {
    const i = this.input;
    i.inside = true;
    i.type = e.pointerType;
    i.lastMove = i.lastAct = performance.now();
    this.toNdc(e);
    const s = this.stroke;
    const now = performance.now();
    const fresh = now - s.at < 150;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    s.x = e.clientX;
    s.y = e.clientY;
    s.at = now;
    if (i.down) s.moved += Math.hypot(dx, dy);
    const over = this.overCat();
    this.dom.style.cursor = over && !this.laser ? "grab" : "";
    if (!fresh || this.laser || !over) return;
    // a mouse strokes by moving over the fur; a finger by sliding along it
    if (e.pointerType === "touch" && !i.down) return;
    s.acc += Math.hypot(dx, dy);
    s.last = now;
  };

  private onDown = (e: PointerEvent) => {
    this.input.down = true;
    this.stroke.moved = 0;
    this.stroke.downX = e.clientX;
    this.stroke.downY = e.clientY;
    this.onMove(e);
  };

  private onUp = (e: PointerEvent) => {
    const i = this.input;
    if (!i.down) return;
    i.down = false;
    // a tap on the cat (not a stroke): it notices you
    if (this.stroke.moved < 8 && !this.laser && e.target instanceof Node && this.dom.contains(e.target)) {
      this.toNdc(e);
      if (this.overCat()) {
        this.brain.boop();
        if (performance.now() - this.boopAt > 4000) {
          this.boopAt = performance.now();
          useEmber.getState().petAct({ kind: "boop" });
        }
      }
    }
  };

  private onLeave = () => {
    this.input.inside = false;
    this.input.down = false;
    this.dom.style.cursor = "";
  };

  /* ---- the loop ---- */

  frame(state: FrameState, rawDt: number) {
    const dt = Math.min(rawDt, 1 / 15);
    this.t += dt;
    const t = this.t;
    const now = performance.now();
    const i = this.input;
    const R = this.R;
    const v = this.v;

    this.frame_camera(state);

    if (t - this.statsAt > 4) {
      this.statsAt = t;
      this.stats = tickPet(useEmber.getState().pet);
    }

    // the pointer, as a point in the room
    let pointer: THREE.Vector3 | null = null;
    let laserAt: { x: number; z: number } | null = null;
    const present = i.type === "mouse" || i.type === "pen" ? i.inside : i.down;
    if (present && now - i.lastMove < 2500) {
      this.ray.setFromCamera(this.ndc, this.camera);
      this.rig.headWorld(v.head);
      this.camera.getWorldDirection(v.dir);
      this.facing.setFromNormalAndCoplanarPoint(v.dir.negate(), v.head);
      if (this.ray.ray.intersectPlane(this.facing, v.hit)) pointer = v.look.copy(v.hit);
      if (this.laser && this.ray.ray.intersectPlane(this.floor, v.hit)) {
        const r = Math.hypot(v.hit.x, v.hit.z);
        if (r < R + 0.35) laserAt = r > R ? { x: (v.hit.x * R) / r, z: (v.hit.z * R) / r } : { x: v.hit.x, z: v.hit.z };
      }
    }

    // stroking: enough movement over the fur, recently
    const s = this.stroke;
    s.acc *= Math.exp(-dt * 2.2);
    const petting = !this.laser && s.acc > 40 && now - s.last < 450;
    if (petting) this.pending.stroke += dt;

    this.stepTreat(dt);
    this.stepBall(dt);

    const tr = this.treatDrop;
    const brain = this.brain;
    brain.update({
      t, dt,
      stats: this.stats,
      petting,
      pointer: this.laser ? null : pointer,
      laser: laserAt,
      ball: this.ballState,
      bowl: this.bowl,
      bed: LAYOUT[this.mode].bed,
      // once it has hit the floor, a little bounce does not hide it
      treat: tr?.landed && tr.y < 0.08 ? tr : null,
      idleFor: (now - i.lastAct) / 1000,
      camera: this.camera.position,
      radius: R,
    });

    const root = this.rig.root;
    root.position.set(brain.x, 0, brain.z);
    root.rotation.y = brain.heading;
    root.updateMatrixWorld();
    this.rig.apply(brain.pose, {
      t, dt,
      phase: brain.phase,
      speed: brain.speed,
      turn: brain.turn,
      lift: brain.lift,
      wiggle: brain.wiggle,
      swipe: brain.swipe,
      look: brain.hasLook ? root.worldToLocal(v.look.copy(brain.look)) : null,
      wrapSide: brain.wrapSide,
    });

    // props follow
    this.treatMesh.visible = !!tr;
    if (tr) this.treatMesh.position.set(tr.x, tr.y + 0.03, tr.z);
    this.laserDot.visible = !!laserAt;
    if (laserAt) {
      this.laserDot.position.set(laserAt.x, 0.004, laserAt.z);
      this.laserDot.scale.setScalar(1 + Math.sin(t * 20) * 0.08);
    }
    if (this.kibble && this.bowl) this.kibble.count = Math.ceil(this.bowl.food * 22);

    // hearts while purring, z's while asleep
    if (t > this.nextFx) {
      if (brain.act === "purr") {
        this.rig.headWorld(v.head);
        this.spawn("heart", v.tmp.copy(v.head).add(v.dir.set((Math.random() - 0.5) * 0.2, 0.28, 0)));
        this.nextFx = t + 0.75;
      } else if (brain.act === "sleep") {
        this.rig.headWorld(v.head);
        this.spawn("z", v.tmp.copy(v.head).add(v.dir.set(0.12, 0.22, 0)));
        this.nextFx = t + 1.5;
      }
    }
    this.stepParticles(dt);

    if (brain.status !== this.status) {
      this.status = brain.status;
      this.onStatus(brain.status);
    }

    // bank stroking and play now and then, not every frame
    const pd = this.pending;
    if (t - pd.at > 3) {
      pd.at = t;
      this.flush();
    }
  }

  /** frame the room whatever the shape of the box */
  private frame_camera(state: FrameState) {
    const key = `${state.size.width}x${state.size.height}`;
    if (key === this.framedFor) return;
    this.framedFor = key;
    const L = LAYOUT[this.mode];
    const aspect = state.size.width / Math.max(1, state.size.height);
    const k = Math.min(1.9, Math.max(1, (this.mode === "stage" ? 1.35 : 1.15) / aspect));
    this.camera.position.set(L.camera[0] * k, L.camera[1] * k, L.camera[2] * k);
    this.camera.lookAt(L.target[0], L.target[1], L.target[2]);
    if (this.debugCam === "close") {
      this.camera.position.set(0, 0.75, 2.1);
      this.camera.lookAt(0, 0.33, 0);
    } else if (this.debugCam === "top") {
      this.camera.position.set(0.01, 1.6, 0.35);
      this.camera.lookAt(0, 0, 0);
    } else if (this.debugCam === "face") {
      this.camera.position.set(0.05, 0.56, 1.05);
      this.camera.lookAt(0, 0.5, 0.33);
    } else if (this.debugCam === "side2") {
      this.camera.position.set(-2.1, 0.6, 0.2);
      this.camera.lookAt(0, 0.33, 0);
    } else if (this.debugCam === "side") {
      this.camera.position.set(2.1, 0.6, 0.2);
      this.camera.lookAt(0, 0.33, 0);
    }
    this.camera.updateProjectionMatrix();
  }

  private flush() {
    const pd = this.pending;
    const act = useEmber.getState().petAct;
    if (pd.stroke > 0.3) {
      act({ kind: "stroke", seconds: pd.stroke });
      pd.stroke = 0;
    }
    if (pd.play > 0) {
      act({ kind: "play", seconds: pd.play });
      pd.play = 0;
    }
  }

  private stepTreat(dt: number) {
    const tr = this.treatDrop;
    if (!tr || tr.y <= 0) return;
    tr.vy -= 9.8 * dt;
    tr.y += tr.vy * dt;
    if (tr.y <= 0) {
      tr.y = 0;
      tr.landed = true;
      if (Math.abs(tr.vy) > 0.8) {
        tr.vy = -tr.vy * 0.35;
        tr.y = 0.0001;
      }
    }
  }

  private stepBall(dt: number) {
    const b = this.ballState;
    const m = this.ballMesh;
    if (!b) {
      m.visible = false;
      return;
    }
    b.vy -= 9.8 * dt;
    b.y += b.vy * dt;
    if (b.y < 0) {
      b.y = 0;
      b.vy = Math.abs(b.vy) > 0.6 ? -b.vy * 0.45 : 0;
    }
    const friction = Math.exp(-(b.y > 0 ? 0.2 : 1.1) * dt);
    b.vx *= friction;
    b.vz *= friction;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    const r = Math.hypot(b.x, b.z);
    const edge = this.R + 0.15;
    if (r > edge) {
      const nx = b.x / r, nz = b.z / r;
      const dot = b.vx * nx + b.vz * nz;
      if (dot > 0) {
        b.vx -= 1.6 * dot * nx;
        b.vz -= 1.6 * dot * nz;
      }
      b.x = nx * edge;
      b.z = nz * edge;
    }
    m.visible = true;
    m.position.set(b.x, BALL_R + b.y, b.z);
    const speed = Math.hypot(b.vx, b.vz);
    if (speed > 1e-3) m.rotateOnWorldAxis(this.v.axis.set(b.vz / speed, 0, -b.vx / speed), (speed * dt) / BALL_R);
  }

  private spawn(kind: "heart" | "z" | "spark", at: THREE.Vector3, delay = 0) {
    const list = this.particles;
    if (list.length > 14) {
      const old = list.shift()!;
      this.particleGroup.remove(old.sprite);
      old.sprite.material.dispose();
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex[kind], transparent: true, depthWrite: false, opacity: 0 }));
    sprite.position.copy(at);
    const size = kind === "z" ? 0.13 : kind === "heart" ? 0.12 : 0.1;
    sprite.scale.setScalar(size);
    this.particleGroup.add(sprite);
    const spread = kind === "spark" ? 0.6 : 0.12;
    list.push({
      sprite, size,
      born: this.t + delay,
      life: kind === "z" ? 2.4 : kind === "heart" ? 1.6 : 0.7,
      vx: (Math.random() - 0.5) * spread,
      vy: kind === "spark" ? 0.5 : 0.28,
    });
  }

  private stepParticles(dt: number) {
    const list = this.particles;
    for (let k = list.length - 1; k >= 0; k--) {
      const p = list[k];
      const age = this.t - p.born;
      if (age < 0) continue;
      const u = age / p.life;
      const sp = p.sprite;
      if (u >= 1) {
        this.particleGroup.remove(sp);
        sp.material.dispose();
        list.splice(k, 1);
        continue;
      }
      sp.position.x += p.vx * dt;
      sp.position.y += p.vy * dt;
      sp.material.opacity = Math.min(1, u * 6) * (1 - u * u);
      sp.scale.setScalar(p.size * (0.7 + 0.3 * Math.min(1, u * 4)));
    }
  }

  dispose() {
    this.flush();
    stopPurr();
    const el = this.dom;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointercancel", this.onLeave);
    el.removeEventListener("pointerleave", this.onLeave);
    el.style.cursor = "";
    this.group.parent?.remove(this.group);
    for (const p of this.particles) p.sprite.material.dispose();
    this.particles = [];
    this.rig.dispose();
    this.kibble?.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
