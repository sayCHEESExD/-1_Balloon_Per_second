import type { PetDefinition } from '@highjump/shared';
import { BoxGeometry, Group, Mesh, MeshLambertMaterial, type Material } from 'three';

/** One unit box shared by every pet part; parts are scaled copies. */
const UNIT = new BoxGeometry(1, 1, 1);

const materials = new Map<string, MeshLambertMaterial>();

const material = (color: number, glow = 0): MeshLambertMaterial => {
  const key = `${color}:${glow}`;
  let found = materials.get(key);
  if (!found) {
    found = new MeshLambertMaterial({ color });
    if (glow > 0) {
      found.emissive.setHex(color);
      found.emissiveIntensity = glow;
    }
    materials.set(key, found);
  }
  return found;
};

/**
 * Blocky pet models, built from boxes like the rest of the scenery: a chunky
 * head-heavy look in the style of the reference pets, about 1.6 units tall.
 *
 * Returns an OUTER group (placed in the world) holding an INNER group, the
 * body, which the follower hops. Materials and the box are shared.
 */
export const buildPetModel = (pet: PetDefinition): Group => {
  const outer = new Group();
  const body = new Group();
  outer.add(body);
  const glow = pet.rarity === 'Legendary' ? 0.35 : pet.rarity === 'Epic' ? 0.15 : 0;
  const main = material(pet.color, glow);
  const accent = material(pet.accent, glow);
  const ink = material(0x12181f);
  const white = material(0xffffff);
  const add = (m: Material, w: number, h: number, d: number, x: number, y: number, z: number, rz = 0, rx = 0): void => {
    const mesh = new Mesh(UNIT, m);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    mesh.castShadow = true;
    body.add(mesh);
  };
  /** Big cartoon eyes: white with a dark pupil, on the face at depth z. */
  const eyes = (y: number, z: number, spread = 0.22, size = 0.22): void => {
    for (const side of [-1, 1]) {
      add(white, size, size * 1.1, 0.04, side * spread, y, z);
      add(ink, size * 0.5, size * 0.6, 0.05, side * spread, y - size * 0.1, z + 0.02);
    }
  };

  switch (pet.body) {
    case 'cat':
      add(main, 1.1, 1.0, 1.0, 0, 0.75, 0);
      add(main, 0.28, 0.32, 0.18, 0.34, 1.38, 0, 0.25);
      add(main, 0.28, 0.32, 0.18, -0.34, 1.38, 0, -0.25);
      add(accent, 0.14, 0.18, 0.06, 0.34, 1.36, 0.08, 0.25);
      add(accent, 0.14, 0.18, 0.06, -0.34, 1.36, 0.08, -0.25);
      add(accent, 0.36, 0.16, 0.05, 0, 0.55, 0.51);
      eyes(0.85, 0.51);
      add(ink, 0.08, 0.06, 0.05, 0, 0.66, 0.52);
      add(main, 0.14, 0.14, 0.6, 0, 0.5, -0.75, 0, -0.5);
      break;
    case 'bunny':
      add(main, 1.0, 0.95, 0.95, 0, 0.7, 0);
      add(main, 0.2, 0.7, 0.16, 0.22, 1.5, 0);
      add(main, 0.2, 0.7, 0.16, -0.22, 1.5, 0);
      add(accent, 0.1, 0.5, 0.05, 0.22, 1.5, 0.08);
      add(accent, 0.1, 0.5, 0.05, -0.22, 1.5, 0.08);
      eyes(0.82, 0.48, 0.2, 0.2);
      add(accent, 0.12, 0.08, 0.05, 0, 0.62, 0.49);
      add(white, 0.3, 0.3, 0.3, 0, 0.4, -0.55);
      break;
    case 'pig':
      add(main, 1.1, 1.0, 1.0, 0, 0.72, 0);
      add(accent, 0.46, 0.3, 0.14, 0, 0.6, 0.55);
      add(ink, 0.08, 0.1, 0.04, 0.1, 0.6, 0.63);
      add(ink, 0.08, 0.1, 0.04, -0.1, 0.6, 0.63);
      add(main, 0.26, 0.22, 0.12, 0.34, 1.3, 0.1, 0.5);
      add(main, 0.26, 0.22, 0.12, -0.34, 1.3, 0.1, -0.5);
      eyes(0.95, 0.51, 0.26, 0.18);
      break;
    case 'bird':
      add(main, 1.0, 1.0, 0.95, 0, 0.72, 0);
      add(accent, 0.22, 0.16, 0.26, 0, 0.62, 0.58);
      add(main, 0.12, 0.5, 0.55, 0.56, 0.72, -0.05, 0.3);
      add(main, 0.12, 0.5, 0.55, -0.56, 0.72, -0.05, -0.3);
      add(accent, 0.14, 0.3, 0.14, 0, 1.32, 0.1);
      eyes(0.88, 0.48, 0.22, 0.22);
      add(accent, 0.12, 0.2, 0.12, 0.2, 0.12, 0.1);
      add(accent, 0.12, 0.2, 0.12, -0.2, 0.12, 0.1);
      break;
    case 'frog':
      add(main, 1.15, 0.8, 1.0, 0, 0.55, 0);
      for (const side of [-1, 1]) {
        add(main, 0.36, 0.34, 0.36, side * 0.3, 1.05, 0.2);
        add(white, 0.26, 0.26, 0.04, side * 0.3, 1.07, 0.39);
        add(material(0x12181f), 0.12, 0.14, 0.05, side * 0.3, 1.05, 0.41);
      }
      add(material(0xe8313a), 0.6, 0.06, 0.05, 0, 0.42, 0.51);
      add(accent, 0.3, 0.12, 0.4, 0.45, 0.12, 0.3);
      add(accent, 0.3, 0.12, 0.4, -0.45, 0.12, 0.3);
      break;
    case 'unicorn':
      add(main, 0.9, 0.8, 1.2, 0, 0.62, -0.1);
      add(main, 0.7, 0.75, 0.7, 0, 1.25, 0.45);
      add(material(0xffd23d, 0.4), 0.1, 0.45, 0.1, 0, 1.8, 0.62, 0, 0.3);
      add(accent, 0.2, 0.7, 0.5, 0, 1.3, 0.0);
      add(accent, 0.18, 0.18, 0.6, 0, 0.7, -0.85, 0, -0.6);
      eyes(1.3, 0.81, 0.2, 0.18);
      for (const [x, z] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.5], [-0.3, -0.5]] as const) add(accent, 0.18, 0.3, 0.18, x, 0.12, z);
      break;
    case 'fish':
      add(main, 0.8, 0.8, 1.3, 0, 0.75, 0);
      add(accent, 0.6, 0.35, 0.9, 0, 0.5, 0.1);
      add(main, 0.1, 0.6, 0.5, 0, 0.8, -0.85);
      add(main, 0.1, 0.45, 0.45, 0, 1.3, -0.05);
      add(main, 0.5, 0.08, 0.3, 0.5, 0.6, 0.1, -0.4);
      add(main, 0.5, 0.08, 0.3, -0.5, 0.6, 0.1, 0.4);
      eyes(0.95, 0.66, 0.26, 0.18);
      break;
    case 'penguin':
      add(main, 0.95, 1.1, 0.85, 0, 0.72, 0);
      add(accent, 0.7, 0.8, 0.05, 0, 0.6, 0.43);
      add(material(0xff9a2e), 0.22, 0.12, 0.24, 0, 0.95, 0.55);
      add(main, 0.12, 0.6, 0.4, 0.52, 0.65, 0, 0.3);
      add(main, 0.12, 0.6, 0.4, -0.52, 0.65, 0, -0.3);
      eyes(1.12, 0.44, 0.2, 0.18);
      add(material(0xff9a2e), 0.24, 0.1, 0.3, 0.2, 0.1, 0.15);
      add(material(0xff9a2e), 0.24, 0.1, 0.3, -0.2, 0.1, 0.15);
      break;
    case 'dragon':
      add(main, 1.0, 0.95, 1.1, 0, 0.72, 0);
      add(accent, 0.12, 0.4, 0.12, 0.26, 1.35, 0.1, 0.3);
      add(accent, 0.12, 0.4, 0.12, -0.26, 1.35, 0.1, -0.3);
      add(main, 0.1, 0.7, 0.9, 0.62, 1.05, -0.2, 0.7);
      add(main, 0.1, 0.7, 0.9, -0.62, 1.05, -0.2, -0.7);
      add(accent, 0.6, 0.18, 0.06, 0, 0.5, 0.56);
      add(main, 0.22, 0.22, 0.8, 0, 0.5, -0.85, 0, -0.3);
      eyes(0.9, 0.56, 0.24, 0.22);
      break;
  }
  return outer;
};
