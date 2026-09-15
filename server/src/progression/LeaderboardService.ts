import { LEADERBOARD_SIZE, visibleName } from '@highjump/shared';
import type { LeaderEntry, LeaderboardState } from '../rooms/state/GameState.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { profileStore } from './ProfileStore.js';

const REFRESH_SECONDS = 2;

interface Candidate {
  /** The verified Bloxity display name, or "Guest". Never an id. */
  readonly name: string;
  readonly avatar: string;
  readonly balloons: number;
  readonly wins: number;
  readonly time: number;
}

/**
 * The Top Balloons, Top Wins and Top Playtime boards. Every figure is the
 * server's: stored profiles merged with live state (live figures where both
 * exist). Rows show each player's Bloxity display name and avatar - the live
 * verified identity for players in the room, the last verified one for players
 * who are not. Rebuilt on a slow timer - nobody reads a board twenty times a second.
 */
export class LeaderboardService {
  private timer = 0;

  update(
    delta: number,
    board: LeaderboardState,
    live: Iterable<[string, PlayerState]>,
    playerIds: ReadonlyMap<string, string>,
  ): void {
    this.timer -= delta;
    if (this.timer > 0) return;
    this.timer = REFRESH_SECONDS;

    const byId = new Map<string, Candidate>();
    for (const [id, profile] of profileStore.entries()) {
      byId.set(id, {
        name: visibleName(profile.displayName),
        avatar: profile.avatarUrl ?? '',
        balloons: profile.balloons,
        wins: profile.wins,
        time: profile.playSeconds,
      });
    }
    for (const [sessionId, player] of live) {
      const id = playerIds.get(sessionId);
      if (!id) continue;
      const stored = byId.get(id);
      byId.set(id, {
        name: player.displayName ? visibleName(player.displayName) : (stored?.name ?? visibleName('')),
        avatar: player.displayName ? player.avatarUrl : (stored?.avatar ?? ''),
        balloons: player.balloons,
        wins: player.wins,
        time: player.playSeconds,
      });
    }

    const all = [...byId.values()];
    fill(board.balloons, all, (c) => c.balloons, 1);
    fill(board.wins, all, (c) => c.wins, 1);
    fill(board.time, all, (c) => c.time, 60);
  }
}

const fill = (
  into: ArrayLike<LeaderEntry>,
  all: readonly Candidate[],
  pick: (candidate: Candidate) => number,
  minimum: number,
): void => {
  const ranked = all
    .filter((candidate) => pick(candidate) >= minimum)
    .sort((a, b) => pick(b) - pick(a))
    .slice(0, LEADERBOARD_SIZE);

  for (let i = 0; i < LEADERBOARD_SIZE; i += 1) {
    const entry = into[i];
    if (!entry) continue;
    const candidate = ranked[i];
    const name = candidate ? candidate.name : '';
    const avatar = candidate ? candidate.avatar : '';
    const value = candidate ? Math.floor(pick(candidate)) : 0;
    if (entry.name !== name) entry.name = name;
    if (entry.avatar !== avatar) entry.avatar = avatar;
    if (entry.value !== value) entry.value = value;
  }
};

export const leaderboardService = new LeaderboardService();
