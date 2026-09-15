/**
 * The world, checked as data and by SIMULATION.
 *
 * The course is generated from tables, so its failure modes are silent: a height
 * curve that flattens, a jump that quietly weakens higher up, a balloon count that
 * tops the staircase in half an hour, a win pad on the walking line, a shop on the
 * wrong side of the hub. This suite checks the layout and the curves, then runs the
 * real shared `stepPlayer` against the real collision model to prove that:
 *
 *   - a jump rises EXACTLY the balloon lift, whatever step, altitude or world it
 *     starts from (stud 1, 9, 100, 200, 300, the hub, World 2) - nothing weakens it
 *   - a player climbs until a riser is taller than their lift, and there is no other
 *     limit on where they can go
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
  MOVEMENT,
  PORTALS,
  SCOREBOARD,
  SPAWN_POSITION,
  STAIR_START_Z,
  STEPS,
  WALL_CLEARANCE,
  WIN_AREAS,
  WIN_PADS,
  WORLD2_HUB,
  WORLD2_OFFSET_X,
  WORLD2_WIN_PADS,
  WorldCollision,
  balloonLiftFor,
  balloonMask,
  balloonsForLift,
  createMotion,
  createMovementInput,
  createSimEvents,
  eggPedestalCentre,
  eggZoneAt,
  firstStepBeyondLift,
  inBalloonShop,
  isFinalStep,
  jumpHeightFor,
  lastStepWithinLift,
  portalAt,
  progressionBalloons,
  resolveJumpPhysics,
  stepAt,
  stepPlayer,
  studElevation,
  totalBalloonsForLift,
  winPadAt,
  winPadByArea,
  world1Requirement,
  worldAtX,
  worldLift,
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
/** A moderate lift for layout tests that jump. */
const HOPPY = { lift: 50 };
const formatShort = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));
const stepWithStuds = (studs) => STEPS.find((s) => s.studs === studs);

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
check('stud 10 is noticeable (over 20 units)', at(10) > 20, `${at(10)}`);
check('stud 70 is higher than the OLD 400th stud (1680)', at(70) > 1680, `${at(70)}`);
check('stud 200 is extreme, 300 massive, 400 endgame (over 15K, 40K, 80K)', at(200) > 15_000 && at(300) > 40_000 && at(400) > 80_000);
check('the top disappears into the sky (over 100K units)', COURSE_TOP_Y > 100_000, `${COURSE_TOP_Y}`);

console.log('\nthe balloon lift: balloons, and nothing else\n');

const YELLOW = 1;
const owned = (slot) => 1 | balloonMask(slot);
const lift = (balloons, slot = YELLOW) => balloonLiftFor(balloons, owned(slot));

check('jumpHeightFor takes the lift and nothing else (one argument)', jumpHeightFor.length === 1);
check('a jump rises the lift', jumpHeightFor(123.4) === 123.4 && jumpHeightFor(5) === 5);
check('with next to no balloons a jump is still a hop', jumpHeightFor(0) === BALLOON_JUMP.minHop && lift(0) === 0);
check('lift grows with every balloon', Array.from({ length: 2000 }, (_, i) => lift(i)).every((v, i, a) => i === 0 || v > a[i - 1]));
check('balloonsForLift is the exact inverse', [1, 5, 47, 873, 3296].every((l) => lift(balloonsForLift(l, 1)) >= l && lift(balloonsForLift(l, 1) - 1) < l));
check("stud 9's riser takes about ten balloons", balloonsForLift(stepWithStuds(9).rise, 1) >= 5 && balloonsForLift(stepWithStuds(9).rise, 1) <= 20, `${balloonsForLift(stepWithStuds(9).rise, 1)}`);
check('the first win area comes quickly: 17 studs in under 150 balloons', balloonsForLift(stepWithStuds(17).rise, 1) <= 150, `${balloonsForLift(stepWithStuds(17).rise, 1)}`);
check('1,680 balloons on the Heart are nowhere near the top (under stud 80)', (lastStepWithinLift(lift(1680, 4))?.studs ?? 0) < 80, `${lastStepWithinLift(lift(1680, 4))?.studs}`);
check('a better balloon helps: the Heart lifts more than the Yellow with the same balloons', lift(1680, 4) > lift(1680, 1));
{
  const gear = [1, 2, 3, 4, 6, 8, 10];
  const needed = WIN_PADS.map((pad, i) => balloonsForLift(stepWithStuds(pad.studs).rise, owned(gear[i])));
  console.log(`        balloons to lift over each win area's riser on typical gear: ${WIN_PADS.map((p, i) => `${p.studs}=${formatShort(needed[i])} (${BALLOONS[gear[i] - 1].name})`).join('  ')}`);
  check('each win area needs more balloons than the last, even on better gear', increasing(needed));
  check('the top needs hundreds of thousands of balloons on late gear', needed.at(-1) > 100_000, `${needed.at(-1)}`);
  check('the Yellow Balloon alone needs the better part of a million for the top', balloonsForLift(STEPS.at(-1).rise, 1) > 500_000, `${balloonsForLift(STEPS.at(-1).rise, 1)}`);
}
check('the step information is information: the lift picks the last step whose riser it rises past', (() => {
  for (const l of [0, 1, 5, 47.2, 190, 873, 2200, 4000]) {
    const last = lastStepWithinLift(l);
    const next = firstStepBeyondLift(l);
    const h = jumpHeightFor(l);
    if (last && last.rise > h) return false;
    if (next && next.rise <= h) return false;
  }
  return true;
})());

console.log('\njump physics\n');
{
  const physics = resolveJumpPhysics(300);
  check('a jump peaks at exactly its height', Math.abs((physics.velocity * physics.velocity) / (2 * physics.gravity) - 300) < 1e-6);
}
check('a small hop stays floaty (over half a second to its apex)', resolveJumpPhysics(8).velocity / resolveJumpPhysics(8).gravity > 0.5);
check('a towering lift still rises in under 2.5 seconds', resolveJumpPhysics(5000).velocity / resolveJumpPhysics(5000).gravity <= 2.5);
check('the descent floats: gentler gravity and a slower top speed than the rise', BALLOON_JUMP.descentGravity < 1 && BALLOON_JUMP.descentTerminal < 1);
{
  // A jump comes down more slowly than it went up, and still peaks at exactly its lift.
  const motion = createMotion();
  const events = createSimEvents();
  let apexFrame = -1;
  let landFrame = -1;
  let top = 0;
  for (let frame = 0; frame < 60 * 10 && landFrame < 0; frame += 1) {
    stepPlayer(motion, { moveX: 0, moveZ: 0, jump: true, cameraYaw: 0 }, { lift: 40 }, DT, collision, events);
    if (motion.y > top) top = motion.y;
    if (apexFrame < 0 && frame > 1 && motion.vy <= 0) apexFrame = frame;
    if (frame > 1 && motion.grounded) landFrame = frame;
  }
  check('a 40-unit jump rises slowly (over a second) and drifts down even more slowly', apexFrame > 60 && landFrame - apexFrame > apexFrame && Math.abs(top - 40) < 0.05, `apex frame ${apexFrame}, landed ${landFrame}, top ${top.toFixed(3)}`);
}

/**
 * One jump straight up from standing at (x, y, z), jump held: the height gained at
 * the apex. `moveZ` presses forward (into the riser ahead) during the jump.
 */
const jumpGain = (x, surface, z, liftValue, moveZ = 0) => {
  const motion = createMotion();
  motion.x = x;
  motion.y = surface.y;
  motion.z = z;
  const events = createSimEvents();
  const params = { lift: liftValue };
  // Settle on the ground first.
  for (let i = 0; i < 3; i += 1) stepPlayer(motion, { moveX: 0, moveZ: 0, jump: false, cameraYaw: 0 }, params, DT, collision, events);
  const start = motion.y;
  let top = start;
  let jumped = false;
  for (let frame = 0; frame < 60 * 4; frame += 1) {
    stepPlayer(motion, { moveX: 0, moveZ, jump: true, cameraYaw: 0 }, params, DT, collision, events);
    if (events.jumpStarted) jumped = true;
    top = Math.max(top, motion.y);
    if (jumped && motion.grounded) break;
  }
  return { gain: top - start, start, jumped };
};

console.log('\nTHE RULE: a jump gains the same height on every step, at every altitude, in every world\n');
{
  const places = [
    { label: 'the hub', x: 0, y: 0, z: SPAWN_POSITION.z },
    ...[1, 9, 50, 100, 200, 300, 500].map((studs) => {
      const s = stepWithStuds(studs);
      return { label: `stud ${studs}`, x: -6, y: s.top, z: (s.minZ + s.maxZ) / 2 };
    }),
    ...[1, 100, 300].map((studs) => {
      const s = stepWithStuds(studs);
      return { label: `World 2 stud ${studs}`, x: WORLD2_OFFSET_X - 6, y: s.top, z: (s.minZ + s.maxZ) / 2 };
    }),
  ];
  for (const [balloons, slot] of [[0, 1], [13, 1], [60, 1], [1680, 4], [20_000, 6], [3e7, 18]]) {
    const L = lift(balloons, slot);
    const expected = jumpHeightFor(L);
    const gains = places.map((p) => ({ ...p, ...jumpGain(p.x, p, p.z, L) }));
    const reference = gains[0].gain;
    // The apex falls between frames, so the sampled peak sits a hair under the height; identical everywhere.
    const tolerance = expected * 1e-3 + 1e-3;
    const worst = Math.max(...gains.map((g) => Math.abs(g.gain - reference)));
    check(
      `${formatShort(balloons).padStart(6)} balloons (${BALLOONS[slot - 1].name}, lift ${expected.toFixed(2)}): the same gain at the hub, studs 1/9/50/100/200/300/500 and World 2`,
      gains.every((g) => g.jumped && Math.abs(g.gain - expected) <= tolerance) && worst <= expected * 1e-6 + 1e-6,
      gains.map((g) => `${g.label}=${g.gain.toFixed(4)}`).join(', '),
    );
  }
  // Pressing into a riser far taller than the lift does not shrink the jump either.
  const L = lift(13, 1);
  const s = stepWithStuds(98);
  const blocked = jumpGain(-6, { y: s.top }, s.maxZ - 1, L, 1);
  check(`jumping into stud 100's ${stepWithStuds(100).rise.toFixed(0)}-unit riser with a ${jumpHeightFor(L).toFixed(2)} lift still gains the full lift`, Math.abs(blocked.gain - jumpHeightFor(L)) <= jumpHeightFor(L) * 1e-3 + 1e-3, `gained ${blocked.gain}`);
}

/**
 * A bot climbing as greedily as it can: straight up the RIGHT side of the
 * staircase (clear of the win pads), holding jump and re-pressing it on landing.
 * Returns the highest step it stood on.
 */
const climb = (liftValue, from = null, originX = 0, maxSeconds = 900) => {
  const motion = createMotion();
  motion.x = originX - 6;
  if (originX !== 0) motion.z = worldSpawn(2).z;
  if (from) {
    motion.y = from.top;
    motion.z = from.minZ + 1;
  }
  const events = createSimEvents();
  const params = { lift: liftValue };
  let best = from ? from.index : -1;
  let lastProgress = 0;
  let held = false;
  let fell = false;
  for (let frame = 0; frame < maxSeconds * 60; frame += 1) {
    const jump = motion.grounded ? !held : true;
    held = jump;
    stepPlayer(motion, { moveX: 0, moveZ: 1, jump, cameraYaw: 0 }, params, DT, collision, events);
    if (motion.grounded) {
      const step = stepAt(motion.z);
      if (step && Math.abs(motion.y - step.top) < 1e-6 && step.index > best) {
        best = step.index;
        lastProgress = frame;
      }
    }
    if (collision.hasFallen(motion.y, motion.z)) fell = true;
    if (frame - lastProgress > 60 * 12) break;
  }
  return { best, fell };
};

/** The physically possible range: at least every riser within the lift, at most those within the lift plus a step-up. */
const expectedRange = (liftValue) => {
  const h = jumpHeightFor(liftValue);
  const low = lastStepWithinLift(liftValue)?.index ?? -1;
  let high = -1;
  for (const s of STEPS) if (s.rise <= h + MOVEMENT.stepHeight + 1e-9) high = s.index;
  return { low, high };
};

console.log('\nclimbing: risers taller than the lift stop the player, and nothing else does\n');
for (const [balloons, slot] of [[1, 1], [13, 1], [60, 1], [300, 1], [1680, 4], [20_000, 6], [3e7, 18]]) {
  const L = lift(balloons, slot);
  const { low, high } = expectedRange(L);
  const { best, fell } = climb(L);
  check(
    `${formatShort(balloons).padStart(6)} balloons on ${BALLOONS[slot - 1].name.padEnd(7)} (lift ${jumpHeightFor(L).toFixed(1)}) climb until a riser is taller than the lift: stud ${STEPS[best]?.studs ?? 0}`,
    best >= low && best <= high && !fell,
    `stood on step ${best + 1}, physics allows ${low + 1}..${high + 1}${fell ? ', FELL' : ''}`,
  );
}
{
  // The same lift gets exactly as far whether the climb starts at stud 10, 100, 200 or 300.
  const L = stepWithStuds(350).rise;
  const results = [10, 100, 200, 300].map((start) => climb(L, stepWithStuds(start)));
  const { low, high } = expectedRange(L);
  check(
    'the lift for stud 350 gets to the same step starting at stud 10, 100, 200 and 300',
    results.every((r) => r.best === results[0].best && !r.fell) && results[0].best >= low && results[0].best <= high,
    results.map((r) => STEPS[r.best]?.studs).join(', '),
  );
}
{
  // Just under a riser: not cleared. Just over it: cleared. No other rule is involved.
  const target = stepWithStuds(104);
  const below = climb(target.rise - MOVEMENT.stepHeight - 1, STEPS[target.index - 1]);
  const above = climb(target.rise, STEPS[target.index - 1], 0, 60);
  check(`a lift just short of stud 104's riser (${target.rise.toFixed(0)}) cannot clear it`, below.best === target.index - 1, `step ${below.best + 1}`);
  check('a lift of that riser clears it', above.best >= target.index, `step ${above.best + 1}`);
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
    stepPlayer(motion, { moveX: 1, moveZ: 0, jump: false, cameraYaw: 0 }, HOPPY, DT, collision, events);
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
  for (let frame = 0; frame < 60 * 90 && motion.z > until; frame += 1) {
    stepPlayer(motion, { moveX: 0, moveZ: -1, jump: false, cameraYaw: 0 }, HOPPY, DT, collision, events);
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
    for (const params of [HOPPY, { lift: 1e5 }]) {
      const motion = createMotion();
      motion.x = run.start.x;
      motion.z = run.start.z;
      motion.y = run.start.y ?? 0;
      const events = createSimEvents();
      for (let frame = 0; frame < 60 * 8; frame += 1) {
        stepPlayer(motion, { ...run.move, jump: frame % 30 < 2, cameraYaw: 0 }, params, DT, collision, events);
      }
      // Let a huge jump come back down before judging.
      for (let frame = 0; frame < 60 * 12 && !motion.grounded; frame += 1) stepPlayer(motion, { ...run.move, jump: false, cameraYaw: 0 }, params, DT, collision, events);
      check(`${run.label}: the body stops there, walking or jumping (lift ${params.lift})`, run.ok(motion) && !collision.hasFallen(motion.y, motion.z), `x=${motion.x.toFixed(3)} z=${motion.z.toFixed(3)}`);
    }
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
      stepPlayer(motion, input, HOPPY, DT, collision, events);
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
  check('each portal stands on its hub floor', PORTALS.every((p) => collision.surfaceYAt(p.x, p.z, 0) === 0 && portalAt(p.x, 0, p.z) === p));
  check('World 2 has no shop and no eggs', !inBalloonShop(WORLD2_OFFSET_X + BALLOON_SHOP.x, 0, BALLOON_SHOP.z) && EGGS.every((egg) => eggZoneAt(WORLD2_OFFSET_X + eggPedestalCentre(egg.slot).x, 0, EGG_AREA.z - 6) === 0));

  const motion = createMotion();
  motion.x = s2.x;
  motion.z = s2.z;
  const events = createSimEvents();
  for (let frame = 0; frame < 60 * 4; frame += 1) stepPlayer(motion, { moveX: 1, moveZ: 0, jump: false, cameraYaw: 0 }, HOPPY, DT, collision, events);
  check("World 2's hub fence holds", Math.abs(Math.abs(motion.x - WORLD2_OFFSET_X) - (WORLD2_HUB.halfWidth - WALL_CLEARANCE)) < 0.01 && !collision.hasFallen(motion.y, motion.z), `x=${motion.x}`);

  check('World 2 pads number on after World 1', WORLD2_WIN_PADS.every((p, i) => p.area === WIN_PADS.length + i + 1 && winPadByArea(p.area) === p));
  check('World 2 pads are found where they are drawn', WORLD2_WIN_PADS.every((p) => winPadAt((p.minX + p.maxX) / 2, p.maxY, (p.minZ + p.maxZ) / 2) === p.area));
  check('World 1 pads are not found in World 2', WIN_PADS.every((p) => winPadAt((p.minX + p.maxX) / 2 + WORLD2_OFFSET_X, p.maxY, (p.minZ + p.maxZ) / 2) !== p.area));
  check('World 2 rewards continue past World 1 top reward, increasing', WORLD2_WIN_PADS[0].wins > WIN_PADS.at(-1).wins && increasing(WORLD2_WIN_PADS.map((p) => p.wins)));

  for (const mask of [1, owned(4), owned(18)]) {
    const req = world1Requirement(mask);
    check(`[owned ${mask}] World 1's requirement is the balloons that lift over its tallest riser`, balloonLiftFor(req, mask) >= STEPS.at(-1).rise && balloonLiftFor(req - 1, mask) < STEPS.at(-1).rise);
    check(`[owned ${mask}] World 1 lifts on every balloon`, worldLift(1, req, mask) === balloonLiftFor(req, mask));
    check(`[owned ${mask}] at the requirement World 2 lifts nothing (a hop)`, progressionBalloons(2, req, mask) === 0 && worldLift(2, req, mask) === 0);
    check(`[owned ${mask}] one balloon past it, World 2 lifts like World 1's first balloon`, worldLift(2, req + 1, mask) === balloonLiftFor(1, mask));
    check(`[owned ${mask}] World 2 needs the requirement on top for each lift`, totalBalloonsForLift(2, 50, mask) === req + balloonsForLift(50, mask));
  }

  const L = stepWithStuds(20).rise;
  const one = climb(L);
  const two = climb(L, null, WORLD2_OFFSET_X);
  check("World 2's staircase climbs exactly like World 1's with the same lift", one.best === two.best && !two.fell, `world 1 step ${one.best + 1}, world 2 step ${two.best + 1}`);
  const last = STEPS.at(-1);
  check("World 1's final step is detected", isFinalStep(last.top, (last.minZ + last.maxZ) / 2) && !isFinalStep(STEPS.at(-2).top, (STEPS.at(-2).minZ + STEPS.at(-2).maxZ) / 2));
}

console.log('\n  step   studs         top      rise   yellow balloons to lift over the riser   win area');
for (const step of STEPS.filter((s, i) => i % 10 === 0 || s.winArea > 0 || i === STEPS.length - 1)) {
  console.log(`  ${String(step.index + 1).padStart(4)}  ${String(step.studs).padStart(6)}  ${step.top.toFixed(1).padStart(10)}  ${step.rise.toFixed(1).padStart(8)}   ${formatShort(balloonsForLift(step.rise, 1)).padStart(15)}   ${step.winArea ? `#${step.winArea} (+${WIN_AREAS[step.winArea - 1].wins})` : ''}`);
}

console.log(`\n${failures === 0 ? 'course verified' : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
