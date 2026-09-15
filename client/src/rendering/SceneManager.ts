import { AmbientLight, Color, DirectionalLight, Fog, HemisphereLight, Scene } from 'three';
import { PALETTE, WORLD_FOG } from '../config/worldVisuals.js';

/**
 * The scene root and the daylight rig: a bright hemisphere fill, a soft
 * ambient, and ONE shadow-casting sun whose frustum follows the player - the
 * staircase is hundreds of units tall and a single shadow map covering it
 * would put a handful of texels under each character.
 */
export class SceneManager {
  readonly scene = new Scene();
  private readonly sun: DirectionalLight;

  constructor() {
    this.scene.background = new Color(PALETTE.sky);
    this.scene.fog = new Fog(PALETTE.fog, WORLD_FOG.near, WORLD_FOG.far);

    const hemi = new HemisphereLight(0xe6f5ff, 0x9ac27a, 1.2);
    this.scene.add(hemi);
    this.scene.add(new AmbientLight(0xffffff, 0.4));

    this.sun = new DirectionalLight(0xfff4de, 1.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.camera.left = -60;
    this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top = 60;
    this.sun.shadow.camera.bottom = -60;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
    this.followShadow(0, 0, 0);
  }

  followShadow(x: number, y: number, z: number): void {
    this.sun.target.position.set(x, y, z);
    this.sun.position.set(x + 40, y + 90, z - 30);
    this.sun.target.updateMatrixWorld();
  }
}
