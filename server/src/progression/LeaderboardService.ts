import { LEADERBOARD_SIZE, handleFor } from '@highjump/shared';
import type { LeaderEntry, LeaderboardState } from '../rooms/state/GameState.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { profileStore } from './ProfileStore.js';

const REFRESH_SECONDS = 2;

interface Candidate {
  readonly handle: string;
  readonly balloons: number;
  readonly wins: number;
  readonly time: number;
}

/**
 * The Top Balloons, Top Wins and Top Playtime boards. Every figure is the
 * server's: stored profiles merged with live state (live figures where both
 * exist). Rebuilt on a slow timer - nobody reads a board twenty times a second.
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
      byId.set(id, { handle: handleFor(id), balloons: profile.balloons, wins: profile.wins, time: profile.playSeconds });
    }
    for (const [sessionId, player] of live) {
      const id = playerIds.get(sessionId);
      if (!id) continue;
      byId.set(id, { handle: handleFor(id), balloons: player.balloons, wins: player.wins, time: player.playSeconds });
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
    const handle = candidate ? candidate.handle : '';
    const value = candidate ? Math.floor(pick(candidate)) : 0;
    if (entry.handle !== handle) entry.handle = handle;
    if (entry.value !== value) entry.value = value;
  }
};

export const leaderboardService = new LeaderboardService();
