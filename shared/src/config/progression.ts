/**
 * Balloons over time, and the number formatting every screen shares.
 *
 * BALLOONS are granted by the SERVER on a fixed clock: every
 * `BALLOON_TICK_SECONDS` a connected player gains their per-tick amount (1,
 * plus the held balloon's bonus, plus the equipped pets'). Nothing else grants
 * a balloon and nothing spends one. The count is the player's climbing
 * capability, boosted by the best balloon owned: see `climbHeightFor` and
 * `reachYFor`.
 */

/** Seconds per balloon payout. The HUD meter fills over exactly this. */
export const BALLOON_TICK_SECONDS = 5;

/** Balloons per payout before the held balloon and pets. */
export const BASE_BALLOONS_PER_TICK = 1;

/**
 * The largest Wins figure the server will hold.
 *
 * Wins are a `float64` on the wire - balloon prices run into the millions and
 * pet multipliers stack - so the ceiling is the largest integer a double
 * represents exactly. Every addition saturates at it.
 */
export const MAX_WINS = Number.MAX_SAFE_INTEGER;

/** The largest balloon count the server will hold. Same reasoning. */
export const MAX_BALLOONS = Number.MAX_SAFE_INTEGER;

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'] as const;

/** Compact display form: 940, 1.5K, 1.56K, 3.1M, 800B, 1T. */
export const formatNumber = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (amount < 1000) return Math.floor(amount).toString();
  let tier = 0;
  let scaled = amount;
  while (scaled >= 1000 && tier < SUFFIXES.length - 1) {
    scaled /= 1000;
    tier += 1;
  }
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const text = scaled.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  return `${text}${SUFFIXES[tier] ?? ''}`;
};

/** "43h 32m 48s" for the Top Playtime board. */
export const formatDuration = (seconds: number): string => {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0 ? `${hours}h ${minutes}m ${secs}s` : minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
};

/** "00:00:04" for the balloon meter. */
export const formatClock = (seconds: number): string => {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};
