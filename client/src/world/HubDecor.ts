import { SPAWN_POSITION } from '@highjump/shared';
import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RingGeometry,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { Batch, box, bush, flower, mergeBatch, pebbles, rock, roundTree, seeded, tuft, type Part, type Prop } from './PropKit.js';

/**
 * Scenery that makes the spawn hub feel lived in: trees, bushes and flower
 * beds along the fence, lamp posts beside the path, benches facing the
 * leaderboards, flower planters round spawn, flags, bunting over the stair
 * mouth, bobbing balloon bunches and a glowing spawn ring.
 *
 * Built from the box prop kit (`PropKit`), merged into one lit and one glowing
 * mesh, plus a handful of small animated groups. None of it collides, and it
 * keeps clear of the shop, the eggs, the boards and the path to the stairs.
 */

const GREY = [0x8f969e, 0x7a8189, 0xa3a9b0];
const LEAVES = [0x4fc34a, 0x3fae3a, 0x5cd65c];
const PETALS = [0xff5f9a, 0xffe14d, 0xffffff, 0x9d7aff, 0xff9a3d];

const lampPost: Prop = () => [
  box(1, 0.4, 1, 0, 0, 0, 0x2b2f3a),
  box(0.3, 6.4, 0.3, 0, 0.4, 0, 0x3b4252),
  box(1.5, 0.22, 0.22, 0.6, 6.5, 0, 0x3b4252),
  box(0.2, 0.5, 0.2, 1.2, 6.0, 0, 0x2b2f3a),
  box(0.9, 0.9, 0.9, 1.2, 5.1, 0, 0xffe7a3, { glow: true }),
  box(1.15, 0.2, 1.15, 1.2, 6.0, 0, 0x2b2f3a),
];

const bench: Prop = () => [
  box(0.25, 0.9, 0.25, -1.3, 0, 0.35, 0x3b4252),
  box(0.25, 0.9, 0.25, 1.3, 0, 0.35, 0x3b4252),
  box(0.25, 1.9, 0.25, -1.3, 0, -0.4, 0x3b4252),
  box(0.25, 1.9, 0.25, 1.3, 0, -0.4, 0x3b4252),
  box(3.2, 0.25, 1.1, 0, 0.9, 0, 0xb5713a),
  box(3.2, 0.7, 0.2, 0, 1.3, -0.45, 0xb5713a),
];

const planter: Prop = (r) => {
  // The soil sits ON TOP of the rim (1.1 -> 1.22), never level with it: two faces at
  // the same height z-fight, which striped the soil with dark bands.
  const parts: Part[] = [
    box(3.2, 0.9, 3.2, 0, 0, 0, 0xc9784a),
    box(3.4, 0.2, 3.4, 0, 0.9, 0, 0xe0a070),
    box(2.8, 0.12, 2.8, 0, 1.1, 0, 0x5c3a1e),
  ];
  for (let i = 0; i < 6; i += 1) {
    const ox = (r() - 0.5) * 2.2;
    const oz = (r() - 0.5) * 2.2;
    for (const part of flower(PETALS)(r)) parts.push({ ...part, x: part.x + ox, y: part.y + 1.2, z: part.z + oz });
  }
  return parts;
};

const flagPole = (banner: number): Prop => () => [
  box(1.2, 0.5, 1.2, 0, 0, 0, 0x6b7280),
  box(0.3, 11, 0.3, 0, 0.5, 0, 0xdfe6ef),
  box(0.6, 0.6, 0.6, 0, 11.5, 0, 0xffd23d, { glow: true }),
  box(0.14, 3.2, 3, 0, 7.6, 1.65, banner),
  box(0.16, 0.5, 3, 0, 9.2, 1.65, 0xffffff),
  box(0.16, 0.5, 3, 0, 7.6, 1.65, 0xffffff),
];

export class HubDecor {
  readonly root = new Group();

  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly balloons: { group: Group; baseY: number; phase: number }[] = [];
  private readonly spawnRing: Mesh;
  private time = 0;

  constructor() {
    const batch = new Batch();
    const r = seeded(0xba11);
    const place = (prop: Prop, x: number, z: number, spin = r() * Math.PI * 2, y = 0): void => {
      for (const part of prop(r)) batch.add(part, x, y, z, spin);
    };
    const scatter = (props: readonly Prop[], cx: number, cz: number, w: number, d: number, count: number): void => {
      for (let i = 0; i < count; i += 1) {
        const prop = props[Math.floor(r() * props.length)] as Prop;
        place(prop, cx + (r() - 0.5) * w, cz + (r() - 0.5) * d);
      }
    };
    const bed = (cx: number, cz: number, w: number, d: number): void => {
      batch.add({ w, h: 0.14, d, x: 0, y: 0.1, z: 0, c: 0x3fae3a }, cx, 0, cz, 0);
      scatter([tuft(LEAVES), flower(PETALS), flower(PETALS), pebbles(GREY)], cx, cz, w - 2, d - 2, Math.round((w * d) / 9));
    };

    // Flower beds along the side fences, clear of the shop and the eggs.
    bed(66, -40, 8, 40);
    bed(-66, -40, 8, 40);
    bed(64, 38, 12, 8);
    bed(-66, 38, 8, 8);

    // Trees with bushes and rocks at their feet, in the corners.
    for (const [x, z] of [
      [66, -78],
      [56, -79],
      [-66, -78],
      [-56, -79],
      [66, -6],
      [-66, -6],
      [66, 30],
      [-67, 28],
    ] as const) {
      place(roundTree(LEAVES), x, z);
      place(bush(LEAVES), x - 2.6, z + 1.5);
      place(rock(GREY), x + 2.2, z - 1.8);
    }

    // Lamp posts along the path from spawn to the stairs.
    for (const [x, z, spin] of [
      [14, -44, Math.PI],
      [-14, -44, 0],
      [14, -2, Math.PI],
      [-14, -2, 0],
      [20, 36, Math.PI],
      [-20, 36, 0],
    ] as const) {
      place(lampPost, x, z, spin);
    }

    // Benches facing the leaderboards at the back.
    for (const x of [-40, -20, -8, 8, 20, 40]) place(bench, x, -62, Math.PI);

    // Flower planters round spawn.
    for (const [x, z] of [
      [9, SPAWN_POSITION.z - 8],
      [-9, SPAWN_POSITION.z - 8],
      [9, SPAWN_POSITION.z + 8],
      [-9, SPAWN_POSITION.z + 8],
    ] as const) {
      place(planter, x, z, 0);
    }

    // Flags at the front corners.
    place(flagPole(0xff5f9a), 56, 40, -Math.PI / 2);
    place(flagPole(0x3aa8ff), -58, 40, -Math.PI / 2);

    // Bunting across the stair mouth, under the arch.
    this.bunting(batch, -15, 15, 15, 42, 20);

    const { solid, glow } = mergeBatch(batch);
    const solidMaterial = this.track(new MeshLambertMaterial({ vertexColors: true }));
    const glowMaterial = this.track(new MeshBasicMaterial({ vertexColors: true }));
    for (const [geometry, material] of [
      [solid, solidMaterial],
      [glow, glowMaterial],
    ] as const) {
      if (!geometry) continue;
      this.geometries.push(geometry);
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = material === solidMaterial;
      this.root.add(mesh);
    }

    // Balloon bunches bobbing over the hub.
    const balloon = new SphereGeometry(0.9, 12, 10);
    balloon.scale(1, 1.2, 1);
    const string = new BoxGeometry(0.05, 3.2, 0.05);
    this.geometries.push(balloon, string);
    const stringMaterial = this.track(new MeshLambertMaterial({ color: 0xf2f5f7 }));
    const colours = [0xff5f9a, 0xffd23d, 0x3aa8ff, 0x7dff5c, 0xb86bff, 0xff4d4d].map((color) =>
      this.track(new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.15 })),
    );
    [
      [62, 9, 12],
      [-62, 9, 12],
      [58, 10, -70],
      [-58, 10, -70],
      [24, 8, -30],
      [-24, 8, -30],
      [0, 12, -82],
    ].forEach(([x, y, z], clusterIndex) => {
      const group = new Group();
      for (let i = 0; i < 4; i += 1) {
        const angle = (i / 4) * Math.PI * 2 + clusterIndex;
        const bx = Math.cos(angle) * 1;
        const bz = Math.sin(angle) * 1;
        const by = 1.8 + (i % 2) * 0.8;
        const material = colours[(clusterIndex + i) % colours.length] as MeshLambertMaterial;
        const body = new Mesh(balloon, material);
        body.position.set(bx, by, bz);
        const line = new Mesh(string, stringMaterial);
        line.position.set(bx * 0.5, by - 2.6, bz * 0.5);
        group.add(body, line);
      }
      group.position.set(x as number, y as number, z as number);
      this.root.add(group);
      this.balloons.push({ group, baseY: y as number, phase: clusterIndex * 1.3 });
    });

    // A glowing ring and soft disc marking spawn.
    const ringGeometry = new RingGeometry(3.2, 4, 48);
    const discGeometry = new CircleGeometry(3.2, 48);
    this.geometries.push(ringGeometry, discGeometry);
    this.spawnRing = new Mesh(
      ringGeometry,
      this.track(new MeshBasicMaterial({ color: 0x5ce1ff, transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })),
    );
    const spawnDisc = new Mesh(
      discGeometry,
      this.track(new MeshBasicMaterial({ color: 0x5ce1ff, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })),
    );
    for (const mesh of [this.spawnRing, spawnDisc]) {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(SPAWN_POSITION.x, 0.06, SPAWN_POSITION.z);
      this.root.add(mesh);
    }
  }

  update(delta: number): void {
    this.time += delta;
    for (const balloon of this.balloons) {
      balloon.group.position.y = balloon.baseY + Math.sin(this.time * 1.1 + balloon.phase) * 0.5;
      balloon.group.rotation.y = Math.sin(this.time * 0.6 + balloon.phase) * 0.3;
    }
    const pulse = 1 + Math.sin(this.time * 2) * 0.06;
    this.spawnRing.scale.set(pulse, pulse, 1);
    (this.spawnRing.material as MeshBasicMaterial).opacity = 0.55 + Math.sin(this.time * 2) * 0.2;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.root.removeFromParent();
  }

  /** A string of diamond pennants sagging between two points. */
  private bunting(batch: Batch, x1: number, x2: number, y: number, z: number, count: number): void {
    const colours = [0xff5f9a, 0xffd23d, 0x3aa8ff, 0x7dff5c, 0xffffff];
    let previous: { x: number; y: number } | null = null;
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      const x = x1 + (x2 - x1) * t;
      const py = y - Math.sin(t * Math.PI) * 2;
      batch.add({ w: 0.9, h: 0.9, d: 0.08, x: 0, y: -0.55, z: 0, c: colours[i % colours.length] as number, rz: Math.PI / 4 }, x, py, z, 0);
      if (previous) {
        const dx = x - previous.x;
        const dy = py - previous.y;
        batch.add({ w: Math.hypot(dx, dy), h: 0.07, d: 0.07, x: 0, y: 0, z: 0, c: 0x3b4252, rz: Math.atan2(dy, dx) }, (x + previous.x) / 2, (py + previous.y) / 2, z, 0);
      }
      previous = { x, y: py };
    }
  }

  private track<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }
}
