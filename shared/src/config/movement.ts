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
 * HOW HIGH a jump goes is the balloon mechanic: it rises toward the player's REACH
 * (the altitude their balloons lift them to, see `reachYFor`) but no further than
 * the top of the step ahead plus `clearance` (`jumpHeightFor`) - so it always
 * clears the next riser that is within reach, and never leaves anyone drifting
 * down for minutes from far above it. It is never less than `minHop`.
 *
 * The physics is solved backwards from that height (`resolveJumpPhysics`): the
 * time to the apex grows only logarithmically, so a small hop is slow and floaty
 * and a riser thousands of units tall still takes little more than a second. A
 * walk-off falls like a jump the height of the riser it drops down.
 */
export const BALLOON_JUMP = {
  /** The smallest jump: what a player at their reach still gets. */
  minHop: 1.6,
  /** How far above the next step's top a jump rises. */
  clearance: 3,
  /** The height whose rise takes `apexTimeBase`. */
  referenceHeight: 8,
  /** Seconds to the apex of a reference-height jump. */
  apexTimeBase: 0.59,
  /** Extra seconds to the apex each time the height doubles. */
  apexTimePerDoubling: 0.09,
  apexTimeMin: 0.35,
  apexTimeMax: 1.3,
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

/** How high a jump from `feetY` goes, with the reach at `reachY` and the next step's top at `nextTopY`. */
export const jumpHeightFor = (feetY: number, reachY: number, nextTopY: number): number => {
  const feet = Number.isFinite(feetY) ? feetY : 0;
  const room = (Number.isFinite(reachY) ? reachY : 0) - feet;
  const needed = (Number.isFinite(nextTopY) ? nextTopY : feet) - feet + BALLOON_JUMP.clearance;
  return Math.max(Math.min(room, needed), BALLOON_JUMP.minHop);
};
