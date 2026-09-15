/**
 * The gameplay signals the animator consumes each frame. It reads these and
 * never writes back: it cannot move the player or decide an outcome.
 *
 * The local player fills it from its own prediction and every remote player
 * from replicated state, so both run the exact same animation code.
 */
export interface AnimationInput {
  grounded: boolean;
  /** Horizontal speed. */
  horizontalSpeed: number;
  verticalVelocity: number;
  /** True on the frame a jump starts. */
  jumpStarted: boolean;
  landed: boolean;
}

export const createAnimationInput = (): AnimationInput => ({
  grounded: true,
  horizontalSpeed: 0,
  verticalVelocity: 0,
  jumpStarted: false,
  landed: false,
});
