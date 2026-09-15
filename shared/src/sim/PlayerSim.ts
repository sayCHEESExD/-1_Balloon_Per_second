import { BALLOON_JUMP, MOVEMENT, jumpHeightFor, resolveJumpPhysics } from '../config/movement.js';
import { nextStepTopFrom, standLimitFor, stepAt } from '../config/course.js';
import { BODY_HEIGHT, SPAWN_POSITION, SPAWN_ROTATION_Y } from '../constants/world.js';
import { rotateTowards } from '../types/math.js';
import type { WorldCollision } from './WorldCollision.js';

/**
 * The authoritative physics step, shared by the server and client prediction.
 *
 * THE movement simulation. The server runs it to own the result and the client
 * runs the identical function to predict, so the two can only disagree through
 * inputs, never through different maths. Allocation-free.
 *
 * The one mechanic this game adds is the BALLOON JUMP: its height is solved from
 * the player's reach and the step ahead, and its gravity from its height, so a
 * hop floats and a towering riser is still a single quick jump.
 */

export interface PlayerMotion {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  grounded: boolean;
  /** Edge-detect for the jump control, so holding it does not re-fire. */
  jumpLatched: boolean;
  /** Monotonic count of jumps started, so remotes can play the jump. */
  jumpCount: number;
  /** Seconds of coyote time left. */
  coyote: number;
  /** Gravity and fastest fall of the current airborne arc: a jump's own, or a walk-off's. */
  airGravity: number;
  airTerminal: number;
}

export interface MovementInput {
  moveX: number;
  moveZ: number;
  jump: boolean;
  cameraYaw: number;
}

/** Server-owned tuning the step reads but never changes. */
export interface SimParams {
  /** The altitude the player's balloons reach (`reachYFor`). */
  reachY: number;
}

export interface SimEvents {
  jumpStarted: boolean;
  landed: boolean;
}

export const MAX_SIM_DELTA = 0.1;

/** The arc a player walking off flat ground falls with. */
const FLAT_FALL = resolveJumpPhysics(BALLOON_JUMP.walkOffMinHeight);

/** A walk-off from the step at `z` falls like a jump the height of its riser. */
const walkOffPhysicsAt = (z: number) => resolveJumpPhysics(Math.max(BALLOON_JUMP.walkOffMinHeight, stepAt(z)?.rise ?? 0));

export const createMotion = (): PlayerMotion => ({
  x: SPAWN_POSITION.x,
  y: SPAWN_POSITION.y,
  z: SPAWN_POSITION.z,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: SPAWN_ROTATION_Y,
  grounded: true,
  jumpLatched: false,
  jumpCount: 0,
  coyote: 0,
  airGravity: FLAT_FALL.gravity,
  airTerminal: FLAT_FALL.velocity,
});

export const createSimEvents = (): SimEvents => ({
  jumpStarted: false,
  landed: false,
});

export const createMovementInput = (): MovementInput => ({
  moveX: 0,
  moveZ: 0,
  jump: false,
  cameraYaw: 0,
});

export const resetMotion = (
  motion: PlayerMotion,
  x = SPAWN_POSITION.x,
  y = SPAWN_POSITION.y,
  z = SPAWN_POSITION.z,
  yaw = SPAWN_ROTATION_Y,
): void => {
  motion.x = x;
  motion.y = y;
  motion.z = z;
  motion.vx = 0;
  motion.vy = 0;
  motion.vz = 0;
  motion.yaw = yaw;
  motion.grounded = true;
  motion.jumpLatched = false;
  motion.coyote = 0;
  motion.airGravity = FLAT_FALL.gravity;
  motion.airTerminal = FLAT_FALL.velocity;
};

export const horizontalSpeed = (motion: PlayerMotion): number => Math.hypot(motion.vx, motion.vz);

/** Clamp an arriving input to sane, finite values. Applied by the server. */
export const sanitiseInput = (input: Partial<MovementInput> | undefined): MovementInput => {
  const finite = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;
  let moveX = finite(input?.moveX);
  let moveZ = finite(input?.moveZ);
  const magnitude = Math.hypot(moveX, moveZ);
  if (magnitude > 1) {
    moveX /= magnitude;
    moveZ /= magnitude;
  }
  return {
    moveX,
    moveZ,
    jump: input?.jump === true,
    cameraYaw: finite(input?.cameraYaw),
  };
};

const BOUNDS = { x: 0, z: 0 };

/** Advance one player by one step. */
export const stepPlayer = (
  motion: PlayerMotion,
  input: MovementInput,
  params: SimParams,
  delta: number,
  collision: WorldCollision,
  events: SimEvents,
): void => {
  events.jumpStarted = false;
  events.landed = false;

  const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_SIM_DELTA) : 0;
  if (dt === 0) return;

  const wasGrounded = motion.grounded;

  if (motion.grounded) {
    const fall = walkOffPhysicsAt(motion.z);
    motion.airGravity = fall.gravity;
    motion.airTerminal = fall.velocity;
  }
  applyJump(motion, input, params, events);
  applyHorizontal(motion, input, dt);

  // Gravity in two half-steps around the move (velocity Verlet), so an arc peaks at
  // exactly its height however fast it launches - a towering riser is cleared by its
  // planned margin, not short of it.
  motion.vy -= motion.airGravity * dt * 0.5;
  if (motion.vy < -motion.airTerminal) motion.vy = -motion.airTerminal;

  // Substep until no substep travels further than `maxSubstepDistance`, so a
  // fast step collides as reliably as a slow one.
  const travel = Math.hypot(motion.vx, motion.vy, motion.vz) * dt;
  const substeps = Math.max(1, Math.min(Math.ceil(travel / MOVEMENT.maxSubstepDistance), MOVEMENT.maxSubsteps));
  const sub = dt / substeps;
  const standLimit = standLimitFor(params.reachY);
  for (let i = 0; i < substeps; i += 1) integrate(motion, sub, collision, standLimit);
  if (!motion.grounded) {
    motion.vy -= motion.airGravity * dt * 0.5;
    if (motion.vy < -motion.airTerminal) motion.vy = -motion.airTerminal;
  }

  motion.coyote = motion.grounded ? MOVEMENT.coyoteTime : Math.max(0, motion.coyote - dt);

  if (!wasGrounded && motion.grounded) events.landed = true;
};

const integrate = (motion: PlayerMotion, dt: number, collision: WorldCollision, standLimit: number): void => {
  const previousY = motion.y;

  motion.x += motion.vx * dt;
  const correctedX = collision.resolveAxis(0, motion.x, motion.z, motion.y, standLimit);
  if (correctedX !== motion.x) {
    motion.x = correctedX;
    motion.vx = 0;
  }

  motion.z += motion.vz * dt;
  const correctedZ = collision.resolveAxis(2, motion.z, motion.x, motion.y, standLimit);
  if (correctedZ !== motion.z) {
    motion.z = correctedZ;
    motion.vz = 0;
  }

  motion.y += motion.vy * dt;

  collision.clampToBounds(motion.x, motion.z, BOUNDS);
  motion.x = BOUNDS.x;
  motion.z = BOUNDS.z;

  resolveCeiling(motion, previousY, collision);
  resolveGround(motion, previousY, collision, standLimit);
};

/**
 * The balloon jump, from the ground (or within coyote time of leaving it).
 *
 * Its height is decided from the simulation's own state and the server-owned
 * reach, so a client cannot float higher whatever it sends - the most it can do
 * is predict a jump the server refuses.
 */
const applyJump = (motion: PlayerMotion, input: MovementInput, params: SimParams, events: SimEvents): void => {
  const pressed = input.jump && !motion.jumpLatched;
  motion.jumpLatched = input.jump;
  if (!pressed || !(motion.grounded || motion.coyote > 0)) return;

  const jump = resolveJumpPhysics(jumpHeightFor(motion.y, params.reachY, nextStepTopFrom(motion.z)));
  motion.vy = jump.velocity;
  motion.airGravity = jump.gravity;
  motion.airTerminal = jump.velocity;
  motion.grounded = false;
  motion.coyote = 0;
  motion.jumpCount += 1;
  events.jumpStarted = true;
};

const applyHorizontal = (motion: PlayerMotion, input: MovementInput, dt: number): void => {
  const hasInput = input.moveX !== 0 || input.moveZ !== 0;

  // The camera looks along (sin, cos); its RIGHT is (-cos, sin).
  const sin = Math.sin(input.cameraYaw);
  const cos = Math.cos(input.cameraYaw);
  const dirX = input.moveZ * sin - input.moveX * cos;
  const dirZ = input.moveZ * cos + input.moveX * sin;

  const targetSpeed = MOVEMENT.moveSpeed;
  const control = motion.grounded ? 1 : MOVEMENT.airControl;

  if (hasInput) {
    const accel = MOVEMENT.acceleration * control * dt;
    const rate = Math.min(accel / targetSpeed, 1);
    motion.vx += (dirX * targetSpeed - motion.vx) * rate;
    motion.vz += (dirZ * targetSpeed - motion.vz) * rate;
    motion.yaw = rotateTowards(motion.yaw, Math.atan2(dirX, dirZ), MOVEMENT.turnSpeed * dt);
  } else {
    // Braking on the ground, and a lighter brake in the air, so releasing the
    // stick mid-jump lands where the player meant rather than sailing on.
    const drop = MOVEMENT.deceleration * (motion.grounded ? 1 : 0.35) * dt;
    const speed = horizontalSpeed(motion);
    if (speed <= drop || speed < 1e-6) {
      motion.vx = 0;
      motion.vz = 0;
    } else {
      const scale = (speed - drop) / speed;
      motion.vx *= scale;
      motion.vz *= scale;
    }
  }
};

const resolveCeiling = (motion: PlayerMotion, previousY: number, collision: WorldCollision): void => {
  if (motion.vy <= 0) return;
  const ceiling = collision.ceilingYAt(motion.x, motion.z, previousY + BODY_HEIGHT);
  if (ceiling === null || motion.y + BODY_HEIGHT <= ceiling) return;
  motion.y = ceiling - BODY_HEIGHT;
  motion.vy = 0;
};

const resolveGround = (motion: PlayerMotion, previousY: number, collision: WorldCollision, standLimit: number): void => {
  const surfaceY = collision.surfaceYAt(motion.x, motion.z, previousY, standLimit);
  if (surfaceY === null || motion.vy > 0 || motion.y > surfaceY) {
    motion.grounded = false;
    return;
  }
  if (!collision.canLandOn(previousY, surfaceY)) {
    motion.grounded = false;
    return;
  }
  motion.y = surfaceY;
  motion.vy = 0;
  motion.grounded = true;
};
