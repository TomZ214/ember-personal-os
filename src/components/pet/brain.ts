import * as THREE from "three";
import { restPose, type Pose } from "./rig";

/**
 * What the cat does, moment to moment. A small state machine: one act at a
 * time, each with a pose to ease into and, sometimes, somewhere to go.
 *
 * What happens to the cat (a treat, the bowl, the laser, a hand) interrupts
 * whatever it was doing; otherwise it picks its own next thing, weighted by
 * how fed, rested and cheerful it is. Left alone long enough, it goes to bed.
 */

export type Act =
  | "idle" | "wander" | "sit" | "loaf" | "groom" | "stretch" | "toBed" | "sleep" | "wake"
  | "toBowl" | "eat" | "toTreat" | "treat" | "chase" | "crouch" | "leap" | "watch"
  | "ball" | "bat" | "greet" | "beg" | "come" | "purr" | "boop";

/** what the page shows about the cat right now */
export type CatStatus = "relaxing" | "exploring" | "sleeping" | "eating" | "playing" | "purring" | "grooming" | "hungry" | "greeting";

const STATUS: Record<Act, CatStatus> = {
  idle: "relaxing", sit: "relaxing", loaf: "relaxing", boop: "relaxing", wander: "exploring", come: "greeting",
  groom: "grooming", stretch: "relaxing", wake: "relaxing", toBed: "sleeping", sleep: "sleeping",
  toBowl: "eating", eat: "eating", toTreat: "eating", treat: "eating",
  chase: "playing", crouch: "playing", leap: "playing", watch: "playing", ball: "playing", bat: "playing",
  greet: "greeting", beg: "hungry", purr: "purring",
};

export interface Ball {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** the cat is still interested */
  live: boolean;
}

export interface Senses {
  t: number;
  dt: number;
  stats: { fullness: number; mood: number; energy: number; affection: number };
  /** a hand stroking the cat right now */
  petting: boolean;
  /** where the pointer is, when it moved recently (world space), for the cat to look at */
  pointer: THREE.Vector3 | null;
  laser: { x: number; z: number } | null;
  ball: Ball | null;
  bowl: { x: number; z: number; food: number } | null;
  bed: { x: number; z: number } | null;
  treat: { x: number; z: number } | null;
  /** seconds since the person last did anything here */
  idleFor: number;
  camera: THREE.Vector3;
  radius: number;
}

export interface Voice {
  meow(kind: "hello" | "ask" | "happy" | "sleepy"): void;
  purr(on: boolean): void;
  /** the cat ate the treat on the floor */
  ateTreat(): void;
  /** a mouthful from the bowl, 0..1 of a full bowl */
  ateFood(amount: number): void;
  /** seconds of play to credit */
  played(seconds: number): void;
  /** caught the laser dot */
  caught(x: number, z: number): void;
  /** hit the ball: new velocity */
  bat(vx: number, vz: number): void;
  slowBlink(): void;
}

type Targets = Pose;

const damp = THREE.MathUtils.damp;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(bx - ax, bz - az);

/** how quickly each part of the pose follows its target (1/s) */
const RATE: Partial<Record<keyof Pose, number>> = {
  eyeOpen: 12, mouth: 14, bat: 16, leap: 14, crouch: 9, happyEyes: 10, pupil: 6,
  sit: 5, loaf: 3.2, curl: 2.4, stretch: 4, groom: 5, eat: 6, purr: 5, lookW: 4,
};

export class CatBrain {
  x = 0;
  z = 0;
  heading = 0;
  speed = 0;
  turn = 0;
  phase = 0;
  lift = 0;
  wiggle = 0;
  swipe = 0;
  wrapSide = 1;

  act: Act = "idle";
  /** seconds in the current act */
  private at = 0;
  private dur = 2;
  private goal: { x: number; z: number } | null = null;

  readonly pose: Pose = restPose();
  private target: Targets = restPose();
  readonly look = new THREE.Vector3();
  hasLook = false;
  private lookPick = 0;
  private lookAtCamera = true;
  private glance = new THREE.Vector3();

  private sleptAt = 0;
  private purrBase: Act = "sit";
  private purrIdle = 0;
  private playCredit = 0;
  private bats = 0;
  private batBudget = 4;
  private batHit = false;
  private leapFrom = { x: 0, z: 0 };
  private leapTo = { x: 0, z: 0 };
  private nextMeow = 40;
  private nextBeg = 8;
  private mouthUntil = 0;
  private mouthAmount = 0;
  private greetPending = false;
  private comePending = false;
  private senses!: Senses;

  constructor(private voice: Voice, opts: { x?: number; z?: number; heading?: number; asleep?: boolean; greet?: boolean } = {}) {
    this.x = opts.x ?? 0;
    this.z = opts.z ?? 0;
    this.heading = opts.heading ?? 0;
    this.greetPending = !!opts.greet;
    if (opts.asleep) {
      this.enter("sleep");
      // start already curled up, not easing into it
      Object.assign(this.pose, { curl: 1, eyeOpen: 0, tailWrap: 1, lookW: 0 });
    }
  }

  get status(): CatStatus {
    return STATUS[this.act];
  }

  /** the person tapped the cat */
  boop() {
    if (this.act === "sleep") return this.enter("wake");
    if (this.act === "purr" || this.busyPlaying()) return;
    this.enter("boop");
  }

  /** "come here!" */
  call() {
    this.comePending = true;
  }

  private busyPlaying() {
    return this.act === "leap" || this.act === "bat";
  }

  private enter(act: Act, dur = 0) {
    if (this.act === "purr" && act !== "purr") this.voice.purr(false);
    this.act = act;
    this.at = 0;
    this.dur = dur;
    this.goal = null;
    this.wiggle = 0;
    if (act === "sleep") this.sleptAt = this.senses?.t ?? 0;
    if (act === "purr") this.voice.purr(true);
    if (act === "wake") this.say("sleepy", 1.2, 0.85);
    if (act === "bat") this.batHit = false;
  }

  /** open the mouth for a meow (or a yawn) */
  private say(kind: "hello" | "ask" | "happy" | "sleepy" | null, seconds = 0.5, amount = 0.6) {
    const t = this.senses?.t ?? 0;
    this.mouthUntil = t + seconds;
    this.mouthAmount = amount;
    if (kind) this.voice.meow(kind);
  }

  /** development only: stay in one act, to look at its pose */
  hold: Act | null = null;

  update(s: Senses) {
    this.senses = s;
    const { dt, t } = s;
    this.at += dt;
    this.turn = 0;
    const tired = s.stats.energy < 25;
    const T = this.target;
    Object.assign(T, restPose());
    if (this.hold) {
      if (this.act !== this.hold) this.enter(this.hold, 1e9);
      this.at = this.hold === "stretch" ? 1.2 : 2;
      if (this.hold === "eat" || this.hold === "toBowl") this.x = this.z = 0;
      const ahead = { x: this.x + Math.sin(this.heading) * 0.6, z: this.z + Math.cos(this.heading) * 0.6 };
      s = {
        ...s, petting: this.hold === "purr", idleFor: 0, treat: null, ball: null,
        bowl: this.hold === "eat" ? { x: 9, z: 9, food: 1 } : null,
        laser: this.hold === "crouch" ? ahead : null,
      };
      this.senses = s;
    }

    /* ---- interruptions, most urgent first ---- */
    const asleep = this.act === "sleep";
    const disturbed = asleep && s.idleFor < t - this.sleptAt - 0.5;

    if (this.hold) {
      // nothing interrupts a held pose
    } else if (s.petting) {
      this.purrIdle = 0;
      if (this.act !== "purr") {
        this.purrBase = asleep || this.act === "loaf" ? "loaf" : this.act === "sit" || this.act === "groom" || this.act === "beg" ? "sit" : "sit";
        this.enter("purr");
      }
    } else if (s.treat && !["toTreat", "treat", "leap", "purr"].includes(this.act)) {
      this.enter("toTreat");
    } else if (s.bowl && s.bowl.food > 0.02 && s.stats.fullness < 99 && !["toBowl", "eat", "toTreat", "treat", "purr", "leap"].includes(this.act)) {
      this.enter("toBowl");
    } else if (s.laser && !["chase", "crouch", "leap", "watch", "purr", "toTreat", "treat", "eat"].includes(this.act)) {
      this.enter(s.stats.energy < 15 ? "watch" : "chase");
    } else if (s.ball?.live && !s.laser && !["ball", "bat", "purr", "toTreat", "treat", "eat", "toBowl", "leap"].includes(this.act)) {
      this.bats = 0;
      this.batBudget = Math.round(rand(3, 6));
      this.enter("ball");
    } else if (disturbed) {
      this.enter("wake");
    } else if (this.comePending && !["purr", "eat", "treat", "leap", "bat"].includes(this.act)) {
      this.comePending = false;
      this.enter("come");
    } else if (this.greetPending && !["sleep", "wake", "stretch"].includes(this.act)) {
      this.greetPending = false;
      this.enter("greet");
    }

    /* ---- falling asleep ---- */
    const sleepAfter = tired ? 14 : s.stats.energy < 45 ? 32 : 55;
    const restful = ["idle", "sit", "loaf", "groom", "wander", "beg", "boop"].includes(this.act);
    if (restful && s.idleFor > sleepAfter && !this.hold) this.enter("toBed");

    /* ---- the act itself ---- */
    switch (this.act) {
      case "idle": {
        this.brake(dt);
        T.tailUp = 0.35;
        if (this.at > (this.dur || 2.5)) this.choose();
        break;
      }
      case "wander": {
        if (!this.goal) this.goal = this.pickSpot(s);
        T.tailUp = 0.5;
        T.tailSway = 0.18;
        if (this.moveTo(this.goal.x, this.goal.z, tired ? 0.3 : 0.42, dt) || this.at > 12) this.enter("idle", rand(0.8, 2));
        break;
      }
      case "sit":
      case "boop":
      case "beg": {
        this.brake(dt);
        T.sit = 1;
        T.tailWrap = this.at > 0.6 ? 1 : 0;
        T.tailSway = 0.12;
        if (this.act === "boop") {
          T.tailUp = 0.7;
          T.tailWrap = 0;
          if (this.at < dt * 1.5) this.say(Math.random() < 0.5 ? "happy" : null, 0.35, 0.4);
          if (this.at > 2.2) this.enter("sit", rand(3, 6));
        }
        if (this.act === "beg") {
          // hungry: sit by the bowl, look at the person, ask now and then
          if (this.at > this.nextBeg) {
            this.say("ask", 0.7, 0.75);
            this.nextBeg = this.at + rand(5, 8);
          }
          if (this.at > 16) this.enter("idle", 1);
        } else if (this.act === "sit" && this.at > (this.dur || 6)) this.choose();
        break;
      }
      case "loaf": {
        this.brake(dt);
        T.loaf = 1;
        T.tailWrap = 0.8;
        T.eyeOpen = 0.62;
        T.tailSway = 0.08;
        if (this.at > (this.dur || 10)) this.choose();
        break;
      }
      case "groom": {
        this.brake(dt);
        T.sit = 1;
        T.groom = this.at > 0.5 && this.at < this.dur - 0.4 ? 1 : 0;
        T.eyeOpen = 0.35;
        T.tailWrap = 1;
        T.lookW = 0;
        T.mouth = T.groom * (0.25 + Math.max(0, Math.sin(t * 8.5)) * 0.2);
        if (this.at > this.dur) this.enter("sit", rand(2, 5));
        break;
      }
      case "stretch": {
        this.brake(dt);
        const u = this.at / 2.6;
        T.stretch = u < 0.85 ? 1 : 0;
        T.tailUp = 1;
        T.eyeOpen = 0.35;
        T.lookW = 0.2;
        if (u > 0.35 && u < 0.75) T.mouth = 0.85; // the yawn
        if (u >= 1) this.enter("idle", rand(1, 2));
        break;
      }
      case "toBed": {
        T.eyeOpen = 0.55;
        const bed = s.bed;
        if (bed && this.moveTo(bed.x, bed.z, 0.28, dt, 0.08) === false && this.at < 15) break;
        this.enter("sleep");
        break;
      }
      case "sleep": {
        this.brake(dt);
        T.curl = 1;
        T.eyeOpen = 0;
        T.tailWrap = 1;
        T.tailSway = 0.04;
        T.tailSpeed = 0.6;
        T.lookW = 0;
        T.earsBack = 0.1;
        break;
      }
      case "wake": {
        this.brake(dt);
        T.loaf = this.at < 1.6 ? 1 : 0;
        T.eyeOpen = this.at < 0.4 ? 0.2 : 0.7;
        T.lookW = 0.8;
        if (this.at > 1.6) this.enter("stretch");
        break;
      }
      case "toBowl": {
        const bowl = s.bowl;
        if (!bowl) {
          this.enter("idle");
          break;
        }
        const spot = this.approach(bowl.x, bowl.z, 0.4);
        T.tailUp = 0.75;
        if (this.moveTo(spot.x, spot.z, 0.55, dt, 0.06) || this.at > 10) {
          if (this.face(bowl.x, bowl.z, dt)) this.enter(bowl.food > 0.02 ? "eat" : "beg");
        }
        break;
      }
      case "eat": {
        this.brake(dt);
        const bowl = s.bowl;
        T.eat = 1;
        T.lookW = 0;
        T.eyeOpen = 0.6;
        T.tailUp = 0.2;
        T.tailSway = 0.3;
        if (bowl && this.at > 0.6) {
          const bite = Math.min(bowl.food, dt * 0.2);
          if (bite > 0) this.voice.ateFood(bite);
        }
        if (!bowl || bowl.food <= 0.02 || this.at > 8) {
          // licks its lips and has a wash, as cats do after a meal
          this.enter("groom", rand(3.5, 5));
        }
        break;
      }
      case "toTreat": {
        const treat = s.treat;
        if (!treat) {
          this.enter("idle");
          break;
        }
        const spot = this.approach(treat.x, treat.z, 0.3);
        T.tailUp = 0.9;
        T.pupil = 0.8;
        if (this.moveTo(spot.x, spot.z, 0.85, dt, 0.06) || this.at > 6) {
          if (this.face(treat.x, treat.z, dt)) this.enter("treat", 1.3);
        }
        break;
      }
      case "treat": {
        this.brake(dt);
        T.eat = this.at < 1 ? 1 : 0;
        T.lookW = 0;
        T.tailUp = 1;
        if (this.at > this.dur) {
          this.voice.ateTreat();
          this.say("happy", 0.45, 0.6);
          this.enter("sit", rand(2, 4));
        }
        break;
      }
      case "chase": {
        const laser = s.laser;
        if (!laser) {
          this.enter("sit", rand(2, 4));
          break;
        }
        this.credit(dt);
        T.pupil = 1;
        T.tailUp = 0.45;
        T.tailSway = 0.5;
        T.tailSpeed = 4;
        this.look.set(laser.x, 0, laser.z);
        this.hasLook = true;
        const d = dist(this.x, this.z, laser.x, laser.z);
        const fast = s.stats.energy < 35 ? 0.9 : 1.45;
        if (d < 0.5) {
          if (this.face(laser.x, laser.z, dt)) this.enter("crouch", rand(0.45, 1));
        } else this.moveTo(laser.x, laser.z, fast, dt, 0.4);
        break;
      }
      case "crouch": {
        this.brake(dt);
        const laser = s.laser;
        T.crouch = 1;
        T.pupil = 1;
        T.tailUp = -0.25;
        T.tailSway = 0.6;
        T.tailSpeed = 7;
        T.earsBack = 0.1;
        this.wiggle = Math.min(1, this.at / 0.4);
        this.credit(dt);
        if (!laser) {
          this.enter("sit", 2);
          break;
        }
        this.look.set(laser.x, 0, laser.z);
        this.hasLook = true;
        this.face(laser.x, laser.z, dt);
        if (dist(this.x, this.z, laser.x, laser.z) > 0.8) this.enter("chase");
        else if (this.at > this.dur) {
          this.leapFrom = { x: this.x, z: this.z };
          // land with the front paws on the dot
          const a = Math.atan2(laser.x - this.x, laser.z - this.z);
          const reach = Math.max(0, Math.min(0.85, dist(this.x, this.z, laser.x, laser.z) - 0.28));
          this.leapTo = { x: this.x + Math.sin(a) * reach, z: this.z + Math.cos(a) * reach };
          this.heading = a;
          this.enter("leap", 0.42);
        }
        break;
      }
      case "leap": {
        const u = Math.min(1, this.at / this.dur);
        const e = u * u * (3 - 2 * u);
        this.x = this.leapFrom.x + (this.leapTo.x - this.leapFrom.x) * e;
        this.z = this.leapFrom.z + (this.leapTo.z - this.leapFrom.z) * e;
        this.lift = Math.sin(u * Math.PI) * 0.2;
        this.speed = 0;
        T.leap = u < 0.85 ? 1 : 0;
        T.pupil = 1;
        T.tailUp = 0.3;
        this.credit(dt);
        if (u >= 1) {
          this.lift = 0;
          const laser = s.laser;
          const paws = { x: this.x + Math.sin(this.heading) * 0.3, z: this.z + Math.cos(this.heading) * 0.3 };
          if (laser && dist(paws.x, paws.z, laser.x, laser.z) < 0.3) this.voice.caught(paws.x, paws.z);
          this.enter(laser ? "chase" : "sit", 2);
        }
        break;
      }
      case "watch": {
        // too tired to run: lies there and follows the dot with its eyes
        this.brake(dt);
        T.loaf = 1;
        T.pupil = 1;
        T.tailSway = 0.25;
        T.tailSpeed = 5;
        if (s.laser) {
          this.look.set(s.laser.x, 0, s.laser.z);
          this.hasLook = true;
        } else this.enter("loaf", 4);
        break;
      }
      case "ball": {
        const ball = s.ball;
        if (!ball || !ball.live) {
          this.enter("sit", rand(2, 4));
          break;
        }
        this.credit(dt);
        T.pupil = 1;
        T.tailUp = 0.5;
        T.tailSway = 0.45;
        T.tailSpeed = 4;
        // aim where the ball is going to be
        const ax = ball.x + ball.vx * 0.25;
        const az = ball.z + ball.vz * 0.25;
        this.look.set(ball.x, 0.07, ball.z);
        this.hasLook = true;
        const paws = { x: this.x + Math.sin(this.heading) * 0.33, z: this.z + Math.cos(this.heading) * 0.33 };
        const near = dist(paws.x, paws.z, ball.x, ball.z) < 0.16;
        if (near) {
          if (this.bats >= this.batBudget || s.stats.energy < 15) {
            ball.live = false;
            this.enter("groom", rand(3, 4.5));
          } else this.enter("bat", 0.42);
        } else {
          const spot = this.approach(ax, az, 0.33);
          this.moveTo(spot.x, spot.z, s.stats.energy < 35 ? 0.8 : 1.25, dt, 0.03);
        }
        break;
      }
      case "bat": {
        this.brake(dt);
        const u = this.at / this.dur;
        T.bat = 1;
        T.crouch = 0.35;
        T.pupil = 1;
        this.swipe = u < 0.45 ? 0 : Math.min(1, (u - 0.45) / 0.18);
        const ball = s.ball;
        if (ball) {
          this.look.set(ball.x, 0.07, ball.z);
          this.hasLook = true;
        }
        if (!this.batHit && u > 0.55 && ball) {
          this.batHit = true;
          this.bats++;
          const a = this.heading + rand(-0.8, 0.8);
          const v = rand(1.3, 2.3);
          this.voice.bat(Math.sin(a) * v, Math.cos(a) * v);
        }
        this.credit(dt);
        if (u >= 1) this.enter("ball");
        break;
      }
      case "greet":
      case "come": {
        // the person is back: trot over, tail up, and say hello
        const spot = { x: 0, z: s.radius * 0.5 };
        T.tailUp = 1;
        T.tailSway = 0.12;
        if (this.moveTo(spot.x, spot.z, 0.6, dt, 0.08) || this.at > 8) {
          this.brake(dt);
          this.lookAtCamera = true;
          if (this.face(s.camera.x, s.camera.z, dt)) {
            this.say("hello", 0.55, 0.7);
            this.voice.slowBlink();
            this.enter("sit", rand(4, 7));
            this.target.tailUp = 1;
          }
        }
        break;
      }
      case "purr": {
        this.brake(dt);
        if (this.purrBase === "loaf") T.loaf = 1;
        else T.sit = 1;
        T.purr = 1;
        T.happyEyes = 1;
        T.eyeOpen = 0;
        T.tailUp = 0.6;
        T.tailWrap = 0.5;
        T.tailSway = 0.15;
        T.tailSpeed = 1;
        T.lookW = 0.3;
        T.headRoll = 0.12;
        if (!s.petting) {
          this.purrIdle += dt;
          if (this.purrIdle > 1.6) this.enter(this.purrBase, rand(3, 6));
        }
        break;
      }
    }

    /* ---- mood shows ---- */
    if (s.stats.mood < 35 && this.act !== "purr") {
      T.earsBack = Math.max(T.earsBack, 0.4);
      T.tailUp -= 0.35;
      T.headPitch += 0.1;
    } else if (s.stats.mood > 78) T.tailUp += 0.15;
    if (tired && this.act !== "sleep") T.eyeOpen = Math.min(T.eyeOpen, 0.6);

    /* ---- a meow now and then, when someone is around ---- */
    if (t > this.nextMeow && s.idleFor < 6 && ["idle", "sit", "wander"].includes(this.act)) {
      this.say(s.stats.fullness < 30 ? "ask" : "hello", 0.5, 0.6);
      this.nextMeow = t + rand(45, 100);
    }
    if (t < this.mouthUntil) T.mouth = Math.max(T.mouth, this.mouthAmount);

    /* ---- hungry and nothing in the bowl: go and sit by it ---- */
    if (s.stats.fullness < 28 && s.bowl && s.bowl.food <= 0.02 && t > this.nextBegTrip && ["idle", "sit", "wander"].includes(this.act)) {
      this.nextBegTrip = t + 40;
      this.nextBeg = 1.2;
      this.enter("toBowl");
    }

    /* ---- where to look ---- */
    this.decideLook(s);

    /* ---- ease the pose ---- */
    for (const k of Object.keys(this.pose) as (keyof Pose)[]) {
      // a held pose (development) snaps, so a slow renderer still shows it whole
      this.pose[k] = this.hold ? T[k] : damp(this.pose[k], T[k], RATE[k] ?? 6, dt);
    }
    if (this.act !== "bat") this.swipe = damp(this.swipe, 0, 10, dt);

    // gait: the legs advance with the distance covered, so paws don't skate
    const stride = 0.34 + this.speed * 0.22;
    this.phase += (this.speed * dt * Math.PI * 2) / stride + Math.abs(this.turn) * dt * 1.4;

  }
  private nextBegTrip = 20;

  private credit(dt: number) {
    this.playCredit += dt;
    if (this.playCredit >= 2.5) {
      this.voice.played(this.playCredit);
      this.playCredit = 0;
    }
  }

  /** next thing to do, when nothing in particular is going on */
  private choose() {
    const s = this.senses;
    const e = s.stats.energy / 100;
    const m = s.stats.mood / 100;
    const options: [Act, number, number, number][] = [
      // act, weight, min s, max s
      ["wander", 2.6 * (e + 0.25), 0, 0],
      ["sit", 2, 4, 9],
      ["loaf", 0.8 + (1 - e) * 2.2, 6, 14],
      ["groom", 1.1, 3.5, 6],
      ["stretch", 0.5 * e + 0.15, 2.6, 2.6],
      ["idle", 1.2, 1.5, 3.5],
      ["boop", m > 0.7 ? 0.25 : 0, 2.2, 2.2],
    ];
    let total = 0;
    for (const o of options) total += o[1];
    let r = Math.random() * total;
    for (const [act, w, lo, hi] of options) {
      r -= w;
      if (r <= 0) {
        this.enter(act, rand(lo, hi));
        if (act === "sit" || act === "loaf") this.wrapSide = Math.random() < 0.5 ? 1 : -1;
        return;
      }
    }
    this.enter("idle", 2);
  }

  private decideLook(s: Senses) {
    const T = this.target;
    // following the pointer wins whenever the cat is awake and free to
    if (s.pointer && T.lookW > 0.5 && !["chase", "crouch", "leap", "ball", "bat", "watch"].includes(this.act)) {
      this.look.copy(s.pointer);
      this.hasLook = true;
      return;
    }
    if (["chase", "crouch", "leap", "ball", "bat", "watch"].includes(this.act)) return;
    // otherwise: now at the person, now somewhere else
    if (s.t > this.lookPick) {
      this.lookPick = s.t + rand(1.8, 4.5);
      this.lookAtCamera = Math.random() < 0.55;
      const a = this.heading + rand(-1, 1);
      this.glance.set(this.x + Math.sin(a) * 1.5, rand(0, 0.6), this.z + Math.cos(a) * 1.5);
      if (this.lookAtCamera && s.stats.affection > 60 && Math.random() < 0.3) this.voice.slowBlink();
    }
    this.look.copy(this.lookAtCamera ? s.camera : this.glance);
    this.hasLook = this.act !== "wander" || this.lookAtCamera;
  }

  /** a free spot to stroll to, away from the bowl */
  private pickSpot(s: Senses) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * s.radius * 0.9;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (s.bowl && dist(x, z, s.bowl.x, s.bowl.z) < 0.5) continue;
      if (dist(x, z, this.x, this.z) < 0.4) continue;
      return { x, z };
    }
    return { x: 0, z: 0 };
  }

  /** where to stand to reach something at (x, z) with the nose/paws */
  private approach(x: number, z: number, gap: number) {
    const a = Math.atan2(this.x - x, this.z - z);
    return { x: x + Math.sin(a) * gap, z: z + Math.cos(a) * gap };
  }

  private brake(dt: number) {
    this.speed = damp(this.speed, 0, 8, dt);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.contain();
  }

  /** turn toward a point without walking; true once facing it */
  private face(x: number, z: number, dt: number) {
    const want = Math.atan2(x - this.x, z - this.z);
    const diff = wrapAngle(want - this.heading);
    const step = Math.max(-4 * dt, Math.min(4 * dt, diff));
    this.heading = wrapAngle(this.heading + step);
    this.turn = step / Math.max(dt, 1e-4);
    return Math.abs(diff) < 0.12;
  }

  /** walk toward a point; true on arrival */
  private moveTo(tx: number, tz: number, max: number, dt: number, arrive = 0.06) {
    const R = this.senses.radius;
    const r = Math.hypot(tx, tz);
    if (r > R) {
      tx *= R / r;
      tz *= R / r;
    }
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < arrive) {
      this.brake(dt);
      return true;
    }
    const want = Math.atan2(dx, dz);
    const diff = wrapAngle(want - this.heading);
    const rate = max > 1 ? 6.5 : 3.6;
    const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
    this.heading = wrapAngle(this.heading + step);
    this.turn = step / Math.max(dt, 1e-4);
    const align = Math.max(0, Math.cos(diff));
    const want_v = max * align * align * Math.min(1, d / 0.35 + 0.2);
    this.speed = damp(this.speed, want_v, 5, dt);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.contain();
    return false;
  }

  /** stay on the rug, and out of the food bowl */
  private contain() {
    const s = this.senses;
    const R = s.radius;
    const r = Math.hypot(this.x, this.z);
    if (r > R) {
      this.x *= R / r;
      this.z *= R / r;
    }
    if (s.bowl && this.act !== "eat") {
      const d = dist(this.x, this.z, s.bowl.x, s.bowl.z);
      if (d < 0.36 && d > 1e-4) {
        this.x = s.bowl.x + ((this.x - s.bowl.x) / d) * 0.36;
        this.z = s.bowl.z + ((this.z - s.bowl.z) / d) * 0.36;
      }
    }
  }
}
