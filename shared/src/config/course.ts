import { jumpHeightFor } from './movement.js';
import { EGGS } from './pets.js';
import type { Aabb } from '../types/math.js';

/**
 * The world: a fenced spawn hub, then one colossal rainbow staircase floating
 * up into the sky along +Z.
 *
 * PURE DATA. The renderer draws exactly what is here and the collision model
 * collides against exactly `COURSE_SOLIDS`, so a step the client draws but the
 * server does not know about is structurally impossible.
 *
 * HEIGHT GROWS FAST WITH STUDS. A step labelled N studs has its top at exactly
 * `studElevation(N)` = `STUD_CURVE.scale * N ^ STUD_CURVE.exponent` above the hub
 * floor: stud 1 is almost flat, and every stud after it rises much more than the
 * one before - stud 70 is higher than 400 studs used to be, and past 400 the
 * staircase climbs out of sight. A riser is the elevation its step adds. Step
 * DEPTH is horizontal and independent.
 *
 * CLIMBING IS PHYSICS. A player's balloons give their jump a constant LIFT
 * (`balloonLiftFor`): the same rise at stud 1, stud 300 and in World 2. There is no
 * reach, no wall above it and no cap: a riser taller than the lift simply cannot be
 * jumped, because the jump does not go high enough. `lastStepWithinLift` is for
 * information only (the HUD) and nothing in the simulation reads it.
 *
 * Orientation: the staircase climbs along +Z. At spawn the player faces +Z, so
 * their LEFT is +X and their RIGHT is -X (the camera's right is -X at yaw 0).
 */

export type SolidKind = 'hubFloor' | 'hubWall' | 'step' | 'winPad' | 'shopCounter' | 'eggPedestal';

export interface CourseSolid extends Aabb {
  readonly kind: SolidKind;
}

// ---------------------------------------------------------------- stairs

/** One run of steps sharing a stud increment and a shape. */
export interface StairSegment {
  readonly count: number;
  /** How many studs each step's label adds over the one before. */
  readonly studsPerStep: number;
  /** Step length along Z. */
  readonly depth: number;
  /** Step width along X. */
  readonly width: number;
}

/**
 * THE height curve: elevation = scale * studs ^ exponent.
 * 1 = 0.17, 10 = 27, 20 = 127, 30 = 312, 50 = 950, 70 = 2.0K, 100 = 4.4K,
 * 200 = 20K, 300 = 50K, 400 = 92K, 500 = 151K.
 */
export const STUD_CURVE = { scale: 0.174, exponent: 2.2 } as const;

/** The elevation of a step labelled `studs`. */
export const studElevation = (studs: number): number => {
  const n = Number.isFinite(studs) ? Math.max(0, studs) : 0;
  return STUD_CURVE.scale * n ** STUD_CURVE.exponent;
};

/**
 * THE staircase, bottom to top: 1 ... 30 studs one at a time, 32 ... 100 by twos,
 * 104 ... 200 by fours and 205 ... 500 by fives. The increments only keep the
 * step count sane; the height of every stud comes from `studElevation`.
 */
export const STAIR_SEGMENTS: readonly StairSegment[] = [
  { count: 30, studsPerStep: 1, depth: 9, width: 30 },
  { count: 35, studsPerStep: 2, depth: 10, width: 30 },
  { count: 25, studsPerStep: 4, depth: 12, width: 28 },
  { count: 60, studsPerStep: 5, depth: 14, width: 26 },
];

/**
 * The reward areas: a deep landing at a stud milestone with a gold win pad on
 * its LEFT half. The walking line continues past it on the right.
 */
export const WIN_AREAS: readonly { readonly studs: number; readonly wins: number }[] = [
  { studs: 17, wins: 5 },
  { studs: 50, wins: 25 },
  { studs: 100, wins: 150 },
  { studs: 200, wins: 1_000 },
  { studs: 300, wins: 6_000 },
  { studs: 400, wins: 40_000 },
  { studs: 500, wins: 300_000 },
];

/** Depth of a milestone landing. */
export const MILESTONE_DEPTH = 34;

/** Win pad footprint and its inset from the step's left (+X) edge. */
export const WIN_PAD = { width: 12, depth: 14, inset: 1.5, thickness: 0.1 } as const;


/** How far below its top a step column is solid (and drawn). */
export const STEP_BASE_Y = -40;

// -------------------------------------------------------------------- hub

export const HUB = {
  halfWidth: 72,
  minZ: -84,
  /** The hub's front edge, where the staircase begins. */
  maxZ: 44,
  floorY: 0,
  /** Height of the white fence drawn round the hub (the boundary is a clamp). */
  fenceHeight: 3,
} as const;

export const STAIR_START_Z = HUB.maxZ;

/** Past the hub, the sky has no fence: this only bounds a player who fell far off the side. */
const SKY_HALF_WIDTH = 400;

/** The Balloon Shop stall on the player's LEFT (+X), before the staircase. */
export const BALLOON_SHOP = {
  x: 40,
  z: 20,
  /** Counter footprint (solid). */
  width: 16,
  depth: 3,
  height: 2.6,
  /** Standing in this rectangle opens the Balloons menu. */
  zone: { minX: 30, maxX: 50, minZ: 7, maxZ: 18 },
} as const;

/** The Eggs area on the player's RIGHT (-X): one pedestal per egg. */
export const EGG_AREA = {
  xs: [-26, -40, -54] as readonly number[],
  z: 22,
  pedestalSize: 5,
  pedestalHeight: 2.2,
  /** Each egg's hatch zone, in front of its pedestal (toward spawn). */
  zoneHalfWidth: 5.5,
  zoneMinZ: 10,
  zoneMaxZ: 19,
} as const;

/** The three leaderboards stand along the BACK of the hub, facing the staircase. */
export const SCOREBOARD = {
  z: HUB.minZ + 4,
  /** Top Balloons, Top Wins, Top Playtime - left to right as seen from spawn looking back. */
  xs: [-30, 0, 30] as readonly number[],
} as const;

// ----------------------------------------------------------------- worlds

/**
 * World 2 is an exact copy of World 1's staircase, shifted far along +X (out past
 * World 1's open sky), so the two stay visible to each other across the gap and
 * share one collision model. Which world a position is in follows from its X.
 */
export const WORLD_COUNT = 2;
export const WORLD2_OFFSET_X = 1400;
const WORLD_SPLIT_X = WORLD2_OFFSET_X / 2;

/** The world a position is in: 1 or 2. */
export const worldAtX = (x: number): number => (x >= WORLD_SPLIT_X ? 2 : 1);

/** X of a world's origin (its staircase centre line). */
export const worldOriginX = (world: number): number => (world === 2 ? WORLD2_OFFSET_X : 0);

/**
 * World 2's small spawn in front of its staircase: no shops, no eggs, no boards.
 * Local to the world's origin.
 */
export const WORLD2_HUB = {
  halfWidth: 24,
  minZ: 0,
  maxZ: 44,
  floorY: 0,
} as const;

/** Where each world places a player, in WORLD coordinates. */
export const worldSpawn = (world: number): { x: number; y: number; z: number } =>
  world === 2 ? { x: WORLD2_OFFSET_X, y: WORLD2_HUB.floorY, z: 18 } : { x: 0, y: HUB.floorY, z: -12 };

export interface PortalDefinition {
  /** The world the portal stands in. */
  readonly world: number;
  /** The world it sends a player to. */
  readonly target: number;
  /** Centre, in world coordinates. */
  readonly x: number;
  readonly z: number;
  /** Half extents of the walk-in zone. */
  readonly halfX: number;
  readonly halfZ: number;
  /** Rotation of the frame: the side a player walks in from. */
  readonly rotationY: number;
}

/**
 * The portals. World 1's stands on the lawn beside spawn, facing the path (+X);
 * World 2's stands behind its spawn, facing the staircase (+Z).
 */
export const PORTALS: readonly PortalDefinition[] = [
  { world: 1, target: 2, x: -40, z: -18, halfX: 2.2, halfZ: 4.2, rotationY: Math.PI / 2 },
  { world: 2, target: 1, x: WORLD2_OFFSET_X, z: 5, halfX: 4.2, halfZ: 2.2, rotationY: 0 },
];

/** The portal whose zone the feet are in, or null. */
export const portalAt = (x: number, y: number, z: number): PortalDefinition | null => {
  if (y > HUB.floorY + 3) return null;
  for (const portal of PORTALS) {
    if (Math.abs(x - portal.x) <= portal.halfX && Math.abs(z - portal.z) <= portal.halfZ) return portal;
  }
  return null;
};

export const eggPedestalCentre = (slot: number): { x: number; z: number } => ({
  x: EGG_AREA.xs[Math.max(0, Math.floor(slot) - 1)] ?? EGG_AREA.xs[0] ?? 0,
  z: EGG_AREA.z,
});

// ------------------------------------------------------------- generation

export interface StepDefinition {
  /** 0-based across the whole staircase. */
  readonly index: number;
  /** The label: balloons needed to reach this step's top. */
  readonly studs: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Height of the step's top. */
  readonly top: number;
  readonly rise: number;
  /** 1-based win area on this step, or 0. */
  readonly winArea: number;
}

export interface WinPadDefinition extends Aabb {
  /** 1-based win area. */
  readonly area: number;
  readonly studs: number;
  readonly wins: number;
}

const buildSteps = (): StepDefinition[] => {
  const steps: StepDefinition[] = [];
  let z = STAIR_START_Z;
  let studs = 0;
  for (const segment of STAIR_SEGMENTS) {
    for (let i = 0; i < segment.count; i += 1) {
      studs += segment.studsPerStep;
      const top = HUB.floorY + studElevation(studs);
      const rise = top - (HUB.floorY + studElevation(studs - segment.studsPerStep));
      const area = WIN_AREAS.findIndex((entry) => entry.studs === studs) + 1;
      const depth = area > 0 ? MILESTONE_DEPTH : segment.depth;
      steps.push({
        index: steps.length,
        studs,
        minX: -segment.width / 2,
        maxX: segment.width / 2,
        minZ: z,
        maxZ: z + depth,
        top,
        rise,
        winArea: area,
      });
      z += depth;
    }
  }
  return steps;
};

export const STEPS: readonly StepDefinition[] = buildSteps();

const lastStep = STEPS[STEPS.length - 1] as StepDefinition;

/** The far end of the world. */
export const COURSE_END_Z = lastStep.maxZ;

/** Top of the highest step. */
export const COURSE_TOP_Y = lastStep.top;

/** Studs on the highest step. */
export const COURSE_TOP_STUDS = lastStep.studs;

export const WIN_PADS: readonly WinPadDefinition[] = WIN_AREAS.map((entry, i) => {
  const step = STEPS.find((s) => s.winArea === i + 1);
  if (!step) throw new Error(`no step for the ${entry.studs}-stud win area`);
  const centreZ = (step.minZ + step.maxZ) / 2;
  return {
    area: i + 1,
    studs: entry.studs,
    wins: entry.wins,
    maxX: step.maxX - WIN_PAD.inset,
    minX: step.maxX - WIN_PAD.inset - WIN_PAD.width,
    minZ: centreZ - WIN_PAD.depth / 2,
    maxZ: centreZ + WIN_PAD.depth / 2,
    minY: step.top,
    maxY: step.top + WIN_PAD.thickness,
  };
});

/**
 * World 2's rewards: the same milestones, paying on from World 1's top reward
 * (300,000) rather than starting over.
 */
export const WORLD2_WIN_WINS: readonly number[] = [400_000, 600_000, 1_000_000, 2_000_000, 4_000_000, 8_000_000, 20_000_000];

/** World 2's pads: World 1's, moved to its origin, numbered on after World 1's. */
export const WORLD2_WIN_PADS: readonly WinPadDefinition[] = WIN_PADS.map((pad, i) => ({
  ...pad,
  area: WIN_PADS.length + i + 1,
  wins: WORLD2_WIN_WINS[i] ?? pad.wins,
  minX: pad.minX + WORLD2_OFFSET_X,
  maxX: pad.maxX + WORLD2_OFFSET_X,
}));

/** Every pad in every world, indexed by `area - 1`. */
export const ALL_WIN_PADS: readonly WinPadDefinition[] = [...WIN_PADS, ...WORLD2_WIN_PADS];

export const winPadByArea = (area: number): WinPadDefinition | undefined =>
  Number.isInteger(area) ? ALL_WIN_PADS[area - 1] : undefined;

/** The world a win area belongs to. */
export const worldOfArea = (area: number): number => (area > WIN_PADS.length ? 2 : 1);

const box = (kind: SolidKind, minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): CourseSolid => ({
  kind,
  minX,
  maxX,
  minY,
  maxY,
  minZ,
  maxZ,
});

const buildSolids = (): CourseSolid[] => {
  const solids: CourseSolid[] = [];
  const first = STEPS[0] as StepDefinition;

  solids.push(box('hubFloor', -HUB.halfWidth, HUB.halfWidth, HUB.floorY - 4, HUB.floorY, HUB.minZ, HUB.maxZ));

  // The hub's front edge either side of the stair mouth. SOLID, so a player
  // walking along the front of the hub is stopped rather than walking off into
  // the sky, and the side clamp can end at the mouth without shoving anyone.
  const mouth = first.maxX;
  // Effectively endless: a jump has no height cap, so no jump may clear it.
  const wallTop = HUB.floorY + 1e7;
  solids.push(
    box('hubWall', mouth, HUB.halfWidth + 2, HUB.floorY - 4, wallTop, HUB.maxZ, HUB.maxZ + 2),
    box('hubWall', -HUB.halfWidth - 2, -mouth, HUB.floorY - 4, wallTop, HUB.maxZ, HUB.maxZ + 2),
  );

  for (const step of STEPS) {
    solids.push(box('step', step.minX, step.maxX, STEP_BASE_Y, step.top, step.minZ, step.maxZ));
  }

  for (const pad of WIN_PADS) {
    solids.push(box('winPad', pad.minX, pad.maxX, pad.minY, pad.maxY, pad.minZ, pad.maxZ));
  }

  const shop = BALLOON_SHOP;
  solids.push(
    box('shopCounter', shop.x - shop.width / 2, shop.x + shop.width / 2, HUB.floorY, HUB.floorY + shop.height, shop.z - shop.depth / 2, shop.z + shop.depth / 2),
  );

  const half = EGG_AREA.pedestalSize / 2;
  for (const egg of EGGS) {
    const c = eggPedestalCentre(egg.slot);
    solids.push(box('eggPedestal', c.x - half, c.x + half, HUB.floorY, HUB.floorY + EGG_AREA.pedestalHeight, c.z - half, c.z + half));
  }

  // World 2: a small spawn, the same staircase and its pads, at its origin.
  const ox = WORLD2_OFFSET_X;
  const hub2 = WORLD2_HUB;
  solids.push(
    box('hubFloor', ox - hub2.halfWidth, ox + hub2.halfWidth, hub2.floorY - 4, hub2.floorY, hub2.minZ, hub2.maxZ),
    box('hubWall', ox + mouth, ox + hub2.halfWidth + 2, hub2.floorY - 4, wallTop, hub2.maxZ, hub2.maxZ + 2),
    box('hubWall', ox - hub2.halfWidth - 2, ox - mouth, hub2.floorY - 4, wallTop, hub2.maxZ, hub2.maxZ + 2),
  );
  for (const step of STEPS) {
    solids.push(box('step', ox + step.minX, ox + step.maxX, STEP_BASE_Y, step.top, step.minZ, step.maxZ));
  }
  for (const pad of WORLD2_WIN_PADS) {
    solids.push(box('winPad', pad.minX, pad.maxX, pad.minY, pad.maxY, pad.minZ, pad.maxZ));
  }

  return solids;
};

export const COURSE_SOLIDS: readonly CourseSolid[] = buildSolids();

// ---------------------------------------------------------------- queries

/** The step whose footprint `z` is in, or null in the hub / past the end. */
export const stepAt = (z: number): StepDefinition | null => {
  if (!(z >= STAIR_START_Z) || z >= COURSE_END_Z) return null;
  let lo = 0;
  let hi = STEPS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((STEPS[mid] as StepDefinition).minZ <= z) lo = mid;
    else hi = mid - 1;
  }
  return STEPS[lo] ?? null;
};

/**
 * INFORMATION ONLY (the HUD): the last step whose riser a full jump of this lift
 * rises past, counting up from the bottom, or null if not even the first. Risers
 * strictly grow, so every step below it is within the lift too. The simulation never
 * reads this - whether a riser is cleared is decided by the jump itself.
 */
export const lastStepWithinLift = (lift: number): StepDefinition | null => {
  const height = jumpHeightFor(lift);
  if (height < (STEPS[0] as StepDefinition).rise) return null;
  let lo = 0;
  let hi = STEPS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((STEPS[mid] as StepDefinition).rise <= height) lo = mid;
    else hi = mid - 1;
  }
  return STEPS[lo] ?? null;
};

/** INFORMATION ONLY: the first step whose riser is taller than this lift, or null. */
export const firstStepBeyondLift = (lift: number): StepDefinition | null => {
  const last = lastStepWithinLift(lift);
  return STEPS[last ? last.index + 1 : 0] ?? null;
};

/** Half the fenced width at `z`: the hub's, or the open sky's past the mouth. */
export const halfWidthAt = (z: number, world = 1): number =>
  z < STAIR_START_Z ? (world === 2 ? WORLD2_HUB.halfWidth : HUB.halfWidth) : SKY_HALF_WIDTH;

/** The back of a world's spawn area. */
export const hubMinZFor = (world: number): number => (world === 2 ? WORLD2_HUB.minZ : HUB.minZ);

/** True when a stud height is the top of the staircase: World 1's final step. */
export const isFinalStep = (y: number, z: number): boolean => {
  const step = stepAt(z);
  return !!step && step.index === STEPS.length - 1 && y >= step.top - 0.5;
};

/** The win area whose pad the feet are on, or 0. World 2's pads number on from World 1's. */
export const winPadAt = (x: number, y: number, z: number): number => {
  const step = stepAt(z);
  if (!step || step.winArea === 0) return 0;
  const pad = worldAtX(x) === 2 ? WORLD2_WIN_PADS[step.winArea - 1] : WIN_PADS[step.winArea - 1];
  if (!pad) return 0;
  if (x < pad.minX || x > pad.maxX || z < pad.minZ || z > pad.maxZ) return 0;
  if (y < pad.minY - 0.5 || y > pad.maxY + 1.5) return 0;
  return pad.area;
};

/** The egg whose hatch zone the player is standing in, or 0. */
export const eggZoneAt = (x: number, y: number, z: number): number => {
  if (y > HUB.floorY + 2 || z < EGG_AREA.zoneMinZ || z > EGG_AREA.zoneMaxZ) return 0;
  for (const egg of EGGS) {
    if (Math.abs(x - eggPedestalCentre(egg.slot).x) <= EGG_AREA.zoneHalfWidth) return egg.slot;
  }
  return 0;
};

/** True while standing at the Balloon Shop. */
export const inBalloonShop = (x: number, y: number, z: number): boolean => {
  const zone = BALLOON_SHOP.zone;
  return y < HUB.floorY + 2 && x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ;
};
