import { BALLOON_TICK_SECONDS, MAX_BALLOONS, balloonsPerTick, reachYFor, worldClimbHeight } from '@highjump/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/** Hard ceiling on payouts processed in one tick, so a stalled clock cannot hang the room. */
const MAX_PAYOUTS_PER_TICK = 4;

/**
 * Server authority over balloons and everything derived from them.
 *
 * Balloons are paid on the SERVER's clock: every `BALLOON_TICK_SECONDS` of
 * simulated room time a player in the room gains their per-payout amount.
 * There is no balloon message and nothing spends balloons.
 *
 * `syncDerived` is THE evaluator for the payout amount, the climb capacity and the reach. Every
 * service that changes an input to those (a payout, a balloon bought or
 * equipped, a pet hatched, equipped or deleted) calls it instead of computing
 * its own.
 */
export class BalloonService {
  private readonly clocks = new Map<string, number>();

  initialise(player: PlayerState): void {
    this.clocks.set(player.sessionId, 0);
    this.syncDerived(player);
  }

  forget(sessionId: string): void {
    this.clocks.delete(sessionId);
  }

  /** Advance one player's balloon clock. Returns the balloons granted. */
  tick(player: PlayerState, delta: number): number {
    const step = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    let clock = (this.clocks.get(player.sessionId) ?? 0) + step;
    let granted = 0;
    for (let i = 0; i < MAX_PAYOUTS_PER_TICK && clock >= BALLOON_TICK_SECONDS; i += 1) {
      clock -= BALLOON_TICK_SECONDS;
      granted += this.grant(player, player.balloonsPerTick);
    }
    this.clocks.set(player.sessionId, Math.min(clock, BALLOON_TICK_SECONDS));
    return granted;
  }

  /** Add balloons, saturating. The only path that raises the count. */
  grant(player: PlayerState, amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const before = player.balloons;
    player.balloons = Math.min(MAX_BALLOONS, Math.floor(before + amount));
    this.syncDerived(player);
    return player.balloons - before;
  }

  /** Re-derive the payout amount, the climb capacity and the reach. */
  syncDerived(player: PlayerState): void {
    player.balloonsPerTick = balloonsPerTick(player.equippedBalloon, player.ownedBalloons, player.pets);
    // The CURRENT world's climb: World 2 counts only balloons past World 1's requirement.
    const climb = worldClimbHeight(player.world, player.balloons, player.ownedBalloons);
    if (player.climbHeight !== climb) player.climbHeight = climb;
    const reach = reachYFor(climb);
    if (player.reachY !== reach) player.reachY = reach;
  }
}
