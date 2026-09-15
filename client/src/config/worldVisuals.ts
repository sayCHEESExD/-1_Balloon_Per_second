/**
 * Colours and look for the world. Presentation only - nothing here changes
 * gameplay, and every gameplay number lives in `shared/`.
 */
export const PALETTE = {
  sky: 0x6fc3ff,
  fog: 0xcfeaff,
  cloud: 0xffffff,
  hubPath: '#f2a65a',
  hubPathLine: '#dc8f47',
  grass: '#5fd14a',
  grassLine: '#4bb83a',
  dirt: '#9a6a3f',
  dirtLine: '#835731',
  fence: 0xffffff,
  fenceShade: 0xdfe6ef,
  padGold: '#ffc933',
  padGoldLine: '#e0a412',
  /** The staircase's rainbow, bottom to top, repeating. */
  steps: [0xff4d4d, 0xff9a2e, 0xffd93d, 0x5cd23f, 0x2fd1c4, 0x3a8bff, 0x8a5cff, 0xff5fc8] as readonly number[],
  boardFrame: '#2aa8f5',
  boardFrameLine: '#1c8fd8',
  boardPanel: '#0f5fa6',
  boardPanelDeep: '#0a4a86',
  boardStripe: 'rgba(255,255,255,0.08)',
  boardName: '#ffffff',
  shopAwningA: 0xff5fc8,
  shopAwningB: 0xffffff,
  shopWood: 0xb07a4a,
} as const;

/** Distance fog. The staircase is over a thousand units tall, so it starts far out. */
export const WORLD_FOG = { near: 500, far: 2600 } as const;
