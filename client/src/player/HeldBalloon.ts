import { balloonBySlot } from '@highjump/shared';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3, type Bone, type Object3D } from 'three';
import { buildBalloonModel, releaseBalloonModel } from './BalloonModels.js';

/**
 * Where the palm sits relative to the lower arm bone, in world units at bind
 * pose: the arms hang down, so the hand is below the elbow.
 */
const HAND_OFFSET = new Vector3(0, -0.72, 0.1);

/** String length at balloon size 1. */
const STRING_LENGTH = 3.1;

/** Spring stiffness and damping of the balloon chasing its spot above the hand. */
const STIFFNESS = 26;
const DAMPING = 6.5;

/** The balloon never strays further than this multiple of its string from the hand. */
const MAX_STRETCH = 1.12;

const UP = new Vector3(0, 1, 0);
const HAND = new Vector3();
const DIRECTION = new Vector3();
const TARGET = new Vector3();
const TILT = new Quaternion();

const stringGeometry = new BoxGeometry(0.035, 1, 0.035).translate(0, 0.5, 0);
const stringMaterial = new MeshBasicMaterial({ color: 0x2b2f3a });

/**
 * The balloon a player holds in their right hand.
 *
 * The HAND is a small anchor parented to the right lower-arm bone, so it goes
 * wherever the animation takes the arm. The BALLOON lives in world space under
 * the character's `worldRoot`: a damped spring pulls it toward a spot a string's
 * length above the hand, so it trails behind a walk, lags a jump and bobs back,
 * and it tilts to hang along its string. The string is one thin box stretched
 * from the hand to the knot every frame.
 *
 * Purely cosmetic. Which balloon is held is replicated server state.
 */
export class HeldBalloon {
  readonly root = new Group();
  private readonly anchor: Object3D | null = null;
  private readonly string = new Mesh(stringGeometry, stringMaterial);
  private readonly velocity = new Vector3();
  private model: Group | null = null;
  private slot = -1;
  private length = STRING_LENGTH;
  private placed = false;
  private time = Math.random() * 10;

  constructor(handBone: Bone | null) {
    this.string.frustumCulled = false;
    this.root.add(this.string);
    if (!handBone) return;
    handBone.updateWorldMatrix(true, false);
    const boneWorld = new Quaternion();
    const boneScale = new Vector3();
    handBone.getWorldQuaternion(boneWorld);
    handBone.getWorldScale(boneScale);
    const scale = boneScale.x || 1;
    const anchor = new Group();
    anchor.position.copy(HAND_OFFSET).applyQuaternion(boneWorld.clone().invert()).divideScalar(scale);
    handBone.add(anchor);
    this.anchor = anchor;
  }

  /** Hold the given balloon. */
  setSlot(slot: number): void {
    if (slot === this.slot) return;
    this.slot = slot;
    if (this.model) releaseBalloonModel(this.model);
    this.model = null;
    const balloon = balloonBySlot(slot);
    if (!balloon) return;
    this.model = buildBalloonModel(balloon);
    this.model.traverse((child) => {
      child.frustumCulled = false;
    });
    // A giant balloon rides on a longer string, so it floats clear above its owner.
    this.length = STRING_LENGTH + (balloon.size - 1) * 0.8;
    this.root.add(this.model);
  }

  /** Put the balloon straight above the hand on the next update (a placement). */
  snap(): void {
    this.placed = false;
  }

  /** Follow the hand. Call AFTER the pose for this frame has been applied. */
  update(delta: number): void {
    if (!this.anchor || !this.model) return;
    const dt = Math.min(Math.max(delta, 0), 0.05);
    this.time += dt;
    this.anchor.updateWorldMatrix(true, false);
    this.anchor.getWorldPosition(HAND);

    TARGET.set(
      HAND.x + Math.sin(this.time * 1.3) * 0.25,
      HAND.y + this.length,
      HAND.z + Math.cos(this.time * 1.1) * 0.25,
    );
    const position = this.model.position;
    if (!this.placed) {
      position.copy(TARGET);
      this.velocity.set(0, 0, 0);
      this.placed = true;
    } else {
      // Damped spring toward the spot above the hand.
      this.velocity.x += ((TARGET.x - position.x) * STIFFNESS - this.velocity.x * DAMPING) * dt;
      this.velocity.y += ((TARGET.y - position.y) * STIFFNESS - this.velocity.y * DAMPING) * dt;
      this.velocity.z += ((TARGET.z - position.z) * STIFFNESS - this.velocity.z * DAMPING) * dt;
      position.addScaledVector(this.velocity, dt);
    }

    DIRECTION.subVectors(position, HAND);
    let distance = DIRECTION.length();
    const limit = this.length * MAX_STRETCH;
    if (distance > limit) {
      DIRECTION.multiplyScalar(limit / distance);
      position.copy(HAND).add(DIRECTION);
      distance = limit;
    }
    if (distance < 1e-4) DIRECTION.copy(UP);
    else DIRECTION.divideScalar(distance);

    // Hang along the string.
    TILT.setFromUnitVectors(UP, DIRECTION);
    this.model.quaternion.copy(TILT);
    this.string.position.copy(HAND);
    this.string.quaternion.copy(TILT);
    this.string.scale.set(1, Math.max(distance, 0.01), 1);
  }

  dispose(): void {
    if (this.model) releaseBalloonModel(this.model);
    this.model = null;
    this.anchor?.removeFromParent();
    this.root.removeFromParent();
  }
}
