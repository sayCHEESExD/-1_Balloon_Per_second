import { balloonBySlot, balloonMask, isBalloonOwned } from '@highjump/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { BalloonService } from './BalloonService.js';
import { wallet } from './Wallet.js';

export type BalloonRefusal = 'unknown-balloon' | 'already-owned' | 'not-owned' | 'too-poor';

/**
 * Server authority over the Balloon Shop.
 *
 * Every check runs before the payment, and the payment runs last. A bought
 * balloon goes straight into the hand.
 */
export class BalloonShopService {
  buy(player: PlayerState, slot: number, balloons: BalloonService): BalloonRefusal | null {
    const balloon = balloonBySlot(slot);
    if (!balloon) return 'unknown-balloon';
    if (isBalloonOwned(player.ownedBalloons, balloon.slot)) return 'already-owned';
    if (!wallet.spend(player, balloon.cost)) return 'too-poor';
    player.ownedBalloons = (player.ownedBalloons | balloonMask(balloon.slot)) >>> 0;
    player.equippedBalloon = balloon.slot;
    balloons.syncDerived(player);
    return null;
  }

  equip(player: PlayerState, slot: number, balloons: BalloonService): BalloonRefusal | null {
    const balloon = balloonBySlot(slot);
    if (!balloon) return 'unknown-balloon';
    if (!isBalloonOwned(player.ownedBalloons, balloon.slot)) return 'not-owned';
    player.equippedBalloon = balloon.slot;
    balloons.syncDerived(player);
    return null;
  }
}
