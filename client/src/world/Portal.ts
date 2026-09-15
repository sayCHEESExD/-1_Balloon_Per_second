import type { PortalDefinition } from '@highjump/shared';
import {
  AdditiveBlending,
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RingGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { CanvasSign, type SignLine } from './CanvasSign.js';

const WIDTH = 8;
const HEIGHT = 11;

interface PortalLook {
  readonly title: string;
  readonly frame: number;
  readonly open: number;
}

/**
 * A walk-through portal: a studded stone frame, a swirling glowing surface and
 * a sign over it. Purely visual - the SERVER decides who travels (`portalAt`).
 * A locked portal is dim and grey and says what unlocks it.
 */
export class Portal {
  readonly root = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly surface: MeshBasicMaterial;
  private readonly ring: Mesh;
  private readonly sign: CanvasSign;
  private locked: boolean | null = null;
  private time = 0;

  constructor(
    definition: PortalDefinition,
    private readonly look: PortalLook,
    locked: boolean,
  ) {
    const frame = this.track(new MeshLambertMaterial({ color: look.frame }));
    const trim = this.track(new MeshLambertMaterial({ color: 0xffffff }));
    const add = (geometry: BufferGeometry, material: Material, x: number, y: number, z: number): Mesh => {
      this.geometries.push(geometry);
      const mesh = new Mesh(geometry, material);
      mesh.position.set(x, y, z);
      this.root.add(mesh);
      return mesh;
    };
    for (const side of [-1, 1]) {
      add(new BoxGeometry(1.4, HEIGHT + 1.4, 1.6), frame, side * (WIDTH / 2 + 0.7), (HEIGHT + 1.4) / 2, 0).castShadow = true;
      add(new BoxGeometry(2.2, 0.6, 2.2), trim, side * (WIDTH / 2 + 0.7), 0.3, 0);
    }
    add(new BoxGeometry(WIDTH + 2.8, 1.4, 1.6), frame, 0, HEIGHT + 0.7, 0).castShadow = true;
    add(new BoxGeometry(WIDTH + 3.4, 0.4, 2), trim, 0, HEIGHT + 1.6, 0);

    this.surface = this.track(
      new MeshBasicMaterial({ color: look.open, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    );
    add(new PlaneGeometry(WIDTH, HEIGHT), this.surface, 0, HEIGHT / 2, 0);
    this.ring = add(new RingGeometry(2.2, 3.4, 32), this.surface, 0, HEIGHT / 2, 0.05);

    this.sign = new CanvasSign(16, 5, []);
    this.sign.mesh.position.set(0, HEIGHT + 4.6, 0);
    this.root.add(this.sign.mesh);

    this.root.position.set(definition.x, 0, definition.z);
    this.root.rotation.y = definition.rotationY;
    this.setLocked(locked);
  }

  setLocked(locked: boolean): void {
    if (locked === this.locked) return;
    this.locked = locked;
    this.surface.color.setHex(locked ? 0x6c7384 : this.look.open);
    const lines: SignLine[] = [
      { text: this.look.title, size: 1, fill: locked ? '#d7dde8' : '#7fd4ff', stroke: '#12181f', strokeWidth: 0.2 },
      locked
        ? { text: '🔒 Unlock by reaching the final step', size: 0.55, fill: '#ffd23d', stroke: '#12181f', strokeWidth: 0.2 }
        : { text: 'Walk in to teleport!', size: 0.55, fill: '#7dff5c', stroke: '#12181f', strokeWidth: 0.2 },
    ];
    this.sign.redraw(lines);
  }

  update(delta: number): void {
    this.time += delta;
    this.ring.rotation.z = this.time * (this.locked ? 0.3 : 1.6);
    const pulse = 1 + Math.sin(this.time * 2.4) * 0.08;
    this.ring.scale.set(pulse, pulse, 1);
    this.surface.opacity = this.locked ? 0.35 : 0.55 + Math.sin(this.time * 3) * 0.15;
  }

  private track<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.sign.dispose();
    this.root.removeFromParent();
  }
}
