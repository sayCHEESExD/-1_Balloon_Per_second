/**
 * The server's decisions, exercised without a server.
 *
 * Every rule here is about somebody's balloons, Wins or pets, and the failure
 * mode of getting one wrong is a player paid twice, charged twice, or granted
 * something from across the map. The REJECTION paths are tested as carefully
 * as the happy ones.
 *
 * Run with `npm run verify:services`.
 */
import {
  BALLOONS,
  BALLOON_TICK_SECONDS,
  EGGS,
  EGG_AREA,
  PET_LIMITS,
  WIN_PADS,
  balloonMask,
  eggPedestalCentre,
  climbHeightFor,
  reachYFor,
} from '../shared/dist/index.js';
import { BalloonService } from '../server/dist/progression/BalloonService.js';
import { BalloonShopService } from '../server/dist/progression/BalloonShopService.js';
import { PetService } from '../server/dist/progression/PetService.js';
import { wallet } from '../server/dist/progression/Wallet.js';
import { WinService } from '../server/dist/progression/WinService.js';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};

/** A stand-in for the replicated schema: the services only read and write fields. */
const makePlayer = (over = {}) => ({
  sessionId: `p${Math.random()}`,
  x: 0, y: 0, z: -12, grounded: true,
  balloons: 0, wins: 0, playSeconds: 0, balloonsPerTick: 1, reachY: 1.6, climbHeight: 0,
  ownedBalloons: 1, equippedBalloon: 1, pets: '',
  ...over,
});

const balloons = new BalloonService();
const atEgg = (slot) => ({ x: eggPedestalCentre(slot).x, y: 0, z: (EGG_AREA.zoneMinZ + EGG_AREA.zoneMaxZ) / 2 });

console.log('\nballoons over time\n');
{
  const player = makePlayer();
  balloons.initialise(player);
  for (let i = 0; i < 98; i += 1) balloons.tick(player, 0.05);
  check('nothing is paid before 5 seconds', player.balloons === 0, `${player.balloons}`);
  for (let i = 0; i < 3; i += 1) balloons.tick(player, 0.05);
  check('+1 balloon at 5 seconds', player.balloons === 1, `${player.balloons}`);
  for (let i = 0; i < 20 * 60; i += 1) balloons.tick(player, 0.05);
  check('a minute pays 12', player.balloons === 13, `${player.balloons}`);
  check('the climb height and the reach follow the balloons', player.climbHeight === climbHeightFor(13, 1) && player.reachY === reachYFor(player.climbHeight));
  const stalled = makePlayer();
  balloons.initialise(stalled);
  balloons.tick(stalled, 1e6);
  check('a stalled clock pays a few payouts, never a million', stalled.balloons > 0 && stalled.balloons <= 4, `${stalled.balloons}`);
  const boosted = makePlayer({ ownedBalloons: 1 | balloonMask(3), equippedBalloon: 3, pets: 'cat*,bunny*' });
  balloons.initialise(boosted);
  check('the payout adds the held balloon and the pets', boosted.balloonsPerTick === 1 + BALLOONS[2].balloons + 2 + 3, `${boosted.balloonsPerTick}`);
  balloons.tick(boosted, BALLOON_TICK_SECONDS);
  check('and is paid in full', boosted.balloons === boosted.balloonsPerTick);
  const huge = makePlayer({ balloons: Number.MAX_SAFE_INTEGER - 1 });
  balloons.grant(huge, 1e12);
  check('a huge grant saturates', huge.balloons === Number.MAX_SAFE_INTEGER);
  check('bad grants are ignored', balloons.grant(makePlayer(), Number.NaN) === 0 && balloons.grant(makePlayer(), -4) === 0);
}

console.log('\nthe balloon shop\n');
{
  const shop = new BalloonShopService();
  const player = makePlayer({ wins: 9 });
  balloons.initialise(player);
  check('an unknown balloon is refused', shop.buy(player, 99, balloons) === 'unknown-balloon');
  check('the Yellow Balloon is already owned', shop.buy(player, 1, balloons) === 'already-owned');
  check('Blue cannot be bought with 9 wins', shop.buy(player, 2, balloons) === 'too-poor' && player.wins === 9);
  check('an unowned balloon cannot be equipped', shop.equip(player, 2, balloons) === 'not-owned' && player.equippedBalloon === 1);
  player.wins = 60;
  check('Blue sells at 10', shop.buy(player, 2, balloons) === null && player.wins === 50);
  check('and goes straight into the hand', player.equippedBalloon === 2 && player.balloonsPerTick === 2);
  player.balloons = 100;
  balloons.syncDerived(player);
  check('its climb multiplier applies at once (100 balloons count as 110)', Math.abs(player.climbHeight - climbHeightFor(110, 1)) < 1e-6);
  check('it cannot be bought twice', shop.buy(player, 2, balloons) === 'already-owned' && player.wins === 50);
  check('Red sells at exactly 50', shop.buy(player, 3, balloons) === null && player.wins === 0);
  check('an owned balloon can be re-equipped', shop.equip(player, 2, balloons) === null && player.equippedBalloon === 2);
  check('wearing a weaker balloon keeps the best multiplier (Red: 100 count as 120)', Math.abs(player.climbHeight - climbHeightFor(120, 1)) < 1e-6);
  check('the starter can always be equipped', shop.equip(player, 1, balloons) === null && player.balloonsPerTick === 1);
  const rich = makePlayer({ wins: 5_000_000 });
  balloons.initialise(rich);
  check('the Jaguar sells at 5M', shop.buy(rich, 18, balloons) === null && rich.wins === 0 && rich.equippedBalloon === 18);
}

console.log('\neggs and pets\n');
{
  let roll = 0;
  const pets = new PetService(() => roll);
  const player = makePlayer({ wins: 100_000 });
  balloons.initialise(player);

  check('an egg cannot be hatched away from it', pets.hatch(player, 1, balloons).reason === 'not-at-egg');
  Object.assign(player, atEgg(2));
  check("standing at egg 2 does not hatch egg 1", pets.hatch(player, 1, balloons).reason === 'not-at-egg');
  check('an unknown egg is refused', pets.hatch(player, 9, balloons).reason === 'unknown-egg');
  Object.assign(player, atEgg(1));
  player.wins = 1;
  check('an egg cannot be hatched without the Wins', pets.hatch(player, 1, balloons).reason === 'too-poor' && player.wins === 1);
  player.wins = 100_000;

  const first = pets.hatch(player, 1, balloons);
  check('a hatch rolls a pet from that egg', first.pet?.id === 'cat');
  check('its price is deducted', player.wins === 100_000 - EGGS[0].cost);
  check('the new pet is equipped while there is room', player.pets === 'cat*');
  check('and adds to the balloon payout', player.balloonsPerTick === 3, `${player.balloonsPerTick}`);

  roll = 0.9999;
  check('a lucky roll hatches the rarest', pets.hatch(player, 1, balloons).pet?.id === 'racoon');
  roll = 0.7;
  pets.hatch(player, 1, balloons);
  roll = 0.1;
  pets.hatch(player, 1, balloons);
  check('a fourth pet is kept but not equipped', player.pets.split(',').length === 4 && player.pets.split('*').length - 1 === PET_LIMITS.maxEquipped, player.pets);
  check('equipping past three is refused', pets.toggle(player, 3, balloons) === 'equip-limit');
  check('a pet can be unequipped', pets.toggle(player, 0, balloons) === null && !player.pets.startsWith('cat*'));
  check('Equip Best wears the strongest', (pets.equipBest(player, balloons), player.pets.includes('racoon*')));
  const before = player.balloonsPerTick;
  check('a pet can be deleted', pets.remove(player, 1, balloons) === null && player.pets.split(',').length === 3);
  check('deleting an equipped pet lowers the payout', player.balloonsPerTick < before);
  check('deleting a missing index is refused', pets.remove(player, 12, balloons) === 'bad-index');

  const full = makePlayer({ ...atEgg(3), wins: 1e9, pets: Array.from({ length: PET_LIMITS.maxOwned }, () => 'cat').join(',') });
  check('a full inventory refuses and charges nothing', pets.hatch(full, 3, balloons).reason === 'inventory-full' && full.wins === 1e9);
}

console.log('\nwin pads: once per attempt\n');
{
  const wins = new WinService();
  const pad = WIN_PADS[1];
  const onPad = { x: (pad.minX + pad.maxX) / 2, y: pad.maxY, z: (pad.minZ + pad.maxZ) / 2 };
  const player = makePlayer();

  check('a claim from spawn is refused', wins.claim(player, 2, 0).reason === 'not-on-pad');
  Object.assign(player, onPad);
  check('a claim for a different area is refused', wins.claim(player, 1, 0).reason === 'not-on-pad');
  check('an unknown area is refused', wins.claim(player, 99, 0).reason === 'unknown-area');
  check('a fractional area is refused', wins.claim(player, 1.5, 0).reason === 'unknown-area');
  check('a claim mid-air is refused', wins.claim(makePlayer({ ...onPad, grounded: false }), 2, 0).reason === 'not-on-pad');
  check('a claim from far below the pad is refused', wins.claim(makePlayer({ ...onPad, y: 0 }), 2, 0).reason === 'not-on-pad');
  check('and nothing was paid', player.wins === 0);

  check('standing on the pad pays', wins.claim(player, 2, 10_000).granted === true);
  check(`the 50-stud pad pays exactly ${pad.wins}`, player.wins === pad.wins, `wins=${player.wins}`);
  check('standing on it again pays nothing this attempt', wins.claim(player, 2, 60_000).reason === 'already-claimed' && player.wins === pad.wins);

  const next = WIN_PADS[2];
  Object.assign(player, { x: (next.minX + next.maxX) / 2, y: next.maxY, z: (next.minZ + next.maxZ) / 2 });
  check('a second pad inside the cooldown is refused', wins.claim(player, 3, 10_500).reason === 'cooldown');

  wins.startAttempt(player.sessionId);
  Object.assign(player, onPad);
  check('a new attempt (placed at spawn) can claim the pad again', wins.claim(player, 2, 70_000).granted === true && player.wins === pad.wins * 2);

  const lucky = makePlayer({ ...onPad, ownedBalloons: 1 | balloonMask(4), equippedBalloon: 4, pets: 'piggy*' });
  new WinService().claim(lucky, 2, 0);
  check('the held balloon and equipped pets multiply the reward', lucky.wins === Math.floor(pad.wins * 1.15), `wins=${lucky.wins}`);
  const lazy = makePlayer({ ...onPad, pets: 'piggy' });
  new WinService().claim(lazy, 2, 0);
  check('an unequipped pet multiplies nothing', lazy.wins === pad.wins);
}

console.log('\nthe wallet\n');
{
  const player = makePlayer({ wins: 10 });
  check('spend what you have', wallet.spend(player, 10) === true && player.wins === 0);
  check('cannot spend what you do not have', wallet.spend(player, 1) === false && player.wins === 0);
  wallet.add(player, Number.NaN);
  wallet.add(player, -5);
  check('bad credits are ignored', player.wins === 0);
  player.wins = Number.MAX_SAFE_INTEGER - 5;
  wallet.add(player, 1e12);
  check('a huge award saturates', player.wins === Number.MAX_SAFE_INTEGER);
}

console.log(`\n${failures === 0 ? 'services verified' : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
