import { BALLOON_SHOP, HUB, balloonBySlot } from '@highjump/shared';
import {
  AdditiveBlending,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { PALETTE } from '../config/worldVisuals.js';
import { buildBalloonModel, releaseBalloonModel } from '../player/BalloonModels.js';
import { CanvasSign } from './CanvasSign.js';
import { FramedSign, SIGN_THEMES } from './FramedSign.js';
import type { WorldTextures } from './WorldTextures.js';

/** Where the shopkeeper stands: on a raised step behind the counter. */
export const SHOP_KEEPER = {
  x: BALLOON_SHOP.x,
  z: BALLOON_SHOP.z + 2.4,
  platformHeight: 1,
} as const;

/** The balloons on show over the counter. */
const DISPLAY_SLOTS = [2, 4, 6, 10, 12];

const CLUSTER_COLOURS = [0xef3b3b, 0x3ccf4a, 0xffe14d, 0x3a8bff, 0xd8d0ff, 0xff5fa2];

/**
 * The Balloon Shop on the player's left: a candy-striped stall piled with
 * balloons, as in the reference.
 *
 * A white studded counter with pink trim, a pink-and-white awning, bunches of
 * balloons tied to its corners, shop balloons bobbing over the counter, a rug
 * where customers stand (standing on it opens the Balloons menu), a
 * "(Balloons Here!)" sign and a framed, glowing "Balloon Shop" sign. The
 * shopkeeper stands on the step behind the counter (see `Shopkeeper`).
 */
export class BalloonShop {
  readonly root = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly sign: FramedSign;
  private readonly here: CanvasSign;
  private readonly displays: Group[] = [];
  private readonly clusters: Group[] = [];
  private readonly rugGlow: MeshBasicMaterial;
  private time = 0;

  constructor(textures: WorldTextures) {
    const s = BALLOON_SHOP;
    const frontZ = s.z - s.depth / 2;
    const counter = this.lambert({ map: textures.studs('#fbfbfd', '#dfe3ea') });
    const wood = this.lambert({ color: PALETTE.shopWood });
    const woodDark = this.lambert({ color: 0x6b4428 });
    const pink = this.lambert({ color: 0xff8cc6 });
    const stripeA = this.lambert({ color: PALETTE.shopAwningA });
    const stripeB = this.lambert({ color: PALETTE.shopAwningB });
    const wall = this.lambert({ map: textures.studs('#ffd6ec', '#f5bddc') });

    // Counter, trim and front panels.
    this.add(new BoxGeometry(s.width, s.height, s.depth), counter, s.x, s.height / 2, s.z);
    this.add(new BoxGeometry(s.width + 0.6, 0.3, s.depth + 0.5), pink, s.x, s.height + 0.15, s.z);
    for (const dx of [-5.2, 0, 5.2]) this.add(new BoxGeometry(4, 1.3, 0.12), pink, s.x + dx, s.height / 2, frontZ - 0.08);

    // Posts and a pink back wall.
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        this.add(new BoxGeometry(0.8, 9, 0.8), wood, s.x + dx * (s.width / 2 - 0.4), 4.5, s.z + dz * (s.depth / 2 + 1));
      }
    }
    this.add(new BoxGeometry(s.width + 1.5, 7.5, 0.6), wall, s.x, 3.75, s.z + 4.6);
    this.add(new BoxGeometry(6, SHOP_KEEPER.platformHeight, 1.8), woodDark, SHOP_KEEPER.x, SHOP_KEEPER.platformHeight / 2, SHOP_KEEPER.z + 0.1);

    // Candy-striped awning with a scalloped edge.
    const stripes = 8;
    const stripeW = (s.width + 2) / stripes;
    for (let i = 0; i < stripes; i += 1) {
      this.add(new BoxGeometry(stripeW, 0.5, s.depth + 6), i % 2 === 0 ? stripeA : stripeB, s.x - (s.width + 2) / 2 + stripeW * (i + 0.5), 9.4, s.z - 0.6).rotation.x = -0.2;
    }
    const scallops = 16;
    const scallopW = (s.width + 2) / scallops;
    for (let i = 0; i < scallops; i += 1) {
      this.add(new BoxGeometry(scallopW * 0.9, 0.7, 0.2), i % 2 === 0 ? stripeA : stripeB, s.x - (s.width + 2) / 2 + scallopW * (i + 0.5), 8.2, s.z - 4.9).castShadow = false;
    }

    // Shop balloons bobbing over the counter.
    DISPLAY_SLOTS.forEach((slot, i) => {
      const balloon = balloonBySlot(slot);
      if (!balloon) return;
      const model = buildBalloonModel(balloon);
      // Shown at one size on the counter, whatever size it is in the hand.
      model.scale.setScalar(0.9);
      model.position.set(s.x - 6 + i * 3, s.height + 0.6, s.z + 0.2);
      this.root.add(model);
      this.displays.push(model);
    });

    // Bunches of balloons tied to the awning's corners.
    const sphere = new SphereGeometry(0.85, 12, 10);
    sphere.scale(1, 1.2, 1);
    const string = new BoxGeometry(0.05, 2.6, 0.05);
    this.geometries.push(sphere, string);
    const stringMaterial = this.lambert({ color: 0xf2f5f7 });
    const colours = CLUSTER_COLOURS.map((color) => this.lambert({ color, emissive: color, emissiveIntensity: 0.12 }));
    [
      [s.x - s.width / 2 - 1, s.z - 4],
      [s.x + s.width / 2 + 1, s.z - 4],
      [s.x - s.width / 2 - 1, s.z + 3],
      [s.x + s.width / 2 + 1, s.z + 3],
    ].forEach(([x, z], c) => {
      const cluster = new Group();
      for (let i = 0; i < 4; i += 1) {
        const angle = (i / 4) * Math.PI * 2 + c;
        const bx = Math.cos(angle) * 0.9;
        const bz = Math.sin(angle) * 0.9;
        const by = 2.8 + (i % 2) * 0.9;
        const body = new Mesh(sphere, colours[(c + i) % colours.length]);
        body.position.set(bx, by, bz);
        body.castShadow = true;
        const line = new Mesh(string, stringMaterial);
        line.position.set(bx * 0.5, by - 1.9, bz * 0.5);
        line.rotation.z = -bx * 0.2;
        cluster.add(body, line);
      }
      cluster.position.set(x as number, 9, z as number);
      this.root.add(cluster);
      this.clusters.push(cluster);
    });

    // A pink rug where customers stand, with a softly glowing border.
    const zone = s.zone;
    const zoneX = (zone.minX + zone.maxX) / 2;
    const zoneZ = (zone.minZ + zone.maxZ) / 2;
    const zoneW = zone.maxX - zone.minX;
    const zoneD = zone.maxZ - zone.minZ;
    this.add(new BoxGeometry(zoneW - 3, 0.06, zoneD - 2), this.lambert({ color: 0xff5fc8 }), zoneX, HUB.floorY + 0.08, zoneZ).castShadow = false;
    this.add(new BoxGeometry(zoneW - 5, 0.08, zoneD - 4), this.lambert({ color: 0xffffff }), zoneX, HUB.floorY + 0.1, zoneZ).castShadow = false;
    this.rugGlow = this.track(new MeshBasicMaterial({ color: 0xff7fe0, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }));
    for (const [w, d, x, z] of [
      [zoneW, 0.3, zoneX, zone.minZ],
      [zoneW, 0.3, zoneX, zone.maxZ],
      [0.3, zoneD, zone.minX, zoneZ],
      [0.3, zoneD, zone.maxX, zoneZ],
    ] as const) {
      this.add(new BoxGeometry(w, 0.05, d), this.rugGlow, x, HUB.floorY + 0.14, z).castShadow = false;
    }

    this.here = new CanvasSign(12, 2.4, [{ text: '(Balloons Here!)', size: 1, fill: '#ffffff', stroke: '#12181f', strokeWidth: 0.2 }]);
    this.here.mesh.position.set(s.x, 6.6, frontZ - 4.2);
    this.here.mesh.rotation.y = Math.PI;
    this.root.add(this.here.mesh);

    this.sign = new FramedSign(26, 7, 'Balloon Shop', '/ui/shop.png', SIGN_THEMES.purple);
    this.sign.root.position.set(s.x, 14.6, s.z - 2);
    this.sign.root.rotation.y = Math.PI;
    this.root.add(this.sign.root);
  }

  update(delta: number): void {
    this.time += delta;
    this.displays.forEach((model, i) => {
      model.rotation.y = this.time * 0.8 + i;
      model.position.y = BALLOON_SHOP.height + 0.6 + Math.sin(this.time * 1.8 + i) * 0.2;
    });
    this.clusters.forEach((cluster, i) => {
      cluster.rotation.y = Math.sin(this.time * 0.6 + i) * 0.3;
      cluster.position.y = 9 + Math.sin(this.time * 1.1 + i * 1.3) * 0.25;
    });
    this.rugGlow.opacity = 0.35 + Math.sin(this.time * 2.2) * 0.2;
    this.sign.update(delta);
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
    for (const model of this.displays) releaseBalloonModel(model);
    this.sign.dispose();
    this.here.dispose();
    this.root.removeFromParent();
  }
}
