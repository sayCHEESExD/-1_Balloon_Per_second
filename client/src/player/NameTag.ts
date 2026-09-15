import { formatNumber } from '@highjump/shared';
import { CanvasTexture, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';
import { avatarImage, drawAvatar } from '../rendering/AvatarImages.js';

const FONT = '"Arial Black", "Segoe UI", system-ui, sans-serif';
const INK = '#12181f';

/** A small red balloon with its string, drawn beside the balloon count. */
const drawBalloon = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void => {
  ctx.lineWidth = r * 0.28;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#ef3b3b';
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.quadraticCurveTo(x - r * 0.4, y + r * 1.5, x + r * 0.1, y + r * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.35, r * 0.18, r * 0.3, -0.4, 0, Math.PI * 2);
  ctx.fill();
};

/**
 * A floating label that always faces the camera: a player's Bloxity avatar and
 * display name with their balloon count under it, or a pet's name in its rarity
 * colour.
 *
 * One small canvas texture per label, redrawn ONLY when its text or avatar changes
 * (or the avatar image finishes loading) - never per frame.
 */
export class NameTag {
  readonly sprite: Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private readonly material: SpriteMaterial;
  private signature = '';
  private last: { name: string; balloons: number; color: string; avatarUrl: string | null } | null = null;
  private disposed = false;

  /** @param worldWidth width of the label in world units (height follows the canvas). */
  constructor(worldWidth: number, private readonly withBalloons: boolean) {
    this.canvas.width = 360;
    this.canvas.height = withBalloons ? 150 : 72;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = LinearFilter;
    this.material = new SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false });
    this.sprite = new Sprite(this.material);
    this.sprite.scale.set(worldWidth, (worldWidth * this.canvas.height) / this.canvas.width, 1);
    this.sprite.renderOrder = 8;
  }

  /**
   * Redraw if anything changed. `balloons` is ignored for a label without the count.
   * `avatarUrl` null draws no avatar (a pet); '' draws Bloxity's default avatar.
   */
  set(name: string, balloons: number, color = '#ffffff', avatarUrl: string | null = null): void {
    const count = this.withBalloons ? formatNumber(balloons) : '';
    const signature = `${name}|${count}|${color}|${avatarUrl ?? '-'}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.last = { name, balloons, color, avatarUrl };
    this.draw();
  }

  private readonly redraw = (): void => {
    if (!this.disposed) this.draw();
  };

  private draw(): void {
    const last = this.last;
    const ctx = this.canvas.getContext('2d');
    if (!last || !ctx) return;
    const { name, color, avatarUrl } = last;
    const count = this.withBalloons ? formatNumber(last.balloons) : '';
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const nameY = this.withBalloons ? 40 : height / 2;
    const avatarRadius = avatarUrl === null ? 0 : 26;
    const gap = avatarRadius > 0 ? 10 : 0;
    let size = 44;
    ctx.font = `900 ${size}px ${FONT}`;
    while (ctx.measureText(name).width > width - 24 - avatarRadius * 2 - gap && size > 16) {
      size -= 2;
      ctx.font = `900 ${size}px ${FONT}`;
    }
    const textWidth = ctx.measureText(name).width;
    const left = (width - (avatarRadius * 2 + gap + textWidth)) / 2;
    if (avatarUrl !== null) {
      drawAvatar(ctx, avatarImage(avatarUrl, this.redraw), left + avatarRadius, nameY, avatarRadius, INK);
    }
    ctx.textAlign = 'left';
    ctx.lineWidth = size * 0.24;
    ctx.strokeStyle = INK;
    ctx.strokeText(name, left + avatarRadius * 2 + gap, nameY);
    ctx.fillStyle = color;
    ctx.fillText(name, left + avatarRadius * 2 + gap, nameY);

    if (this.withBalloons) {
      ctx.font = `900 50px ${FONT}`;
      const countWidth = ctx.measureText(count).width;
      const countLeft = width / 2 - (countWidth + 44) / 2;
      drawBalloon(ctx, countLeft + 16, 98, 17);
      ctx.lineWidth = 12;
      ctx.strokeText(count, countLeft + 44, 108);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(count, countLeft + 44, 108);
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.disposed = true;
    this.texture.dispose();
    this.material.dispose();
    this.sprite.removeFromParent();
  }
}
