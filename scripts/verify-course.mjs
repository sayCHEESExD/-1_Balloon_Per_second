/**
 * The world, checked as data and by SIMULATION.
 *
 * The course is generated from tables, so its failure modes are silent: a
 * height curve that flattens, a reach that lands a player one step too high, a
 * balloon count that tops the staircase in half an hour, a win pad on the
 * walking line, a shop on the wrong side of the hub. This suite checks the
 * layout and the curves, then runs the real shared `stepPlayer` against the real
 * collision model to prove that a player climbs to exactly the highest step their
 * balloons' climb height covers - from wherever they start - and no further.
 *
 * Run with `npm run verify:course`.
 */
import {
  BALLOONS,
  BALLOON_JUMP,
  BALLOON_SHOP,
  BODY_RADIUS,
  COURSE_END_Z,
  COURSE_TOP_STUDS,
  COURSE_TOP_Y,
  EGGS,
  EGG_AREA,
  HUB,
  REACH_MARGIN,
  REACH_STAND_SLACK,
  SCOREBOARD,
  SPAWN_POSITION,
  STAIR_START_Z,
  STEPS,
  WALL_CLEARANCE,
  WIN_AREAS,
  WIN_PAD,
  WIN_PADS,
  WorldCollision,
  balloonMask,
  balloonsForHeight,
  climbHeightFor,
  createMotion,
  createMovementInput,
  createSimEvents,
  eggPedestalCentre,
  eggZoneAt,
  highestReachableStep,
  inBalloonShop,
  jumpHeightFor,
  nextStepTopFrom,
  reachYFor,
  resolveJumpPhysics,
  stepAt,
  stepPlayer,
  studElevation,
  winPadAt,
  PORTALS,
  WORLD2_HUB,
  WORLD2_OFFSET_X,
  WORLD2_WIN_PADS,
  isFinalStep,
  portalAt,
  progressionBalloons,
  totalBalloonsForHeight,
  winPadByArea,
  world1Requirement,
  worldAtX,
  worldClimbHeight,
  worldSpawn,
} from '../shared/dist/index.js';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const increasing = (list) => list.every((value, i) => i === 0 || value > list[i - 1]);
const collision = new WorldCollision();
const DT = 1 / 60;
const at = (studs) => studElevation(studs);
const FREE = { reachY: 1e12 };
const formatShort = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

console.log('\nthe staircase\n');

check('starts at 1, 2, 3, 4, 5 studs', [1, 2, 3, 4, 5].every((studs, i) => STEPS[i]?.studs === studs));
check('climbs one stud a step to 30', STEPS.slice(0, 30).every((s, i) => s.studs === i + 1));
check('goes past 400 studs, into endgame heights', COURSE_TOP_STUDS > 400, `${COURSE_TOP_STUDS}`);
check('stud labels strictly increase', increasing(STEPS.map((s) => s.studs)));
check('the stud increment never shrinks', STEPS.every((s, i) => i < 2 || s.studs - STEPS[i - 1].studs >= STEPS[i - 1].studs - STEPS[i - 2].studs));
check('the first step starts at the hub edge', STEPS[0]?.minZ === STAIR_START_Z);
check('steps are one continuous stair, no gaps', STEPS.every((s, i) => i === 0 || Math.abs(s.minZ - STEPS[i - 1].maxZ) < 1e-9));
check('every step is higher than the last', increasing(STEPS.map((s) => s.top)));

console.log('\nthe height curve\n');

check("every step's top is exactly studElevation(its studs)", STEPS.every((s) => Math.abs(s.top - at(s.studs)) < 1e-9));
check('stud 1 is almost flat, barely above the floor', at(1) > 0 && at(1) < 0.3, `${at(1)}`);
check('every riser is taller than the one before it', STEPS.every((s, i) => i === 0 || s.rise > STEPS[i - 1].rise));
check(
  'every stud rises more than the one before it (rise per stud always grows)',
  STEPS.every((s, i) => i === 0 || s.rise / (s.studs - STEPS[i - 1].studs) > STEPS[i - 1].rise / (STEPS[i - 1].studs - (STEPS[i - 2]?.studs ?? 0))),
);
check('stud 10 is noticeable (over 20 units)', at(10) > 20, `${at(10)}`);
check('stud 20 is clearly high (over 100)', at(20) > 100, `${at(20)}`);
check('stud 30 is very high (over 250)', at(30) > 250, `${at(30)}`);
check('stud 50 is enormous (over 800)', at(50) > 800, `${at(50)}`);
check('stud 70 is higher than the OLD 400th stud (1680)', at(70) > 1680, `${at(70)}`);
check('stud 100 is vastly above that (over 2x stud 70)', at(100) > 2 * at(70), `${at(100)}`);
check('stud 200 is extreme, 300 massive, 400 endgame (over 15K, 40K, 80K)', at(200) > 15_000 && at(300) > 40_000 && at(400) > 80_000);
check('the top disappears into the sky (over 100K units)', COURSE_TOP_Y > 100_000, `${COURSE_TOP_Y}`);
console.log(`        elevation: ${[1, 2, 5, 10, 20, 30, 50, 70, 100, 200, 300, 400, COURSE_TOP_STUDS].map((s) => `${s}=${at(s) < 10 ? at(s).toFixed(2) : formatShort(Math.round(at(s)))}`).join('  ')}`);
{
  const minRise = Math.min(...STEPS.map((s) => s.rise));
  check('a player may stand on a win pad but never on the next step up', REACH_STAND_SLACK >= WIN_PAD.thickness && REACH_STAND_SLACK < minRise, `slack ${REACH_STAND_SLACK}, smallest riser ${minRise}`);
}

console.log('\nthe balloon rule: balloons, and nothing else\n');

const YELLOW = 1;
const capacity = (balloons, slot = YELLOW) => climbHeightFor(balloons, 1 | balloonMask(slot));
const reachable = (balloons, slot = YELLOW) => highestReachableStep(capacity(balloons, slot));

check('0 balloons reach nothing', reachable(0) === null && reachYFor(0) === HUB.floorY + REACH_MARGIN);
check('the first balloon reaches the first stud', (reachable(1)?.studs ?? 0) >= 1);
check('climb height grows with every balloon', Array.from({ length: 2000 }, (_, i) => capacity(i)).every((v, i, a) => i === 0 || v > a[i - 1]));
check('balloonsForHeight is the exact inverse', [1, 89, 950, 4370, 50_000, COURSE_TOP_Y].every((h) => capacity(balloonsForHeight(h, 1)) >= h && capacity(balloonsForHeight(h, 1) - 1) < h));
check('the first win area comes quickly: 17 studs in under 150 balloons', balloonsForHeight(at(17), 1) <= 150, `${balloonsForHeight(at(17), 1)}`);
check('1,680 balloons on the Heart are nowhere near the top (under stud 80)', (reachable(1680, 4)?.studs ?? 0) < 80, `reach ${reachable(1680, 4)?.studs}`);
check('a better balloon helps: the Heart climbs higher than the Yellow with the same balloons', capacity(1680, 4) > capacity(1680, 1));
{
  // The balloon a player can plausibly afford arriving at each win area, and the balloons it takes there.
  const gear = [1, 2, 3, 4, 6, 8, 13];
  const needed = WIN_PADS.map((pad, i) => balloonsForHeight(pad.minY, 1 | balloonMask(gear[i])));
  console.log(`        balloons to reach each win area on typical gear: ${WIN_PADS.map((p, i) => `${p.studs}=${formatShort(needed[i])} (${BALLOONS[gear[i] - 1].name})`).join('  ')}`);
  check('each win area needs more balloons than the last, even on better gear', increasing(needed));
  check('the top needs hundreds of thousands of balloons on late gear', needed.at(-1) > 100_000, `${needed.at(-1)}`);
  check('the Yellow Balloon alone needs the better part of a million for the top', balloonsForHeight(COURSE_TOP_Y, 1) > 500_000, `${balloonsForHeight(COURSE_TOP_Y, 1)}`);
}

console.log('\nthe jump: always clears the next riser, wherever the player is\n');

{
  const physics = resolveJumpPhysics(300);
  check('a jump peaks at exactly its height', Math.abs((physics.velocity * physics.velocity) / (2 * physics.gravity) - 300) < 1e-6);
}
check('a small hop stays floaty (over half a second to its apex)', resolveJumpPhysics(8).velocity / resolveJumpPhysics(8).gravity > 0.5);
check('a towering riser still rises in under 1.5 seconds', resolveJumpPhysics(5000).velocity / resolveJumpPhysics(5000).gravity <= 1.5);
check('a jump rises toward the reach', jumpHeightFor(0, 3, 50) === 3);
check('a player at their reach still hops', jumpHeightFor(10, 10, 50) === BALLOON_JUMP.minHop);
check('a jump clears the next step with room to spare', jumpHeightFor(0, 1e12, 2) === 2 + BALLOON_JUMP.clearance);
check(
  'from every step, with the reach above, the jump clears the next riser - at stud 1 and at the top alike',
  STEPS.every((s, i) => i === STEPS.length - 1 || jumpHeightFor(s.top, 1e12, nextStepTopFrom((s.minZ + s.maxZ) / 2)) >= STEPS[i + 1].rise + 1),
);

/**
 * A bot climbing as greedily as it can: straight up the RIGHT side of the
 * staircase (clear of the win pads), jumping every time it lands.
 */
const climb = (height, seconds, from = null, originX = 0) => {
  const motion = createMotion();
  motion.x = originX - 6;
  if (originX !== 0) motion.z = worldSpawn(2).z;
  if (from) {
    motion.y = from.top;
    motion.z = from.minZ + 1;
  }
  const events = createSimEvents();
  const params = { reachY: reachYFor(height) };
  let highest = motion.y;
  let fell = false;
  for (let frame = 0; frame < seconds * 60; frame += 1) {
    stepPlayer(motion, { moveX: 0, moveZ: 1, jump: frame % 4 < 2, cameraYaw: 0 }, params, DT, collision, events);
    if (motion.grounded) highest = Math.max(highest, motion.y);
    if (collision.hasFallen(motion.y, motion.z)) fell = true;
  }
  return { highest, fell };
};

{
  const { highest, fell } = climb(0, 6);
  check('with no climb height even the almost-flat first step stops the player', highest === 0 && !fell, `y=${highest}`);
}
{
  // A reach exactly at stud 3: the hop rises above stud 4 and still cannot land on it.
  const { highest, fell } = climb(at(3), 8);
  check('hopping higher than the next step above the reach never lands on it', Math.abs(highest - at(3)) < 1e-6 && !fell, `y=${highest}`);
}

for (const [balloons, slot] of [[1, 1], [5, 1], [60, 1], [300, 1], [1680, 4], [20_000, 6], [3e7, 18]]) {
  const step = reachable(balloons, slot);
  const expected = step?.top ?? HUB.floorY;
  const { highest, fell } = climb(capacity(balloons, slot), 20 + 3 * ((step?.index ?? 0) + 1));
  check(
    `${formatShort(balloons).padStart(6)} balloons on ${BALLOONS[slot - 1].name.padEnd(7)} climb to exactly the ${step?.studs ?? 0}-stud step`,
    Math.abs(highest - expected) < 1e-6 && !fell,
    `reached ${highest.toFixed(2)}, expected ${expected}${fell ? ', FELL' : ''}`,
  );
}
{
  // The same climb height reaches the same step whether the climb starts at stud 10, 100, 200 or 300.
  const target = STEPS.find((s) => s.studs === 350);
  for (const start of [10, 100, 200, 300]) {
    const from = STEPS.find((s) => s.studs === start);
    const { highest, fell } = climb(target.top, 20 + 3 * (target.index - from.index), from);
    check(`the climb height for 350 studs, starting at stud ${String(start).padStart(3)}, reaches exactly 350 studs`, Math.abs(highest - target.top) < 1e-6 && !fell, `reached ${highest.toFixed(1)}, expected ${target.top}`);
  }
}

console.log('\nfalling off\n');
{
  const step = STEPS[20];
  const motion = createMotion();
  motion.y = step.top;
  motion.z = (step.minZ + step.maxZ) / 2;
  const events = createSimEvents();
  let fellAt = -1;
  for (let frame = 0; frame < 60 * 4 && fellAt < 0; frame += 1) {
    stepPlayer(motion, { moveX: 1, moveZ: 0, jump: false, cameraYaw: 0 }, FREE, DT, collision, events);
    if (collision.hasFallen(motion.y, motion.z)) fellAt = frame;
  }
  check('stepping off the side of the staircase is a fall', fellAt >= 0 && fellAt < 60 * 3, `frame ${fellAt}`);
}
{
  const step = STEPS[STEPS.length - 30];
  const motion = createMotion();
  motion.x = -6;
  motion.y = step.top;
  motion.z = step.minZ + 1;
  const events = createSimEvents();
  let fell = false;
  const until = STEPS[STEPS.length - 36].minZ;
  for (let frame = 0; frame < 60 * 30 && motion.z > until; frame += 1) {
    stepPlayer(motion, { moveX: 0, moveZ: -1, jump: false, cameraYaw: 0 }, FREE, DT, collision, events);
    if (collision.hasFallen(motion.y, motion.z)) fell = true;
  }
  check('walking back DOWN the towering upper staircase is never a fall, and is quick', !fell && motion.z <= until, `z=${motion.z.toFixed(1)}`);
}
check('the hub is never a fall', !collision.hasFallen(0, SPAWN_POSITION.z) && !collision.hasFallen(-10, 0));
check('nothing is below the out-of-world floor', collision.hasFallen(-500, SPAWN_POSITION.z));

console.log('\nwin areas\n');

check('first win area at 17 studs pays 5', WIN_PADS[0]?.studs === 17 && WIN_PADS[0]?.wins === 5);
check('second win area at 50 studs pays 25', WIN_PADS[1]?.studs === 50 && WIN_PADS[1]?.wins === 25);
check('rewards strictly increase up the staircase', increasing(WIN_PADS.map((p) => p.wins)));
check('the last win area is the top', WIN_PADS.at(-1).studs === COURSE_TOP_STUDS && WIN_PADS.length === WIN_AREAS.length);
{
  let bad = 0;
  for (const pad of WIN_PADS) {
    const step = STEPS.find((s) => s.winArea === pad.area);
    const inside = pad.minX >= step.minX && pad.maxX <= step.maxX && pad.minZ >= step.minZ && pad.maxZ <= step.maxZ;
    if (!inside || pad.minY !== step.top || (pad.minX + pad.maxX) / 2 <= 0) bad += 1;
    if (winPadAt((pad.minX + pad.maxX) / 2, pad.maxY, (pad.minZ + pad.maxZ) / 2) !== pad.area) bad += 1;
  }
  check("every pad sits on its landing, on the player's LEFT, and is found where it is drawn", bad === 0, `${bad} bad`);
}
check('the walking line on the right is never a pad', STEPS.every((s) => winPadAt(-6, s.top, (s.minZ + s.maxZ) / 2) === 0));
check('standing under a pad (far below) is not on it', winPadAt((WIN_PADS[0].minX + WIN_PADS[0].maxX) / 2, 0, (WIN_PADS[0].minZ + WIN_PADS[0].maxZ) / 2) === 0);

console.log("\nhub layout (the player's left is +X)\n");

check('spawn is inside the hub', SPAWN_POSITION.z > HUB.minZ && SPAWN_POSITION.z < HUB.maxZ);
check('the Balloon Shop is on the LEFT, before the staircase', BALLOON_SHOP.x > 20 && BALLOON_SHOP.zone.maxZ < STAIR_START_Z);
check('the shop zone is detected', inBalloonShop((BALLOON_SHOP.zone.minX + BALLOON_SHOP.zone.maxX) / 2, 0, (BALLOON_SHOP.zone.minZ + BALLOON_SHOP.zone.maxZ) / 2));
check('exactly three eggs, on the RIGHT', EGGS.length === 3 && EGGS.every((egg) => eggPedestalCentre(egg.slot).x < -20));
check('each egg zone opens only its own egg', EGGS.every((egg) => eggZoneAt(eggPedestalCentre(egg.slot).x, 0, (EGG_AREA.zoneMinZ + EGG_AREA.zoneMaxZ) / 2) === egg.slot));
check('spawn is in no zone', !inBalloonShop(SPAWN_POSITION.x, 0, SPAWN_POSITION.z) && eggZoneAt(SPAWN_POSITION.x, 0, SPAWN_POSITION.z) === 0);
check('the scoreboards stand at the BACK', SCOREBOARD.z < SPAWN_POSITION.z - 40 && SCOREBOARD.xs.length === 3);
check('the stair mouth is clear of the shop and eggs', stepAt(STAIR_START_Z + 1)?.index === 0);

console.log('\nboundaries\n');
{
  const last = STEPS.at(-1);
  const runs = [
    { label: 'the hub side fence', start: { x: 50, z: -40 }, move: { moveX: -1, moveZ: 0 }, ok: (m) => Math.abs(m.x - (HUB.halfWidth - WALL_CLEARANCE)) < 0.01 },
    { label: 'the hub back fence', start: { x: 0, z: -60 }, move: { moveX: 0, moveZ: -1 }, ok: (m) => Math.abs(m.z - (HUB.minZ + WALL_CLEARANCE)) < 0.01 },
    { label: 'the hub front edge beside the stairs', start: { x: 40, z: 38 }, move: { moveX: 0, moveZ: 1 }, ok: (m) => m.z <= HUB.maxZ - BODY_RADIUS + 1e-6 },
    { label: 'the far end of the staircase', start: { x: -6, z: COURSE_END_Z - 20, y: last.top }, move: { moveX: 0, moveZ: 1 }, ok: (m) => Math.abs(m.z - (COURSE_END_Z - WALL_CLEARANCE)) < 0.01 },
  ];
  for (const run of runs) {
    const motion = createMotion();
    motion.x = run.start.x;
    motion.z = run.start.z;
    motion.y = run.start.y ?? 0;
    const events = createSimEvents();
    for (let frame = 0; frame < 60 * 6; frame += 1) {
      stepPlayer(motion, { ...run.move, jump: frame % 30 < 2, cameraYaw: 0 }, FREE, DT, collision, events);
    }
    check(`${run.label}: the body stops there, walking or jumping`, run.ok(motion) && !collision.hasFallen(motion.y, motion.z), `x=${motion.x.toFixed(3)} z=${motion.z.toFixed(3)}`);
  }
}

console.log('\npushing into a counter is stable\n');
{
  const R = BODY_RADIUS;
  const s = BALLOON_SHOP;
  const pedestal = eggPedestalCentre(2);
  const half = EGG_AREA.pedestalSize / 2;
  const cases = [
    { label: 'the shop counter, front', x: s.x, z: s.z - s.depth / 2 - R, moveX: 0, moveZ: 1, axis: 'z', limit: (v) => v <= s.z - s.depth / 2 - R + 0.01 },
    { label: 'the shop counter, end', x: s.x + s.width / 2 + R, z: s.z, moveX: -1, moveZ: 0, axis: 'x', limit: (v) => v >= s.x + s.width / 2 + R - 0.01 },
    { label: 'an egg pedestal, front', x: pedestal.x, z: pedestal.z - half - R, moveX: 0, moveZ: 1, axis: 'z', limit: (v) => v <= pedestal.z - half - R + 0.01 },
  ];
  for (const c of cases) {
    const motion = createMotion();
    motion.x = Math.fround(c.x);
    motion.z = Math.fround(c.z);
    const input = createMovementInput();
    input.moveX = c.moveX;
    input.moveZ = c.moveZ;
    const events = createSimEvents();
    const tangent = c.axis === 'z' ? 'x' : 'z';
    const start = motion[tangent];
    let drift = 0;
    let inside = false;
    for (let i = 0; i < 60; i += 1) {
      stepPlayer(motion, input, FREE, DT, collision, events);
      drift = Math.max(drift, Math.abs(motion[tangent] - start));
      if (!c.limit(motion[c.axis])) inside = true;
      motion.x = Math.fround(motion.x);
      motion.z = Math.fround(motion.z);
    }
    check(`${c.label}: no sideways shove`, drift < 0.05, `drifted ${drift.toFixed(3)} along ${tangent}`);
    check(`${c.label}: stays outside`, !inside, `${c.axis}=${motion[c.axis]}`);
  }
}

console.log('\nworld 2\n');
{
  const s1 = worldSpawn(1);
  const s2 = worldSpawn(2);
  check('World 1 spawn is the original spawn', s1.x === SPAWN_POSITION.x && s1.z === SPAWN_POSITION.z);
  check('World 2 spawn is in World 2, on its small hub', worldAtX(s2.x) === 2 && s2.z > WORLD2_HUB.minZ && s2.z < WORLD2_HUB.maxZ && !collision.hasFallen(s2.y, s2.z));
  check('World 2 is far enough away that neither world can walk into the other', WORLD2_OFFSET_X - 2 * 400 > 400);
  check('World 2 is close enough to be seen across the fog', WORLD2_OFFSET_X < 2600);
  check('spawns are in no portal', !portalAt(s1.x, 0, s1.z) && !portalAt(s2.x, 0, s2.z));
  check('one portal each way, each in its own world', PORTALS.length === 2 && PORTALS.every((p) => worldAtX(p.x) === p.world && p.world !== p.target));
  check('each portal stands on its hub floor', PORTALS.every((p) => collision.surfaceYAt(p.x, p.z, 0, 1) === 0 && portalAt(p.x, 0, p.z) === p));
  check('World 2 has no shop and no eggs', !inBalloonShop(WORLD2_OFFSET_X + BALLOON_SHOP.x, 0, BALLOON_SHOP.z) && EGGS.every((egg) => eggZoneAt(WORLD2_OFFSET_X + eggPedestalCentre(egg.slot).x, 0, EGG_AREA.z - 6) === 0));

  // Walking off World 2's small hub sideways is stopped by its own fence.
  const motion = createMotion();
  motion.x = s2.x;
  motion.z = s2.z;
  const events = createSimEvents();
  for (let frame = 0; frame < 60 * 4; frame += 1) stepPlayer(motion, { moveX: 1, moveZ: 0, jump: false, cameraYaw: 0 }, FREE, DT, collision, events);
  check("World 2's hub fence holds", Math.abs(Math.abs(motion.x - WORLD2_OFFSET_X) - (WORLD2_HUB.halfWidth - WALL_CLEARANCE)) < 0.01 && !collision.hasFallen(motion.y, motion.z), `x=${motion.x}`);

  check('World 2 pads number on after World 1', WORLD2_WIN_PADS.every((p, i) => p.area === WIN_PADS.length + i + 1 && winPadByArea(p.area) === p));
  check('World 2 pads are found where they are drawn', WORLD2_WIN_PADS.every((p) => winPadAt((p.minX + p.maxX) / 2, p.maxY, (p.minZ + p.maxZ) / 2) === p.area));
  check('World 1 pads are not found in World 2', WIN_PADS.every((p) => winPadAt((p.minX + p.maxX) / 2 + WORLD2_OFFSET_X, p.maxY, (p.minZ + p.maxZ) / 2) !== p.area));
  check('World 2 rewards continue past World 1 top reward, increasing', WORLD2_WIN_PADS[0].wins > WIN_PADS.at(-1).wins && increasing(WORLD2_WIN_PADS.map((p) => p.wins)));

  for (const owned of [1, 1 | balloonMask(4), 1 | balloonMask(18)]) {
    const req = world1Requirement(owned);
    check(`[owned ${owned}] World 1 climbs on every balloon`, worldClimbHeight(1, req, owned) === climbHeightFor(req, owned));
    check(`[owned ${owned}] at World 1's requirement World 2 climbs nothing`, progressionBalloons(2, req, owned) === 0 && worldClimbHeight(2, req, owned) === 0);
    check(`[owned ${owned}] one balloon past it, World 2 climbs like World 1's first balloon`, worldClimbHeight(2, req + 1, owned) === climbHeightFor(1, owned));
    check(`[owned ${owned}] World 2 needs the requirement on top for each height`, totalBalloonsForHeight(2, at(17), owned) === req + balloonsForHeight(at(17), owned));
  }

  const target = STEPS.find((s) => s.studs === 20);
  const { highest, fell } = climb(target.top, 60, null, WORLD2_OFFSET_X);
  check("World 2's staircase climbs exactly like World 1's", Math.abs(highest - target.top) < 1e-6 && !fell, `reached ${highest}`);
  const last = STEPS.at(-1);
  check("World 1's final step is detected", isFinalStep(last.top, (last.minZ + last.maxZ) / 2) && !isFinalStep(STEPS.at(-2).top, (STEPS.at(-2).minZ + STEPS.at(-2).maxZ) / 2));
}

console.log('\n  step   studs         top      rise   yellow balloons   win area');
for (const step of STEPS.filter((s, i) => i % 10 === 0 || s.winArea > 0 || i === STEPS.length - 1)) {
  console.log(`  ${String(step.index + 1).padStart(4)}  ${String(step.studs).padStart(6)}  ${step.top.toFixed(1).padStart(10)}  ${step.rise.toFixed(1).padStart(8)}   ${formatShort(balloonsForHeight(step.top, 1)).padStart(15)}   ${step.winArea ? `#${step.winArea} (+${WIN_AREAS[step.winArea - 1].wins})` : ''}`);
}

console.log(`\n${failures === 0 ? 'course verified' : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
