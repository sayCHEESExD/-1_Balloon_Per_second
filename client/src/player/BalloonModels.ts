import type { BalloonDefinition } from '@highjump/shared';
import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Object3D,
} from 'three';

/**
 * Low-poly balloon models, built from primitives: one per balloon in the shop.
 *
 * Every model's ORIGIN is the knot where the string ties on, and the balloon
 * rises above it along +Y, about two world units tall at size 1. Used in every
 * player's hand, over the Balloon Shop counter and for the menu thumbnails.
 *
 * Geometries and materials are CACHED at module level and shared by every
 * copy, so fifteen players holding balloons cost fifteen transforms, not
 * fifteen sets of buffers.
 */

const geometries = new Map<string, BufferGeometry>();
const materials = new Map<string, MeshLambertMaterial>();

const geometry = (key: string, make: () => BufferGeometry): BufferGeometry => {
  let found = geometries.get(key);
  if (!found) {
    found = make();
    geometries.set(key, found);
  }
  return found;
};

const material = (color: number, glow = 0, opacity = 1): MeshLambertMaterial => {
  const key = `${color}:${glow}:${opacity}`;
  let found = materials.get(key);
  if (!found) {
    found = new MeshLambertMaterial({ color, transparent: opacity < 1, opacity });
    if (glow > 0) {
      found.emissive.setHex(color);
      found.emissiveIntensity = glow;
    }
    materials.set(key, found);
  }
  return found;
};

const SPHERE = (): BufferGeometry => geometry('sphere', () => new SphereGeometry(0.5, 18, 14));
const LOW_SPHERE = (): BufferGeometry => geometry('lowSphere', () => new SphereGeometry(0.5, 10, 8));
const CUBE = (): BufferGeometry => geometry('cube', () => new BoxGeometry(1, 1, 1));
const CYLINDER = (): BufferGeometry => geometry('cylinder', () => new CylinderGeometry(0.5, 0.5, 1, 16));
const CONE = (): BufferGeometry => geometry('cone', () => new ConeGeometry(0.5, 1, 14));
const CAPSULE = (): BufferGeometry => geometry('capsule', () => new CapsuleGeometry(0.5, 1, 4, 10));
const KNOT = (): BufferGeometry => geometry('knot', () => new ConeGeometry(0.1, 0.18, 8));

interface Place {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly sx?: number;
  readonly sy?: number;
  readonly sz?: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
}

const add = (group: Group, geo: BufferGeometry, mat: MeshLambertMaterial, p: Place): Mesh => {
  const mesh = new Mesh(geo, mat);
  mesh.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
  mesh.scale.set(p.sx ?? 1, p.sy ?? p.sx ?? 1, p.sz ?? p.sx ?? 1);
  mesh.rotation.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
};

const INK = 0x14161c;
const WHITE = 0xffffff;

/** Two white eyes with dark pupils, looking out along +Z. */
const eyes = (g: Group, y: number, z: number, spread: number, size: number): void => {
  for (const side of [-1, 1]) {
    add(g, SPHERE(), material(WHITE), { x: side * spread, y, z, sx: size });
    add(g, SPHERE(), material(INK), { x: side * spread, y, z: z + size * 0.38, sx: size * 0.5 });
  }
};

/** A plain rubber balloon with a knot and a shine. */
const round = (g: Group, color: number, accent: number, y = 1.02, scale = 1.35): void => {
  add(g, SPHERE(), material(color, 0.12), { y, sx: scale, sy: scale * 1.18, sz: scale });
  add(g, KNOT(), material(color), { y: y - scale * 0.62, rx: Math.PI });
  add(g, LOW_SPHERE(), material(accent, 0.5), { x: -scale * 0.2, y: y + scale * 0.25, z: scale * 0.36, sx: scale * 0.18, sy: scale * 0.26, sz: scale * 0.1 });
};

const build = (def: BalloonDefinition, g: Group): void => {
  const c = def.color;
  const a = def.accent;
  switch (def.shape) {
    case 'round':
      round(g, c, a);
      break;
    case 'heart':
      for (const side of [-1, 1]) add(g, SPHERE(), material(c, 0.15), { x: side * 0.34, y: 1.3, sx: 0.95 });
      add(g, CONE(), material(c, 0.15), { y: 0.72, sx: 1.34, sy: 1.05, sz: 0.9, rx: Math.PI });
      add(g, LOW_SPHERE(), material(a, 0.5), { x: -0.42, y: 1.48, z: 0.36, sx: 0.2, sy: 0.26, sz: 0.1 });
      add(g, KNOT(), material(c), { y: 0.14, rx: Math.PI });
      break;
    case 'dogs': {
      // Three balloon-animal dogs, stacked like the bunch in the reference.
      const colors = [c, a, 0x2f5fe8];
      colors.forEach((color, i) => {
        const dog = new Group();
        const m = material(color, 0.18);
        add(dog, CAPSULE(), m, { y: 0.6, sx: 0.16, sy: 0.32, sz: 0.16, rz: Math.PI / 2 });
        add(dog, CAPSULE(), m, { x: 0.36, y: 0.92, sx: 0.14, sy: 0.22, sz: 0.14, rz: -0.35 });
        add(dog, CAPSULE(), m, { x: 0.52, y: 1.2, sx: 0.16, sy: 0.18, sz: 0.16, rz: Math.PI / 2 });
        add(dog, CAPSULE(), m, { x: 0.42, y: 1.36, sx: 0.08, sy: 0.14, sz: 0.08, rz: 0.4 });
        for (const lx of [-0.32, 0.3]) add(dog, CAPSULE(), m, { x: lx, y: 0.32, sx: 0.12, sy: 0.18, sz: 0.12 });
        add(dog, CAPSULE(), m, { x: -0.48, y: 0.84, sx: 0.08, sy: 0.14, sz: 0.08, rz: -0.6 });
        dog.position.set((i - 1) * 0.55, i === 1 ? 0.35 : 0, (i - 1) * 0.2);
        dog.rotation.y = (i - 1) * 0.5;
        g.add(dog);
      });
      add(g, KNOT(), material(c), { y: 0.14, rx: Math.PI });
      break;
    }
    case 'package': {
      const colors = [0xff9a2e, 0x3a8bff, 0xffe14d, 0xef3b3b, 0x5cd23f, 0xb45cff, 0xff5fa2];
      const spots: readonly [number, number, number][] = [
        [0, 1.55, 0], [-0.5, 1.2, 0.2], [0.5, 1.25, 0.1], [-0.2, 0.9, -0.35], [0.3, 0.85, 0.4], [-0.45, 1.6, -0.3], [0.45, 1.7, -0.2],
      ];
      spots.forEach(([x, y, z], i) => add(g, SPHERE(), material(colors[i % colors.length] ?? c, 0.15), { x, y, z, sx: 0.62, sy: 0.72, sz: 0.62 }));
      add(g, KNOT(), material(c), { y: 0.14, rx: Math.PI });
      break;
    }
    case 'zeppelin':
      add(g, CAPSULE(), material(c, 0.08), { y: 1.25, sx: 0.8, sy: 0.9, sz: 0.8, rx: Math.PI / 2 });
      add(g, CYLINDER(), material(a, 0.2), { y: 1.25, sx: 0.84, sy: 0.18, sz: 0.84, rx: Math.PI / 2 });
      for (const [rz, y, x] of [[0, 1.72, 0], [0, 0.78, 0], [Math.PI / 2, 1.25, 0.48], [Math.PI / 2, 1.25, -0.48]] as const) {
        add(g, CUBE(), material(a), { x, y, z: -0.95, sx: 0.06, sy: 0.4, sz: 0.4, rz });
      }
      add(g, CUBE(), material(0x3b4252), { y: 0.62, sx: 0.3, sy: 0.18, sz: 0.55 });
      add(g, KNOT(), material(c), { y: 0.14, rx: Math.PI });
      break;
    case 'frog':
      round(g, c, 0xd6ffb0, 1.0, 1.3);
      eyes(g, 1.68, 0.28, 0.32, 0.36);
      add(g, CUBE(), material(0xe8313a), { y: 0.86, z: 0.66, sx: 0.5, sy: 0.07, sz: 0.1 });
      for (const side of [-1, 1]) add(g, LOW_SPHERE(), material(0xff9ecf, 0.3), { x: side * 0.45, y: 1.0, z: 0.54, sx: 0.18, sy: 0.12, sz: 0.06 });
      break;
    case 'tumtum':
      // The wooden log with a face and a bat.
      add(g, CYLINDER(), material(c, 0.05), { y: 1.1, sx: 0.95, sy: 1.6, sz: 0.95 });
      add(g, CYLINDER(), material(a), { y: 1.92, sx: 0.8, sy: 0.04, sz: 0.8 });
      eyes(g, 1.4, 0.44, 0.2, 0.24);
      add(g, CUBE(), material(INK), { y: 0.95, z: 0.47, sx: 0.36, sy: 0.12, sz: 0.04 });
      add(g, CYLINDER(), material(0xd9b07a), { x: 0.72, y: 1.0, sx: 0.12, sy: 1.1, sz: 0.12, rz: -0.5 });
      add(g, KNOT(), material(a), { y: 0.2, rx: Math.PI });
      break;
    case 'bird':
      round(g, c, 0xd8f4ff, 1.02, 1.3);
      add(g, CONE(), material(a, 0.2), { y: 1.1, z: 0.72, sx: 0.28, sy: 0.4, sz: 0.28, rx: Math.PI / 2 });
      eyes(g, 1.4, 0.5, 0.26, 0.24);
      for (const side of [-1, 1]) add(g, SPHERE(), material(c), { x: side * 0.72, y: 1.0, sx: 0.2, sy: 0.6, sz: 0.5, rz: side * 0.4 });
      add(g, CONE(), material(a), { y: 1.9, sx: 0.18, sy: 0.3, sz: 0.18 });
      break;
    case 'noob':
      add(g, CUBE(), material(0x5cc23a), { y: 0.36, sx: 0.8, sy: 0.5, sz: 0.4 });
      add(g, CUBE(), material(a), { y: 0.92, sx: 0.9, sy: 0.64, sz: 0.44 });
      for (const side of [-1, 1]) add(g, CUBE(), material(c), { x: side * 0.6, y: 0.92, sx: 0.28, sy: 0.64, sz: 0.3 });
      add(g, CUBE(), material(c, 0.05), { y: 1.62, sx: 0.8, sy: 0.72, sz: 0.72 });
      for (const side of [-1, 1]) add(g, CUBE(), material(INK), { x: side * 0.17, y: 1.72, z: 0.37, sx: 0.1, sy: 0.14, sz: 0.02 });
      add(g, CUBE(), material(INK), { y: 1.46, z: 0.37, sx: 0.34, sy: 0.06, sz: 0.02 });
      add(g, KNOT(), material(c), { y: 0.06, rx: Math.PI });
      break;
    case 'blackhole':
      add(g, SPHERE(), material(c), { y: 1.2, sx: 1.05 });
      add(g, geometry('disk', () => new TorusGeometry(0.85, 0.12, 8, 32)), material(a, 0.9), { y: 1.2, rx: Math.PI / 2 - 0.35 });
      add(g, geometry('halo', () => new TorusGeometry(1.08, 0.05, 6, 32)), material(0xff9a3d, 0.9), { y: 1.2, rx: Math.PI / 2 - 0.35 });
      add(g, KNOT(), material(a), { y: 0.5, rx: Math.PI });
      break;
    case 'uphouse': {
      add(g, CUBE(), material(c), { y: 0.36, sx: 0.9, sy: 0.62, sz: 0.8 });
      add(g, CONE(), material(0x9a3b2e), { y: 0.95, sx: 1.25, sy: 0.55, sz: 1.15, ry: Math.PI / 4 });
      add(g, CUBE(), material(0x7ec8ff, 0.3), { y: 0.4, z: 0.41, sx: 0.28, sy: 0.24, sz: 0.02 });
      const colors = [0xef3b3b, 0xffe14d, 0x4cc3f5, 0x5cd23f, 0xff5fa2, 0xb45cff, 0xff9a2e];
      for (let i = 0; i < 11; i += 1) {
        const angle = i * 2.4;
        const r = 0.2 + (i % 3) * 0.22;
        add(g, SPHERE(), material(colors[i % colors.length] ?? a, 0.15), { x: Math.cos(angle) * r, y: 1.6 + (i % 4) * 0.2, z: Math.sin(angle) * r, sx: 0.42, sy: 0.5, sz: 0.42 });
      }
      break;
    }
    case 'snowflake': {
      const ice = material(c, 0.55);
      for (let i = 0; i < 3; i += 1) {
        const rz = (i * Math.PI) / 3;
        add(g, CUBE(), ice, { y: 1.2, sx: 1.9, sy: 0.14, sz: 0.1, rz });
        for (const side of [-1, 1]) {
          const bx = Math.cos(rz) * 0.62 * side;
          const by = 1.2 + Math.sin(rz) * 0.62 * side;
          add(g, CUBE(), ice, { x: bx, y: by, sx: 0.44, sy: 0.1, sz: 0.08, rz: rz + Math.PI / 3 });
          add(g, CUBE(), ice, { x: bx, y: by, sx: 0.44, sy: 0.1, sz: 0.08, rz: rz - Math.PI / 3 });
        }
      }
      add(g, geometry('gem', () => new OctahedronGeometry(0.28, 0)), material(a, 0.8), { y: 1.2 });
      add(g, KNOT(), ice, { y: 0.14, rx: Math.PI });
      break;
    }
    case 'icecube':
      add(g, CUBE(), material(c, 0.25, 0.72), { y: 1.1, sx: 1.25, ry: 0.35, rx: 0.2 });
      add(g, CUBE(), material(a, 0.5, 0.55), { y: 1.1, sx: 0.8, ry: 0.35, rx: 0.2 });
      add(g, CUBE(), material(WHITE, 0.9), { x: -0.3, y: 1.52, z: 0.4, sx: 0.36, sy: 0.08, sz: 0.04, ry: 0.35 });
      add(g, KNOT(), material(c), { y: 0.3, rx: Math.PI });
      break;
    case 'yeti':
      round(g, c, WHITE, 1.05, 1.4);
      add(g, SPHERE(), material(a), { y: 1.1, z: 0.52, sx: 0.8, sy: 0.7, sz: 0.3 });
      eyes(g, 1.22, 0.62, 0.2, 0.2);
      add(g, CUBE(), material(INK), { y: 0.9, z: 0.68, sx: 0.3, sy: 0.08, sz: 0.04 });
      for (const side of [-1, 1]) add(g, CONE(), material(0xd8d2c4), { x: side * 0.45, y: 1.9, sx: 0.16, sy: 0.4, sz: 0.16, rz: -side * 0.5 });
      break;
    case 'mammoth':
      round(g, c, 0xc89a70, 1.05, 1.4);
      for (const side of [-1, 1]) add(g, SPHERE(), material(0x6b4428), { x: side * 0.72, y: 1.15, sx: 0.2, sy: 0.75, sz: 0.62 });
      add(g, CYLINDER(), material(c), { y: 0.72, z: 0.72, sx: 0.2, sy: 0.6, sz: 0.2, rx: 0.3 });
      add(g, CYLINDER(), material(c), { y: 0.36, z: 0.86, sx: 0.16, sy: 0.3, sz: 0.16, rx: -0.4 });
      for (const side of [-1, 1]) add(g, CONE(), material(a), { x: side * 0.3, y: 0.66, z: 0.72, sx: 0.12, sy: 0.6, sz: 0.12, rx: 2.4 });
      eyes(g, 1.3, 0.62, 0.3, 0.18);
      break;
    case 'jaguar': {
      round(g, c, 0xffe0a0, 1.02, 1.36);
      const spots: readonly [number, number][] = [[0.4, 0.3], [-0.6, 0.5], [1.6, 0.2], [2.4, -0.3], [3.3, 0.4], [4.2, -0.1], [5.1, 0.5], [0.9, -0.5]];
      for (const [theta, phi] of spots) {
        const r = 0.7;
        add(g, LOW_SPHERE(), material(a), {
          x: Math.sin(theta) * Math.cos(phi) * r,
          y: 1.02 + Math.sin(phi) * r * 1.1,
          z: Math.cos(theta) * Math.cos(phi) * r,
          sx: 0.16,
          sy: 0.16,
          sz: 0.16,
        });
      }
      for (const side of [-1, 1]) add(g, CONE(), material(c), { x: side * 0.4, y: 1.82, sx: 0.26, sy: 0.3, sz: 0.2 });
      eyes(g, 1.2, 0.56, 0.24, 0.2);
      add(g, LOW_SPHERE(), material(INK), { y: 0.98, z: 0.72, sx: 0.14, sy: 0.1, sz: 0.1 });
      break;
    }
  }
};

/** A fresh balloon model for this definition, origin at the knot. */
export const buildBalloonModel = (def: BalloonDefinition): Group => {
  const group = new Group();
  build(def, group);
  group.scale.setScalar(def.size);
  return group;
};

/** Detach a balloon model. Its buffers are shared and live for the page's lifetime. */
export const releaseBalloonModel = (root: Object3D): void => {
  root.removeFromParent();
};
