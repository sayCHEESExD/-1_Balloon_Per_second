/**
 * Player identity: how the server turns a Bloxity token into a visible name and
 * avatar, checked against a FAKE Bloxity (no network, no real token).
 *
 * Proves the server verifies game-scoped tokens the way the Bloxity SDK does
 * (`POST /v1/auth/game-token/verify` with the game slug), falls back to
 * `/v1/auth/me` for plain account tokens, and reads the display name and pfp.
 *
 * Run with `npm run build:server && node scripts/verify-identity.mjs`.
 */
import { parseBloxityUser, verifyBloxityToken } from '../server/dist/bloxity/bloxityIdentity.js';
import { fetchBloxityAvatar, parseEquipped } from '../server/dist/bloxity/bloxityAvatarData.js';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};

const API = 'https://api.example.test';
const USER = { _id: 'acc_123', username: 'chicken877', displayName: 'Chicken 877', pfp: 'https://static.bloxity.io/img/pfps/s1_hd4.png?width=128&quality=85&v=2' };

/** A fake fetch answering like Bloxity, recording every request. */
const fakeBloxity = (routes) => {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', auth: init.headers?.Authorization, body: init.body });
    const route = routes[`${init.method ?? 'GET'} ${url.replace(API, '')}`];
    if (!route) return new Response('{"error":"not found"}', { status: 404 });
    return new Response(JSON.stringify(route.body), { status: route.status });
  };
  return { impl, calls };
};

console.log('\nparsing a Bloxity user\n');
check('the display name and avatar come from { user }', JSON.stringify(parseBloxityUser({ user: USER })) === JSON.stringify({ id: 'acc_123', username: 'chicken877', displayName: 'Chicken 877', avatarUrl: USER.pfp }));
check('or from the user object itself', parseBloxityUser(USER)?.displayName === 'Chicken 877');
check('no display name falls back to the username (no @)', parseBloxityUser({ _id: 'a', username: 'chicken877' })?.displayName === 'chicken877');
check('a relative pfp path becomes an absolute Bloxity URL', parseBloxityUser({ _id: 'a', username: 'u', pfp: '/pfps/x.png' })?.avatarUrl === 'https://static.bloxity.io/img/pfps/x.png?width=128&quality=85');
check('no id, no account', parseBloxityUser({ username: 'x' }) === null && parseBloxityUser(null) === null);

console.log('\nverifying a game-scoped token (the SDK in this game)\n');
{
  const bloxity = fakeBloxity({
    'POST /v1/auth/game-token/verify': { status: 200, body: { user: USER } },
    'GET /v1/auth/me': { status: 401, body: { code: 'TOKEN_INVALID' } },
  });
  const user = await verifyBloxityToken('game-token-abc', API, 'balloon-per-second', bloxity.impl);
  const first = bloxity.calls[0];
  check('a game token is verified with POST /v1/auth/game-token/verify first', first?.method === 'POST' && first?.url === `${API}/v1/auth/game-token/verify`);
  check('with the bearer token and the game slug', first?.auth === 'Bearer game-token-abc' && JSON.parse(first?.body ?? '{}').gameSlug === 'balloon-per-second');
  check('and yields the Bloxity display name and avatar', user?.displayName === 'Chicken 877' && user?.avatarUrl === USER.pfp && user?.id === 'acc_123');
}

console.log('\nverifying a plain account token\n');
{
  const bloxity = fakeBloxity({
    'POST /v1/auth/game-token/verify': { status: 401, body: { code: 'GAME_TOKEN_INVALID' } },
    'GET /v1/auth/me': { status: 200, body: USER },
  });
  const user = await verifyBloxityToken('account-token', API, 'balloon-per-second', bloxity.impl);
  check('falls back to GET /v1/auth/me', bloxity.calls[1]?.url === `${API}/v1/auth/me` && user?.displayName === 'Chicken 877');
}

console.log('\nrejections\n');
{
  const bloxity = fakeBloxity({
    'POST /v1/auth/game-token/verify': { status: 401, body: { code: 'GAME_TOKEN_INVALID' } },
    'GET /v1/auth/me': { status: 401, body: { code: 'TOKEN_INVALID' } },
  });
  check('a token neither route accepts is nobody', (await verifyBloxityToken('bad', API, 'balloon-per-second', bloxity.impl)) === null);
  check('an empty or oversized token is never sent', (await verifyBloxityToken('', API, 'g', bloxity.impl)) === null && (await verifyBloxityToken('x'.repeat(5000), API, 'g', bloxity.impl)) === null && bloxity.calls.length === 2);
  const broken = await verifyBloxityToken('t', API, 'g', async () => {
    throw new Error('network down');
  });
  check('a network failure is nobody, not a crash', broken === null);
}

console.log("\nthe avatar a player wears (cosmetics, read with their token)\n");
{
  check('an account wearing nothing is its DEFAULT avatar, not "no avatar"', parseEquipped({ equipped: {} }) === '{}');
  check('equipped ids are read from { equipped } or from the body itself', parseEquipped({ equipped: { skinId: '7', hatId: '12' } }) === JSON.stringify({ hatId: '12', skinId: '7' }) && parseEquipped({ skinId: '7' }) === JSON.stringify({ skinId: '7' }));
  check('only known slots survive, and only id-shaped values', parseEquipped({ equipped: { skinId: '7', evil: '<script>', hatId: 'a b', backId: 'x'.repeat(200) } }) === JSON.stringify({ skinId: '7' }));
  check('a response with no avatar at all is empty (the bundled-body fallback)', parseEquipped(null) === '' && parseEquipped('nope') === '');

  const calls = [];
  const ok = async (url, init = {}) => {
    calls.push({ url, auth: init.headers?.Authorization });
    return new Response(JSON.stringify({ equipped: { skinId: '4', headId: '9' }, ownedItems: ['0'] }), { status: 200 });
  };
  const worn = await fetchBloxityAvatar('tok', 'https://api.example.test', ok);
  check('cosmetics are read from GET /v1/avatar/equipped with the bearer token', calls[0]?.url === 'https://api.example.test/v1/avatar/equipped' && calls[0]?.auth === 'Bearer tok');
  check('and come back as the equipped ids', worn === JSON.stringify({ skinId: '4', headId: '9' }), worn);
  check('a refusal means no cosmetics, never a crash', (await fetchBloxityAvatar('tok', 'https://api.example.test', async () => new Response('{}', { status: 401 }))) === '');
  check('so does a network failure, and an empty token is never sent', (await fetchBloxityAvatar('tok', 'https://api.example.test', async () => { throw new Error('down'); })) === '' && (await fetchBloxityAvatar('', 'https://api.example.test', ok)) === '' && calls.length === 1);
}

console.log(`\n${failures === 0 ? 'identity verified' : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
