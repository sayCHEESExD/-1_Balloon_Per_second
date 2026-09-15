/**
 * Pets: hatched from the three eggs in the Eggs area, bought with Wins.
 *
 * Every egg holds four pets with rarity-weighted chances. While equipped a pet
 * adds BALLOONS to every balloon payout and/or a PERCENT to every win; the
 * bonuses of equipped pets add up. A player owns at most `PET_LIMITS.maxOwned`
 * pets and equips at most `PET_LIMITS.maxEquipped`.
 *
 * The roll happens on the SERVER. The client only asks to hatch.
 */
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export const RARITIES: Readonly<Record<Rarity, { readonly color: string }>> = {
  Common: { color: '#9ca3af' },
  Uncommon: { color: '#4ade80' },
  Rare: { color: '#38bdf8' },
  Epic: { color: '#c084fc' },
  Legendary: { color: '#fbbf24' },
};

/** What a pet looks like when it follows its owner. */
export type PetBody = 'cat' | 'bunny' | 'pig' | 'bird' | 'frog' | 'unicorn' | 'fish' | 'penguin' | 'dragon';

export interface PetDefinition {
  readonly id: string;
  readonly name: string;
  readonly egg: number;
  readonly rarity: Rarity;
  /** Percent chance within its egg. The four chances of an egg sum to 100. */
  readonly chance: number;
  /** Extra balloons per payout while equipped. */
  readonly balloons: number;
  /** Extra percent on every win while equipped. */
  readonly winsPercent: number;
  readonly body: PetBody;
  readonly color: number;
  readonly accent: number;
}

export interface EggDefinition {
  readonly slot: number;
  readonly name: string;
  readonly cost: number;
  readonly color: number;
  readonly accent: number;
}

export const EGGS: readonly EggDefinition[] = [
  { slot: 1, name: 'Basic Egg', cost: 2, color: 0x9a5b2e, accent: 0xd9a066 },
  { slot: 2, name: 'Grass Egg', cost: 150, color: 0x3fbf3a, accent: 0xa6ff7a },
  { slot: 3, name: 'Ocean Egg', cost: 3_500, color: 0x2338c8, accent: 0x5ec8ff },
];

/**
 * THE pet table. Each egg's common pet out-boosts the previous egg's best on
 * balloons, so a new egg is always an upgrade for the player who can afford it.
 */
export const PETS: readonly PetDefinition[] = [
  { id: 'cat', name: 'Cat', egg: 1, rarity: 'Common', chance: 55, balloons: 2, winsPercent: 0, body: 'cat', color: 0xd9d6e4, accent: 0xb58bd8 },
  { id: 'bunny', name: 'Bunny', egg: 1, rarity: 'Uncommon', chance: 30, balloons: 3, winsPercent: 5, body: 'bunny', color: 0xf7f7f7, accent: 0xff9ecf },
  { id: 'piggy', name: 'Piggy', egg: 1, rarity: 'Rare', chance: 12, balloons: 5, winsPercent: 10, body: 'pig', color: 0xffb3cf, accent: 0xff7fae },
  { id: 'racoon', name: 'Racoon', egg: 1, rarity: 'Epic', chance: 3, balloons: 8, winsPercent: 20, body: 'cat', color: 0x7d808a, accent: 0x25272e },

  { id: 'bird', name: 'Bird', egg: 2, rarity: 'Common', chance: 55, balloons: 10, winsPercent: 10, body: 'bird', color: 0x3ec8f0, accent: 0xffc02e },
  { id: 'frog', name: 'Frog', egg: 2, rarity: 'Uncommon', chance: 30, balloons: 14, winsPercent: 15, body: 'frog', color: 0x5cd23f, accent: 0xffffff },
  { id: 'fox', name: 'Fox', egg: 2, rarity: 'Rare', chance: 12, balloons: 20, winsPercent: 25, body: 'cat', color: 0xff8a2a, accent: 0xffffff },
  { id: 'unicorn', name: 'Unicorn', egg: 2, rarity: 'Legendary', chance: 3, balloons: 36, winsPercent: 50, body: 'unicorn', color: 0xfff4fb, accent: 0xff7fd6 },

  { id: 'dolphin', name: 'Dolphin', egg: 3, rarity: 'Common', chance: 55, balloons: 45, winsPercent: 30, body: 'fish', color: 0x6ba8e6, accent: 0xe8fbff },
  { id: 'penguin', name: 'Penguin', egg: 3, rarity: 'Uncommon', chance: 30, balloons: 65, winsPercent: 45, body: 'penguin', color: 0x23262e, accent: 0xffffff },
  { id: 'shark', name: 'Shark', egg: 3, rarity: 'Epic', chance: 12, balloons: 95, winsPercent: 70, body: 'fish', color: 0x6b7480, accent: 0xffffff },
  { id: 'emerald_dragon', name: 'Emerald Dragon', egg: 3, rarity: 'Legendary', chance: 3, balloons: 150, winsPercent: 120, body: 'dragon', color: 0x2fd17a, accent: 0xd8fff0 },
];

export const PET_LIMITS = {
  /** Most pets one player may own. */
  maxOwned: 40,
  /** Most pets one player may have equipped. */
  maxEquipped: 3,
} as const;

export const eggBySlot = (slot: number): EggDefinition | undefined =>
  EGGS.find((egg) => egg.slot === Math.floor(slot));

export const petById = (id: string): PetDefinition | undefined => PETS.find((pet) => pet.id === id);

export const petsInEgg = (slot: number): readonly PetDefinition[] => PETS.filter((pet) => pet.egg === Math.floor(slot));

/**
 * Roll one pet from an egg. `random` returns [0, 1): the server passes
 * `Math.random`, the tests pass fixed values.
 */
export const rollPet = (slot: number, random: () => number): PetDefinition | undefined => {
  const pool = petsInEgg(slot);
  const total = pool.reduce((sum, pet) => sum + pet.chance, 0);
  const value = random();
  let roll = (Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999) : 0) * total;
  for (const pet of pool) {
    roll -= pet.chance;
    if (roll < 0) return pet;
  }
  return pool[pool.length - 1];
};

/** One inventory entry. */
export interface OwnedPet {
  readonly id: string;
  readonly equipped: boolean;
}

/**
 * The pet inventory travels as ONE string, e.g. `"cat*,bunny,cat*"` (`*` marks
 * equipped; duplicates are separate pets). A single replicated field changes
 * the player's own onChange, where a nested schema array would not, and it
 * persists as-is.
 */
export const parsePets = (encoded: string): OwnedPet[] => {
  if (typeof encoded !== 'string' || encoded.length === 0) return [];
  const out: OwnedPet[] = [];
  for (const part of encoded.split(',')) {
    const equipped = part.endsWith('*');
    const id = equipped ? part.slice(0, -1) : part;
    if (!petById(id) || out.length >= PET_LIMITS.maxOwned) continue;
    out.push({ id, equipped });
  }
  // Never more equipped than allowed, whatever the source string said.
  let equippedCount = 0;
  return out.map((pet) => {
    if (!pet.equipped) return pet;
    equippedCount += 1;
    return equippedCount <= PET_LIMITS.maxEquipped ? pet : { id: pet.id, equipped: false };
  });
};

export const encodePets = (pets: readonly OwnedPet[]): string =>
  pets.map((pet) => `${pet.id}${pet.equipped ? '*' : ''}`).join(',');

/** Ids of the equipped pets, in inventory order. */
export const equippedPetIds = (encoded: string): string[] =>
  parsePets(encoded)
    .filter((pet) => pet.equipped)
    .map((pet) => pet.id);

const sumEquipped = (encoded: string, pick: (pet: PetDefinition) => number): number =>
  parsePets(encoded).reduce((sum, owned) => {
    const pet = owned.equipped ? petById(owned.id) : undefined;
    return sum + (pet ? Math.max(0, pick(pet)) : 0);
  }, 0);

/** Extra balloons per payout from the equipped pets. */
export const petBalloonBonus = (encoded: string): number => sumEquipped(encoded, (pet) => pet.balloons);

/** Extra win percent from the equipped pets. */
export const petWinsPercent = (encoded: string): number => sumEquipped(encoded, (pet) => pet.winsPercent);

/** How pets are ranked for Equip Best: balloons first, wins break ties. */
const score = (id: string): number => {
  const pet = petById(id);
  return pet ? pet.balloons * 1000 + pet.winsPercent : 0;
};

/** Equip the best `PET_LIMITS.maxEquipped` pets, unequip the rest. */
export const equipBestPets = (pets: readonly OwnedPet[]): OwnedPet[] => {
  const ranked = pets
    .map((pet, index) => ({ index, score: score(pet.id) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, PET_LIMITS.maxEquipped)
    .map((entry) => entry.index);
  return pets.map((pet, index) => ({ id: pet.id, equipped: ranked.includes(index) }));
};
