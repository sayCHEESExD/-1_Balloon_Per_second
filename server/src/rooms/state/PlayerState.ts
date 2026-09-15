import { Schema, type } from '@colyseus/schema';
import { SPAWN_POSITION, SPAWN_ROTATION_Y } from '@highjump/shared';

/**
 * Replicated per-player state.
 *
 * Every field is written by the SERVER. Transform and motion come out of the
 * authoritative simulation; balloons, Wins and inventories are written only by
 * their own service. Nothing is ever copied from a client message.
 */
export class PlayerState extends Schema {
  @type('string') sessionId = '';
  /** Derived from the player's id; the id itself never leaves the server. */
  @type('string') handle = '';
  /** The Bloxity display name, set ONLY from a token the server verified. '' for guests. */
  @type('string') displayName = '';

  @type('float32') x: number = SPAWN_POSITION.x;
  @type('float32') y: number = SPAWN_POSITION.y;
  @type('float32') z: number = SPAWN_POSITION.z;
  @type('float32') rotationY: number = SPAWN_ROTATION_Y;

  @type('float32') speed = 0;
  @type('float32') verticalVelocity = 0;
  @type('boolean') grounded = true;
  @type('float32') velocityX = 0;
  @type('float32') velocityY = 0;
  @type('float32') velocityZ = 0;
  @type('uint32') lastInputSeq = 0;

  /** Latched simulation state, so client replay resumes exactly where the server stopped. */
  @type('boolean') jumpLatched = false;
  @type('float32') coyote = 0;
  /** The current airborne arc's gravity and fastest fall, so replay matches the server. */
  @type('float32') airGravity = 46;
  @type('float32') airTerminal = 27;

  /** Monotonic counter, so remote clients derive the one-shot jump animation. */
  @type('uint32') jumpCount = 0;

  // ---- progression (server-authoritative)
  /** Balloons collected: the climbing capability and the Top Balloons figure. */
  @type('float64') balloons = 0;
  @type('float64') wins = 0;
  /** Seconds played, for the Top Playtime board. */
  @type('float64') playSeconds = 0;

  // ---- worlds
  /** The world the player is in (1 or 2). Only a placement changes it. */
  @type('uint8') world = 1;
  /** Earned by reaching World 1's final step. Never lost. */
  @type('boolean') world2Unlocked = false;

  // ---- derived by BalloonService
  /** Balloons granted every payout. */
  @type('float64') balloonsPerTick = 1;
  /** The altitude the balloons lift this player to. The jump rises toward it. */
  @type('float32') reachY = 1.6;
  /** The altitude this player's balloons can lift them to (`climbHeightFor`). */
  @type('float64') climbHeight = 0;

  // ---- inventories
  /** Owned balloons as a bit mask (the Yellow Balloon is always owned). */
  @type('uint32') ownedBalloons = 1;
  @type('uint8') equippedBalloon = 1;
  /** Pet inventory, encoded by `encodePets`. */
  @type('string') pets = '';

  /** True once the server has simulated at least one input for this player. */
  @type('boolean') ready = false;
}
