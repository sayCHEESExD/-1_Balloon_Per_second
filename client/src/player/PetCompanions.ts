import { COURSE_END_Z, RARITIES, equippedPetIds, halfWidthAt, hubMinZFor, petById, worldAtX, worldOriginX } from '@highjump/shared';
import { Group } from 'three';
import { NameTag } from './NameTag.js';
import { buildPetModel } from './PetModels.js';

/** Where each follower walks, in the owner's frame: x to the side, z behind. */
const SLOTS: readonly { readonly x: number; readonly z: number }[] = [
  { x: 2.4, z: -1.8 },
  { x: -2.4, z: -1.8 },
  { x: 0, z: -3.6 },
];

const FOLLOW_RATE = 6;
/** A follower further than this from its spot is placed, not walked. */
const SNAP_DISTANCE = 30;
/** How close a follower may come to the hub fence. */
const PET_WALL_CLEARANCE = 1;
/** Pets are drawn a little larger than their authored size, like the reference. */
const PET_SCALE = 1.25;

const clamp = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);

interface Follower {
  readonly group: Group;
  readonly tag: NameTag;
  readonly phase: number;
  placed: boolean;
}

/**
 * The equipped pets, following their owner around with their names above them.
 *
 * Living in WORLD space (under the character's `worldRoot`) so they trail
 * behind rather than being bolted to the body. They walk on the owner's ground
 * level, hop while the owner moves and float along beside them through a jump.
 *
 * Purely cosmetic: which pets are equipped is replicated server state.
 */
export class PetCompanions {
  readonly root = new Group();
  private readonly followers: Follower[] = [];
  private signature = '';
  private time = 0;

  /** Show the pets equipped in an encoded inventory. */
  setPets(encoded: string): void {
    const ids = equippedPetIds(encoded);
    const signature = ids.join(',');
    if (signature === this.signature) return;
    this.signature = signature;
    this.clear();
    ids.forEach((id, index) => {
      const pet = petById(id);
      if (!pet) return;
      const group = buildPetModel(pet);
      group.scale.setScalar(PET_SCALE);
      const tag = new NameTag(2.6, false);
      tag.set(pet.name, 0, RARITIES[pet.rarity].color);
      tag.sprite.position.y = 2.25;
      group.add(tag.sprite);
      this.root.add(group);
      this.followers.push({ group, tag, phase: index * 2.1, placed: false });
    });
  }

  /** Place every follower at its spot on the next update (a placement). */
  snap(): void {
    for (const follower of this.followers) follower.placed = false;
  }

  update(delta: number, x: number, y: number, z: number, yaw: number, speed: number): void {
    if (this.followers.length === 0) return;
    this.time += delta;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const alpha = 1 - Math.exp(-FOLLOW_RATE * Math.max(0, delta));
    const moving = speed > 1;

    this.followers.forEach((follower, index) => {
      const slot = SLOTS[index] ?? SLOTS[0];
      if (!slot) return;
      // Owner's local offset into world space, kept inside the hub fence.
      const world = worldAtX(x);
      const origin = worldOriginX(world);
      const tz = clamp(z - slot.x * sin + slot.z * cos, hubMinZFor(world) + PET_WALL_CLEARANCE, COURSE_END_Z - PET_WALL_CLEARANCE);
      const half = halfWidthAt(tz, world) - PET_WALL_CLEARANCE;
      const tx = origin + clamp(x - origin + slot.x * cos + slot.z * sin, -half, half);
      const position = follower.group.position;
      const far = Math.hypot(tx - position.x, tz - position.z, y - position.y) > SNAP_DISTANCE;
      if (!follower.placed || far) {
        position.set(tx, y, tz);
        follower.placed = true;
      } else {
        position.x += (tx - position.x) * alpha;
        position.z += (tz - position.z) * alpha;
        position.y += (y - position.y) * alpha;
      }
      const t = this.time * (moving ? 9 : 2.2) + follower.phase;
      const hop = moving ? Math.abs(Math.sin(t)) * 0.5 : (Math.sin(t) + 1) * 0.08;
      (follower.group.children[0] as Group).position.y = hop;
      // Face the way the owner is facing, with a little wobble.
      follower.group.rotation.y = yaw + Math.sin(this.time * 3 + follower.phase) * 0.12;
    });
  }

  dispose(): void {
    this.clear();
    this.root.removeFromParent();
  }

  private clear(): void {
    for (const follower of this.followers) {
      follower.tag.dispose();
      follower.group.removeFromParent();
    }
    this.followers.length = 0;
  }
}
