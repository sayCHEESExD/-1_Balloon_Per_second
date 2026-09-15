import { formatNumber } from '@highjump/shared';
import { CanvasTexture, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';

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
 * A floating label that always faces the camera: a player's name with their
 * balloon count under it, or a pet's name in its rarity colour.
 *
 * One small canvas texture per label, redrawn ONLY when its text changes - a
 * player's count changes once every few seconds, never per frame.
 */
export class NameTag {
  readonly sprite: Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private readonly material: SpriteMaterial;
  private signature = '';

  /** @param worldWidth width of the label in world units (height follows the canvas). */
  constructor(worldWidth: number, private readonly withBalloons: boolean) {
    this.canvas.width = 320;
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

  /** Redraw if anything changed. `balloons` is ignored for a label without the count. */
  set(name: string, balloons: number, color = '#ffffff'): void {
    const count = this.withBalloons ? formatNumber(balloons) : '';
    const signature = `${name}|${count}|${color}`;
    if (signature === this.signature) return;
    this.signature = signature;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const nameY = this.withBalloons ? 38 : height / 2;
    let size = 44;
    ctx.font = `900 ${size}px ${FONT}`;
    while (ctx.measureText(name).width > width - 24 && size > 16) {
      size -= 2;
      ctx.font = `900 ${size}px ${FONT}`;
    }
    ctx.lineWidth = size * 0.24;
    ctx.strokeStyle = INK;
    ctx.strokeText(name, width / 2, nameY);
    ctx.fillStyle = color;
    ctx.fillText(name, width / 2, nameY);

    if (!this.withBalloons) {
      this.texture.needsUpdate = true;
      return;
    }
    ctx.font = `900 50px ${FONT}`;
    const textWidth = ctx.measureText(count).width;
    const left = width / 2 - (textWidth + 44) / 2;
    drawBalloon(ctx, left + 16, 96, 17);
    ctx.textAlign = 'left';
    ctx.lineWidth = 12;
    ctx.strokeText(count, left + 44, 106);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(count, left + 44, 106);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.sprite.removeFromParent();
  }
}
