/**
 * Network-level constants. Must stay identical on client and server.
 */

/** Colyseus room registered by the server and joined by the client. */
export const ROOM_NAME = 'balloonpersecond';

/**
 * Default server port. Override with the PORT env var on the server.
 *
 * Deliberately not 2567-2571: the previous games in this series answer on
 * those, and sharing one would mean whichever server started first silently
 * served every client.
 */
export const DEFAULT_SERVER_PORT = 2572;

/**
 * Most players in ONE room. The matchmaker locks a full room and
 * `joinOrCreate` opens another, so the sixteenth player is routed, not refused.
 */
export const MAX_PLAYERS_PER_ROOM = 15;

/** Server simulation / state broadcast rate, in Hz. */
export const SERVER_TICK_RATE = 20;

/** Milliseconds between server ticks. */
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;

/** Client <-> server message identifiers. Every client message is a REQUEST. */
export const MessageType = {
  /** Client -> server: one frame of INPUT. Never a transform. */
  Move: 'move',
  /** Server -> client: authoritative respawn instruction. */
  Respawn: 'respawn',
  /** Client -> server: "put me back at spawn". */
  RequestRespawn: 'requestRespawn',
  /** Client -> server: "I am standing on this milestone's win pad". */
  ClaimWin: 'claimWin',
  /** Server -> client: a win was granted. Drives the celebration. */
  WinAwarded: 'winAwarded',
  /** Client -> server: "sell me this balloon". */
  BuyBalloon: 'buyBalloon',
  /** Client -> server: "hold this owned balloon". */
  EquipBalloon: 'equipBalloon',
  /** Client -> server: "hatch this egg for me" (standing at it). */
  HatchEgg: 'hatchEgg',
  /** Server -> client: which pet came out. Presentation only. */
  PetHatched: 'petHatched',
  /** Client -> server: toggle one pet on or off. */
  TogglePet: 'togglePet',
  /** Client -> server: equip the best owned pets. */
  EquipBestPets: 'equipBestPets',
  /** Client -> server: delete one pet. */
  DeletePet: 'deletePet',
  /**
   * Client -> server: "my Bloxity token is now this" (login or logout mid-session).
   * The server verifies it with Bloxity; it never trusts an id from a client.
   */
  BloxityIdentity: 'bloxityIdentity',
  /**
   * Client -> server: the Bloxity cosmetics this player is wearing (equipped ids).
   *
   * Cosmetic ONLY, and the one thing a client reports about itself: Bloxity's avatar
   * route refuses the game-scoped token the server holds, so an account's own SDK is
   * the only place these ids can be read. Without them every OTHER player would see
   * the default body. Names, ids and progression stay server-verified.
   */
  BloxityAvatar: 'bloxityAvatar',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];
