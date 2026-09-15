import {
  COURSE_END_Z,
  COURSE_TOP_STUDS,
  COURSE_TOP_Y,
  HUB,
  PORTALS,
  STEPS,
  STEP_BASE_Y,
  WIN_PADS,
  WORLD2_HUB,
  WORLD2_OFFSET_X,
  WORLD2_WIN_PADS,
  WorldCollision,
  formatNumber,
  worldSpawn,
  type StepDefinition,
} from '@highjump/shared';
import { Portal } from './Portal.js';
import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TextureLoader,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../config/worldVisuals.js';
import { BalloonShop } from './BalloonShop.js';
import { CanvasSign } from './CanvasSign.js';
import { EggArea } from './EggArea.js';
import { HubDecor } from './HubDecor.js';
import { Batch, box, mergeBatch } from './PropKit.js';
import { Scoreboard } from './Scoreboard.js';
import { SignAtlas, type AtlasSign } from './SignAtlas.js';
import { Sky } from './Sky.js';
import { texturedBox } from './texturedBox.js';
import { WorldTextures } from './WorldTextures.js';

/** World units one stud texture tile covers. */
const STUD = 4;

/** Height of the golden light column over each win pad. */
const GLOW_HEIGHT = 7;

/** Trophy images floating inside each win pad's glow. */
const TROPHIES_PER_PAD = 3;

/** Thickness of a step's lighter top plate (never more than half its riser). */
const PLATE = 0.5;

/**
 * Steps per render chunk. The staircase climbs past a hundred thousand units, where
 * float32 vertex positions visibly jitter; each chunk is merged around its OWN
 * origin, so the vertices near the player are small numbers.
 */
const CHUNK_STEPS = 10;

/** World 2's realm: the same staircase, shaded toward this blue. */
const REALM_BLUE = new Color(0x3a7bff);
const REALM_SHADE = 0.45;

/** A colour as it appears in a world: unchanged in World 1, blue-shaded in World 2. */
const realm = (hex: number, blue: boolean): number => (blue ? new Color(hex).lerp(REALM_BLUE, REALM_SHADE).getHex() : hex);

/** Balloon colours for the floating clusters. */
const BALLOON_COLOURS = [0xff4d4d, 0xffd93d, 0x3a8bff, 0x5cd23f, 0xff5fc8, 0xff9a2e, 0x8a5cff, 0x2fd1c4];

/** A soft round glow, bright in the middle and clear at the edges. */
const radialGlowCanvas = (): HTMLCanvasElement => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.55, 'rgba(255,220,120,0.45)');
    gradient.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return canvas;
};

/** Paint every vertex of a geometry one colour, for a vertex-coloured merge. */
const paint = (geometry: BufferGeometry, hex: number, lighten = 0): BufferGeometry => {
  const colour = new Color(hex).lerp(new Color(0xffffff), lighten);
  const count = geometry.getAttribute('position').count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  return geometry;
};

const previousTop = (step: StepDefinition): number => STEPS[step.index - 1]?.top ?? HUB.floorY;

const studs = (n: number): string => `${formatNumber(n)} Stud${n === 1 ? '' : 's'}`;

/** Geometry gathered for one chunk of the staircase before it is merged. */
interface ChunkParts {
  readonly blocks: BufferGeometry[];
  readonly plates: BufferGeometry[];
  readonly frames: BufferGeometry[];
  readonly golds: BufferGeometry[];
  readonly glows: BufferGeometry[];
  readonly pools: BufferGeometry[];
  readonly balloons: BufferGeometry[];
  readonly signs: AtlasSign[];
}

/**
 * The visible world, built from exactly the same shared data the collision
 * model uses (`STEPS`, `WIN_PADS`, `HUB`), so what is drawn and what is solid
 * cannot drift apart.
 *
 * A fenced orange-and-green hub floating on an island, and a colossal rainbow
 * staircase rising out of it into the sky: studded blocks in a repeating
 * rainbow, each riser labelled with its studs, gold win areas at the
 * milestones and balloon clusters drifting alongside. The climb is merged in
 * chunks of `CHUNK_STEPS`, each around its own origin, so the whole staircase
 * costs a few dozen draw calls and stays steady at any altitude.
 */
export class CourseWorld {
  readonly root = new Group();
  readonly collision = new WorldCollision();
  readonly textures = new WorldTextures();
  readonly scoreboard: Scoreboard;
  readonly shop: BalloonShop;
  readonly eggs: EggArea;
  readonly sky = new Sky(COURSE_END_Z);

  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly signs: CanvasSign[] = [];
  private readonly atlases: SignAtlas[] = [];
  private readonly padTrophies: { sprite: Sprite; baseY: number; phase: number }[] = [];
  private readonly padGlow = new MeshBasicMaterial({
    color: 0xffc933,
    transparent: true,
    opacity: 0.2,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  private readonly padFloorGlow: MeshBasicMaterial;
  /** World 2's spawn ring. */
  private readonly padGlowRing = new MeshBasicMaterial({
    color: 0x5ce1ff,
    transparent: true,
    opacity: 0.7,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly trophyMaterial: SpriteMaterial;
  private readonly ownTextures: Texture[] = [];
  private readonly hubDecor = new HubDecor();
  private readonly skyBalloons: { mesh: Mesh; baseY: number }[] = [];
  private readonly summitBalloons: Mesh[] = [];
  private summitBaseY = 0;
  private readonly portals: Portal[] = [];
  private time = 0;

  constructor() {
    const trophy = new TextureLoader().load('/ui/trophy.png');
    trophy.colorSpace = SRGBColorSpace;
    this.trophyMaterial = new SpriteMaterial({ map: trophy, transparent: true, depthWrite: false });
    const floor = new CanvasTexture(radialGlowCanvas());
    floor.colorSpace = SRGBColorSpace;
    this.padFloorGlow = new MeshBasicMaterial({
      map: floor,
      color: 0xffd23d,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.ownTextures.push(trophy, floor);
    this.scoreboard = new Scoreboard(this.textures);
    this.shop = new BalloonShop(this.textures);
    this.eggs = new EggArea(this.textures);
    this.root.add(this.sky.root, this.scoreboard.root, this.shop.root, this.eggs.root, this.hubDecor.root);

    this.buildHub();
    this.buildStaircase(0, false);
    this.buildSummit(0, false);

    // World 2: the same staircase, far off along +X and shaded blue, with only a
    // small spawn in front of it.
    this.buildWorld2Hub();
    this.buildStaircase(WORLD2_OFFSET_X, true);
    this.buildSummit(WORLD2_OFFSET_X, true);

    for (const definition of PORTALS) {
      const portal =
        definition.target === 2
          ? new Portal(definition, { title: 'WORLD 2', frame: 0x3a5ea8, open: 0x39b7ff }, true)
          : new Portal(definition, { title: 'WORLD 1', frame: 0x4f8a3a, open: 0x7dff5c }, false);
      this.root.add(portal.root);
      this.portals.push(portal);
    }
  }

  /** Open or shut World 1's portal to World 2. Cheap when unchanged. */
  setWorld2Unlocked(unlocked: boolean): void {
    for (const portal of this.portals) {
      const definition = PORTALS[this.portals.indexOf(portal)];
      if (definition?.target === 2) portal.setLocked(!unlocked);
    }
  }

  update(delta: number, cameraX: number, cameraY: number, cameraZ: number): void {
    this.sky.follow(cameraX, cameraY, cameraZ);
    this.shop.update(delta);
    this.eggs.update(delta);
    this.hubDecor.update(delta);

    this.time += delta;
    this.padGlow.opacity = 0.16 + Math.sin(this.time * 2.2) * 0.06;
    this.padFloorGlow.opacity = 0.75 + Math.sin(this.time * 2.2) * 0.2;
    for (const trophy of this.padTrophies) {
      trophy.sprite.position.y = trophy.baseY + Math.sin(this.time * 1.8 + trophy.phase) * 0.45;
      trophy.sprite.material.rotation = Math.sin(this.time * 1.3 + trophy.phase) * 0.18;
    }
    const bob = Math.sin(this.time * 0.7) * 1.2;
    for (const cluster of this.skyBalloons) cluster.mesh.position.y = cluster.baseY + bob;
    for (const balloon of this.summitBalloons) {
      balloon.position.y = this.summitBaseY + Math.sin(this.time * 0.9) * 1.5;
      balloon.rotation.y = this.time * 0.2;
    }
    for (const portal of this.portals) portal.update(delta);
  }

  /**
   * World 2's spawn: a small blue studded platform on its own island, a low
   * fence, a blue arch over the stair mouth with the realm's title, and a spawn
   * ring. No shop, eggs or boards - those live in World 1.
   */
  private buildWorld2Hub(): void {
    const ox = WORLD2_OFFSET_X;
    const hub = WORLD2_HUB;
    const width = hub.halfWidth * 2;
    const depth = hub.maxZ - hub.minZ;
    const midZ = (hub.minZ + hub.maxZ) / 2;
    const floor = this.lambert({ map: this.textures.studs('#8fc2ff', '#6fa2e0') });
    this.mesh(texturedBox(width, 4, depth, STUD), floor, ox, hub.floorY - 2, midZ).castShadow = false;

    const dirt = this.lambert({ map: this.textures.studs('#6c7fae', '#5a6c98') });
    const rock: BufferGeometry[] = [];
    [
      [width, 8, depth, -8],
      [width - 12, 12, depth - 12, -18],
      [width - 26, 14, depth - 24, -31],
    ].forEach(([w, h, d, y]) => {
      const part = texturedBox(w as number, h as number, d as number, STUD);
      part.translate(ox, y as number, midZ);
      rock.push(part);
    });
    const island = this.merged(rock, dirt);
    if (island) island.castShadow = false;

    const batch = new Batch();
    const mouth = (STEPS[0]?.maxX ?? 15) + 1;
    const fenceRun = (x1: number, z1: number, x2: number, z2: number): void => {
      const length = Math.hypot(x2 - x1, z2 - z1);
      const posts = Math.max(1, Math.round(length / 4));
      const spin = Math.atan2(x2 - x1, z2 - z1) - Math.PI / 2;
      for (let i = 0; i <= posts; i += 1) {
        const t = i / posts;
        batch.add(box(0.55, HUB.fenceHeight + 0.4, 0.55, 0, 0, 0, 0xe8f2ff), x1 + (x2 - x1) * t, 0, z1 + (z2 - z1) * t, 0);
      }
      for (const y of [1.1, 2.4]) batch.add(box(length, 0.4, 0.3, 0, y, 0, 0xb8cfee), (x1 + x2) / 2, 0, (z1 + z2) / 2, spin);
    };
    const w = hub.halfWidth;
    fenceRun(-w, hub.minZ, w, hub.minZ);
    fenceRun(w, hub.minZ, w, hub.maxZ);
    fenceRun(-w, hub.minZ, -w, hub.maxZ);
    fenceRun(mouth, hub.maxZ, w, hub.maxZ);
    fenceRun(-w, hub.maxZ, -mouth, hub.maxZ);
    const archColours = PALETTE.steps.map((c) => realm(c, true));
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i += 1) {
        batch.add(box(2.4, 2.6, 2.4, 0, i * 2.6, 0, archColours[i % archColours.length] as number), side * (mouth + 1.5), 0, hub.maxZ + 1, 0);
      }
    }
    for (let i = 0; i < 12; i += 1) {
      const x = -mouth - 1.5 + ((mouth + 1.5) * 2 * (i + 0.5)) / 12;
      batch.add(box((mouth * 2 + 5.4) / 12 + 0.02, 2.2, 2.4, 0, 18.2, 0, archColours[i % archColours.length] as number), x, 0, hub.maxZ + 1, 0);
    }
    const { solid } = mergeBatch(batch);
    if (solid) this.mesh(solid, this.lambert({ vertexColors: true }), ox, 0, 0);

    const title = new CanvasSign(30, 6, [
      { text: 'WORLD 2', size: 1, fill: '#7fd4ff', stroke: '#0c1a33', strokeWidth: 0.2 },
    ]);
    title.mesh.position.set(ox, 24, hub.maxZ);
    title.mesh.rotation.y = Math.PI;
    this.addSign(title);

    const spawn = worldSpawn(2);
    const ring = new Mesh(new RingGeometry(3.2, 4, 48), this.padGlowRing);
    this.geometries.push(ring.geometry);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(spawn.x, hub.floorY + 0.06, spawn.z);
    this.root.add(ring);
  }

  /**
   * The spawn hub: an orange studded floor with grass lawns, a white fence
   * (the boundary is a clamp; the fence is what shows it), a rainbow arch over
   * the stair mouth with the title, and the island rock it floats on.
   */
  private buildHub(): void {
    const width = HUB.halfWidth * 2;
    const depth = HUB.maxZ - HUB.minZ;
    const midZ = (HUB.minZ + HUB.maxZ) / 2;
    const path = this.lambert({ map: this.textures.studs(PALETTE.hubPath, PALETTE.hubPathLine) });
    this.mesh(texturedBox(width, 4, depth, STUD), path, 0, HUB.floorY - 2, midZ).castShadow = false;

    // Lawns either side of the orange path from spawn to the stairs.
    const lawns: BufferGeometry[] = [];
    for (const [minX, maxX, minZ, maxZ] of [
      [16, HUB.halfWidth, HUB.minZ, 2],
      [-HUB.halfWidth, -16, HUB.minZ, 2],
      [54, HUB.halfWidth, 2, HUB.maxZ],
      [-HUB.halfWidth, -62, 2, HUB.maxZ],
      [18, 28, 26, HUB.maxZ],
      [-28, -18, 28, HUB.maxZ],
    ] as const) {
      const lawn = texturedBox(maxX - minX, 0.12, maxZ - minZ, STUD);
      lawn.translate((minX + maxX) / 2, HUB.floorY + 0.06, (minZ + maxZ) / 2);
      lawns.push(lawn);
    }
    const lawn = this.merged(lawns, this.lambert({ map: this.textures.studs(PALETTE.grass, PALETTE.grassLine) }));
    if (lawn) lawn.castShadow = false;

    // The island the hub floats on: stepped dirt shrinking away beneath it.
    const dirt = this.lambert({ map: this.textures.studs(PALETTE.dirt, PALETTE.dirtLine) });
    const rock: BufferGeometry[] = [];
    [
      [width, 8, depth, -8],
      [width - 24, 12, depth - 24, -18],
      [width - 60, 14, depth - 58, -31],
      [width - 100, 18, depth - 92, -47],
    ].forEach(([w, h, d, y]) => {
      const part = texturedBox(w as number, h as number, d as number, STUD);
      part.translate(0, y as number, midZ);
      rock.push(part);
    });
    const island = this.merged(rock, dirt);
    if (island) island.castShadow = false;

    // The fence, and the rainbow arch over the stair mouth, as one merged prop mesh.
    const batch = new Batch();
    const mouth = (STEPS[0]?.maxX ?? 15) + 1;
    const fenceRun = (x1: number, z1: number, x2: number, z2: number): void => {
      const length = Math.hypot(x2 - x1, z2 - z1);
      const posts = Math.max(1, Math.round(length / 4));
      const spin = Math.atan2(x2 - x1, z2 - z1) - Math.PI / 2;
      for (let i = 0; i <= posts; i += 1) {
        const t = i / posts;
        batch.add(box(0.55, HUB.fenceHeight + 0.4, 0.55, 0, 0, 0, PALETTE.fence), x1 + (x2 - x1) * t, 0, z1 + (z2 - z1) * t, 0);
      }
      for (const y of [1.1, 2.4]) {
        batch.add(box(length, 0.4, 0.3, 0, y, 0, PALETTE.fenceShade), (x1 + x2) / 2, 0, (z1 + z2) / 2, spin);
      }
    };
    const w = HUB.halfWidth;
    fenceRun(-w, HUB.minZ, w, HUB.minZ);
    fenceRun(w, HUB.minZ, w, HUB.maxZ);
    fenceRun(-w, HUB.minZ, -w, HUB.maxZ);
    fenceRun(mouth, HUB.maxZ, w, HUB.maxZ);
    fenceRun(-w, HUB.maxZ, -mouth, HUB.maxZ);

    const archColours = PALETTE.steps;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i += 1) {
        batch.add(box(2.4, 2.6, 2.4, 0, i * 2.6, 0, archColours[i % archColours.length] as number), side * (mouth + 1.5), 0, HUB.maxZ + 1, 0);
      }
    }
    for (let i = 0; i < 12; i += 1) {
      const x = -mouth - 1.5 + ((mouth + 1.5) * 2 * (i + 0.5)) / 12;
      batch.add(box((mouth * 2 + 5.4) / 12 + 0.02, 2.2, 2.4, 0, 18.2, 0, archColours[i % archColours.length] as number), x, 0, HUB.maxZ + 1, 0);
    }
    const { solid } = mergeBatch(batch);
    if (solid) this.mesh(solid, this.lambert({ vertexColors: true }), 0, 0, 0);

    const title = new CanvasSign(38, 6, [{ text: '+1 BALLOON PER SECOND', size: 1, fill: '#ffe14d', stroke: '#12181f', strokeWidth: 0.2 }]);
    title.mesh.position.set(0, 24, HUB.maxZ);
    title.mesh.rotation.y = Math.PI;
    this.addSign(title);
  }

  /**
   * The rainbow staircase, chunk by chunk: a studded block per step from far below
   * up to its top with a lighter top plate, every riser labelled with its studs,
   * the gold win areas, and balloon clusters drifting beside it.
   */
  private buildStaircase(ox: number, blue: boolean): void {
    const stepMap = this.textures.studs('#ffffff', '#e2e2e2');
    const stone = this.lambert({ map: stepMap, vertexColors: true });
    const plateMaterial = this.lambert({ map: stepMap, vertexColors: true });
    const gold = this.lambert({
      map: this.textures.studs(PALETTE.padGold, PALETTE.padGoldLine),
      emissive: 0x6b4a00,
      color: blue ? 0xcfe4ff : 0xffffff,
    });
    const frame = this.lambert({ color: 0x1b2433 });
    const balloonMaterial = this.lambert({ vertexColors: true, color: blue ? 0xc4dcff : 0xffffff });
    const pads = blue ? WORLD2_WIN_PADS : WIN_PADS;

    let seed = 7;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    for (let start = 0; start < STEPS.length; start += CHUNK_STEPS) {
      const chunk: ChunkParts = { blocks: [], plates: [], frames: [], golds: [], glows: [], pools: [], balloons: [], signs: [] };
      const steps = STEPS.slice(start, start + CHUNK_STEPS);
      for (const step of steps) {
        this.addStep(chunk, step, ox, blue);
        if (step.winArea > 0) this.addWinArea(chunk, pads[step.winArea - 1]);
        if (step.index % 3 === 1) this.addBalloonCluster(chunk, step, random, ox);
      }
      if (start === 0 && !blue) {
        // A few giant balloons around the hub.
        for (const [x, y, z] of [
          [-96, 40, -30],
          [100, 52, 10],
          [-84, 70, 90],
          [92, 90, 160],
          [-110, 30, -80],
          [120, 36, -70],
        ] as const) {
          this.addBalloon(chunk.balloons, x, y, z, 5 + random() * 3, BALLOON_COLOURS[Math.floor(random() * BALLOON_COLOURS.length)] as number);
        }
      }

      this.localMerged(chunk.blocks, stone);
      this.localMerged(chunk.plates, plateMaterial);
      this.localMerged(chunk.frames, frame);
      this.localMerged(chunk.golds, gold);
      const glow = this.localMerged(chunk.glows, this.padGlow);
      if (glow) glow.castShadow = false;
      const pool = this.localMerged(chunk.pools, this.padFloorGlow);
      if (pool) {
        pool.castShadow = false;
        pool.receiveShadow = false;
      }
      const clusters = this.localMerged(chunk.balloons, balloonMaterial);
      if (clusters) {
        clusters.castShadow = false;
        this.skyBalloons.push({ mesh: clusters, baseY: clusters.position.y });
      }

      const first = steps[0] as StepDefinition;
      const last = steps[steps.length - 1] as StepDefinition;
      const atlas = new SignAtlas(chunk.signs, { x: ox, y: (previousTop(first) + last.top) / 2, z: (first.minZ + last.maxZ) / 2 });
      this.root.add(atlas.mesh);
      this.atlases.push(atlas);
    }
  }

  private addStep(chunk: ChunkParts, step: StepDefinition, ox: number, blue: boolean): void {
    const colour = realm(PALETTE.steps[step.index % PALETTE.steps.length] as number, blue);
    const w = step.maxX - step.minX;
    const d = step.maxZ - step.minZ;
    const cz = (step.minZ + step.maxZ) / 2;
    const plate = Math.min(PLATE, step.rise / 2);
    const height = step.top - plate - STEP_BASE_Y;
    const block = texturedBox(w, height, d, STUD);
    block.translate(ox, STEP_BASE_Y + height / 2, cz);
    chunk.blocks.push(paint(block, colour));
    const top = texturedBox(w + 0.3, plate, d, STUD);
    top.translate(ox, step.top - plate / 2, cz);
    chunk.plates.push(paint(top, colour, 0.28));

    // "N Studs" across the front of the riser, facing the climber: readable on a
    // nearly flat step (it stands up past the riser) and big on a towering one.
    const rise = step.top - previousTop(step);
    const labelHeight = Math.min(Math.max(1, rise * 0.25), (w - 2) / 3.6);
    chunk.signs.push({
      lines: [{ text: studs(step.studs), size: 1, fill: '#ffffff', stroke: '#12181f', strokeWidth: 0.2 }],
      width: labelHeight * 3.6,
      height: labelHeight,
      x: ox,
      y: previousTop(step) + Math.max(rise, labelHeight) / 2,
      z: step.minZ - 0.08,
      rotationY: Math.PI,
    });
  }

  /** The gold pad on a milestone landing, its glow, trophies and label. */
  private addWinArea(chunk: ChunkParts, pad: (typeof WIN_PADS)[number] | undefined): void {
    if (!pad) return;
    const w = pad.maxX - pad.minX;
    const d = pad.maxZ - pad.minZ;
    const cx = (pad.minX + pad.maxX) / 2;
    const cz = (pad.minZ + pad.maxZ) / 2;

    const border = texturedBox(w + 1, 0.06, d + 1, STUD);
    border.translate(cx, pad.minY + 0.03, cz);
    chunk.frames.push(border);
    const plate = texturedBox(w, pad.maxY - pad.minY, d, 2);
    plate.translate(cx, (pad.minY + pad.maxY) / 2 + 0.01, cz);
    chunk.golds.push(plate);

    const column = new BoxGeometry(w - 0.4, GLOW_HEIGHT, d - 0.4);
    column.translate(cx, pad.maxY + GLOW_HEIGHT / 2, cz);
    chunk.glows.push(column);
    const pool = new PlaneGeometry(w + 4, d + 4);
    pool.rotateX(-Math.PI / 2);
    pool.translate(cx, pad.maxY + 0.06, cz);
    chunk.pools.push(pool);

    // One compact label high over the pad, out of the camera's way on the walking line.
    chunk.signs.push({
      lines: [
        { text: `WIN AREA · ${studs(pad.studs)}`, size: 0.55, fill: '#7dff5c', stroke: '#12181f', strokeWidth: 0.2 },
        { text: `+${formatNumber(pad.wins)} Win${pad.wins === 1 ? '' : 's'}`, size: 1, fill: '#ffd23d', stroke: '#5a2b00', strokeWidth: 0.2 },
      ],
      width: 9,
      height: 3.8,
      x: cx,
      y: pad.maxY + GLOW_HEIGHT + 1.6,
      z: cz,
      rotationY: Math.PI,
    });

    for (let i = 0; i < TROPHIES_PER_PAD; i += 1) {
      const sprite = new Sprite(this.trophyMaterial);
      const angle = (i / TROPHIES_PER_PAD) * Math.PI * 2 + pad.area;
      const baseY = pad.maxY + 1.6 + ((i * 0.37 + pad.area * 0.13) % 1) * 3;
      sprite.position.set(cx + Math.cos(angle) * (w / 2 - 3), baseY, cz + Math.sin(angle) * (d / 2 - 3));
      sprite.scale.setScalar(1.8 + (i % 2) * 0.3);
      this.root.add(sprite);
      this.padTrophies.push({ sprite, baseY, phase: i * 1.7 + pad.area });
    }
  }

  /** A bunch of three balloons drifting beside a step, on each side. */
  private addBalloonCluster(chunk: ChunkParts, step: StepDefinition, random: () => number, ox: number): void {
    for (const side of [-1, 1]) {
      const cx = ox + side * (step.maxX + 7 + random() * 8);
      const cy = step.top + 4 + random() * 7;
      const cz = (step.minZ + step.maxZ) / 2 + (random() - 0.5) * 6;
      for (let i = 0; i < 3; i += 1) {
        const angle = (i / 3) * Math.PI * 2 + random();
        const colour = BALLOON_COLOURS[Math.floor(random() * BALLOON_COLOURS.length)] as number;
        this.addBalloon(chunk.balloons, cx + Math.cos(angle) * 1.3, cy + (i % 2) * 1.2, cz + Math.sin(angle) * 1.3, 1.1, colour);
      }
    }
  }

  private addBalloon(parts: BufferGeometry[], x: number, y: number, z: number, radius: number, colour: number): void {
    const body = new SphereGeometry(radius, 12, 10);
    body.scale(1, 1.18, 1);
    body.translate(x, y, z);
    parts.push(paint(body, colour));
    const string = new BoxGeometry(0.08, radius * 3, 0.08);
    string.translate(x, y - radius * 2.6, z);
    parts.push(paint(string, 0xf2f5f7));
  }

  /** The top: a congratulations sign and a giant golden balloon. */
  private buildSummit(ox: number, blue: boolean): void {
    const summit = STEPS[STEPS.length - 1];
    if (!summit) return;
    const sign = new CanvasSign(30, 8, [
      { text: 'YOU REACHED THE TOP!', size: 1, fill: '#ffd23d', stroke: '#5a2b00', strokeWidth: 0.2 },
      { text: blue ? `World 2 · ${studs(COURSE_TOP_STUDS)}` : `${studs(COURSE_TOP_STUDS)} · World 2 unlocked!`, size: 0.8, fill: '#ffffff', stroke: '#12181f', strokeWidth: 0.2 },
    ]);
    sign.mesh.position.set(ox, COURSE_TOP_Y + 12, summit.maxZ - 1);
    sign.mesh.rotation.y = Math.PI;
    this.addSign(sign);

    const body = new SphereGeometry(6, 24, 18);
    body.scale(1, 1.2, 1);
    this.summitBaseY = COURSE_TOP_Y + 30;
    const colour = blue ? 0x6fc8ff : 0xffc933;
    this.summitBalloons.push(
      this.mesh(body, this.lambert({ color: colour, emissive: blue ? 0x1a4a8a : 0x8a5a00, emissiveIntensity: 0.5 }), ox, this.summitBaseY, summit.maxZ + 8),
    );
    const string = new BoxGeometry(0.2, 16, 0.2);
    this.mesh(string, this.lambert({ color: 0xffffff }), ox, COURSE_TOP_Y + 15, summit.maxZ + 8);
  }

  private lambert(params: ConstructorParameters<typeof MeshLambertMaterial>[0]): MeshLambertMaterial {
    const material = new MeshLambertMaterial(params);
    this.materials.push(material);
    return material;
  }

  private mesh(geometry: BufferGeometry, material: Material, x: number, y: number, z: number): Mesh {
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  private merged(parts: BufferGeometry[], material: Material): Mesh | null {
    if (parts.length === 0) return null;
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) return null;
    return this.mesh(geometry, material, 0, 0, 0);
  }

  /** Merge around the parts' own centre, placing the mesh there, so its vertices stay small numbers. */
  private localMerged(parts: BufferGeometry[], material: Material): Mesh | null {
    if (parts.length === 0) return null;
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) return null;
    geometry.computeBoundingBox();
    const centre = (geometry.boundingBox ?? new Box3()).getCenter(new Vector3());
    // Centre on the TOPS rather than the deep columns under them, which reach far below.
    centre.y = Math.max(centre.y, (geometry.boundingBox?.max.y ?? 0) - 1000);
    geometry.translate(-centre.x, -centre.y, -centre.z);
    geometry.computeBoundingSphere();
    return this.mesh(geometry, material, centre.x, centre.y, centre.z);
  }

  private addSign(sign: CanvasSign): void {
    this.signs.push(sign);
    this.root.add(sign.mesh);
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const sign of this.signs) sign.dispose();
    for (const atlas of this.atlases) atlas.dispose();
    for (const portal of this.portals) portal.dispose();
    this.padGlow.dispose();
    this.padGlowRing.dispose();
    this.padFloorGlow.dispose();
    this.trophyMaterial.dispose();
    for (const texture of this.ownTextures) texture.dispose();
    this.hubDecor.dispose();
    this.scoreboard.dispose();
    this.shop.dispose();
    this.eggs.dispose();
    this.sky.dispose();
    this.textures.dispose();
    this.root.removeFromParent();
  }
}
