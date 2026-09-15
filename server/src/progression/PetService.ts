import {
  PET_LIMITS,
  eggBySlot,
  eggZoneAt,
  encodePets,
  equipBestPets,
  parsePets,
  rollPet,
  type PetDefinition,
} from '@highjump/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { BalloonService } from './BalloonService.js';
import { wallet } from './Wallet.js';

export type PetRefusal = 'unknown-egg' | 'not-at-egg' | 'inventory-full' | 'too-poor' | 'bad-index' | 'equip-limit';

export interface HatchResult {
  readonly pet?: PetDefinition;
  readonly reason?: PetRefusal;
}

/**
 * Server authority over eggs and the pet inventory.
 *
 * Hatching needs the player standing at THAT egg, room in the inventory and
 * the Wins; payment is the last check, and the roll happens HERE with the
 * server's random source. Every inventory change re-derives the balloon
 * payout, because equipped pets add to it.
 */
export class PetService {
  constructor(private readonly random: () => number = Math.random) {}

  hatch(player: PlayerState, slot: number, balloons: BalloonService): HatchResult {
    const egg = eggBySlot(slot);
    if (!egg) return { reason: 'unknown-egg' };
    if (eggZoneAt(player.x, player.y, player.z) !== egg.slot) return { reason: 'not-at-egg' };
    const pets = parsePets(player.pets);
    if (pets.length >= PET_LIMITS.maxOwned) return { reason: 'inventory-full' };
    const pet = rollPet(egg.slot, this.random);
    if (!pet) return { reason: 'unknown-egg' };
    if (!wallet.spend(player, egg.cost)) return { reason: 'too-poor' };

    // A new pet goes straight on if there is a free slot.
    const equipped = pets.filter((entry) => entry.equipped).length;
    pets.push({ id: pet.id, equipped: equipped < PET_LIMITS.maxEquipped });
    player.pets = encodePets(pets);
    balloons.syncDerived(player);
    return { pet };
  }

  toggle(player: PlayerState, index: number, balloons: BalloonService): PetRefusal | null {
    const pets = parsePets(player.pets);
    const at = Math.floor(index);
    const target = pets[at];
    if (!target) return 'bad-index';
    if (!target.equipped && pets.filter((pet) => pet.equipped).length >= PET_LIMITS.maxEquipped) {
      return 'equip-limit';
    }
    pets[at] = { id: target.id, equipped: !target.equipped };
    player.pets = encodePets(pets);
    balloons.syncDerived(player);
    return null;
  }

  equipBest(player: PlayerState, balloons: BalloonService): void {
    player.pets = encodePets(equipBestPets(parsePets(player.pets)));
    balloons.syncDerived(player);
  }

  remove(player: PlayerState, index: number, balloons: BalloonService): PetRefusal | null {
    const pets = parsePets(player.pets);
    const at = Math.floor(index);
    if (!pets[at]) return 'bad-index';
    pets.splice(at, 1);
    player.pets = encodePets(pets);
    balloons.syncDerived(player);
    return null;
  }
}
