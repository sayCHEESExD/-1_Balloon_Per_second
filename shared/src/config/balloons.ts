import { petBalloonBonus, petWinsPercent } from './pets.js';
import { BASE_BALLOONS_PER_TICK, MAX_WINS } from './progression.js';

/**
 * Balloons: the Balloon Shop's ladder, and the balloon every player holds.
 *
 * A balloon is bought with Wins (from the Balloons menu, anywhere) and then
 * equipped. The equipped balloon is the one drawn in the player's hand and it
 * adds its `balloons` to every balloon payout and its `winsPercent` to every win.
 * The best balloon owned multiplies how many studs the player's balloons can climb
 * (`climb`). The Yellow Balloon is free and owned by everyone from the start.
 *
 * Pure data. Change a price or a bonus here and the menu, the server and the
 * verification script all follow.
 */
export type BalloonShape =
  | 'round'
  | 'heart'
  | 'dogs'
  | 'package'
  | 'zeppelin'
  | 'frog'
  | 'tumtum'
  | 'bird'
  | 'noob'
  | 'blackhole'
  | 'uphouse'
  | 'snowflake'
  | 'icecube'
  | 'yeti'
  | 'mammoth'
  | 'jaguar';

export interface BalloonDefinition {
  /** 1-based slot. Also the bit in the owned mask and the menu's order. */
  readonly slot: number;
  readonly name: string;
  /** Wins deducted on purchase. */
  readonly cost: number;
  /** Extra balloons per payout while held. */
  readonly balloons: number;
  /** Extra percent on every win while held. */
  readonly winsPercent: number;
  /** Climb multiplier once owned: the balloons counted toward climb height are multiplied by this. */
  readonly climb: number;
  readonly shape: BalloonShape;
  readonly color: number;
  readonly accent: number;
  /**
   * How big it is drawn in the hand, relative to a plain balloon. Grows with value, so a
   * rare balloon is visibly enormous: cheap 1-1.1, mid-tier 1.25-2.1, rare 2.8-5.5.
   */
  readonly size: number;
}

export const BALLOONS: readonly BalloonDefinition[] = [
  { slot: 1, name: 'Yellow', cost: 0, balloons: 0, winsPercent: 0, climb: 1, shape: 'round', color: 0xffdf5e, accent: 0xfff3b0, size: 1 },
  { slot: 2, name: 'Blue', cost: 10, balloons: 1, winsPercent: 0, climb: 1.1, shape: 'round', color: 0x4cc3f5, accent: 0xc8efff, size: 1 },
  { slot: 3, name: 'Red', cost: 50, balloons: 2, winsPercent: 0, climb: 1.2, shape: 'round', color: 0xef3b3b, accent: 0xffb0b0, size: 1 },
  { slot: 4, name: 'Heart', cost: 100, balloons: 3, winsPercent: 5, climb: 1.3, shape: 'heart', color: 0xff5fa2, accent: 0xffd1e6, size: 1.1 },
  { slot: 5, name: 'Dogs', cost: 500, balloons: 5, winsPercent: 10, climb: 1.5, shape: 'dogs', color: 0xe8313a, accent: 0x3ccf4a, size: 1.25 },
  { slot: 6, name: 'Package', cost: 1_000, balloons: 8, winsPercent: 15, climb: 1.75, shape: 'package', color: 0xff9a2e, accent: 0x3a8bff, size: 1.35 },
  { slot: 7, name: 'Zeppelin', cost: 5_000, balloons: 15, winsPercent: 25, climb: 2, shape: 'zeppelin', color: 0xb8c0cc, accent: 0xe8313a, size: 1.6 },
  { slot: 8, name: 'Frog', cost: 8_000, balloons: 20, winsPercent: 30, climb: 2.25, shape: 'frog', color: 0x5cc23a, accent: 0xffffff, size: 1.7 },
  { slot: 9, name: 'Tum Tum', cost: 10_000, balloons: 25, winsPercent: 40, climb: 2.5, shape: 'tumtum', color: 0xb5793f, accent: 0x5a3a1e, size: 1.75 },
  { slot: 10, name: 'Bird', cost: 25_000, balloons: 40, winsPercent: 50, climb: 3, shape: 'bird', color: 0x38b6ff, accent: 0xffc02e, size: 2.1 },
  { slot: 11, name: 'Noob', cost: 10_000, balloons: 30, winsPercent: 30, climb: 2.5, shape: 'noob', color: 0xf5d33d, accent: 0x2f6fe0, size: 1.75 },
  { slot: 12, name: 'Black Hole', cost: 70_000, balloons: 80, winsPercent: 90, climb: 4, shape: 'blackhole', color: 0x14101f, accent: 0xb45cff, size: 3 },
  { slot: 13, name: 'Uphouse', cost: 60_000, balloons: 70, winsPercent: 80, climb: 3.5, shape: 'uphouse', color: 0xf2a65a, accent: 0x7ec8ff, size: 2.8 },
  { slot: 14, name: 'Snowflake', cost: 100_000, balloons: 100, winsPercent: 120, climb: 4.5, shape: 'snowflake', color: 0xbfeaff, accent: 0xffffff, size: 3.2 },
  { slot: 15, name: 'Ice Cube', cost: 450_000, balloons: 200, winsPercent: 200, climb: 6, shape: 'icecube', color: 0x8fd8ff, accent: 0xe8fbff, size: 3.6 },
  { slot: 16, name: 'Yeti', cost: 1_000_000, balloons: 350, winsPercent: 300, climb: 7, shape: 'yeti', color: 0xf3f7fb, accent: 0x5aa8e8, size: 4.2 },
  { slot: 17, name: 'Mammoth', cost: 3_000_000, balloons: 600, winsPercent: 450, climb: 8.5, shape: 'mammoth', color: 0x8a5a36, accent: 0xfff4de, size: 4.8 },
  { slot: 18, name: 'Jaguar', cost: 5_000_000, balloons: 900, winsPercent: 600, climb: 10, shape: 'jaguar', color: 0xf2a93b, accent: 0x2b1d12, size: 5.5 },
];

/** The Yellow Balloon: owned by everyone, free, and what a new player holds. */
export const STARTER_BALLOON = 1;

export const balloonBySlot = (slot: number): BalloonDefinition | undefined =>
  BALLOONS.find((balloon) => balloon.slot === Math.floor(slot));

export const balloonMask = (slot: number): number => 2 ** (Math.floor(slot) - 1);

/** The starter balloon is always owned, whatever the mask says. */
export const isBalloonOwned = (owned: number, slot: number): boolean => {
  const at = Math.floor(slot);
  if (at === STARTER_BALLOON) return true;
  if (at < 1 || at > BALLOONS.length) return false;
  return Math.floor((Number.isFinite(owned) ? owned : 0) / balloonMask(at)) % 2 === 1;
};

/** How many of the balloons a mask owns (the starter included). */
export const ownedBalloonCount = (owned: number): number =>
  BALLOONS.filter((balloon) => isBalloonOwned(owned, balloon.slot)).length;

/** The balloon actually held: the equipped slot if owned, else the starter. */
export const heldBalloon = (equipped: number, owned: number): BalloonDefinition =>
  (isBalloonOwned(owned, equipped) ? balloonBySlot(equipped) : undefined) ?? (BALLOONS[0] as BalloonDefinition);

/**
 * THE balloon payout: balloons granted every `BALLOON_TICK_SECONDS`. The base,
 * plus the held balloon, plus every equipped pet.
 */
export const balloonsPerTick = (equipped: number, owned: number, pets: string): number =>
  BASE_BALLOONS_PER_TICK + heldBalloon(equipped, owned).balloons + petBalloonBonus(pets);

/** Extra win percent: the held balloon's plus the equipped pets'. */
export const winsPercentFor = (equipped: number, owned: number, pets: string): number =>
  heldBalloon(equipped, owned).winsPercent + petWinsPercent(pets);

/** The climb multiplier of the best balloon owned. Owning is enough; it need not be held. */
export const bestClimbMultiplier = (owned: number): number =>
  BALLOONS.reduce((best, balloon) => (isBalloonOwned(owned, balloon.slot) ? Math.max(best, balloon.climb) : best), 1);

/**
 * How balloons become climb height: `scale * (balloons * multiplier) ^ exponent`.
 * The exponent under 1 is the grind: each stud higher costs more balloons than the
 * last. 60 balloons reach stud 17; 1.7K stud ~55; the top takes hundreds of
 * thousands on late balloons.
 */
export const CLIMB_CURVE = { scale: 3.77, exponent: 0.772 } as const;

/**
 * THE climb height, in world units: what a player's balloons can lift them to. It
 * depends on the balloon count and the best owned balloon, and on nothing else -
 * not where the player stands, not the staircase - and it never falls.
 */
export const climbHeightFor = (balloons: number, owned: number): number => {
  const count = Number.isFinite(balloons) ? Math.max(0, Math.floor(balloons)) : 0;
  return CLIMB_CURVE.scale * (count * bestClimbMultiplier(owned)) ** CLIMB_CURVE.exponent;
};

/** The fewest balloons whose climb height reaches `height` with these balloons owned. */
export const balloonsForHeight = (height: number, owned: number): number => {
  if (!(height > 0)) return 0;
  const multiplier = bestClimbMultiplier(owned);
  let count = Math.max(0, Math.floor((height / CLIMB_CURVE.scale) ** (1 / CLIMB_CURVE.exponent) / multiplier) - 2);
  while (climbHeightFor(count, owned) < height) count += 1;
  return count;
};

/** Win multiplier: 1 plus the held balloon's and the equipped pets' percents. */
export const winsMultiplier = (equipped: number, owned: number, pets: string): number =>
  1 + winsPercentFor(equipped, owned, pets) / 100;

/**
 * THE win reward calculation: a pad's base value times the bonuses, saturated.
 * Integer percent arithmetic, so +15% of 100 is 115 and never 114.99999.
 */
export const resolveWinReward = (base: number, equipped: number, owned: number, pets: string): number => {
  const value = Number.isFinite(base) ? Math.max(0, Math.floor(base)) : 0;
  return Math.min(Math.floor((value * (100 + winsPercentFor(equipped, owned, pets))) / 100), MAX_WINS);
};
