/**
 * Client -> server input. INPUT ONLY: no position, velocity or rotation, so a
 * client has no channel through which to assert where it is.
 */
export interface MoveMessage {
  seq: number;
  dt: number;
  moveX: number;
  moveZ: number;
  jump: boolean;
  cameraYaw: number;
}

export type RespawnReason = 'fall' | 'win' | 'manual' | 'join' | 'portal';

export interface RespawnMessage {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  reason: RespawnReason;
}

/** "I am standing on this win area's pad." A request, never a grant. */
export interface ClaimWinMessage {
  area: number;
}

/** A win landed. Presentation only. */
export interface WinAwardedMessage {
  area: number;
  wins: number;
  total: number;
}

/** A slot-addressed request: balloons, eggs. */
export interface SlotMessage {
  slot: number;
}

/** An index-addressed request: a pet in the inventory. */
export interface IndexMessage {
  index: number;
}

/** An egg hatched. Presentation only: the pet is already in replicated state. */
export interface PetHatchedMessage {
  egg: number;
  pet: string;
}

/**
 * "My Bloxity token is now this." A TOKEN, not an id: the server resolves it
 * with Bloxity, so nobody can claim another account's paid-for Bux grants by
 * naming its id. Empty means logged out.
 */
export interface BloxityIdentityMessage {
  token: string;
}

/**
 * "This is the Bloxity avatar I am wearing": equipped cosmetic ids and nothing else -
 * no name, no account id. `null` means this player has no Bloxity avatar to show.
 */
export interface BloxityAvatarMessage {
  equipped: Record<string, string> | null;
}
