import { EGGS, EGG_AREA, HUB, eggPedestalCentre, formatNumber } from '@highjump/shared';
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { CanvasSign } from './CanvasSign.js';
import type { WorldTextures } from './WorldTextures.js';

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/** Height of an egg's centre above its pedestal. */
const EGG_LIFT = 2.8;

/**
 * The Eggs area on the player's right, as in the reference: three giant eggs
 * - brown, green and blue - with bold black outlines, each floating over its
 * own brick pedestal on a coloured plate, with its name and price above it and
 * a glowing mat in front. Walking onto an egg's mat opens that egg's menu.
 */
export class EggArea {
  readonly root = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly signs: CanvasSign[] = [];
  private readonly eggs: { group: Group; baseY: number; phase: number }[] = [];
  private readonly mats: MeshBasicMaterial[] = [];
  private time = 0;

  constructor(textures: WorldTextures) {
    const eggGeometry = new SphereGeometry(1, 24, 18);
    eggGeometry.scale(1.75, 2.3, 1.75);
    this.geometries.push(eggGeometry);
    const outline = this.track(new MeshBasicMaterial({ color: 0x12181f, side: BackSide }));
    const half = EGG_AREA.pedestalSize / 2;
    const zoneW = EGG_AREA.zoneHalfWidth * 2;
    const zoneD = EGG_AREA.zoneMaxZ - EGG_AREA.zoneMinZ;
    const zoneZ = (EGG_AREA.zoneMinZ + EGG_AREA.zoneMaxZ) / 2;

    for (const egg of EGGS) {
      const c = eggPedestalCentre(egg.slot);
      const tint = new Color(egg.color).lerp(new Color(0x9aa0a8), 0.55).getHex();

      // The plate the pedestal stands on, in the egg's colour.
      this.add(new BoxGeometry(12, 0.14, 11), this.lambert({ color: egg.color }), c.x, HUB.floorY + 0.07, c.z - 1).castShadow = false;
      this.add(new BoxGeometry(10.6, 0.18, 9.6), this.lambert({ map: textures.studs('#f6c38a', '#e0a468') }), c.x, HUB.floorY + 0.09, c.z - 1).castShadow = false;

      // Brick pedestal with a lighter rim.
      this.add(new BoxGeometry(EGG_AREA.pedestalSize, EGG_AREA.pedestalHeight, EGG_AREA.pedestalSize), this.lambert({ color: tint, map: textures.bricks() }), c.x, EGG_AREA.pedestalHeight / 2, c.z);
      this.add(new BoxGeometry(half * 2 + 0.6, 0.4, half * 2 + 0.6), this.lambert({ color: egg.accent }), c.x, EGG_AREA.pedestalHeight + 0.2, c.z);

      // The egg itself, outlined, bobbing and turning.
      const group = new Group();
      const shell = new Mesh(eggGeometry, this.lambert({ color: egg.color, map: textures.speckle(hex(egg.color), hex(egg.accent)), emissive: egg.color, emissiveIntensity: 0.12 }));
      shell.castShadow = true;
      const rim = new Mesh(eggGeometry, outline);
      rim.scale.setScalar(1.07);
      group.add(rim, shell);
      const baseY = EGG_AREA.pedestalHeight + 0.4 + EGG_LIFT;
      group.position.set(c.x, baseY, c.z);
      this.root.add(group);
      this.eggs.push({ group, baseY, phase: egg.slot * 1.7 });

      // The hatch mat in front, glowing in the egg's colour.
      const mat = this.track(new MeshBasicMaterial({ color: egg.accent, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false }));
      this.mats.push(mat);
      for (const [w, d, x, z] of [
        [zoneW, 0.35, c.x, EGG_AREA.zoneMinZ],
        [zoneW, 0.35, c.x, EGG_AREA.zoneMaxZ],
        [0.35, zoneD, c.x - EGG_AREA.zoneHalfWidth, zoneZ],
        [0.35, zoneD, c.x + EGG_AREA.zoneHalfWidth, zoneZ],
      ] as const) {
        this.add(new BoxGeometry(w, 0.05, d), mat, x, HUB.floorY + 0.16, z).castShadow = false;
      }

      const sign = new CanvasSign(11, 4, [
        { text: egg.name, size: 1, fill: '#ffffff', stroke: '#12181f', strokeWidth: 0.2 },
        { text: `${formatNumber(egg.cost)} Wins`, size: 0.85, fill: '#ffe14d', stroke: '#12181f', strokeWidth: 0.2 },
      ]);
      sign.mesh.position.set(c.x, baseY + 4.6, c.z);
      sign.mesh.rotation.y = Math.PI;
      this.root.add(sign.mesh);
      this.signs.push(sign);
    }

    const title = new CanvasSign(26, 7, [{ text: 'EGGS', size: 1, fill: '#ffc21f', stroke: '#12181f', strokeWidth: 0.16 }]);
    const middle = eggPedestalCentre(2);
    title.mesh.position.set(middle.x, 18, middle.z + 6);
    title.mesh.rotation.y = Math.PI;
    this.root.add(title.mesh);
    this.signs.push(title);
  }

  update(delta: number): void {
    this.time += delta;
    for (const egg of this.eggs) {
      egg.group.position.y = egg.baseY + Math.sin(this.time * 1.4 + egg.phase) * 0.35;
      egg.group.rotation.y = Math.sin(this.time * 0.5 + egg.phase) * 0.5;
      egg.group.rotation.z = Math.sin(this.time * 2.1 + egg.phase) * 0.04;
    }
    for (const mat of this.mats) mat.opacity = 0.35 + Math.sin(this.time * 2.2) * 0.18;
  }

  private lambert(params: ConstructorParameters<typeof MeshLambertMaterial>[0]): MeshLambertMaterial {
    return this.track(new MeshLambertMaterial(params));
  }

  private track<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private add(geometry: BufferGeometry, material: Material, x: number, y: number, z: number): Mesh {
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const sign of this.signs) sign.dispose();
    this.root.removeFromParent();
  }
}
