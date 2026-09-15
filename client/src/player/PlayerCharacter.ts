import { Group, Object3D } from 'three';
import type { AnimationInput } from '../animation/AnimationInput.js';
import { PlayerAnimator, type AnimationState } from '../animation/PlayerAnimator.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { HeldBalloon } from './HeldBalloon.js';
import { NameTag } from './NameTag.js';
import { PetCompanions } from './PetCompanions.js';
import { playerModelLoader } from './PlayerModelLoader.js';

/** Height of the name tag's centre above the feet. */
const NAME_TAG_HEIGHT = 4.5;

/**
 * The visual half of a player, arranged so animation can never move them.
 *
 *   root          physics transform (position + facing). Gameplay owns it.
 *     tipPivot    hip-height pivot: the float sway while airborne
 *       visual    the bob and scale effects
 *         model   the cloned FBX (or a Bloxity body), posed by the rig; the
 *                 balloon string is tied to its right hand
 *     name tag    name and balloon count, always facing the camera
 *   worldRoot     the balloon and the pets, which live in world space
 */
export class PlayerCharacter {
  readonly root = new Group();
  readonly worldRoot = new Group();
  readonly animator: PlayerAnimator;
  readonly pets = new PetCompanions();

  private readonly tipPivot = new Group();
  private readonly visual = new Group();
  private readonly defaultModel: Object3D;
  private readonly nameTag = new NameTag(4.6, true);
  private model: Object3D;
  private balloon: HeldBalloon;
  private balloonSlot = 1;

  constructor() {
    this.defaultModel = playerModelLoader.createInstance();
    this.model = this.defaultModel;
    this.root.add(this.tipPivot);
    this.tipPivot.add(this.visual);
    this.visual.add(this.model);
    this.nameTag.sprite.position.y = NAME_TAG_HEIGHT;
    this.root.add(this.nameTag.sprite);
    const rig = new PlayerRig(this.model, this.model);
    this.animator = new PlayerAnimator(rig, this.tipPivot, this.visual);
    this.balloon = new HeldBalloon(rig.getBone('ArmR2'));
    this.balloon.setSlot(this.balloonSlot);
    this.worldRoot.add(this.balloon.root, this.pets.root);
  }

  /** The body currently worn: the bundled FBX or a Bloxity body. */
  get modelRoot(): Object3D {
    return this.model;
  }

  /**
   * Wear a different body, or null for the bundled one.
   *
   * The body goes into the SAME `visual` node, so nothing above it moves, and a
   * fresh rig is bound to it by bone name - Bloxity's `player.glb` carries the
   * twelve names `player.fbx` does, so the walk and the jump drive it
   * unchanged. The balloon string is re-tied to the new right hand from the
   * bind pose, before the body is parented, which is how it was tied originally.
   *
   * @returns the model now worn
   */
  setModel(next: Object3D | null): Object3D {
    const target = next ?? this.defaultModel;
    if (target === this.model) return target;

    const previous = this.model;
    previous.removeFromParent();
    if (previous !== this.defaultModel && previous.userData['bloxityBody'] === true) {
      // A Bloxity body owns its material; its part geometry is cached and shared.
      previous.traverse((child) => {
        const material = (child as { material?: { dispose?: () => void } }).material;
        material?.dispose?.();
      });
    }

    const rig = new PlayerRig(target, target);
    rig.resetToBindPose();
    target.updateMatrixWorld(true);
    this.balloon.dispose();
    this.balloon = new HeldBalloon(rig.getBone('ArmR2'));
    this.balloon.setSlot(this.balloonSlot);
    this.worldRoot.add(this.balloon.root);

    this.model = target;
    this.visual.add(target);
    this.animator.setRig(rig);
    return target;
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  setYaw(yaw: number): void {
    this.root.rotation.y = yaw;
  }

  setVisualScale(x: number, y: number, z: number): void {
    this.visual.scale.set(x, y, z);
  }

  /** Hold the given balloon. */
  setBalloon(slot: number): void {
    this.balloonSlot = slot;
    this.balloon.setSlot(slot);
  }

  /** Show the pets equipped in an encoded inventory. */
  setPets(encoded: string): void {
    this.pets.setPets(encoded);
  }

  /** The label over the head. */
  setNameTag(name: string, balloons: number): void {
    this.nameTag.set(name, balloons);
  }

  update(delta: number, input: AnimationInput): void {
    this.animator.update(Math.max(0, delta), input);
  }

  /** The balloon and the pets. Call after `update` and after the root has moved. */
  updateEffects(delta: number, speed: number): void {
    this.root.updateMatrixWorld(true);
    this.balloon.update(delta);
    const p = this.root.position;
    this.pets.update(delta, p.x, p.y, p.z, this.root.rotation.y, speed);
  }

  get animationState(): AnimationState {
    return this.animator.currentState;
  }

  /** A placement: reset the pose and bring the balloon and pets along at once. */
  resetAnimation(): void {
    this.animator.reset();
    this.visual.scale.set(1, 1, 1);
    this.balloon.snap();
    this.pets.snap();
  }

  dispose(): void {
    this.balloon.dispose();
    this.pets.dispose();
    this.nameTag.dispose();
    this.root.removeFromParent();
    this.worldRoot.removeFromParent();
  }
}
