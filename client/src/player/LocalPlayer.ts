import {
  MOVEMENT,
  WorldCollision,
  createMotion,
  createSimEvents,
  horizontalSpeed,
  resetMotion,
  stepPlayer,
  type MoveMessage,
  type MovementInput,
  type PlayerMotion,
  type SimParams,
} from '@highjump/shared';
import { Vector3 } from 'three';
import { createAnimationInput, type AnimationInput } from '../animation/AnimationInput.js';
import type { InputState } from '../input/InputState.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const MAX_PENDING_INPUTS = 240;
/** The client steps AND sends at exactly this cadence, whatever the frame rate. */
const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const ARRIVE_DURATION = 0.16;
/** Failsafe: stop ignoring server state if a predicted fall is never confirmed. */
const RETURN_ACK_TIMEOUT = 1.5;
/** An unconfirmed fall asks the server again this often. */
const RETURN_NUDGE_INTERVAL = 0.75;
const SNAP_DISTANCE = 6;
const CORRECTION_RATE = 14;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const EMPTY_INPUTS: MoveMessage[] = [];

export type PlacementKind = 'none' | 'respawn' | 'correction';

interface PendingInput {
  seq: number;
  dt: number;
  input: MovementInput;
}

/** Every field of `PlayerMotion` the server owns, so replay is exact. */
export interface AuthoritativeMotion {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  grounded: boolean;
  jumpCount: number;
  lastInputSeq: number;
  jumpLatched: boolean;
  coyote: number;
  airGravity: number;
  airTerminal: number;
}

/**
 * The locally controlled player: a PREDICTION of the server's simulation.
 *
 * Runs the identical `stepPlayer`, keeps every unacknowledged input, and on each
 * server update snaps to the authoritative motion and replays the rest. Nothing
 * here sends a transform - only the input that produced this frame.
 *
 * Falling off the staircase is noticed here first (see `RunController`): the
 * player stops reconciling and waits for the server to place them at spawn.
 */
export class LocalPlayer {
  readonly character = new PlayerCharacter();
  /** THE render position: interpolated simulation plus the eased correction. */
  readonly position = new Vector3();

  private readonly previous = { x: 0, y: 0, z: 0 };
  private readonly motion: PlayerMotion = createMotion();
  private readonly events = createSimEvents();
  private readonly replayEvents = createSimEvents();
  private readonly params: SimParams = { reachY: 1.6 };

  private readonly pending: PendingInput[] = [];
  private nextSeq = 1;
  private readonly outgoing: MoveMessage[] = [];
  private accumulator = 0;
  private readonly correction = new Vector3();
  private placement: PlacementKind = 'none';
  private arriveTime = -1;

  /**
   * True from noticing a fall until the server places the player. State
   * patches in flight still describe them mid-fall, so reconciliation is
   * paused rather than letting a stale patch drag them back into the sky.
   */
  private returning = false;
  private returnWait = 0;
  private nudgeWait = 0;

  private readonly animationInput: AnimationInput = createAnimationInput();

  constructor(private readonly collision: WorldCollision) {
    this.previous.x = this.motion.x;
    this.previous.y = this.motion.y;
    this.previous.z = this.motion.z;
    this.syncFromMotion();
  }

  get horizontalSpeed(): number {
    return horizontalSpeed(this.motion);
  }
  get isGrounded(): boolean {
    return this.motion.grounded;
  }
  get justLanded(): boolean {
    return this.events.landed;
  }
  /** True on a frame a jump started. */
  get jumped(): boolean {
    return this.events.jumpStarted;
  }
  get maxRunSpeed(): number {
    return MOVEMENT.moveSpeed;
  }
  /** True while waiting for the server to bring a fallen player back to spawn. */
  get isReturning(): boolean {
    return this.returning;
  }

  /** The server-resolved reach this player's jump rises toward. */
  setReach(reachY: number): void {
    if (Number.isFinite(reachY)) this.params.reachY = reachY;
  }

  drainOutgoing(): MoveMessage[] {
    if (this.outgoing.length === 0) return EMPTY_INPUTS;
    const batch = this.outgoing.slice();
    this.outgoing.length = 0;
    return batch;
  }

  consumePlacement(): PlacementKind {
    const kind = this.placement;
    this.placement = 'none';
    return kind;
  }

  /** True once per interval while a fall is still waiting for a placement. */
  consumeRespawnNudge(): boolean {
    if (!this.returning || this.nudgeWait < RETURN_NUDGE_INTERVAL) return false;
    this.nudgeWait = 0;
    return true;
  }

  /** Fell off the staircase: wait for the server to place us at spawn. */
  beginFallReturn(): void {
    if (this.returning) return;
    this.returning = true;
    this.returnWait = 0;
    this.nudgeWait = RETURN_NUDGE_INTERVAL;
  }

  /** A server placement: pending inputs described a run that no longer exists. */
  teleport(x: number, y: number, z: number, rotationY: number): void {
    resetMotion(this.motion, x, y, z, rotationY);
    this.previous.x = x;
    this.previous.y = y;
    this.previous.z = z;
    this.pending.length = 0;
    this.outgoing.length = 0;
    this.accumulator = 0;
    this.correction.set(0, 0, 0);
    this.placement = 'respawn';
    this.returning = false;
    this.arriveTime = 0;
    this.character.resetAnimation();
    this.character.setVisualScale(0.15, 0.15, 0.15);
    this.syncFromMotion();
  }

  reconcile(state: AuthoritativeMotion): void {
    if (this.returning) return;

    const px = this.motion.x;
    const py = this.motion.y;
    const pz = this.motion.z;

    this.motion.x = state.x;
    this.motion.y = state.y;
    this.motion.z = state.z;
    this.motion.vx = state.velocityX;
    this.motion.vy = state.velocityY;
    this.motion.vz = state.velocityZ;
    this.motion.yaw = state.rotationY;
    this.motion.grounded = state.grounded;
    this.motion.jumpCount = state.jumpCount;
    this.motion.jumpLatched = state.jumpLatched;
    this.motion.coyote = state.coyote;
    this.motion.airGravity = state.airGravity;
    this.motion.airTerminal = state.airTerminal;

    let kept = 0;
    for (const entry of this.pending) {
      if (entry.seq <= state.lastInputSeq) continue;
      this.pending[kept] = entry;
      kept += 1;
    }
    this.pending.length = kept;
    for (const entry of this.pending) {
      stepPlayer(this.motion, entry.input, this.params, entry.dt, this.collision, this.replayEvents);
    }

    const dx = px - this.motion.x;
    const dy = py - this.motion.y;
    const dz = pz - this.motion.z;
    const snapped = Math.hypot(dx, dy, dz) > SNAP_DISTANCE;
    this.correction.set(snapped ? 0 : dx, snapped ? 0 : dy, snapped ? 0 : dz);
    if (snapped) {
      this.previous.x = this.motion.x;
      this.previous.y = this.motion.y;
      this.previous.z = this.motion.z;
      if (this.placement === 'none') this.placement = 'correction';
    }
    this.syncFromMotion();
  }

  update(delta: number, input: Readonly<InputState>, cameraYaw: number): void {
    this.tickReturn(delta);

    this.accumulator += Math.max(0, delta);
    let steps = 0;
    let jumpStarted = false;
    let landed = false;

    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= FIXED_DT;
      steps += 1;
      const movement: MovementInput = {
        moveX: input.moveX,
        moveZ: input.moveZ,
        jump: input.jump,
        cameraYaw,
      };
      const seq = this.nextSeq;
      this.nextSeq += 1;
      this.previous.x = this.motion.x;
      this.previous.y = this.motion.y;
      this.previous.z = this.motion.z;

      stepPlayer(this.motion, movement, this.params, FIXED_DT, this.collision, this.events);
      jumpStarted = jumpStarted || this.events.jumpStarted;
      landed = landed || this.events.landed;

      this.pending.push({ seq, dt: FIXED_DT, input: movement });
      if (this.pending.length > MAX_PENDING_INPUTS) this.pending.shift();
      this.outgoing.push({ seq, dt: FIXED_DT, ...movement });
    }
    if (this.accumulator > FIXED_DT * MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.events.jumpStarted = jumpStarted;
    this.events.landed = landed;

    this.advanceArrival(delta);
    if (this.correction.lengthSq() < 1e-8) this.correction.set(0, 0, 0);
    else this.correction.multiplyScalar(Math.exp(-CORRECTION_RATE * delta));
    this.syncFromMotion();
    this.updateAnimation(delta);
  }

  private advanceArrival(delta: number): void {
    if (this.arriveTime < 0) return;
    this.arriveTime += delta;
    const t = Math.min(this.arriveTime / ARRIVE_DURATION, 1);
    if (t >= 1) {
      this.arriveTime = -1;
      this.character.setVisualScale(1, 1, 1);
      return;
    }
    const scale = 0.15 + 0.85 * t * (2 - t) + 0.08 * Math.sin(t * Math.PI);
    this.character.setVisualScale(scale, scale, scale);
  }

  private tickReturn(delta: number): void {
    if (!this.returning) return;
    this.returnWait += delta;
    this.nudgeWait += delta;
    if (this.returnWait < RETURN_ACK_TIMEOUT) return;
    // No placement came: the prediction was wrong, so let the server correct it.
    this.returning = false;
    this.returnWait = 0;
  }

  private syncFromMotion(): void {
    const alpha = Math.min(Math.max(this.accumulator / FIXED_DT, 0), 1);
    this.position.set(
      lerp(this.previous.x, this.motion.x, alpha) + this.correction.x,
      lerp(this.previous.y, this.motion.y, alpha) + this.correction.y,
      lerp(this.previous.z, this.motion.z, alpha) + this.correction.z,
    );
    this.character.setPosition(this.position.x, this.position.y, this.position.z);
    this.character.setYaw(this.motion.yaw);
  }

  private updateAnimation(delta: number): void {
    const input = this.animationInput;
    input.grounded = this.motion.grounded;
    input.horizontalSpeed = this.horizontalSpeed;
    input.verticalVelocity = this.motion.vy;
    input.jumpStarted = this.events.jumpStarted;
    input.landed = this.events.landed;
    this.character.update(delta, input);
    this.character.updateEffects(delta, input.horizontalSpeed);
  }
}
