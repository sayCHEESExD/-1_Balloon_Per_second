import { balloonLiftFor, balloonsForLift } from './balloons.js';
import { STEPS } from './course.js';

/**
 * Per-world balloon lift.
 *
 * The balloon TOTAL never resets and is always what is shown. What resets per
 * world is the LIFT: World 1 lifts on every balloon; World 2 lifts only on the
 * balloons past World 1's completion requirement - the balloons it takes (with the
 * player's best balloon) to lift over World 1's tallest riser. So World 2 starts at
 * the lift of about one balloon and grows from there.
 *
 * Once computed, a world's lift is a constant strength: nothing about where the
 * player is changes it.
 */

/** Balloons whose lift clears World 1's tallest riser (its last) with this inventory. */
export const world1Requirement = (owned: number): number =>
  balloonsForLift(STEPS[STEPS.length - 1]?.rise ?? 0, owned);

/** The balloons that count toward lift in a world. */
export const progressionBalloons = (world: number, balloons: number, owned: number): number => {
  const total = Number.isFinite(balloons) ? Math.max(0, Math.floor(balloons)) : 0;
  return world === 2 ? Math.max(0, total - world1Requirement(owned)) : total;
};

/** The balloon lift in a world: `balloonLiftFor` over that world's progression balloons. */
export const worldLift = (world: number, balloons: number, owned: number): number =>
  balloonLiftFor(progressionBalloons(world, balloons, owned), owned);

/** Total balloons at which a world's lift reaches `lift` (the HUD's informational "next" figure). */
export const totalBalloonsForLift = (world: number, lift: number, owned: number): number =>
  balloonsForLift(lift, owned) + (world === 2 ? world1Requirement(owned) : 0);
