import type { Vec3 } from '../types/math.js';

/**
 * World-space constants shared by the renderer and the authoritative server.
 *
 * Units are "world units". The supplied player.fbx is authored at 320 units
 * tall, so it is scaled down on load. The staircase's STUD labels are balloon
 * requirements, not world units: see `course.ts`.
 */

/** Multiplier applied to the loaded FBX so the character is PLAYER_HEIGHT tall. */
export const FBX_TO_WORLD_SCALE = 0.01;

/** Player height in world units (320 * FBX_TO_WORLD_SCALE). */
export const PLAYER_HEIGHT = 3.2;

/** Height of the collision body, feet to crown. */
export const BODY_HEIGHT = PLAYER_HEIGHT;

/**
 * How close the player's position may come to a BOUNDARY wall (the hub's
 * fence and the far end of the staircase): the half-width of the drawn body
 * and arms, so the model stops AT the fence rather than sinking into it.
 */
export const WALL_CLEARANCE = 1.4;

/** Horizontal half-width of the collision body. */
export const BODY_RADIUS = 0.72;

/**
 * Spawn transform: the middle of the hub, facing the staircase (+Z).
 *
 * There is exactly ONE placement in this game. Joining, falling off the
 * staircase and banking a win all land here - there are no checkpoints.
 */
export const SPAWN_POSITION: Readonly<Vec3> = { x: 0, y: 0, z: -12 };

/** Spawn yaw in radians (facing +Z, up the staircase). */
export const SPAWN_ROTATION_Y = 0;

/**
 * How far below the surface they were over a player may drop before they count
 * as fallen off. The staircase floats over open sky: stepping off its side is a
 * fall, and a fall is a respawn at the hub.
 */
export const FALL_DEPTH = 18;

/** Below this a player is outside the world altogether, wherever they are. */
export const OUT_OF_WORLD_Y = -80;
