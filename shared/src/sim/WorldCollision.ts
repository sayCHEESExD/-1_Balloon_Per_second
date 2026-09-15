import {
  COURSE_END_Z,
  COURSE_SOLIDS,
  HUB,
  STAIR_START_Z,
  eggZoneAt,
  halfWidthAt,
  hubMinZFor,
  inBalloonShop,
  stepAt,
  winPadAt,
  worldAtX,
  worldOriginX,
  type CourseSolid,
} from '../config/course.js';
import { MOVEMENT } from '../config/movement.js';
import { BODY_HEIGHT, BODY_RADIUS, FALL_DEPTH, OUT_OF_WORLD_Y, WALL_CLEARANCE } from '../constants/world.js';

/**
 * The gameplay shape of the world: what you can stand on, what stops you, and
 * where the triggers are.
 *
 * Lives in `shared` because BOTH sides collide against it - the server
 * simulates movement against this object and the client predicts against an
 * identical one. Solids are bucketed by Z so a substep tests a handful of
 * boxes rather than the whole staircase.
 */

const BUCKET_SIZE = 24;

/**
 * How far below a surface the player may be and still land on it. The SAME
 * number as `MOVEMENT.stepHeight`: `surfaceYAt` offers surfaces within a step
 * of the feet and `canLandOn` must accept exactly those, or a pad a hair above
 * the floor becomes something the player falls straight through.
 */
const LANDING_TOLERANCE = MOVEMENT.stepHeight;

const CEILING_TOLERANCE = 0.05;

/**
 * How much two boxes may overlap and still count as merely TOUCHING in
 * `resolveAxis`.
 *
 * Positions reach the client as float32 (the replicated schema), so a player
 * the server stopped exactly against a face arrives a few millionths INSIDE it.
 * Without this, replaying from that position made the OTHER axis's resolve see
 * an overlap and shove the player to the far end of the box - several units
 * sideways, every server patch: the stuck-and-shaking at a shop counter.
 */
const CONTACT_EPSILON = 1e-3;

export interface CourseTriggers {
  fallen: boolean;
  winPad: number;
  egg: number;
  inShop: boolean;
}

export class WorldCollision {
  private readonly buckets = new Map<number, CourseSolid[]>();
  private readonly minBucket: number;
  private readonly maxBucket: number;

  constructor() {
    let lowest = Number.POSITIVE_INFINITY;
    let highest = Number.NEGATIVE_INFINITY;
    for (const solid of COURSE_SOLIDS) {
      const from = bucketOf(solid.minZ);
      const to = bucketOf(solid.maxZ);
      lowest = Math.min(lowest, from);
      highest = Math.max(highest, to);
      for (let b = from; b <= to; b += 1) {
        let list = this.buckets.get(b);
        if (!list) {
          list = [];
          this.buckets.set(b, list);
        }
        list.push(solid);
      }
    }
    this.minBucket = lowest;
    this.maxBucket = highest;
  }

  private near(z: number): readonly CourseSolid[] {
    const bucket = bucketOf(z);
    if (bucket < this.minBucket - 1 || bucket > this.maxBucket + 1) return EMPTY;
    SCRATCH.length = 0;
    for (let b = bucket - 1; b <= bucket + 1; b += 1) {
      const list = this.buckets.get(b);
      if (list) for (const solid of list) SCRATCH.push(solid);
    }
    return SCRATCH;
  }

  /**
   * Height of the walkable surface under the feet, or null over open sky. Purely
   * geometric: any surface within a step of the feet, at any altitude.
   */
  surfaceYAt(x: number, z: number, feetY: number): number | null {
    const ceiling = feetY + MOVEMENT.stepHeight;
    let best: number | null = null;
    for (const solid of this.near(z)) {
      if (x < solid.minX - BODY_RADIUS || x > solid.maxX + BODY_RADIUS) continue;
      if (z < solid.minZ - BODY_RADIUS || z > solid.maxZ + BODY_RADIUS) continue;
      if (solid.maxY > ceiling) continue;
      if (best === null || solid.maxY > best) best = solid.maxY;
    }
    return best;
  }

  /** Underside of the lowest solid the head is about to hit, or null. */
  ceilingYAt(x: number, z: number, previousHeadY: number): number | null {
    let best: number | null = null;
    for (const solid of this.near(z)) {
      if (x < solid.minX || x > solid.maxX) continue;
      if (z < solid.minZ || z > solid.maxZ) continue;
      if (previousHeadY > solid.minY + CEILING_TOLERANCE) continue;
      if (best === null || solid.minY < best) best = solid.minY;
    }
    return best;
  }

  canLandOn(previousY: number, surfaceY: number): boolean {
    return previousY >= surfaceY - LANDING_TOLERANCE;
  }

  /**
   * Push the body out of anything it walked into along ONE axis. A solid whose top
   * is within a step of the feet is stepped up onto; anything taller is a wall until
   * the feet are high enough. Purely geometric - no progression enters collision.
   */
  resolveAxis(axis: 0 | 2, value: number, other: number, feetY: number): number {
    const headY = feetY + BODY_HEIGHT;
    const stepTop = feetY + MOVEMENT.stepHeight;
    let out = value;

    for (const solid of this.near(axis === 2 ? value : other)) {
      if (solid.maxY <= stepTop) continue;
      if (solid.minY >= headY) continue;

      const minA = axis === 0 ? solid.minX : solid.minZ;
      const maxA = axis === 0 ? solid.maxX : solid.maxZ;
      const minB = axis === 0 ? solid.minZ : solid.minX;
      const maxB = axis === 0 ? solid.maxZ : solid.maxX;

      // Touching a face (within float32 error) is not overlapping it.
      if (other + BODY_RADIUS <= minB + CONTACT_EPSILON || other - BODY_RADIUS >= maxB - CONTACT_EPSILON) continue;
      if (out + BODY_RADIUS <= minA + CONTACT_EPSILON || out - BODY_RADIUS >= maxA - CONTACT_EPSILON) continue;

      const pushLow = minA - BODY_RADIUS;
      const pushHigh = maxA + BODY_RADIUS;
      out = out - pushLow < pushHigh - out ? pushLow : pushHigh;
    }
    return out;
  }

  /**
   * The boundaries: the hub's fence (sides and back) and the far end of the
   * staircase. A CLAMP applied after every integration substep, by the server
   * and by prediction alike, so no speed can tunnel it.
   *
   * The staircase's SIDES are open sky, deliberately: stepping off one is a
   * fall (`hasFallen`). The hub's front edge is a real solid (see `course.ts`),
   * which is what lets the fence clamp end at the stair mouth.
   */
  clampToBounds(x: number, z: number, out: { x: number; z: number }): void {
    // Each world is bounded around its own origin; the gap between them is unreachable.
    const world = worldAtX(x);
    const origin = worldOriginX(world);
    const minZ = hubMinZFor(world) + WALL_CLEARANCE;
    const maxZ = COURSE_END_Z - WALL_CLEARANCE;
    out.z = z < minZ ? minZ : z > maxZ ? maxZ : z;
    const limit = halfWidthAt(out.z, world) - WALL_CLEARANCE;
    const local = x - origin;
    out.x = origin + (local < -limit ? -limit : local > limit ? limit : local);
  }

  /**
   * True once a player has dropped off the staircase into the sky: more than
   * `FALL_DEPTH` below the step they are over. Falling back onto a lower step
   * never counts - over each step the reference is that step's own top.
   */
  hasFallen(y: number, z: number): boolean {
    if (!(y > OUT_OF_WORLD_Y)) return true;
    if (z < STAIR_START_Z) return false;
    return y < (stepAt(z)?.top ?? HUB.floorY) - FALL_DEPTH;
  }

  sampleTriggers(x: number, y: number, z: number): CourseTriggers {
    return {
      fallen: this.hasFallen(y, z),
      winPad: winPadAt(x, y, z),
      egg: eggZoneAt(x, y, z),
      inShop: inBalloonShop(x, y, z),
    };
  }
}

const SCRATCH: CourseSolid[] = [];
const EMPTY: readonly CourseSolid[] = [];

const bucketOf = (z: number): number => Math.floor(z / BUCKET_SIZE);
