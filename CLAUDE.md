# CLAUDE.md — +1 Balloon Per Second

Permanent project rules. Read before changing anything.

## What this is

A production browser multiplayer staircase obby, the next game in the series
after `+1 Backflip Obby Escape`, `+1 Speed Animal Escape`, `+1 Speed Broom Escape`,
`+1 Speed Moonwalk Escape`, `+1 High Jump Power Escape` and `+1 Tall Escape` (this
repo started as a copy of the last one; the solid, climbable staircase comes from
High Jump Power). It reuses their architecture: npm workspaces (`shared`, `server`,
`client` — the package scope is still `@highjump/*`), Three.js + Vite client,
Colyseus server, server-authoritative movement with client prediction and
reconciliation.

The gameplay: **Time → Balloons → Reach**. Every `BALLOON_TICK_SECONDS` (5) the
server pays each player their balloons per payout. The balloon count is the
player's climbing capability: a player holding N balloons can float up to the
highest step labelled N studs or less, and no higher. There are no rebirths.

## Hard constraints

- Client build under **12 MB** (`npm run size:client`).
- Balloons, rewards, purchases, hatching and inventories are
  **server-authoritative**. The client only sends input and requests.
- Desktop and mobile are both first-class.
- Ports **2572** (server) and **5178** (Vite): the earlier games use 2567-2571 and
  5173-5177 on the same machine.
- Rooms hold `MAX_PLAYERS_PER_ROOM` (15); `onAuth` re-checks it; `autoDispose` is
  explicit so an empty room closes.
- **No rebirths.** Do not add a rebirth, prestige or reset mechanic.

## Movement and the balloon jump

- `stepPlayer` in `shared/src/sim/PlayerSim.ts` is THE simulation, run by the server
  and by client prediction. Never add a second physics implementation.
- **The balloon LIFT is a physical strength, and only balloons decide it.** Lift is
  `balloonLiftFor(balloons, owned)` = `LIFT_CURVE.scale * (balloons * best owned
  multiplier) ^ LIFT_CURVE.exponent` (per world: `worldLift`, replicated as `lift`).
  Every jump rises exactly `jumpHeightFor(lift)` = max(lift, `minHop`) - one argument,
  so no position can ever enter it. **There is NO reach, NO stand limit, NO cap and NO
  "reachable step" gate** anywhere in the simulation or collision: a riser taller than
  the lift is not cleared only because the jump does not go high enough. Never
  reintroduce a height/stud/Y/distance-based clamp or scaling on the jump or on
  collision. `lastStepWithinLift` / `firstStepBeyondLift` are HUD information only.
  `verify-course` proves a jump gains the identical height at the hub, studs
  1/9/50/100/200/300/500 and in World 2, and that a greedy climber stops only where a
  riser exceeds its lift. The exponent under 1 is the grind.
- **The jump physics** comes from its height (`resolveJumpPhysics`, log-time apex), and each arc's
  gravity and fastest fall live in the motion (`airGravity`, `airTerminal`, replicated);
  a walk-off falls like a jump the height of the riser underfoot. `maxSubsteps` is 160
  because a towering riser moves thousands of units a second.
- **Height grows fast with studs.** A step's top is exactly `studElevation(studs)` =
  `0.174 * studs ^ 2.2`: 1 = 0.17, 20 = 127, 50 = 950, 70 = 2.0K (above the old 400th
  stud), 100 = 4.4K, 200 = 20K, 300 = 50K, 500 = 151K. Steps go 1, 2, 4 then 5 studs at
  a time only to keep the step count sane. Never compress or hand-tune heights. The
  renderer merges the staircase in chunks around their own origins, and the clouds
  tile around the camera, so everything holds up at six-figure altitudes.
- **Balloon size shows value** (`size` in `balloons.ts`): cheap 1-1.1, mid-tier
  1.25-2.1, rare 2.8-5.5. The string lengthens and the camera pulls back with it.
- The hub's front-edge walls are effectively endless (a jump has no cap), and landing
  is a swept surface test, so even a six-figure lift cannot tunnel or hop out.
- A hop is slow and floaty; there is one jump per landing (no air jumps).
- **Landings are soft.** No debris, dust ring, shockwave, camera shake or heavy impact
  sound on landing or falling - the player drifts down under a balloon. Do not add any.
- Horizontal speed is NOT a progression axis. `MOVEMENT.moveSpeed` is the only speed.
- Replicated positions are **float32**; `resolveAxis` treats overlap within
  `CONTACT_EPSILON` as touching (the shop-counter shake). `verify-course` asserts it.

## World

- `shared/src/config/course.ts` generates `STEPS`, `WIN_PADS` and `COURSE_SOLIDS`
  from `STAIR_SEGMENTS` and `WIN_AREAS`. The renderer and the collision read the same
  arrays. Stud labels: 1..17 by 1, then +3, +5, +10, +15, +25, +40 up to 1000.
- Steps are SOLID columns from `STEP_BASE_Y` to their top. The staircase floats over
  open sky: its SIDES are not clamped, so stepping off is a **fall**
  (`WorldCollision.hasFallen`: more than `FALL_DEPTH` below the step being crossed).
  A fall sends the player to spawn (`placeAt(..., 'fall')`); walking back down never
  counts. The hub is fenced by a clamp; its front edge beside the mouth is a solid.
- Player's LEFT is **+X**, RIGHT is **-X**. Balloon Shop left, Eggs area (three eggs,
  one hatch zone each) right, scoreboards (Top Balloons, Top Wins, Top Playtime) along
  the back facing the stairs, rainbow arch over the stair mouth.
- **Win areas** are deep milestone landings with a gold pad on the LEFT half. The
  walking line on the right never touches a pad. A pad pays at most once per attempt
  (`startAttempt` on every `placeAt`), then sends the player to spawn.
- **There are no checkpoints.** `GameRoom.placeAt` takes no position, only a world:
  every placement goes to that world's spawn (`worldSpawn`).
- **Worlds.** World 2 is World 1's exact staircase copied `WORLD2_OFFSET_X` along +X
  (solids in `COURSE_SOLIDS`, pads in `WORLD2_WIN_PADS`, areas numbered after World 1's,
  rewards continuing past 300,000), with a small fenced spawn (`WORLD2_HUB`) and no
  shop/eggs/boards. The world is derived from X (`worldAtX`), so the shared sim needs
  no world parameter; `clampToBounds` bounds each world around its own origin.
  Reaching World 1's final step (`isFinalStep`) sets the persisted `world2Unlocked`.
  The portals (`PORTALS`, `portalAt`) are walk-in zones checked by the SERVER tick;
  World 1's is shut until unlocked. The balloon total never resets; the CLIMB is per
  world (`worlds.ts`): World 2 lifts on `balloons - world1Requirement(owned)`, the
  balloons that lift over World 1's tallest riser; that lift is then constant.
  The client draws World 2 blue-shaded (`CourseWorld`, `Portal`).
- Stud labels and pad labels are one `SignAtlas` (one texture, one draw call). Steps,
  plates, pads, glows and the sky balloon clusters are merged. Keep it that way.
- World textures are drawn on canvases (`WorldTextures`). Balloons, pets, eggs and the
  shop are primitives. The only image files are the player texture and the HUD icons
  in `assets/ui/`; the balloon, clock, paw and bag icons are inline SVG.

## Balloons, pets and wins

- **Balloons move only through `BalloonService`** (`tick` on the room clock, `grant`).
  Nothing spends balloons. `syncDerived` is THE evaluator of `balloonsPerTick` and
  `lift`; every service that changes an input to them calls it.
- Balloons per payout = 1 + the held balloon's `balloons` + the equipped pets'.
  Win reward = pad wins × (100 + held balloon % + pets %) / 100, integer percent maths.
- **Wins move only through `Wallet`.** Added by `WinService` and Bux grants; spent by
  balloons and eggs. Wins are `float64`; `MAX_WINS` is the largest exact integer.
- Shop balloons: 18 (`balloons.ts`), bought from the Balloons menu anywhere; the Balloon
  Shop zone only opens the menu. A purchase equips. Yellow is always owned.
- Pets: three eggs (2 / 150 / 3,500 Wins), four pets each, server roll, hatched only
  while standing in THAT egg's zone. Max 40 owned, 3 equipped. The inventory is one
  replicated string (`"cat*,bunny"`), because a nested schema array would not trigger
  onChange.
- Only deriving facts are persisted (balloons, wins, playtime, owned/equipped balloon,
  pets, World 2 unlock). The reach and payout are recomputed on load; a join always
  starts in World 1.

## Presentation

- The held balloon (`HeldBalloon`) is a world-space spring tied to an anchor on the
  `ArmR2` bone, with a stretched string; the animator raises the right arm over every
  pose (`HOLD_BALLOON`) and sways the body while airborne (`FLOAT_SWAY`).
- Balloon and pet models are cached primitives (`BalloonModels`, `PetModels`) shared by
  the world, every player and the menu thumbnails (`rendering/Thumbnails.ts`).
- **Visible identity is Bloxity's, verified by the server.** Name tags and scoreboard
  rows show `[avatar] Display Name` from the Bloxity profile the server fetched with the
  player's token (`verifyBloxityToken` -> `PlayerState.displayName`/`avatarUrl`, saved to
  the profile for offline board rows). Not signed in = "Guest" with Bloxity's default
  avatar (`visibleName`, `identity.ts`). Never show a generated handle, `@`, or any
  internal id (player id, session id, account id). A client never sends a name or
  avatar; after an avatar change it only re-sends its token. Avatar thumbnails load
  with CORS (`AvatarImages`) so canvases are never tainted.
- Players have a name tag with their balloon count; pets have their name in the rarity
  colour (`NameTag`). Equipped pets follow their owner (`PetCompanions`), local AND remote.
- The HUD meter's bar runs on a local clock re-synced to 0 whenever the replicated
  balloon count rises.

## Architecture rules

- No god files. `shared/` never imports three, colyseus or the DOM. The client touches
  colyseus.js only in `client/src/net/`.
- Animators write only bones and their own pivot nodes (`tipPivot`, `visual`), never
  the physics root.
- Remote animation is derived from monotonic counters against a first-sight baseline.
- Only the local player makes sound. The audio files are `Background.mp3` (looping
  background music, streamed through the music bus under master/mute and the portal's
  music volume) and `fall.mp3`; every effect else is synthesised.
- Portal (Unblocked City) integration is build-time env only (`portalConfig.ts`) and
  must never block play.

## Bloxity

- The SDK (`window.Legion.SDK`) loads from `https://sdk.bloxity.io/legion-sdk.min.js` in
  `client/index.html`. **Only `client/src/bloxity/Bloxity.ts` touches it**, and every call
  is guarded: a blocked CDN must never stop play. Slug: `balloon-per-second`
  (`VITE_BLOXITY_GAME_ID` overrides).
- There is exactly ONE `auth.onUserChanged` subscription (in `Bloxity`); UI fans out from
  it. The user object is never cached. The account chip offers Friends, Avatar and Bux -
  there is deliberately NO log-out button, and nothing in the UI calls `auth.logout()`.
- Bux purchases pass a SKU only. Wins are granted by the SERVER when Bloxity's webhook
  hits `POST /bloxity/bux` (secret header `x-legion-webhook-secret`, env
  `BLOXITY_WEBHOOK_SECRET`; without it every delivery is refused). The SKU -> Wins table
  is `server/src/bloxity/BuxGrants.ts`; grants are queued to disk, then applied through
  `wallet.add` to the session whose token the server verified with Bloxity.
- **Bloxity owns how a player LOOKS, local and remote alike** (`BloxityAvatar`). A
  signed-in account wears Bloxity's `player.glb` via `PlayerCharacter.setModel` (which
  re-ties the balloon to the new hand), with parts swapped in, the skin as its map and
  hats/back on bones. **An account with nothing equipped still wears Bloxity's body and
  default skin (`0`)** - that IS their default avatar; the bundled `player.fbx` and its
  `player.png` are ONLY for a player whose Bloxity avatar cannot be had (guest, blocked
  CDN). Never let the bundled texture stand in for a Bloxity default.
- **Remote players wear their OWN Bloxity cosmetics** (`PlayerState.avatar`: equipped ids
  as JSON, `{}` the default avatar, empty no Bloxity avatar at all). Two sources, in this
  order: the server reads them with that player's verified token (`fetchBloxityAvatar`)
  where Bloxity allows it, and otherwise the player's own client reports them
  (`MessageType.BloxityAvatar` -> `onAvatarReported`, sanitised and rate limited). That
  report is the ONE thing a client may say about itself: Bloxity refuses a game-scoped
  token on its avatar route, and the worst a forged report does is dress that player in
  items they do not own. Names, ids, balances and progression stay server-verified.
  Proportions are not replicated.

## Verification

Do not claim something works without running it: `npm run typecheck`,
`npm run verify`, `npm run build:client`, `npm run build:server`,
`npm run size:client`, and a real browser for behaviour.
