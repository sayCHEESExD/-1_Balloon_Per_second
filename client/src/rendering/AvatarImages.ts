import { DEFAULT_AVATAR_URL } from '@highjump/shared';

interface Entry {
  readonly image: HTMLImageElement;
  ready: boolean;
  failed: boolean;
  readonly waiters: Set<() => void>;
}

/**
 * Bloxity avatar thumbnails, loaded once per URL and shared by every name tag and
 * scoreboard row.
 *
 * Loaded with CORS (`crossOrigin = 'anonymous'`, which Bloxity's static host
 * allows), so drawing one onto a canvas never taints the texture. A thumbnail that
 * fails falls back to Bloxity's default avatar, and failing that to a drawn
 * silhouette.
 */
const cache = new Map<string, Entry>();

const load = (url: string): Entry => {
  const existing = cache.get(url);
  if (existing) return existing;
  const image = new Image();
  const entry: Entry = { image, ready: false, failed: false, waiters: new Set() };
  const settle = (): void => {
    const waiters = [...entry.waiters];
    entry.waiters.clear();
    for (const waiter of waiters) waiter();
  };
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.onload = () => {
    entry.ready = true;
    settle();
  };
  image.onerror = () => {
    entry.failed = true;
    settle();
  };
  image.src = url;
  cache.set(url, entry);
  return entry;
};

/**
 * The loaded thumbnail for `url` (or the default avatar), or null while it is still
 * loading - in which case `onReady` is called once it settles, to redraw.
 */
export const avatarImage = (url: string, onReady: () => void): HTMLImageElement | null => {
  const source = url || DEFAULT_AVATAR_URL;
  const entry = load(source);
  if (entry.ready) return entry.image;
  if (entry.failed) return source === DEFAULT_AVATAR_URL ? null : avatarImage(DEFAULT_AVATAR_URL, onReady);
  entry.waiters.add(onReady);
  return null;
};

/** A round avatar with an outline; a simple silhouette while there is no image. */
export const drawAvatar = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  cx: number,
  cy: number,
  radius: number,
  ring = '#12181f',
): void => {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#cfd8e3';
  ctx.fill();
  ctx.clip();
  if (image) {
    const size = Math.min(image.naturalWidth || 1, image.naturalHeight || 1);
    const sx = ((image.naturalWidth || size) - size) / 2;
    const sy = ((image.naturalHeight || size) - size) / 2;
    ctx.drawImage(image, sx, sy, size, size, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = '#8a96a6';
    ctx.beginPath();
    ctx.arc(cx, cy - radius * 0.22, radius * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy + radius * 0.75, radius * 0.7, radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, radius * 0.16);
  ctx.strokeStyle = ring;
  ctx.stroke();
};
