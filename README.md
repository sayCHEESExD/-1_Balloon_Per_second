# +1 Balloon Per Second

A browser multiplayer staircase obby in the +1 series. Every player holds a
balloon, and every 5 seconds they gain balloons. The balloon count is how high
they can float: a player holding N balloons can climb to the highest step
labelled N studs or less on a colossal rainbow staircase (1, 2, 3 ... 17 studs,
then on up to 500). Each stud rises far higher than the last: stud 70 is two
thousand units up and the top is over 150 thousand, so climbing it is a long grind. Better balloons multiply how many studs your
balloons climb, and the rare ones are enormous. Stand on the gold pads at the win areas (17, 50, 100, 200,
350, 600 and 1000 studs) for Wins, spend Wins on better balloons (which add
balloons per payout and win bonuses) and on pet eggs, and equip up to three pets.

Three.js + TypeScript + Vite on the client, Colyseus + Node on the server, and a
framework-free `shared/` package both sides simulate with. Gameplay is
server-authoritative, rooms hold 15 players, and an empty room closes itself.

## Run it

```bash
npm install
```

```bash
npm run dev
```

The client is on http://localhost:5178 and the server on ws://localhost:2572
(the previous games in the series use 5173-5177 and 2567-2571).

## Checks

```bash
npm run typecheck
```

```bash
npm run verify
```

`verify` runs five suites: `verify:assets` (every runtime asset exists),
`verify:course` (the stud table, the win areas, layout sides, falls, boundaries,
and a real simulation that a player holding N balloons climbs to exactly the
highest N-stud step and no further), `verify:progression` (the balloon clock, the
18 balloons and their prices, eggs, pet chances and buffs, win rewards),
`verify:services` (the server's balloon payout, shop, hatching, pet inventory
and win decisions, including rejection paths), and `verify:bloxity` (the Bux
webhook).

```bash
npm run build:client
```

```bash
npm run build:server
```

```bash
npm run size:client
```

`size:client` enforces the 12 MB budget. With the server running,
`npm run verify:capacity` checks the 15-player cap, overflow routing and that empty
rooms close, and `npm run verify:worlds` walks real clients into the portals (locked
World 1 portal, travel to World 2 keeping balloons/wins/pets with World 2's own climb,
and the return trip). It needs a `worlds-probe-unlocked` profile with
`world2Unlocked: true` in `server/data/profiles.json`.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Walk | WASD / arrows (mouse aims the camera) | left stick |
| Zoom | mouse wheel (up = in, down = out) | - |
| Balloon jump | Space | jump button |
| Balloons / Pets / Sound | B / P / M | left rail buttons |
| Buy balloons | the Balloons menu, or walk into the Balloon Shop | same |
| Hatch eggs | walk up to an egg | same |
| Free the cursor | Esc | - |

## Tuning

Every gameplay number lives in `shared/src/config/`:

| File | What it holds |
| --- | --- |
| `course.ts` | `STUD_CURVE` (a step's top is `studElevation(studs)`), `STAIR_SEGMENTS` (stud increments, depth, width), `WIN_AREAS`, the reach margins and the hub layout |
| `progression.ts` | the balloon payout clock and number formatting |
| `movement.ts` | walk speed, air control, and the balloon jump (minimum hop, apex timing; its height is always the balloon lift) |
| `balloons.ts` | the 18 shop balloons (prices, balloon bonus, win percent, climb multiplier, size, look) and `LIFT_CURVE` (balloons to jump lift, the same on every step) |
| `pets.ts` | the three eggs, the pets in each, chances, buffs and inventory limits |

## Deploy

The same split as the previous games: the client is static files, the server is a
long-lived Node process.

- **Server:** `Dockerfile` at the repo root. Set `PORT` (defaults to 2572) and mount
  a volume at `HIGHJUMP_DATA_DIR` (default `/data`) or a redeploy wipes profiles.
  `/health` reports rooms and players.
- **Client:** `npm run build:client` and publish `client/dist` (`netlify.toml` is
  included). Set `VITE_SERVER_URL` at build time to the server's `wss://` address.

### Bloxity Hosting (GitHub Actions)

`.github/workflows/deploy.yml` deploys game id `balloon-per-second` on every push,
following [hosting.bloxity.io/docs](https://hosting.bloxity.io/docs):

| Branch | Channel | Backend (Colyseus) | Frontend |
| --- | --- | --- | --- |
| `dev` | `dev` | `wss://balloon-per-second.dev.host.bloxity.io` | `https://balloon-per-second.dev.play.bloxity.io` |
| `main` | `prod` | `wss://balloon-per-second.host.bloxity.io` | `https://balloon-per-second.play.bloxity.io` |

1. Typecheck and verify.
2. Build the server image, push `ghcr.io/<owner>/balloon-per-second-server:<channel>-<sha>`,
   and roll it with `POST https://legion.bloxity.io/v1/apps/balloon-per-second/deploy`
   (`version` = commit SHA, `seatCap` 15 = the room cap).
3. Build the client with that channel's `VITE_SERVER_URL`, zip `client/dist` with
   `index.html` at the root, and upload the raw zip to
   `POST https://api.bloxity.io/v1/hosting/games/balloon-per-second/frontend?channel=<channel>&version=<sha>`.

The only secret is `LEGION_DEPLOY_TOKEN`. After the first push, make the GHCR package
public so Legion can pull it. The `balloon-per-second` game id must exist on Bloxity first.

### Bloxity SDK

Login, avatar, friends, portal settings, lifecycle and Bux are integrated in
`client/src/bloxity/` (one module, `Bloxity.ts`) with the account chip in
`client/src/ui/BloxityPanel.ts`. Bux fulfilment is server-side:

| Server env | Purpose |
| --- | --- |
| `BLOXITY_WEBHOOK_SECRET` | shared secret Bloxity sends as `x-legion-webhook-secret`; required, or `/bloxity/bux` refuses (and Bloxity refunds) |
| `BLOXITY_WEBHOOK_ALLOW_UNSIGNED` | `1` accepts unsigned webhooks - local development only |
| `BLOXITY_API_BASE` | defaults to `https://api.bloxity.io` (token verification) |

Register `https://<backend host>/bloxity/bux` as the game's webhook and create the SKUs
`wins_small` and `wins_large` in the Bloxity catalogue.

On `localhost` the SDK sends login and API calls to the page's own origin (its
documented behaviour), so logging in from `npm run dev` needs a Bloxity backend there.
To use the real one locally, build with `VITE_BLOXITY_API_URL=https://api.bloxity.io`
and `VITE_BLOXITY_PORTAL_URL=https://bloxity.io`. Deployed builds need neither.

### Unblocked City

The portal hooks are build-time configuration only, and nothing is hardcoded. With
none of these set, the game runs standalone:

| Variable | Purpose |
| --- | --- |
| `VITE_PORTAL_NAME` | label used in logs |
| `VITE_PORTAL_SDK_URL` | optional portal script, loaded after boot; failures are ignored |
| `VITE_PORTAL_ORIGINS` | comma-separated parent origins that receive a `game-ready` postMessage |

Wiring lives in `client/src/config/portalConfig.ts` and `client/src/portal/Portal.ts`.
