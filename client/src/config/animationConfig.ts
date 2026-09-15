import type { PoseDefinition } from '../animation/PoseBuffer.js';

const deg = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Procedural animation tuning, ported from the earlier games and re-tuned for
 * a player who always holds a balloon. All rotations are in character space
 * (see `PlayerRig`): +X pitch swings a limb backward, +Y yaws, +Z rolls.
 */

/** Height of the tip pivot above the feet (hip height): the float sway turns about it. */
export const TIP_PIVOT_HEIGHT = 1.1;

export const LOCOMOTION = {
  strideDistance: 7,
  minFrequency: 0.6,
  maxFrequency: 3.4,
  walkSpeed: 12,
  runSpeed: 22,
  idleSpeed: 0.6,
  hipSwing: { walk: deg(28), run: deg(40) },
  kneeBend: { walk: deg(36), run: deg(64) },
  armSwing: { walk: deg(24), run: deg(36) },
  elbowBend: { walk: deg(16), run: deg(40) },
  torsoTwist: { walk: deg(5), run: deg(8) },
  torsoLean: { walk: deg(4), run: deg(10) },
  headCounterTwist: { walk: deg(3), run: deg(5) },
  bob: { walk: 0.06, run: 0.11 },
  torsoRoll: { walk: deg(2), run: deg(4) },
} as const;

export const IDLE = {
  breathFrequency: 0.35,
  breathAmount: deg(2.2),
  breathBob: 0.018,
  basePose: {
    ArmL1: { z: deg(-5) },
    ArmR1: { z: deg(5) },
    ArmL2: { x: deg(6) },
    ArmR2: { x: deg(6) },
    Spine1: { x: deg(1.5) },
  } satisfies PoseDefinition,
} as const;

/**
 * The balloon hand: the right arm raised, holding the string, layered over
 * every other pose. It sways a little with the body and pulls a little higher
 * while rising, as if the balloon were doing the lifting.
 */
export const HOLD_BALLOON = {
  shoulder: deg(-158),
  shoulderRoll: deg(14),
  elbow: deg(10),
  /** Extra lift of the arm while rising, at full rise. */
  riseShoulder: deg(-12),
  swayAmount: deg(5),
  swayFrequency: 0.9,
} as const;

export const JUMP_START = {
  duration: 0.1,
  pose: {
    Spine1: { x: deg(12) },
    Spine2: { x: deg(5) },
    Neck1: { x: deg(-8) },
    LegL1: { x: deg(-24) },
    LegR1: { x: deg(-24) },
    LegL2: { x: deg(44) },
    LegR2: { x: deg(44) },
    ArmL1: { x: deg(-40), z: deg(-18) },
    ArmL2: { x: deg(20) },
  } satisfies PoseDefinition,
  bobY: -0.12,
} as const;

/**
 * Airborne: a floaty lift rather than a leap. Rising, the legs dangle together
 * and the free arm drifts out; falling, the legs part to land.
 */
export const AIRBORNE = {
  velocityReference: 18,
  rise: {
    Spine1: { x: deg(-8) },
    Neck1: { x: deg(-10) },
    LegL1: { x: deg(-10) },
    LegR1: { x: deg(4) },
    LegL2: { x: deg(30) },
    LegR2: { x: deg(22) },
    ArmL1: { x: deg(-20), z: deg(-48) },
    ArmL2: { x: deg(14) },
  } satisfies PoseDefinition,
  fall: {
    Spine1: { x: deg(6) },
    Neck1: { x: deg(-4) },
    LegL1: { x: deg(-26) },
    LegR1: { x: deg(14) },
    LegL2: { x: deg(34) },
    LegR2: { x: deg(18) },
    ArmL1: { x: deg(-60), z: deg(-40) },
    ArmL2: { x: deg(26) },
  } satisfies PoseDefinition,
} as const;

/** The gentle side-to-side sway of a player drifting under a balloon. */
export const FLOAT_SWAY = {
  roll: deg(5),
  pitch: deg(3),
  frequency: 1.4,
  /** How far the body is lifted toward the balloon at the top of a rise. */
  lift: 0.12,
} as const;

export const LANDING = {
  duration: 0.16,
  pose: {
    Spine1: { x: deg(14) },
    Spine2: { x: deg(6) },
    Neck1: { x: deg(-8) },
    LegL1: { x: deg(-24) },
    LegR1: { x: deg(-24) },
    LegL2: { x: deg(46) },
    LegR2: { x: deg(46) },
    ArmL1: { x: deg(20), z: deg(-22) },
    ArmL2: { x: deg(30) },
  } satisfies PoseDefinition,
  bobY: -0.16,
} as const;

export const TRANSITIONS = {
  toLocomotion: 0.16,
  toJumpStart: 0.05,
  toAirborne: 0.18,
  toLanding: 0.05,
} as const;

/**
 * Playback rate of the jump animations - the crouch, the airborne poses and the
 * landing - relative to their authored speed. Purely visual: the jump physics
 * are untouched.
 */
export const JUMP_ANIMATION = {
  playbackRate: 0.7,
  /** How fast the rise/fall pose follows vertical velocity, per second, before the rate. */
  airBlendRate: 5,
} as const;
