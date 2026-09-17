import { logger } from '../util/logger.js';

const SCOPE = 'bloxity/avatar';

/**
 * Every slot a Bloxity avatar wears: the BODY PARTS (head, torso, each arm, each
 * leg), the skin that textures them, and the accessories. A part is a real mesh on
 * Bloxity's CDN, not a texture - two accounts with different heads are different
 * models, so all of these must reach every other player.
 */
const SLOTS = ['hatId', 'backId', 'skinId', 'headId', 'torsoId', 'armLId', 'armRId', 'legLId', 'legRId'] as const;

/** Bloxity's body proportions. Each is a multiplier around 1. */
const PROPORTIONS = ['height', 'shoulderWidth', 'armLength', 'legOffsetX', 'torsoScaleX', 'neckHeight', 'headScale'] as const;

/** A catalogue id: what Bloxity's own ids look like (24 hex), and nothing that could carry markup. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Wider than Bloxity's own sliders, so a legitimate build is never clipped, but still bounded. */
const PROPORTION_MIN = 0.05;
const PROPORTION_MAX = 6;

type Fetch = typeof fetch;

/** The equipped ids in an avatar payload, or null when it carries no avatar at all. */
export const readEquipped = (body: unknown): Record<string, string> | null => {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const nested = root['equipped'];
  const equipped = (nested && typeof nested === 'object' ? nested : root) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const slot of SLOTS) {
    const value = equipped[slot];
    if (typeof value === 'string' && ID.test(value)) out[slot] = value;
  }
  return out;
};

/** The body proportions in an avatar payload: known keys, finite, bounded. */
export const readProportions = (body: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!body || typeof body !== 'object') return out;
  const root = body as Record<string, unknown>;
  const source = (root['proportions'] && typeof root['proportions'] === 'object' ? root['proportions'] : {}) as Record<string, unknown>;
  for (const key of PROPORTIONS) {
    const value = source[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const bounded = Math.min(Math.max(value, PROPORTION_MIN), PROPORTION_MAX);
    // A proportion left at 1 is the default; sending it would only cost bandwidth.
    if (bounded !== 1) out[key] = Math.round(bounded * 1000) / 1000;
  }
  return out;
};

/**
 * THE replicated avatar: `{"equipped":{...},"proportions":{...}}` as compact JSON.
 *
 * `{"equipped":{}}` is an account wearing Bloxity's DEFAULT avatar - still a Bloxity
 * avatar - and '' is no Bloxity avatar at all, the only case in which a player falls
 * back to the bundled character.
 */
export const encodeAvatar = (body: unknown): string => {
  const equipped = readEquipped(body);
  if (!equipped) return '';
  const proportions = readProportions(body);
  return JSON.stringify(Object.keys(proportions).length > 0 ? { equipped, proportions } : { equipped });
};

/**
 * What a player's Bloxity account is wearing, read with the token the server has
 * already verified.
 *
 * '' when it cannot be read - which is the common case, because Bloxity's avatar
 * route refuses the game-scoped token a game holds. The player's own client then
 * reports it instead (`GameRoom.onAvatarReported`).
 */
export const fetchBloxityAvatar = async (token: string, apiBase: string, fetchImpl: Fetch = fetch): Promise<string> => {
  if (!token || token.length > 4096) return '';
  try {
    const response = await fetchImpl(`${apiBase}/v1/avatar/equipped`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      logger.info(SCOPE, `equipped cosmetics unavailable (HTTP ${response.status})`);
      return '';
    }
    return encodeAvatar(await response.json());
  } catch (error) {
    logger.warn(SCOPE, `could not read equipped cosmetics: ${String(error)}`);
    return '';
  }
};
