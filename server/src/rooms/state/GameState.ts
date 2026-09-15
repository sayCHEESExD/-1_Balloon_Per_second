import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import { LEADERBOARD_SIZE } from '@highjump/shared';
import { PlayerState } from './PlayerState.js';

export class LeaderEntry extends Schema {
  /** The player's Bloxity display name, or "Guest" - never an internal id. */
  @type('string') name = '';
  /** Their Bloxity avatar thumbnail URL, or '' for the default. */
  @type('string') avatar = '';
  @type('float64') value = 0;
}

/**
 * The three boards in the hub: Top Balloons, Top Wins, Top Playtime.
 *
 * FIXED-LENGTH arrays written in place, so a rebuild sends only the rows that
 * actually moved.
 */
export class LeaderboardState extends Schema {
  @type([LeaderEntry]) balloons = rows();
  @type([LeaderEntry]) wins = rows();
  @type([LeaderEntry]) time = rows();
}

const rows = (): ArraySchema<LeaderEntry> => {
  const list = new ArraySchema<LeaderEntry>();
  for (let i = 0; i < LEADERBOARD_SIZE; i += 1) list.push(new LeaderEntry());
  return list;
};

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type(LeaderboardState) leaderboard = new LeaderboardState();
}
