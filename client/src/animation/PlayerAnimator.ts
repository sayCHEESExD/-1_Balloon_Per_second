import type { Group } from 'three';
import {
  AIRBORNE,
  FLOAT_SWAY,
  HOLD_BALLOON,
  IDLE,
  JUMP_ANIMATION,
  JUMP_START,
  LANDING,
  LOCOMOTION,
  TIP_PIVOT_HEIGHT,
  TRANSITIONS,
} from '../config/animationConfig.js';
import type { AnimationInput } from './AnimationInput.js';
import { LocomotionCycle } from './LocomotionCycle.js';
import { PoseBuffer } from './PoseBuffer.js';
import { BONE_INDEX, type BoneName } from './rig/boneNames.js';
import type { PlayerRig } from './rig/PlayerRig.js';

export type AnimationState = 'idle' | 'run' | 'jumpStart' | 'airborne' | 'landing';

/** The states that make up "the jump", played at `JUMP_ANIMATION.playbackRate`. */
const JUMP_STATES: ReadonlySet<AnimationState> = new Set(['jumpStart', 'airborne', 'landing']);

const clamp = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);

const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * The player animation state machine: idle, walk, the floaty balloon jump and
 * the landing, with the balloon-holding right arm layered over all of them.
 *
 * Writes ONLY to bones (via `PlayerRig`), the tip pivot (the float sway) and
 * the visual bob node. It never touches the physics root.
 */
export class PlayerAnimator {
  private readonly locomotion = new LocomotionCycle();

  private readonly target = new PoseBuffer();
  private readonly from = new PoseBuffer();
  private readonly output = new PoseBuffer();

  private state: AnimationState = 'idle';
  private stateTime = 0;
  private blendTime = 0;
  private blendDuration = 0;
  private idleTime = 0;
  private wasGrounded = true;
  /** Eased rise (1) / fall (0) weight for the airborne pose. */
  private airWeight = 1;
  /** Eased 0..1 while airborne: how much float sway is applied. */
  private floatWeight = 0;
  private clock = 0;

  constructor(
    private rig: PlayerRig,
    private readonly tipPivot: Group,
    private readonly visual: Group,
  ) {
    this.tipPivot.position.y = TIP_PIVOT_HEIGHT;
    this.visual.position.y = -TIP_PIVOT_HEIGHT;
  }

  get currentState(): AnimationState {
    return this.state;
  }

  /**
   * Drive a different body (a Bloxity avatar swap). The pose buffers are left
   * alone, so the current animation continues on the new rig next frame.
   */
  setRig(rig: PlayerRig): void {
    this.rig = rig;
  }

  reset(): void {
    this.state = 'idle';
    this.stateTime = 0;
    this.blendDuration = 0;
    this.wasGrounded = true;
    this.airWeight = 1;
    this.floatWeight = 0;
    this.target.reset();
    this.from.reset();
    this.output.reset();
    this.rig.resetToBindPose();
    this.tipPivot.rotation.set(0, 0, 0);
    this.visual.position.y = -TIP_PIVOT_HEIGHT;
  }

  update(delta: number, input: AnimationInput): void {
    const dt = Math.max(0, delta);
    const jumpDt = dt * JUMP_ANIMATION.playbackRate;
    this.clock += dt;
    this.stateTime += JUMP_STATES.has(this.state) ? jumpDt : dt;
    this.resolveState(input);
    this.writePose(dt, jumpDt, input);
    this.writeHold();
    this.apply(JUMP_STATES.has(this.state) ? jumpDt : dt, dt, input);
  }

  private resolveState(input: AnimationInput): void {
    if (input.landed || (input.grounded && !this.wasGrounded)) {
      this.wasGrounded = true;
      this.setState('landing', TRANSITIONS.toLanding);
      return;
    }
    this.wasGrounded = input.grounded;

    if (input.jumpStarted) {
      this.airWeight = 1;
      this.setState('jumpStart', TRANSITIONS.toJumpStart);
      return;
    }

    if (!input.grounded) {
      if (this.state === 'jumpStart' && this.stateTime < JUMP_START.duration) return;
      this.setState('airborne', TRANSITIONS.toAirborne);
      return;
    }

    if (this.state === 'landing' && this.stateTime < LANDING.duration) return;
    this.setState(input.horizontalSpeed < LOCOMOTION.idleSpeed ? 'idle' : 'run', TRANSITIONS.toLocomotion);
  }

  private setState(next: AnimationState, duration: number): void {
    if (next === this.state) return;
    this.from.copyFrom(this.output);
    this.state = next;
    this.stateTime = 0;
    this.blendTime = 0;
    this.blendDuration = duration;
  }

  private writePose(dt: number, jumpDt: number, input: AnimationInput): void {
    switch (this.state) {
      case 'idle': {
        this.locomotion.settleTowardNeutral(dt);
        this.idleTime += dt;
        const breath = Math.sin(this.idleTime * IDLE.breathFrequency * Math.PI * 2);
        this.target.applyDefinition(IDLE.basePose);
        this.target.add('Spine1', breath * IDLE.breathAmount);
        this.target.add('Neck1', -breath * IDLE.breathAmount * 0.6);
        this.target.bobY = breath * IDLE.breathBob;
        break;
      }
      case 'run':
        this.locomotion.advance(dt, input.horizontalSpeed);
        this.locomotion.writePose(this.target, input.horizontalSpeed);
        break;
      case 'jumpStart':
        this.target.applyDefinition(JUMP_START.pose);
        this.target.bobY = JUMP_START.bobY;
        break;
      case 'airborne': {
        const t = clamp(input.verticalVelocity / AIRBORNE.velocityReference, -1, 1);
        const targetWeight = (t + 1) * 0.5;
        // Eased on the jump clock, so the limbs drift from the rising pose to
        // the falling one rather than snapping with the velocity.
        this.airWeight += (targetWeight - this.airWeight) * (1 - Math.exp(-JUMP_ANIMATION.airBlendRate * jumpDt));
        this.target.applyDefinition(AIRBORNE.fall, 1 - this.airWeight);
        this.target.blendInDefinition(AIRBORNE.rise, this.airWeight);
        // Legs slowly paddling, as if hanging from the balloon string.
        const dangle = Math.sin(this.clock * AIRBORNE.dangleFrequency * Math.PI * 2) * AIRBORNE.dangle;
        this.target.add('LegL1', dangle);
        this.target.add('LegR1', -dangle);
        this.target.bobY = FLOAT_SWAY.lift * this.airWeight;
        break;
      }
      case 'landing': {
        const depth = 1 - ease(clamp(this.stateTime / LANDING.duration, 0, 1));
        this.target.applyDefinition(LANDING.pose, depth);
        this.target.bobY = LANDING.bobY * depth;
        break;
      }
    }
  }

  /** The balloon hand, raised over whatever the rest of the body is doing. */
  private writeHold(): void {
    const sway = Math.sin(this.clock * HOLD_BALLOON.swayFrequency * Math.PI * 2) * HOLD_BALLOON.swayAmount;
    const rise = this.state === 'airborne' ? this.airWeight : 0;
    this.setBone('ArmR1', HOLD_BALLOON.shoulder + HOLD_BALLOON.riseShoulder * rise + sway * 0.5, 0, HOLD_BALLOON.shoulderRoll + sway);
    this.setBone('ArmR2', HOLD_BALLOON.elbow, 0, 0);
  }

  private setBone(bone: BoneName, x: number, y: number, z: number): void {
    const at = BONE_INDEX[bone] * 3;
    this.target.rotations[at] = x;
    this.target.rotations[at + 1] = y;
    this.target.rotations[at + 2] = z;
  }

  private apply(blendDt: number, dt: number, input: AnimationInput): void {
    if (this.blendDuration > 0) {
      this.blendTime += blendDt;
      const t = clamp(this.blendTime / this.blendDuration, 0, 1);
      this.output.lerpBetween(this.from, this.target, ease(t));
      if (t >= 1) this.blendDuration = 0;
    } else {
      this.output.copyFrom(this.target);
    }

    this.rig.applyPose(this.output);

    // The float sway: a slow roll and pitch while airborne, eased in and out so
    // take-off and touchdown never snap.
    this.floatWeight += ((input.grounded ? 0 : 1) - this.floatWeight) * (1 - Math.exp(-FLOAT_SWAY.easeRate * dt));
    const phase = this.clock * FLOAT_SWAY.frequency * Math.PI * 2;
    this.tipPivot.rotation.set(
      Math.sin(phase * 0.5) * FLOAT_SWAY.pitch * this.floatWeight,
      0,
      Math.sin(phase) * FLOAT_SWAY.roll * this.floatWeight,
    );
    this.visual.position.y = -TIP_PIVOT_HEIGHT + this.output.bobY;
  }
}
