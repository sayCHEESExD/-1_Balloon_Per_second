/**
 * Worlds and portals, checked against a RUNNING server.
 *
 * Joins real clients and WALKS them (by Move messages, as a player would) into
 * the portals, then asserts what the server did:
 *
 *   - World 1's portal is shut to a player who has not unlocked World 2
 *   - an unlocked player is teleported to World 2's spawn, keeps every balloon
 *     and win, and climbs on World 2's progression (balloons past World 1's
 *     requirement), not World 1's
 *   - World 2's portal returns them to World 1 with World 1's climb back
 *
 * Needs a profile `worlds-probe-unlocked` with `world2Unlocked: true` in the
 * server's data. Usage: start the server, then `node scripts/verify-worlds.mjs`.
 */
import { Client } from 'colyseus.js';
import { PORTALS, ROOM_NAME, worldClimbHeight, worldSpawn } from '../shared/dist/index.js';

const ENDPOINT = process.env.ENDPOINT ?? 'ws://localhost:2572';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok    ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
  }
};

const join = async (playerId) => {
  const room = await new Client(ENDPOINT).joinOrCreate(ROOM_NAME, { playerId });
  let seq = 1;
  const me = () => room.state?.players?.get(room.sessionId);
  for (let i = 0; i < 100 && !me(); i += 1) await sleep(50);
  const send = (moveX, moveZ) => room.send('move', { seq: seq++, dt: 0.05, moveX, moveZ, jump: false, cameraYaw: 0 });
  return { room, me, send };
};

/** Walk toward (x, z) at real-time pace until `done()` or the timeout. At yaw 0, +moveZ is +Z and +moveX is -X. */
const walkTo = async (player, x, z, done, seconds = 8) => {
  for (let i = 0; i < seconds * 20; i += 1) {
    const state = player.me();
    if (done(state)) return true;
    const dx = x - state.x;
    const dz = z - state.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.4) player.send(0, 0);
    else player.send(-dx / length, dz / length);
    await sleep(50);
  }
  return done(player.me());
};

const toWorld2 = PORTALS.find((p) => p.target === 2);
const toWorld1 = PORTALS.find((p) => p.target === 1);

console.log(`worlds (${ENDPOINT})\n`);

// The move message type: read from the shared enum so a rename cannot silently break this.
const { MessageType } = await import('../shared/dist/index.js');
if (MessageType.Move !== 'move') console.log(`        (move message is "${MessageType.Move}")`);

{
  const probe = await join(`worlds-probe-locked-${Date.now()}`);
  const original = probe.send;
  probe.send = (mx, mz) => probe.room.send(MessageType.Move, { seq: (probe.seq = (probe.seq ?? 1) + 1), dt: 0.05, moveX: mx, moveZ: mz, jump: false, cameraYaw: 0 });
  void original;
  await walkTo(probe, toWorld2.x, toWorld2.z, () => false, 4);
  const state = probe.me();
  check('a new player is not unlocked', state.world2Unlocked === false);
  check("World 1's portal does not take a locked player", state.world === 1 && Math.abs(state.x - toWorld2.x) < 3, `world ${state.world} at (${state.x.toFixed(1)}, ${state.z.toFixed(1)})`);
  await probe.room.leave(true);
}

{
  const probe = await join('worlds-probe-unlocked');
  probe.send = (mx, mz) => probe.room.send(MessageType.Move, { seq: (probe.seq = (probe.seq ?? 1) + 1), dt: 0.05, moveX: mx, moveZ: mz, jump: false, cameraYaw: 0 });
  await sleep(300);
  const before = { ...probe.me().toJSON() };
  check('the unlocked profile is restored unlocked, in World 1', before.world2Unlocked === true && before.world === 1);
  check("World 1's climb uses every balloon", Math.abs(before.climbHeight - worldClimbHeight(1, before.balloons, before.ownedBalloons)) < 1e-6);

  const arrived = await walkTo(probe, toWorld2.x, toWorld2.z, (s) => s.world === 2);
  await sleep(300);
  const in2 = probe.me();
  const spawn2 = worldSpawn(2);
  check("World 1's portal teleports an unlocked player to World 2", arrived && in2.world === 2);
  check("they arrive at World 2's spawn", Math.abs(in2.x - spawn2.x) < 1 && Math.abs(in2.z - spawn2.z) < 1, `(${in2.x.toFixed(1)}, ${in2.z.toFixed(1)})`);
  check('balloons are kept in full', in2.balloons >= before.balloons, `${before.balloons} -> ${in2.balloons}`);
  check('wins, pets, balloons owned and equipped are kept', in2.wins === before.wins && in2.pets === before.pets && in2.ownedBalloons === before.ownedBalloons && in2.equippedBalloon === before.equippedBalloon);
  check(
    "World 2 climbs on World 2's progression, far below World 1's climb",
    Math.abs(in2.climbHeight - worldClimbHeight(2, in2.balloons, in2.ownedBalloons)) < 1e-6 && in2.climbHeight < before.climbHeight,
    `world 1 ${before.climbHeight.toFixed(0)}, world 2 ${in2.climbHeight.toFixed(0)}`,
  );

  // Step off the spawn first, then into the return portal.
  const back = await walkTo(probe, toWorld1.x, toWorld1.z, (s) => s.world === 1);
  await sleep(300);
  const in1 = probe.me();
  check("World 2's portal returns them to World 1's spawn", back && in1.world === 1 && Math.abs(in1.x - worldSpawn(1).x) < 1 && Math.abs(in1.z - worldSpawn(1).z) < 1, `(${in1.x.toFixed(1)}, ${in1.z.toFixed(1)})`);
  check("World 1's climb is back", Math.abs(in1.climbHeight - worldClimbHeight(1, in1.balloons, in1.ownedBalloons)) < 1e-6);
  await probe.room.leave(true);
}

console.log(`\n${failures === 0 ? 'worlds verified' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
