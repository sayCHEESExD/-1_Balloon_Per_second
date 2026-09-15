import { balloonsForHeight, climbHeightFor } from './balloons.js';
import { COURSE_TOP_Y } from './course.js';

/**
 * Per-world climb progression.
 *
 * The balloon TOTAL never resets and is always what is shown. What resets per
 * world is the CLIMB: World 1 climbs on every balloon; World 2 climbs only on the
 * balloons past World 1's completion requirement - the balloons it took (with the
 * player's best balloon) to reach World 1's final step. So World 2 starts at the
 * jump of about one balloon and grows from there, never inheriting World 1's.
 */

/** Balloons needed to reach World 1's final step with this inventory. */
export const world1Requirement = (owned: number): number => balloonsForHeight(COURSE_TOP_Y, owned);

/** The balloons that count toward climbing in a world. */
export const progressionBalloons = (world: number, balloons: number, owned: number): number => {
  const total = Number.isFinite(balloons) ? Math.max(0, Math.floor(balloons)) : 0;
  return world === 2 ? Math.max(0, total - world1Requirement(owned)) : total;
};

/** The climb height in a world: `climbHeightFor` over that world's progression balloons. */
export const worldClimbHeight = (world: number, balloons: number, owned: number): number =>
  climbHeightFor(progressionBalloons(world, balloons, owned), owned);

/** Total balloons at which a world's climb reaches a height (the HUD's "next" figure). */
export const totalBalloonsForHeight = (world: number, height: number, owned: number): number =>
  balloonsForHeight(height, owned) + (world === 2 ? world1Requirement(owned) : 0);
