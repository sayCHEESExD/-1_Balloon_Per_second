/**
 * The progression tables and curves, checked without a server.
 *
 * What these get wrong is never a crash - it is a price off by a zero, a
 * payout that forgets a pet, a chance table that sums to 99. This suite pins
 * every figure the design specifies.
 *
 * Run with `npm run verify:progression`.
 */
import {
  BALLOONS,
  BALLOON_TICK_SECONDS,
  BASE_BALLOONS_PER_TICK,
  EGGS,
  MAX_WINS,
  PETS,
  PET_LIMITS,
  STARTER_BALLOON,
  WIN_AREAS,
  balloonMask,
  balloonsPerTick,
  encodePets,
  equipBestPets,
  equippedPetIds,
  formatClock,
  formatDuration,
  formatNumber,
  heldBalloon,
  isBalloonOwned,
  balloonsForLift,
  balloonLiftFor,
  ownedBalloonCount,
  parsePets,
  petBalloonBonus,
  petWinsPercent,
  petsInEgg,
  resolveWinReward,
  rollPet,
  winsMultiplier,
  GUEST_NAME,
  normaliseAvatarUrl,
  visibleName,
} from '../shared/dist/index.js';
import * as shared from '../shared/dist/index.js';

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

console.log('\nthe balloon clock\n');

check('a payout every 5 seconds', BALLOON_TICK_SECONDS === 5);
check('+1 balloon per payout before bonuses', BASE_BALLOONS_PER_TICK === 1 && balloonsPerTick(1, 1, '') === 1);

console.log('\nthe balloon shop\n');

const SPEC = [
  ['Yellow', 0], ['Blue', 10], ['Red', 50], ['Heart', 100], ['Dogs', 500], ['Package', 1_000], ['Zeppelin', 5_000],
  ['Frog', 8_000], ['Tum Tum', 10_000], ['Bird', 25_000], ['Noob', 10_000], ['Black Hole', 70_000], ['Uphouse', 60_000],
  ['Snowflake', 100_000], ['Ice Cube', 450_000], ['Yeti', 1_000_000], ['Mammoth', 3_000_000], ['Jaguar', 5_000_000],
];
check('eighteen balloons', BALLOONS.length === 18);
check('names and prices match the spec, in order', SPEC.every(([name, cost], i) => BALLOONS[i]?.name === name && BALLOONS[i]?.cost === cost));
check('slots run 1..18', BALLOONS.every((b, i) => b.slot === i + 1));
check('every shape is distinct past the plain balloons', new Set(BALLOONS.slice(2).map((b) => b.shape)).size === BALLOONS.length - 2);
check('the Yellow Balloon is free and always owned', STARTER_BALLOON === 1 && isBalloonOwned(0, 1) && BALLOONS[0].cost === 0);
check('an unbought balloon is not owned', !isBalloonOwned(1, 2) && isBalloonOwned(1 | balloonMask(2), 2));
check('the top balloon fits the owned mask', isBalloonOwned(balloonMask(18), 18) && !isBalloonOwned(balloonMask(18), 17));
check('ownership counts the starter', ownedBalloonCount(0) === 1 && ownedBalloonCount(balloonMask(3) | balloonMask(7)) === 3);
check('an unowned equipped slot holds the Yellow Balloon', heldBalloon(5, 1).slot === 1 && heldBalloon(5, balloonMask(5)).slot === 5);
check('every bought balloon adds balloons', BALLOONS.slice(1).every((b) => b.balloons > 0));
check('the more expensive of any two balloons is never weaker', BALLOONS.every((a) => BALLOONS.every((b) => a.cost <= b.cost || a.balloons >= b.balloons)));
check('the held balloon adds to the payout', balloonsPerTick(18, balloonMask(18), '') === 1 + BALLOONS[17].balloons);
check('an unowned balloon adds nothing', balloonsPerTick(18, 1, '') === 1);
check('the Yellow Balloon climbs x1; every bought one multiplies more', BALLOONS[0].climb === 1 && BALLOONS.slice(1).every((b) => b.climb > 1));
check('the more expensive of any two balloons never climbs less', BALLOONS.every((a) => BALLOONS.every((b) => a.cost <= b.cost || a.climb >= b.climb)));
check('no balloons, no lift', balloonLiftFor(0, 1) === 0);
check('lift grows with balloons, but more slowly each time (the grind)', balloonLiftFor(2000, 1) > balloonLiftFor(1000, 1) && balloonLiftFor(2000, 1) - balloonLiftFor(1000, 1) < balloonLiftFor(1000, 1));
check('the best balloon OWNED multiplies the balloons counted, held or not', Math.abs(balloonLiftFor(100, balloonMask(18) | balloonMask(2)) - balloonLiftFor(1000, 1)) < 1e-9 && Math.abs(balloonLiftFor(100, balloonMask(4)) - balloonLiftFor(130, 1)) < 1e-9);
check('balloonsForLift inverts it', [10, 500, 3_000].every((l) => balloonLiftFor(balloonsForLift(l, balloonMask(6)), balloonMask(6)) >= l && balloonLiftFor(balloonsForLift(l, balloonMask(6)) - 1, balloonMask(6)) < l));

console.log('\nplayer identity\n');

check('a Bloxity display name is shown exactly as it is', visibleName('Chicken 877') === 'Chicken 877');
check('a player without a verified name is a Guest, never an id', visibleName('') === GUEST_NAME && visibleName(undefined) === 'Guest');
check('no generated handles exist any more (no @Word_1234 names)', !('handleFor' in shared));
check('an absolute Bloxity avatar thumbnail is kept', normaliseAvatarUrl('https://static.bloxity.io/img/pfps/abc.png?width=128&quality=85&v=2') === 'https://static.bloxity.io/img/pfps/abc.png?width=128&quality=85&v=2');
check("a profile's relative pfp path is made absolute on Bloxity's host", normaliseAvatarUrl('/pfps/s1_hd2.png') === 'https://static.bloxity.io/img/pfps/s1_hd2.png?width=128&quality=85');
check('avatar URLs off Bloxity, or not HTTPS, are refused', ['http://static.bloxity.io/a.png', 'https://evil.example/a.png', 'https://bloxity.io.evil.example/a.png', 'javascript:alert(1)', 42, ''].every((bad) => normaliseAvatarUrl(bad) === ''));

console.log('\nballoon sizes\n');

check('the more expensive of any two balloons is never smaller', BALLOONS.every((a) => BALLOONS.every((b) => a.cost <= b.cost || a.size >= b.size)));
check('cheap balloons (100 Wins or less) are normal size', BALLOONS.filter((b) => b.cost <= 100).every((b) => b.size >= 1 && b.size <= 1.1));
check('mid-tier balloons (500-25K) are noticeably larger', BALLOONS.filter((b) => b.cost >= 500 && b.cost <= 25_000).every((b) => b.size >= 1.25 && b.size <= 2.2));
check('rare balloons (60K+) are very large', BALLOONS.filter((b) => b.cost >= 60_000).every((b) => b.size >= 2.8));
check('the rarest balloon is over five times the starter', BALLOONS.at(-1).size >= 5 * BALLOONS[0].size, `${BALLOONS.at(-1).size}`);
check('the held balloon adds its win percent', Math.abs(winsMultiplier(4, balloonMask(4), '') - 1.05) < 1e-9);

console.log('\neggs and pets\n');

check('exactly three eggs at 2, 150 and 3,500 wins', EGGS.length === 3 && [2, 150, 3_500].every((cost, i) => EGGS[i].cost === cost));
check('every egg holds four pets', EGGS.every((egg) => petsInEgg(egg.slot).length === 4));
check("every egg's chances sum to 100", EGGS.every((egg) => petsInEgg(egg.slot).reduce((s, p) => s + p.chance, 0) === 100));
check(
  'rarer pets are less likely and stronger',
  EGGS.every((egg) => {
    const pool = petsInEgg(egg.slot);
    return pool.every((p, i) => i === 0 || (p.chance < pool[i - 1].chance && p.balloons > pool[i - 1].balloons));
  }),
);
check("each egg's common pet beats the previous egg's best on balloons", EGGS.every((egg, i) => i === 0 || petsInEgg(egg.slot)[0].balloons >= petsInEgg(EGGS[i - 1].slot)[3].balloons));
check('pets have different buffs (some add wins, one adds balloons only)', PETS.some((p) => p.winsPercent === 0) && PETS.some((p) => p.winsPercent > 0));
check('the reference pets exist: Cat +2 balloons, Bird, Piggy, Bunny, Racoon, Emerald Dragon', PETS.find((p) => p.id === 'cat')?.balloons === 2 && ['bird', 'piggy', 'bunny', 'racoon', 'emerald_dragon'].every((id) => PETS.some((p) => p.id === id)));
check('pet ids are unique', new Set(PETS.map((p) => p.id)).size === PETS.length);
check('a low roll hatches the common pet', rollPet(1, () => 0)?.rarity === 'Common');
check('a top roll hatches the rarest', rollPet(3, () => 0.9999)?.rarity === 'Legendary');
{
  const counts = new Map();
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 40_000; i += 1) {
    const pet = rollPet(2, random);
    counts.set(pet.id, (counts.get(pet.id) ?? 0) + 1);
  }
  const ok = petsInEgg(2).every((pet) => Math.abs((counts.get(pet.id) ?? 0) / 40_000 - pet.chance / 100) < 0.012);
  check('rolls follow the chance table', ok, JSON.stringify([...counts]));
}
check('3 equipped, 40 owned', PET_LIMITS.maxEquipped === 3 && PET_LIMITS.maxOwned === 40);
{
  check('parsing never equips more than three', parsePets('cat*,bunny*,bird*,fox*,shark').filter((p) => p.equipped).length === 3);
  check('encoding round-trips', encodePets(parsePets('cat*,bunny')) === 'cat*,bunny');
  check('unknown pets are dropped', parsePets('nope*,cat').length === 1);
  check('duplicates are separate pets', parsePets('cat,cat,cat').length === 3);
  check('equipped pets add their balloons', petBalloonBonus('cat*,cat*,bunny') === 4);
  check('equipped pets add their win percents', petWinsPercent('bunny*,piggy*') === 15);
  check('unequipped pets add nothing', petBalloonBonus('shark') === 0 && petWinsPercent('shark') === 0);
  check('pets add to the payout', balloonsPerTick(2, balloonMask(2), 'cat*') === 1 + 1 + 2);
  check('Equip Best wears the three strongest', equippedPetIds(encodePets(equipBestPets(parsePets('cat,emerald_dragon,bird,shark,bunny')))).sort().join() === 'bird,emerald_dragon,shark');
  check('the bonuses multiply win rewards', resolveWinReward(100, 4, balloonMask(4), 'piggy*') === 115);
  check('a win reward saturates at MAX_WINS', resolveWinReward(MAX_WINS, 18, balloonMask(18), 'emerald_dragon*,emerald_dragon*') === MAX_WINS);
}

console.log('\nwin rewards\n');

check('first win area: 17 studs, +5', WIN_AREAS[0].studs === 17 && WIN_AREAS[0].wins === 5);
check('second: 50 studs, about +25', WIN_AREAS[1].studs === 50 && WIN_AREAS[1].wins === 25);
check('rewards and heights both climb', increasing(WIN_AREAS.map((a) => a.wins)) && increasing(WIN_AREAS.map((a) => a.studs)));
{
  const topRun = resolveWinReward(WIN_AREAS.at(-1).wins, 17, balloonMask(17), 'emerald_dragon*,emerald_dragon*,emerald_dragon*');
  check('the Jaguar is a real but reachable goal: a Mammoth top run pays a fifth of it, never all of it', topRun * 5 >= BALLOONS.at(-1).cost && topRun < BALLOONS.at(-1).cost, `${topRun}`);
}
check('the third egg is affordable from the 300-stud area', WIN_AREAS.find((a) => a.studs === 300).wins >= EGGS[2].cost);

console.log('\nformatting\n');

check('formatNumber', formatNumber(940) === '940' && formatNumber(1560) === '1.56K' && formatNumber(800e9) === '800B', [940, 1560, 800e9].map(formatNumber).join(' '));
check('formatDuration', formatDuration(43 * 3600 + 32 * 60 + 48) === '43h 32m 48s' && formatDuration(125) === '2m 5s');
check('formatClock', formatClock(4) === '00:00:04' && formatClock(3.2) === '00:00:04');

console.log(`\n${failures === 0 ? 'progression verified' : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
