import type { AudioManager } from './AudioManager.js';

/** World units between footfalls. */
const STRIDE = 4.2;
const MAX_STEPS_PER_SECOND = 7;
const MIN_AUDIBLE_SPEED = 2.5;

export interface PlayerAudioInput {
  readonly horizontalSpeed: number;
  readonly maxRunSpeed: number;
  readonly isGrounded: boolean;
  readonly justLanded: boolean;
  readonly jumped: boolean;
}

/**
 * Decides WHEN the local player makes a sound; `AudioManager` knows HOW.
 * Only the local player is heard.
 */
export class PlayerAudio {
  private stride = 0;
  private sinceStep = 0;

  constructor(private readonly audio: AudioManager) {}

  update(delta: number, player: PlayerAudioInput): void {
    if (player.jumped) this.audio.play('jump');
    // A balloon touches down softly, however far it drifted.
    if (player.justLanded) this.audio.play('land', 0.3);

    this.sinceStep += delta;
    if (!player.isGrounded || player.horizontalSpeed < MIN_AUDIBLE_SPEED) {
      this.stride = 0;
      return;
    }
    this.stride += player.horizontalSpeed * delta;
    if (this.stride < STRIDE) return;
    this.stride = 0;
    if (this.sinceStep < 1 / MAX_STEPS_PER_SECOND) return;
    this.sinceStep = 0;
    this.audio.play('step', Math.min(player.horizontalSpeed / player.maxRunSpeed, 1));
  }
}
