import { heldBalloon, visibleName } from '@highjump/shared';
import { createAnimationInput, type AnimationInput } from '../animation/AnimationInput.js';
import { BloxityAvatar } from '../bloxity/BloxityAvatar.js';
import { DEFAULT_PROPORTIONS, type LegionEquipped, type LegionProportions } from '../bloxity/legionTypes.js';
import type { NetPlayerState } from '../net/netTypes.js';
import { logger } from '../util/logger.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const SCOPE = 'RemotePlayer';

const FOLLOW_RATE = 14;
const FOLLOW_RATE_Y = 10;
/** Distance past which a remote is placed rather than walked (a respawn). */
const SNAP_DISTANCE = 16;

const shortestAngle = (from: number, to: number): number => {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
};

/**
 * Another player, rendered from replicated state only.
 *
 * Animation is reconstructed by the same animator the local player runs. The
 * one-shot jump is DERIVED from a monotonic counter against a baseline taken on
 * first sight, so a stranger's lifetime of jumps is never replayed on join.
 * Their balloon, pets and name tag come from replicated inventories.
 *
 * Remotes are ghosted: they never collide with anyone.
 */
export class RemotePlayer {
  readonly character = new PlayerCharacter();

  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;
  private targetYaw = 0;
  private readonly input: AnimationInput = createAnimationInput();

  /** Their Bloxity look, built only once the server says they have one. */
  private avatar: BloxityAvatar | null = null;
  private avatarData = '';

  private lastJumpCount: number;
  private wasGrounded = true;
  private placed = false;

  constructor(state: NetPlayerState) {
    this.lastJumpCount = state.jumpCount;
    this.apply(state);
    this.character.setPosition(this.targetX, this.targetY, this.targetZ);
    this.character.setYaw(this.targetYaw);
    this.placed = true;
  }

  apply(state: NetPlayerState): void {
    this.targetX = state.x;
    this.targetY = state.y;
    this.targetZ = state.z;
    this.targetYaw = state.rotationY;

    this.input.grounded = state.grounded;
    this.input.horizontalSpeed = state.speed;
    this.input.verticalVelocity = state.verticalVelocity;

    if (state.jumpCount > this.lastJumpCount) this.input.jumpStarted = true;
    this.lastJumpCount = state.jumpCount;

    if (!this.wasGrounded && state.grounded) this.input.landed = true;
    this.wasGrounded = state.grounded;

    this.character.setBalloon(heldBalloon(state.equippedBalloon, state.ownedBalloons).slot);
    this.character.setPets(state.pets);
    this.character.setNameTag(visibleName(state.displayName), state.balloons, state.displayName ? state.avatarUrl : '');
    this.applyAvatar(state.avatar);
  }

  update(delta: number): void {
    const dt = Math.max(0, delta);
    const position = this.character.root.position;
    const gap = Math.hypot(this.targetX - position.x, this.targetZ - position.z);

    if (!this.placed || gap > SNAP_DISTANCE) {
      position.set(this.targetX, this.targetY, this.targetZ);
      this.character.setYaw(this.targetYaw);
      if (gap > SNAP_DISTANCE) this.character.resetAnimation();
      this.placed = true;
    } else {
      const alpha = 1 - Math.exp(-FOLLOW_RATE * dt);
      position.x += (this.targetX - position.x) * alpha;
      // A towering jump is followed faster the further it has pulled ahead.
      const dy = this.targetY - position.y;
      position.y += dy * (1 - Math.exp(-(FOLLOW_RATE_Y + Math.abs(dy) * 0.5) * dt));
      position.z += (this.targetZ - position.z) * alpha;
      const yaw = this.character.root.rotation.y;
      this.character.setYaw(yaw + shortestAngle(yaw, this.targetYaw) * alpha);
    }

    this.character.update(dt, this.input);
    this.character.updateEffects(dt, this.input.horizontalSpeed);
    this.input.jumpStarted = false;
    this.input.landed = false;
  }

  /**
   * Wear THIS player's own Bloxity avatar: their equipped head, torso, arms, legs,
   * skin, accessories and body proportions, all resolved from their own ids.
   *
   * An empty string means they have no Bloxity avatar at all, which is the ONLY case
   * that keeps the bundled character.
   */
  private applyAvatar(encoded: string): void {
    if (encoded === this.avatarData) return;
    this.avatarData = encoded;

    if (!encoded) {
      this.avatar?.dispose();
      this.avatar = null;
      this.character.setModel(null);
      logger.info(SCOPE, 'no Bloxity avatar for this player: the bundled body stands');
      return;
    }

    let equipped: LegionEquipped = {};
    let proportions: LegionProportions = DEFAULT_PROPORTIONS;
    try {
      // `{ equipped, proportions }`; a bare id map is the older shape.
      const parsed = JSON.parse(encoded) as {
        equipped?: LegionEquipped;
        proportions?: Partial<LegionProportions>;
      };
      equipped = (parsed.equipped ?? parsed) as LegionEquipped;
      proportions = { ...DEFAULT_PROPORTIONS, ...(parsed.proportions ?? {}) };
    } catch {
      logger.warn(SCOPE, `avatar data was not readable: ${encoded}`);
    }
    this.avatar ??= new BloxityAvatar(this.character, true);
    this.avatar.apply(equipped, proportions);
    logger.info(
      SCOPE,
      `avatar applied: parts head=${equipped.headId ?? '-'} torso=${equipped.torsoId ?? '-'} ` +
        `arms=${equipped.armLId ?? '-'}/${equipped.armRId ?? '-'} legs=${equipped.legLId ?? '-'}/${equipped.legRId ?? '-'} ` +
        `skin=${equipped.skinId ?? '-'} hat=${equipped.hatId ?? '-'} back=${equipped.backId ?? '-'} ` +
        `proportions=${JSON.stringify(proportions)}`,
    );
  }

  dispose(): void {
    this.avatar?.dispose();
    this.character.dispose();
  }
}
