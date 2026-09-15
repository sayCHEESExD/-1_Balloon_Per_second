import { normaliseAvatarUrl } from '@highjump/shared';
import { logger } from '../util/logger.js';

const SCOPE = 'bloxity/identity';

/** A Bloxity account, as the SERVER established it. */
export interface VerifiedBloxityUser {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  /** The account's avatar thumbnail (`pfp`), absolute on Bloxity's host, or ''. */
  readonly avatarUrl: string;
}

type Fetch = typeof fetch;

/**
 * Read the account out of a Bloxity auth response: `{ user: {...} }` or the user
 * itself, exactly as the SDK reads it.
 */
export const parseBloxityUser = (body: unknown): VerifiedBloxityUser | null => {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const nested = root['user'] ?? root['profile'] ?? root['data'];
  const candidate = (nested && typeof nested === 'object' ? nested : root) as Record<string, unknown>;
  const id = candidate['_id'] ?? candidate['id'] ?? candidate['userId'];
  if (typeof id !== 'string' || !id) return null;
  const username = typeof candidate['username'] === 'string' ? candidate['username'] : '';
  const displayName =
    typeof candidate['displayName'] === 'string' && candidate['displayName'].trim() ? candidate['displayName'].trim() : username;
  const avatar = candidate['avatar'];
  const avatarUrl = normaliseAvatarUrl(
    candidate['pfp'] ?? candidate['avatarUrl'] ?? (typeof avatar === 'string' ? avatar : undefined),
  );
  return { id, username, displayName: displayName.slice(0, 40), avatarUrl };
};

/**
 * Resolve a Bloxity token to the account it belongs to.
 *
 * The client sends its TOKEN, never its id or name. A claimed id would let
 * anybody say they were somebody else; a token can only be answered by Bloxity
 * for the account that owns it.
 *
 * Verified exactly the way the Bloxity SDK itself verifies it. An SDK initialised
 * with a game slug (this game) holds a GAME-SCOPED token, which Bloxity accepts
 * only at `POST /v1/auth/game-token/verify` with `{ gameSlug }` - the account
 * routes reject it, which left every signed-in player showing as "Guest". A plain
 * account token (no game scope) is verified at `GET /v1/auth/me`.
 */
export const verifyBloxityToken = async (
  token: string,
  apiBase: string,
  gameSlug: string,
  fetchImpl: Fetch = fetch,
): Promise<VerifiedBloxityUser | null> => {
  if (!token || token.length > 4096) return null;
  const attempts: { label: string; url: string; init: RequestInit }[] = [];
  if (gameSlug) {
    attempts.push({
      label: 'game-token/verify',
      url: `${apiBase}/v1/auth/game-token/verify`,
      init: {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSlug }),
      },
    });
  }
  attempts.push({ label: 'auth/me', url: `${apiBase}/v1/auth/me`, init: { headers: { Authorization: `Bearer ${token}` } } });

  for (const attempt of attempts) {
    try {
      const response = await fetchImpl(attempt.url, { ...attempt.init, signal: AbortSignal.timeout(6000) });
      if (!response.ok) {
        logger.info(SCOPE, `${attempt.label} did not accept the token (HTTP ${response.status})`);
        continue;
      }
      const user = parseBloxityUser(await response.json());
      if (user) return user;
      logger.warn(SCOPE, `${attempt.label} response had no account id`);
    } catch (error) {
      logger.warn(SCOPE, `${attempt.label} failed: ${String(error)}`);
    }
  }
  logger.warn(SCOPE, 'token rejected by Bloxity');
  return null;
};
