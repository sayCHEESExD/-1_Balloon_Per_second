import { balloonBySlot, petById } from '@highjump/shared';
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
  type Group,
} from 'three';
import { buildBalloonModel, releaseBalloonModel } from '../player/BalloonModels.js';
import { buildPetModel } from '../player/PetModels.js';
import { logger } from '../util/logger.js';

const SCOPE = 'thumbnails';
const SIZE = 160;

/**
 * Menu pictures of the balloons and pets, rendered from the SAME models the
 * world uses - so a card shows exactly what the player will hold - into data
 * URLs, once each, and cached.
 *
 * One small offscreen renderer, made on first use. If WebGL is refused here it
 * returns '' and the cards fall back to a colour swatch.
 */
class Thumbnails {
  private renderer: WebGLRenderer | null = null;
  private failed = false;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 100);
  private readonly cache = new Map<string, string>();

  balloon(slot: number): string {
    const def = balloonBySlot(slot);
    return def ? this.render(`b${slot}`, () => buildBalloonModel(def), -0.25) : '';
  }

  pet(id: string): string {
    const def = petById(id);
    return def ? this.render(`p${id}`, () => buildPetModel(def), 0.5) : '';
  }

  private render(key: string, build: () => Group, yaw: number): string {
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const renderer = this.ensureRenderer();
    if (!renderer) return '';

    const model = build();
    model.rotation.y = yaw;
    this.scene.add(model);
    const box = new Box3().setFromObject(model);
    const centre = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.62;
    const distance = radius / Math.tan((this.camera.fov * Math.PI) / 360);
    this.camera.position.set(centre.x, centre.y + radius * 0.25, centre.z + distance);
    this.camera.lookAt(centre);

    renderer.render(this.scene, this.camera);
    const url = renderer.domElement.toDataURL('image/png');
    releaseBalloonModel(model);
    this.cache.set(key, url);
    return url;
  }

  private ensureRenderer(): WebGLRenderer | null {
    if (this.renderer || this.failed) return this.renderer;
    try {
      const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(SIZE, SIZE, false);
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      this.scene.add(new AmbientLight(0xffffff, 1.4));
      const key = new DirectionalLight(0xffffff, 1.6);
      key.position.set(2, 4, 5);
      this.scene.add(key);
      this.renderer = renderer;
    } catch (error) {
      this.failed = true;
      logger.warn(SCOPE, `no thumbnail renderer: ${String(error)}`);
    }
    return this.renderer;
  }
}

export const thumbnails = new Thumbnails();
