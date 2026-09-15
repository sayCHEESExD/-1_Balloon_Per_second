import type { MapSchema } from '@colyseus/schema';

/**
 * Client-side TYPE mirror of the server's Colyseus schema. Types only -
 * colyseus.js builds the instances from the handshake reflection.
 */
export interface NetPlayerState {
  sessionId: string;
  handle: string;
  /** Verified Bloxity display name, or '' for a guest. */
  displayName: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  speed: number;
  verticalVelocity: number;
  grounded: boolean;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  lastInputSeq: number;
  jumpLatched: boolean;
  coyote: number;
  airGravity: number;
  airTerminal: number;
  jumpCount: number;

  balloons: number;
  wins: number;
  playSeconds: number;

  world: number;
  world2Unlocked: boolean;

  balloonsPerTick: number;
  reachY: number;
  climbHeight: number;

  ownedBalloons: number;
  equippedBalloon: number;
  pets: string;

  ready: boolean;
}

export interface NetLeaderEntry {
  handle: string;
  value: number;
}

export interface NetLeaderboardState {
  balloons: ArrayLike<NetLeaderEntry>;
  wins: ArrayLike<NetLeaderEntry>;
  time: ArrayLike<NetLeaderEntry>;
}

export interface NetGameState {
  players: MapSchema<NetPlayerState>;
  leaderboard: NetLeaderboardState;
}

export interface LeaderboardSnapshot {
  balloons: readonly NetLeaderEntry[];
  wins: readonly NetLeaderEntry[];
  time: readonly NetLeaderEntry[];
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
