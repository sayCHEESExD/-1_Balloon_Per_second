import { LEADERBOARD_SIZE, SCOREBOARD, formatDuration, formatNumber } from '@highjump/shared';
import {
  CanvasTexture,
  FrontSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three';
import { PALETTE } from '../config/worldVisuals.js';
import type { LeaderboardSnapshot, NetLeaderEntry } from '../net/netTypes.js';
import { avatarImage, drawAvatar } from '../rendering/AvatarImages.js';
import { CanvasSign } from './CanvasSign.js';
import { texturedBox } from './texturedBox.js';
import type { WorldTextures } from './WorldTextures.js';

type Category = 'balloons' | 'wins' | 'time';

interface BoardSpec {
  readonly category: Category;
  readonly title: string;
  readonly titleFill: string;
  readonly valueFill: string;
}

/** Top Balloons, Top Wins, Top Playtime - left to right as seen from spawn looking back. */
const BOARDS: readonly BoardSpec[] = [
  { category: 'balloons', title: 'TOP BALLOONS', titleFill: '#7ff0ff', valueFill: '#7ff0ff' },
  { category: 'wins', title: 'TOP WINS', titleFill: '#ffe14d', valueFill: '#ffe14d' },
  { category: 'time', title: 'TOP PLAYTIME', titleFill: '#7dff5c', valueFill: '#7dff5c' },
];

const BOARD = { width: 22, height: 20, frame: 2.6, depth: 2.4, baseY: 1.5 } as const;
const PIXELS_PER_UNIT = 44;
const RANK_COLOURS = ['#ffd53d', '#dfe6ef', '#ff9a3d'] as const;
const FONT = '"Arial Black", "Segoe UI", system-ui, sans-serif';

/**
 * The three leaderboards along the back of the hub, facing the staircase:
 * studded blue brick frames round a blue panel, as in the reference. Every
 * figure is the server's; a panel redraws only when its standings change.
 */
export class Scoreboard {
  readonly root = new Group();
  private readonly panels: PanelSurface[] = [];
  private readonly signs: CanvasSign[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: (MeshLambertMaterial | MeshBasicMaterial)[] = [];

  constructor(textures: WorldTextures) {
    const frame = new MeshLambertMaterial({ map: textures.studs(PALETTE.boardFrame, PALETTE.boardFrameLine) });
    this.materials.push(frame);

    BOARDS.forEach((spec, index) => {
      const group = new Group();
      group.position.set(SCOREBOARD.xs[index] ?? 0, 0, SCOREBOARD.z);
      const midY = BOARD.baseY + BOARD.height / 2;
      const outerW = BOARD.width + BOARD.frame * 2;
      const bars: [number, number, number, number][] = [
        [0, midY + BOARD.height / 2 + BOARD.frame * 1.5, outerW, BOARD.frame * 3],
        [0, midY - BOARD.height / 2 - BOARD.frame / 2, outerW, BOARD.frame],
        [-BOARD.width / 2 - BOARD.frame / 2, midY, BOARD.frame, BOARD.height],
        [BOARD.width / 2 + BOARD.frame / 2, midY, BOARD.frame, BOARD.height],
      ];
      for (const [bx, by, bw, bh] of bars) {
        const geometry = texturedBox(bw, bh, BOARD.depth, 2);
        this.geometries.push(geometry);
        const bar = new Mesh(geometry, frame);
        bar.position.set(bx, by, 0);
        bar.castShadow = true;
        group.add(bar);
      }
      // Legs down to the floor.
      for (const side of [-1, 1]) {
        const geometry = texturedBox(BOARD.frame, BOARD.baseY, BOARD.depth, 2);
        this.geometries.push(geometry);
        const leg = new Mesh(geometry, frame);
        leg.position.set(side * (BOARD.width / 2 + BOARD.frame / 2), BOARD.baseY / 2 - BOARD.frame / 2, 0);
        group.add(leg);
      }

      const surface = new PanelSurface(spec, BOARD.width, BOARD.height);
      surface.mesh.position.set(0, midY, BOARD.depth / 2 + 0.02);
      group.add(surface.mesh);
      this.panels.push(surface);

      const title = new CanvasSign(outerW - 2, 5, [{ text: spec.title, size: 1, fill: spec.titleFill, stroke: '#0b2a4a', strokeWidth: 0.2 }]);
      title.mesh.position.set(0, midY + BOARD.height / 2 + BOARD.frame * 1.5, BOARD.depth / 2 + 0.3);
      group.add(title.mesh);
      this.signs.push(title);

      this.root.add(group);
    });
  }

  update(board: LeaderboardSnapshot | null): void {
    if (!board) return;
    for (const panel of this.panels) panel.apply(board[panel.category]);
  }

  dispose(): void {
    for (const panel of this.panels) panel.dispose();
    for (const sign of this.signs) sign.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.root.removeFromParent();
  }
}

class PanelSurface {
  readonly mesh: Mesh;
  readonly category: Category;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private readonly geometry: PlaneGeometry;
  private signature = '-';
  private rows: NetLeaderEntry[] = [];

  constructor(private readonly spec: BoardSpec, width: number, height: number) {
    this.category = spec.category;
    this.canvas.width = Math.round(width * PIXELS_PER_UNIT);
    this.canvas.height = Math.round(height * PIXELS_PER_UNIT);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = LinearFilter;
    this.geometry = new PlaneGeometry(width, height);
    this.material = new MeshBasicMaterial({ map: this.texture, side: FrontSide });
    this.mesh = new Mesh(this.geometry, this.material);
    this.apply([]);
  }

  apply(rows: readonly NetLeaderEntry[]): void {
    const signature = rows.map((row) => `${row.name}:${row.avatar}:${row.value}`).join('|');
    if (signature === this.signature) return;
    this.signature = signature;
    this.rows = rows.map((row) => ({ ...row }));
    this.redraw();
  }

  /** Repaint the current rows - also called when an avatar thumbnail finishes loading. */
  private readonly redraw = (): void => {
    this.draw(this.rows);
    this.texture.needsUpdate = true;
  };

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }

  private draw(rows: readonly NetLeaderEntry[]): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.canvas;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, PALETTE.boardPanel);
    gradient.addColorStop(1, PALETTE.boardPanelDeep);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    const pad = width * 0.05;
    const rowH = (height - pad * 2) / (LEADERBOARD_SIZE + 1);
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    // Column headings.
    const headY = pad + rowH * 0.5;
    ctx.font = `900 ${rowH * 0.42}px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('Rank', pad, headY);
    ctx.fillText('Player', pad + width * 0.17, headY);
    ctx.textAlign = 'right';
    ctx.fillText('Value', width - pad, headY);

    if (!rows.some((row) => row.name)) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9fd0ff';
      ctx.font = `900 ${rowH * 0.5}px ${FONT}`;
      ctx.fillText('No scores yet', width / 2, height / 2);
      return;
    }

    for (let i = 0; i < LEADERBOARD_SIZE; i += 1) {
      const row = rows[i];
      const top = pad + rowH * (i + 1);
      const y = top + rowH / 2;
      if (i % 2 === 0) {
        ctx.fillStyle = PALETTE.boardStripe;
        ctx.fillRect(pad * 0.5, top, width - pad, rowH);
      }
      if (!row || !row.name) continue;
      const size = rowH * 0.5;

      ctx.textAlign = 'left';
      ctx.font = `900 ${size}px ${FONT}`;
      ctx.fillStyle = RANK_COLOURS[i] ?? '#ffffff';
      ctx.fillText(`#${i + 1}`, pad, y);

      const value = this.spec.category === 'time' ? formatDuration(row.value) : formatNumber(row.value);
      ctx.textAlign = 'right';
      fit(ctx, value, width * 0.3, size);
      ctx.fillStyle = this.spec.valueFill;
      ctx.fillText(value, width - pad, y);

      // [avatar] Display Name
      const avatarRadius = rowH * 0.36;
      const nameX = pad + width * 0.17;
      drawAvatar(ctx, avatarImage(row.avatar, this.redraw), nameX + avatarRadius, y, avatarRadius, '#0b2a4a');
      ctx.textAlign = 'left';
      const textX = nameX + avatarRadius * 2 + rowH * 0.18;
      fit(ctx, row.name, width * 0.46 - (textX - nameX), size);
      ctx.fillStyle = PALETTE.boardName;
      ctx.fillText(row.name, textX, y);
    }
  }
}

/** Shrink a font until the text fits its column. */
const fit = (ctx: CanvasRenderingContext2D, text: string, room: number, preferred: number): void => {
  let size = preferred;
  for (let pass = 0; pass < 4; pass += 1) {
    ctx.font = `900 ${size}px ${FONT}`;
    const drawn = ctx.measureText(text).width;
    if (drawn <= room) return;
    size *= room / drawn;
  }
  ctx.font = `900 ${size}px ${FONT}`;
};
