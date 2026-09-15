import { eggZoneAt, inBalloonShop, portalAt, winPadAt, type WorldCollision } from '@highjump/shared';
import type { LocalPlayer } from '../player/LocalPlayer.js';

const REQUEST_COOLDOWN = 0.4;

export interface RunActions {
  claimWin(area: number): void;
  /** Stepped off the staircase into the sky. */
  fell(): void;
  /** Walked up to an egg (its slot), or away from every egg (0). */
  eggChanged(slot: number): void;
  /** Walked into or out of the Balloon Shop. */
  shopChanged(inside: boolean): void;
  /** Walked into a portal (the world it leads to), or out of every portal (0). */
  portalChanged(target: number): void;
}

/**
 * Turns the player's position into REQUESTS and presentation cues.
 *
 * It notices a win pad underfoot and asks the server, which re-checks it
 * against the position IT simulated. A pad already claimed this attempt is not
 * asked about again; the server enforces the same rule regardless. It also
 * notices a fall, and the egg and shop zones, which only open menus.
 */
export class RunController {
  private winCooldown = 0;
  private egg = 0;
  private inShop = false;
  private portal = 0;
  /** Win areas claimed since the last placement at spawn. */
  private readonly claimed = new Set<number>();

  constructor(private readonly collision: WorldCollision, private readonly actions: RunActions) {}

  /** A placement at spawn starts a new attempt. */
  startAttempt(): void {
    this.claimed.clear();
  }

  get currentEgg(): number {
    return this.egg;
  }

  get atShop(): boolean {
    return this.inShop;
  }

  update(delta: number, player: LocalPlayer): void {
    this.winCooldown = Math.max(0, this.winCooldown - delta);
    if (player.isReturning) return;

    const { x, y, z } = player.position;
    if (this.collision.hasFallen(y, z)) {
      player.beginFallReturn();
      this.actions.fell();
      this.setEgg(0);
      this.setShop(false);
      return;
    }

    if (player.isGrounded && this.winCooldown === 0) {
      const area = winPadAt(x, y, z);
      if (area > 0 && !this.claimed.has(area)) {
        this.winCooldown = REQUEST_COOLDOWN;
        this.claimed.add(area);
        this.actions.claimWin(area);
      }
    }

    this.setEgg(eggZoneAt(x, y, z));
    this.setShop(inBalloonShop(x, y, z));
    // The server does the travelling; this only lets the HUD explain a locked portal.
    const portal = portalAt(x, y, z)?.target ?? 0;
    if (portal !== this.portal) {
      this.portal = portal;
      this.actions.portalChanged(portal);
    }
  }

  private setEgg(slot: number): void {
    if (slot === this.egg) return;
    this.egg = slot;
    this.actions.eggChanged(slot);
  }

  private setShop(inside: boolean): void {
    if (inside === this.inShop) return;
    this.inShop = inside;
    this.actions.shopChanged(inside);
  }
}
