/**
 * How a player is SHOWN.
 *
 * The only visible identity is the player's Bloxity profile, as the SERVER verified
 * it from their token: the display name and the avatar thumbnail (`pfp`). Internal
 * ids (the browser player id, the session id, the Bloxity account id) stay on the
 * server for networking and persistence and are never turned into a visible name.
 * A player who is not signed in to Bloxity is simply "Guest".
 */

export const GUEST_NAME = 'Guest';

/** Bloxity's own default avatar thumbnail (the one its SDK and portal use). */
export const DEFAULT_AVATAR_URL = 'https://static.bloxity.io/img/pfps/0.png?width=128&quality=85';

const AVATAR_BASE = 'https://static.bloxity.io/img/';
const BLOXITY_HTTPS = /^https:\/\/([a-z0-9-]+\.)*bloxity\.io\/[^\s"'<>\\]*$/i;

/** The name to display for a verified Bloxity display name (or none). */
export const visibleName = (displayName: string | null | undefined): string => {
  const name = (displayName ?? '').trim();
  return name ? name.slice(0, 40) : GUEST_NAME;
};

/**
 * A Bloxity avatar thumbnail URL, made absolute and restricted to Bloxity's own
 * HTTPS hosts, or '' when it is not one. The profile's `pfp` may be absolute or a
 * `pfps/...png` path on Bloxity's static host.
 */
export const normaliseAvatarUrl = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  let value = raw.trim();
  if (!value || value.length > 512) return '';
  if (!/^https?:\/\//i.test(value)) {
    // Only a plain path on Bloxity's static host: no scheme, no colon, no query tricks.
    if (!/^\/?[a-z0-9_\-./]+(\?[a-z0-9_=&.-]*)?$/i.test(value) || value.includes('..')) return '';
    value = AVATAR_BASE + value.replace(/^\/+/, '').replace(/^img\//, '');
  }
  if (!BLOXITY_HTTPS.test(value)) return '';
  if (!value.includes('?')) value += '?width=128&quality=85';
  return value;
};
