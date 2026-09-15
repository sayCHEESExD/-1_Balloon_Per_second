import { CAMERA } from '@highjump/shared';
import { PerspectiveCamera, Vector3 } from 'three';

/**
 * Extra distance the camera starts a respawn from, in world units.
 *
 * A DELIBERATE effect: this moves only the DISTANCE along the camera's own
 * axis, so the shot is framed correctly throughout and simply pulls in. Set to
 * 0 to remove it.
 */
const RESPAWN_ZOOM_DISTANCE = 10;

/** Per unit of held-balloon size above normal: how much further back, higher, and higher up the shot looks. */
const BALLOON_FRAMING = { distance: 2.4, height: 0.6, look: 1 } as const;

/** Wheel zoom limits, as multiples of the default distance, and its feel. */
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 3;
const ZOOM_PER_PIXEL = 0.0012;
const ZOOM_EASE = 12;

/** How fast that extra distance is given up. Higher is snappier. */
const RESPAWN_ZOOM_RATE = 6.5;

const FORWARD = new Vector3();
const LOOK_TARGET = new Vector3();
const OFFSET = new Vector3();

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Third-person chase camera.
 *
 * The camera owns its OWN yaw and pitch, supplied by the mouse, and the mount
 * supplies only a position to orbit. That separation is the whole point: a
 * camera that trails the character's facing means pressing A turns the player,
 * which turns the camera, which redefines what "forward" means.
 *
 * The simulation rotates its stick input by `yaw`, so the camera is the single
 * source of "which way is forward" and the player's facing follows where they
 * are actually going.
 */
export class ThirdPersonCamera {
  readonly camera: PerspectiveCamera;

  private readonly target = new Vector3();
  /** Smoothed point the camera orbits. The only thing that is smoothed. */
  private readonly followed = new Vector3();

  private orbitYaw = 0;
  private orbitPitch = 0.2;
  private initialised = false;

  /** Extra distance still to be given up by the respawn dolly. */
  private zoomOffset = 0;

  /** Eased 0..1 speed factor driving the dynamic distance and FOV. */
  private rush = 0;

  private aspect = 1;

  /** Extra framing for a big held balloon (its size above normal), and where it is easing to. */
  private framing = 0;
  private framingTarget = 0;

  /** Mouse-wheel zoom, as a multiple of the default distance. Eased toward its target. */
  private zoom = 1;
  private zoomTarget = 1;

  constructor() {
    this.camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
    this.camera.position.set(0, CAMERA.height, -CAMERA.distance);
  }

  /**
   * Zoom by a wheel delta in pixels. Scrolling up (negative) zooms IN, down
   * zooms out. Exponential, so every notch feels the same at any distance.
   */
  addZoom(deltaPixels: number): void {
    if (!Number.isFinite(deltaPixels)) return;
    this.zoomTarget = clamp(this.zoomTarget * Math.exp(deltaPixels * ZOOM_PER_PIXEL), ZOOM_MIN, ZOOM_MAX);
  }

  /** Called by RendererManager whenever the drawing buffer changes size. */
  setViewport(width: number, height: number): void {
    this.aspect = width / Math.max(height, 1);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  /** The direction the camera faces. This is what "forward" means. */
  get yaw(): number {
    return this.orbitYaw;
  }

  /** Follow this position. The camera's own angles are unchanged. */
  setTarget(position: Vector3): void {
    this.target.copy(position);
  }

  /**
   * Arrive at a position instead of easing to it. Used for a PLACEMENT.
   *
   * @param zoomIn play the respawn dolly. TRUE only for a respawn; a network
   *               correction must arrive invisibly, not announce itself.
   */
  snapTo(position: Vector3, zoomIn = false): void {
    this.target.copy(position);
    this.followed.copy(position);
    this.initialised = true;
    this.zoomOffset = zoomIn ? RESPAWN_ZOOM_DISTANCE : 0;
  }

  /** Frame a subject holding a balloon this many times the normal size: a giant balloon pulls the camera back. */
  setSubjectScale(size: number): void {
    this.framingTarget = Number.isFinite(size) ? Math.max(0, size - 1) : 0;
  }

  /** Aim the orbit. Called every frame from the look source. */
  setOrbit(yaw: number, pitch: number): void {
    this.orbitYaw = yaw;
    this.orbitPitch = pitch;
  }

  /** @param speed the mount's horizontal speed, for the dynamic framing. */
  update(delta: number, speed: number): void {
    // ONE smoothing stage, applied to the point the camera follows, so the
    // camera position and its look target can never disagree.
    if (!this.initialised) {
      this.followed.copy(this.target);
      this.initialised = true;
    } else {
      const alpha = 1 - Math.exp(-CAMERA.followLerp * delta);
      // A towering balloon jump outruns the normal follow: height catches up faster the further behind it is.
      const alphaY = 1 - Math.exp(-(CAMERA.followLerp + Math.abs(this.target.y - this.followed.y) * 0.5) * delta);
      this.followed.x += (this.target.x - this.followed.x) * alpha;
      this.followed.y += (this.target.y - this.followed.y) * alphaY;
      this.followed.z += (this.target.z - this.followed.z) * alpha;
    }

    if (this.zoomOffset > 0) {
      this.zoomOffset *= Math.exp(-RESPAWN_ZOOM_RATE * delta);
      if (this.zoomOffset < 0.01) this.zoomOffset = 0;
    }

    const targetRush = clamp(speed / CAMERA.speedReference, 0, 1);
    this.rush += (targetRush - this.rush) * (1 - Math.exp(-CAMERA.speedEase * delta));

    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-ZOOM_EASE * delta));
    this.framing += (this.framingTarget - this.framing) * (1 - Math.exp(-3 * delta));
    const distance = (CAMERA.distance + CAMERA.speedDistance * this.rush + this.framing * BALLOON_FRAMING.distance) * this.zoom + this.zoomOffset;
    const fov = CAMERA.fov + CAMERA.speedFov * this.rush;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Where the camera sits: back along its own yaw, lifted by its pitch.
    const cosPitch = Math.cos(this.orbitPitch);
    const sinPitch = Math.sin(this.orbitPitch);
    FORWARD.set(Math.sin(this.orbitYaw) * cosPitch, 0, Math.cos(this.orbitYaw) * cosPitch);

    this.camera.position
      .copy(this.followed)
      .addScaledVector(FORWARD, -distance)
      .add(OFFSET.set(0, CAMERA.height + this.framing * BALLOON_FRAMING.height + sinPitch * distance, 0));

    LOOK_TARGET.copy(this.followed).add(OFFSET.set(0, CAMERA.lookAtHeight + this.framing * BALLOON_FRAMING.look, 0));
    this.camera.lookAt(LOOK_TARGET);
  }
}
