/**
 * Movement tuning. The client predicts with these numbers and the server
 * simulates with them, so there is exactly one copy, here.
 *
 * Horizontal movement is deliberately NOT a progression axis in this game:
 * progression buys BALLOONS, and balloons decide how high a player can float.
 */
export interface MovementConfig {
  /** Movement speed, world units per second. There is no sprint. */
  readonly moveSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  /** Fraction of ground acceleration retained while airborne (0..1). */
  readonly airControl: number;
  /** Turn rate toward the movement direction, radians per second. */
  readonly turnSpeed: number;
  /** Largest distance one substep may integrate. See `stepPlayer`. */
  readonly maxSubstepDistance: number;
  readonly maxSubsteps: number;
  /** Height the player steps up without jumping. Pads sit under it. */
  readonly stepHeight: number;
  /** Seconds after leaving a ledge during which the jump still counts. */
  readonly coyoteTime: number;
}

export const MOVEMENT: MovementConfig = {
  moveSpeed: 22,
  acceleration: 150,
  deceleration: 120,
  airControl: 0.8,
  turnSpeed: 12,
  maxSubstepDistance: 0.8,
  maxSubsteps: 160,
  stepHeight: 0.9,
  coyoteTime: 0.11,
};

/**
 * The balloon jump.
 *
 * HOW HIGH a jump goes is the balloon mechanic, and it is a PHYSICAL STRENGTH: every
 * jump rises exactly the player's balloon lift (`balloonLiftFor`), at least
 * `minHop` (`jumpHeightFor`). Nothing else enters it - not the step, the altitude,
 * the world position or the staircase ahead - so the same balloons gain the same
 * height at stud 1, stud 300 and in World 2. A riser taller than the lift is simply
 * not reached by the jump.
 *
 * The physics is solved backwards from that height (`resolveJumpPhysics`): the
 * time to the apex grows only logarithmically, so a small hop is slow and floaty
 * and a lift thousands of units high still takes little more than a second. A
 * walk-off falls like a jump the height of the riser it drops down (a fall, never
 * a jump, so it has no effect on the lift).
 */
export const BALLOON_JUMP = {
  /** The smallest jump, for a player with next to no balloons. */
  minHop: 1.6,
  /** The height whose rise takes `apexTimeBase`. */
  referenceHeight: 8,
  /** Seconds to the apex of a reference-height jump: a slow, balloon-borne rise. */
  apexTimeBase: 0.95,
  /** Extra seconds to the apex each time the height doubles. */
  apexTimePerDoubling: 0.14,
  apexTimeMin: 0.6,
  apexTimeMax: 2.2,
  /**
   * Coming DOWN, the balloon holds the player up: gravity is this fraction of the
   * arc's, and the fall never gets faster than this fraction of the launch speed.
   * Only the descent - the rise, and so the height reached, is untouched.
   */
  descentGravity: 0.5,
  descentTerminal: 0.55,
  /** A walk-off falls as if from a riser at least this tall. */
  walkOffMinHeight: 8,
} as const;

export interface JumpPhysics {
  readonly height: number;
  /** Launch speed, and the fastest the arc falls. */
  readonly velocity: number;
  readonly gravity: number;
}

/** Launch velocity and gravity for a jump that peaks exactly `height` up. */
export const resolveJumpPhysics = (height: number): JumpPhysics => {
  const h = Number.isFinite(height) && height > BALLOON_JUMP.minHop ? height : BALLOON_JUMP.minHop;
  const t = Math.min(
    Math.max(BALLOON_JUMP.apexTimeBase + BALLOON_JUMP.apexTimePerDoubling * Math.log2(h / BALLOON_JUMP.referenceHeight), BALLOON_JUMP.apexTimeMin),
    BALLOON_JUMP.apexTimeMax,
  );
  return { height: h, velocity: (2 * h) / t, gravity: (2 * h) / (t * t) };
};

/**
 * THE jump height: the balloon lift, never less than a hop. Takes the lift and
 * nothing else, on purpose - a position cannot be passed in.
 */
export const jumpHeightFor = (lift: number): number =>
  Math.max(Number.isFinite(lift) ? lift : 0, BALLOON_JUMP.minHop);
