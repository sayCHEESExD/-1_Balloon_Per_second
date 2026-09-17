import { logger } from '../util/logger.js';

const SCOPE = 'bloxity/avatar';

/** The cosmetic slots a Bloxity avatar wears. Ids only - never a URL or free text. */
const SLOTS = ['hatId', 'backId', 'skinId', 'headId', 'torsoId', 'armLId', 'armRId', 'legLId', 'legRId'] as const;

/** A catalogue id: what Bloxity's own ids look like, and nothing that could carry markup. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

type Fetch = typeof fetch;

/**
 * The equipped cosmetics out of Bloxity's avatar response, as compact JSON.
 *
 * Returns '{}' for an account wearing nothing - their DEFAULT avatar, which is
 * still a Bloxity avatar - and '' only when the response carries no avatar at all.
 * The difference is what tells the client whether to dress a player in Bloxity's
 * body or fall back to the bundled character.
 */
export const parseEquipped = (body: unknown): string => {
  if (!body || typeof body !== 'object') return '';
  const root = body as Record<string, unknown>;
  const nested = root['equipped'];
  const equipped = (nested && typeof nested === 'object' ? nested : root) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const slot of SLOTS) {
    const value = equipped[slot];
    if (typeof value === 'string' && ID.test(value)) out[slot] = value;
  }
  return JSON.stringify(out);
};

/**
 * What a player's Bloxity account is wearing, read with the token the server has
 * already verified - so cosmetics are as authoritative as the name beside them,
 * and no client can dress as somebody else.
 *
 * '' when they cannot be read: the client then keeps the bundled character, which
 * is the only fallback there is.
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
    return parseEquipped(await response.json());
  } catch (error) {
    logger.warn(SCOPE, `could not read equipped cosmetics: ${String(error)}`);
    return '';
  }
};
