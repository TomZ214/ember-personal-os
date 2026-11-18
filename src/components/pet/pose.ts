import type * as THREE from "three";

/**
 * The language between the brain (what the cat does) and the body (how it
 * looks doing it): a handful of blend amounts and offsets, eased by the
 * brain and turned into bone rotations by the rig.
 */

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
  earsBack: 0, eyeOpen: 1, happyEyes: 0, mouth: 0, purr: 0, pupil: 0.5,
  headPitch: 0, headYaw: 0, headRoll: 0, lookW: 1,
});

/**
 * Distance covered by one full gait cycle (all four paws once) at a speed,
 * in scene units. The brain advances the gait by it and the rig sweeps the
 * paws by it, so a planted paw never slides.
 */
export const strideFor = (speed: number) => 0.42 + speed * 0.25;

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
