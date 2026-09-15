import { BALLOONS, MAX_BALLOONS, STARTER_BALLOON, balloonMask, encodePets, isBalloonOwned, parsePets } from '@highjump/shared';
import { createPersistence, type PersistenceAdapter, type StoredProfile } from '../persistence/index.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/** Every bit a real balloon can occupy, so a stale save cannot own a balloon that does not exist. */
const BALLOON_BITS = BALLOONS.reduce((mask, balloon) => (mask | balloonMask(balloon.slot)) >>> 0, 0);

/**
 * Progression that outlives a session: a CACHE in front of a durable adapter.
 *
 * Process-wide, because a room closes with its last client. Keyed by the
 * browser-stored player id.
 */
class ProfileStore {
  private readonly profiles = new Map<string, StoredProfile>();
  private readonly adapter: PersistenceAdapter = createPersistence();
  private opened = false;

  open(): void {
    if (this.opened) return;
    this.opened = true;
    for (const [id, profile] of this.adapter.load()) this.profiles.set(id, profile);
  }

  get size(): number {
    return this.profiles.size;
  }

  entries(): IterableIterator<[string, StoredProfile]> {
    return this.profiles.entries();
  }

  get(playerId: string): StoredProfile | undefined {
    return this.profiles.get(playerId);
  }

  /** Apply a stored profile onto fresh state. Derived figures are recomputed after. */
  restore(playerId: string, player: PlayerState): boolean {
    const profile = this.profiles.get(playerId);
    if (!profile) return false;
    player.balloons = Math.min(MAX_BALLOONS, Math.floor(profile.balloons));
    player.wins = Math.floor(profile.wins);
    player.playSeconds = profile.playSeconds;
    player.ownedBalloons = ((profile.ownedBalloons & BALLOON_BITS) | balloonMask(STARTER_BALLOON)) >>> 0;
    const equipped = Math.floor(profile.equippedBalloon);
    player.equippedBalloon = isBalloonOwned(player.ownedBalloons, equipped) ? equipped : STARTER_BALLOON;
    // Re-encoded, so a pet removed from the table since the save simply drops.
    player.pets = encodePets(parsePets(profile.pets));
    player.world2Unlocked = profile.world2Unlocked === true;
    return true;
  }

  save(playerId: string, player: PlayerState): void {
    if (!playerId) return;
    const previous = this.profiles.get(playerId);
    this.profiles.set(playerId, {
      balloons: player.balloons,
      wins: player.wins,
      playSeconds: player.playSeconds,
      ownedBalloons: player.ownedBalloons,
      equippedBalloon: player.equippedBalloon,
      pets: player.pets,
      world2Unlocked: player.world2Unlocked,
      // The identity is only ever the server-verified one; a session that has not
      // (yet) verified keeps the last verified name rather than erasing it.
      displayName: player.displayName || previous?.displayName || '',
      avatarUrl: player.displayName ? player.avatarUrl : previous?.avatarUrl || '',
      updatedAt: Date.now(),
    });
    this.adapter.save(this.profiles);
  }

  flush(): void {
    this.adapter.flush();
  }
}

export const profileStore = new ProfileStore();
