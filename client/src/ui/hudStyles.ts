/**
 * One stylesheet for the whole HUD, injected on first use, so the rail, the
 * counters and every panel share one look: heavy white display type with a
 * dark rim, saturated gradient buttons with chunky borders and a gloss.
 * (No backticks inside - the stylesheet is a template literal.)
 */
let injected = false;

export const injectHudStyles = (): void => {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = `
:root { --hj-ink: #12181f; }
.hj-font { font-family: "Arial Black", "Arial Bold", Arial, system-ui, sans-serif; }
.hj-outline {
  color: #fff;
  text-shadow:
    3px 0 0 var(--hj-ink), -3px 0 0 var(--hj-ink), 0 3px 0 var(--hj-ink), 0 -3px 0 var(--hj-ink),
    2px 2px 0 var(--hj-ink), -2px 2px 0 var(--hj-ink), 2px -2px 0 var(--hj-ink), -2px -2px 0 var(--hj-ink),
    0 5px 9px rgba(0, 0, 0, 0.35);
}
.hj-icon { pointer-events: none; }

/* ---- Wins, upper centre ---- */
.hj-wins {
  position: fixed; top: max(10px, env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; padding: 3px 22px 3px 8px; z-index: 22;
  pointer-events: none; user-select: none; border: 4px solid var(--hj-ink); border-radius: 14px;
  background: linear-gradient(180deg, #fff27a 0%, #ffd23d 45%, #f5b400 100%);
  box-shadow: inset 0 -5px 0 rgba(0,0,0,.14), 0 5px 12px rgba(0,0,0,.35);
}
.hj-wins__icon { width: clamp(32px, 3.4vw, 46px); height: clamp(32px, 3.4vw, 46px); }
.hj-wins__icon .hj-icon { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 3px 3px rgba(0,0,0,.35)); }
.hj-wins__value { font-size: clamp(22px, 2.8vw, 38px); line-height: 1.1; }
.hj-wins--pop { animation: hj-pop 520ms ease-out; }
@keyframes hj-pop { 0% { transform: translateX(-50%) scale(1); } 35% { transform: translateX(-50%) scale(1.14); } 100% { transform: translateX(-50%) scale(1); } }

/* ---- Left rail: wide glossy buttons ---- */
.hj-rail {
  position: fixed; left: max(14px, env(safe-area-inset-left, 0px)); top: 50%; transform: translateY(-50%);
  display: flex; flex-direction: column; gap: 14px; z-index: 21; user-select: none;
}
.hj-tile {
  position: relative; width: clamp(150px, 14vw, 206px); height: clamp(52px, 5.6vw, 70px);
  border: 4px solid var(--hj-ink); border-radius: 14px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; padding: 0 0 0 clamp(34px, 3.4vw, 50px); color: #fff; overflow: visible;
  box-shadow: inset 0 -6px 0 rgba(0,0,0,.2), 0 6px 10px rgba(0,0,0,.32); transition: transform 110ms ease;
}
.hj-tile::before {
  content: ""; position: absolute; left: 6px; right: 6px; top: 4px; height: 36%; border-radius: 9px;
  background: linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,.08)); pointer-events: none;
}
.hj-tile:hover { transform: scale(1.05); }
.hj-tile:active { transform: scale(0.96); }
.hj-tile .hj-icon {
  position: absolute; left: -6px; top: 50%; transform: translateY(-50%); height: 118%; width: auto;
  filter: drop-shadow(0 3px 3px rgba(0,0,0,.35));
}
.hj-tile svg.hj-icon { height: 76%; left: 6px; }
.hj-tile__label { position: relative; font-size: clamp(15px, 1.6vw, 23px); white-space: nowrap; pointer-events: none; letter-spacing: .5px; }
.hj-tile__key {
  position: absolute; left: -8px; top: -9px; min-width: 22px; height: 22px; padding: 0 4px; box-sizing: border-box;
  border: 3px solid var(--hj-ink); border-radius: 7px; background: #fff; color: var(--hj-ink);
  font-size: 12px; line-height: 16px; text-align: center; pointer-events: none; z-index: 1;
}
body.hj-touch-mode .hj-tile__key { display: none; }
.hj-tile__badge {
  position: absolute; right: -9px; top: -9px; width: 24px; height: 24px; border: 3px solid var(--hj-ink);
  border-radius: 50%; background: #f5262f; color: transparent; font-size: 0; display: none;
}
.hj-tile--ready .hj-tile__badge { display: block; }
.hj-tile--balloons { background: linear-gradient(180deg, #7ff0ff, #25c4f5 55%, #0f95d6); }
.hj-tile--pets { background: linear-gradient(180deg, #ff9df4, #f04fe0 55%, #c02ac4); }
.hj-tile--audio { background: linear-gradient(180deg, #d9dde2, #a9b0b8 55%, #7f8791); }
.hj-tile--off { filter: saturate(.25) brightness(.72); }

/* ---- Bottom: the balloon meter ---- */
.hj-meter {
  position: fixed; left: 50%; bottom: max(3vh, env(safe-area-inset-bottom, 0px)); transform: translateX(-50%);
  width: min(600px, 60vw); pointer-events: none; user-select: none; z-index: 20;
}
.hj-meter__stats { display: flex; justify-content: space-between; align-items: flex-end; margin: 0 10px 2px; gap: 10px; }
.hj-meter__count { font-size: clamp(15px, 1.7vw, 22px); white-space: nowrap; display: flex; align-items: center; gap: 4px; }
.hj-meter__count .hj-icon { height: 1.3em; width: auto; }
.hj-meter__next { font-size: clamp(12px, 1.3vw, 17px); color: #ffe14d; white-space: nowrap; }
.hj-meter__next--top { color: #7dff5c; }
.hj-meter__info { display: flex; align-items: center; justify-content: center; gap: clamp(10px, 2vw, 26px); margin-bottom: 6px; font-size: clamp(16px, 2vw, 26px); }
.hj-meter__info svg { height: 1.25em; width: auto; }
.hj-meter__clock, .hj-meter__gain { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.hj-meter__track { position: relative; margin-left: clamp(18px, 2.4vw, 30px); }
.hj-meter__bar {
  position: relative; height: clamp(30px, 3.8vw, 46px); border-radius: 999px; border: 5px solid var(--hj-ink);
  overflow: hidden; background: #5d636b; box-shadow: 0 5px 12px rgba(0,0,0,.4);
}
.hj-meter__fill {
  position: absolute; inset: 0 auto 0 0; width: 0%;
  background: linear-gradient(180deg, #6fe6ff 0%, #10b4f5 60%, #0a8fd1 100%);
  box-shadow: inset 0 -4px 0 rgba(0,0,0,.15);
}
.hj-meter__fill::after { content: ""; position: absolute; left: 8px; right: 8px; top: 4px; height: 28%; border-radius: 99px; background: rgba(255,255,255,.35); }
.hj-meter__balloon { position: absolute; left: clamp(-40px, -3.4vw, -26px); top: 50%; transform: translateY(-58%); height: 190%; width: auto; filter: drop-shadow(0 3px 3px rgba(0,0,0,.35)); z-index: 1; }
.hj-meter--payout .hj-meter__bar { animation: hj-bar-pop 420ms ease-out; }
@keyframes hj-bar-pop { 0% { transform: scale(1); } 35% { transform: scale(1.035); } 100% { transform: scale(1); } }
body.hj-touch-mode .hj-meter { bottom: calc(2vh + 112px); width: min(520px, 62vw); }

/* ---- Key hints (desktop) ---- */
.hj-keys {
  position: fixed; right: max(14px, env(safe-area-inset-right, 0px)); top: max(104px, env(safe-area-inset-top, 0px)); z-index: 20;
  display: flex; flex-direction: column; gap: 6px; align-items: flex-end; pointer-events: none; font-size: 13px;
}
.hj-keys span { background: rgba(10,16,28,.55); color: #fff; border-radius: 9px; padding: 4px 9px; }
.hj-keys b { display: inline-block; min-width: 18px; padding: 0 5px; margin-right: 5px; border-radius: 5px; background: #fff; color: var(--hj-ink); text-align: center; }
body.hj-touch-mode .hj-keys { display: none; }

/* ---- Banner ---- */
.hj-banner {
  position: fixed; top: 20%; left: 50%; transform: translateX(-50%); z-index: 25; pointer-events: none;
  font-size: clamp(28px, 5vw, 64px); color: #ffd23d; white-space: nowrap; opacity: 0;
}
.hj-banner--run { animation: hj-banner 1700ms ease-out forwards; }
@keyframes hj-banner {
  0% { opacity: 0; transform: translateX(-50%) scale(.6); }
  15% { opacity: 1; transform: translateX(-50%) scale(1.12); }
  25% { transform: translateX(-50%) scale(1); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
}

/* ---- "+7" balloon popups ---- */
.hj-pops { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 19; }
.hj-pop { --hj-pop-tilt: 0deg; position: absolute; display: flex; align-items: center; gap: 2px; opacity: 0; }
.hj-pop[hidden] { display: none; }
.hj-pop__icon { height: clamp(40px, 4.4vw, 60px); width: auto; filter: drop-shadow(0 3px 5px rgba(0,0,0,.4)); }
.hj-pop__value { font-size: clamp(26px, 3.2vw, 46px); line-height: 1; }
.hj-pop--run { animation: hj-pop-float 1300ms ease-out forwards; }
@keyframes hj-pop-float {
  0% { opacity: 0; transform: translate(-50%, -30%) rotate(var(--hj-pop-tilt)) scale(.5); }
  15% { opacity: 1; transform: translate(-50%, -50%) rotate(var(--hj-pop-tilt)) scale(1.15); }
  30% { opacity: 1; transform: translate(-50%, -60%) rotate(var(--hj-pop-tilt)) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -170%) rotate(var(--hj-pop-tilt)) scale(1); }
}

/* ---- Panels ---- */
.hj-panel { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(6,10,18,.35); z-index: 40; }
.hj-panel[hidden] { display: none; }
.hj-panel__box {
  position: relative; width: min(600px, 92vw); max-height: 86vh; display: flex; flex-direction: column;
  border: 5px solid var(--hj-ink); border-radius: 22px; background-color: #ffffff;
  box-shadow: 0 18px 40px rgba(0,0,0,.5);
}
.hj-panel__head { display: flex; align-items: center; gap: 10px; padding: 8px 60px 4px 18px; font-size: clamp(26px, 3.4vw, 44px); }
.hj-panel__head img, .hj-panel__head svg { height: 1.4em; width: 1.4em; object-fit: contain; flex: none; }
.hj-panel__close {
  position: absolute; right: -16px; top: -18px; width: 52px; height: 52px; border: 4px solid var(--hj-ink); border-radius: 12px;
  background: linear-gradient(180deg, #ff8a8a, #f5363f 55%, #c41c25); font-size: 26px; line-height: 1; color: #fff; cursor: pointer;
  box-shadow: inset 0 -4px 0 rgba(0,0,0,.2), 0 4px 8px rgba(0,0,0,.35); z-index: 3;
  text-shadow: 2px 0 0 var(--hj-ink), -2px 0 0 var(--hj-ink), 0 2px 0 var(--hj-ink), 0 -2px 0 var(--hj-ink);
}
.hj-panel__body { padding: 8px 16px 18px; overflow-y: auto; color: #16202b; font-family: system-ui, "Segoe UI", Roboto, sans-serif; }

.hj-btn {
  position: relative; border: 4px solid var(--hj-ink); border-radius: 14px; padding: 8px 16px; color: #fff; cursor: pointer;
  font-size: clamp(15px, 1.7vw, 22px); white-space: nowrap; box-shadow: inset 0 -5px 0 rgba(0,0,0,.2);
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  text-shadow: 2px 0 0 var(--hj-ink), -2px 0 0 var(--hj-ink), 0 2px 0 var(--hj-ink), 0 -2px 0 var(--hj-ink);
}
.hj-btn img { height: 1.35em; width: auto; }
.hj-btn:disabled { filter: saturate(.3) brightness(.85); cursor: not-allowed; }
.hj-btn--green { background: linear-gradient(180deg, #9bff6a, #3fd82e 60%, #28a81f); }
.hj-btn--gold { background: linear-gradient(180deg, #ffe16b, #ffb52b 55%, #e08410); }
.hj-btn--red { background: linear-gradient(180deg, #ff8a8a, #f5363f 60%, #c41c25); }

/* ---- Inventory menus: Balloons (cyan) and Pets (magenta), as in the reference ---- */
.hj-panel--balloons .hj-panel__box, .hj-panel--pets .hj-panel__box {
  width: min(940px, 95vw); background: linear-gradient(180deg, #56e4ff, #1bb4ec); border-width: 6px; overflow: visible;
}
.hj-panel--pets .hj-panel__box { background: linear-gradient(180deg, #ff8ff2, #d935df); }
.hj-panel--balloons .hj-panel__head, .hj-panel--pets .hj-panel__head {
  position: absolute; left: -14px; top: -46px; padding: 0; transform: rotate(-4deg); z-index: 2;
  font-size: clamp(36px, 5.4vw, 66px); letter-spacing: 1px;
}
.hj-panel--balloons .hj-panel__body, .hj-panel--pets .hj-panel__body { padding: 34px 14px 14px; overflow: visible; font-family: inherit; }
.hj-inv { display: grid; grid-template-columns: minmax(0, 1fr) clamp(200px, 26vw, 270px); gap: 14px; align-items: start; }
.hj-inv__main {
  position: relative; border: 4px solid rgba(0,0,0,.28); border-radius: 18px; background: rgba(0,48,92,.22); padding: 12px;
}
.hj-panel--pets .hj-inv__main { background: rgba(80,0,90,.25); }
.hj-inv__wins { position: absolute; left: 50%; top: -24px; transform: translateX(-50%); font-size: clamp(18px, 2.2vw, 28px); color: #ffe14d; white-space: nowrap; }
.hj-inv__grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(96px, 11vw, 132px), 1fr)); gap: 10px;
  max-height: min(50vh, 420px); overflow-y: auto; padding: 6px 4px 4px; align-content: start;
}
.hj-inv__card {
  position: relative; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
  aspect-ratio: 1 / 1.08; padding: 6px 4px 5px; cursor: pointer; border: 4px solid var(--hj-ink); border-radius: 14px;
  background: linear-gradient(180deg, #ffffff, #e4e7ec); box-shadow: inset 0 -5px 0 rgba(0,0,0,.08);
}
.hj-inv__card--locked { background: linear-gradient(180deg, #a9adb3, #858a91); }
.hj-inv__card--sel { outline: 4px solid #ffe14d; outline-offset: 1px; }
.hj-inv__name { font-size: clamp(12px, 1.3vw, 16px); white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.hj-inv__img { flex: 1 1 auto; min-height: 0; width: 86%; object-fit: contain; filter: drop-shadow(0 3px 3px rgba(0,0,0,.25)); }
.hj-inv__swatch { flex: 1 1 auto; width: 62%; margin: 6px 0; border-radius: 50%; border: 3px solid rgba(0,0,0,.25); }
.hj-inv__foot { display: flex; align-items: center; gap: 4px; font-size: clamp(12px, 1.3vw, 16px); white-space: nowrap; }
.hj-inv__foot img { height: 1.3em; width: auto; }
.hj-inv__foot--gold { color: #ffe14d; }
.hj-inv__foot--green { color: #3dff4f; }
.hj-inv__check {
  position: absolute; right: -8px; top: -8px; width: 30px; height: 30px; border: 3px solid var(--hj-ink); border-radius: 8px;
  background: linear-gradient(180deg, #7dff5c, #2fc42a); color: #fff; font-size: 17px; line-height: 24px; text-align: center;
}
.hj-inv__footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; flex-wrap: wrap; font-size: clamp(15px, 1.7vw, 21px); }
.hj-inv__footer span { display: flex; align-items: center; gap: 6px; }
.hj-inv__footer svg { height: 1.5em; width: 1.5em; }
.hj-inv__empty { grid-column: 1 / -1; text-align: center; margin: 60px 0; font-size: 18px; }
.hj-inv__side {
  border: 5px solid var(--hj-ink); border-radius: 18px; padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 10px;
  background: linear-gradient(180deg, #19b3dc, #0b86b8); box-shadow: inset 0 0 0 4px rgba(255,255,255,.18);
}
.hj-panel--pets .hj-inv__side { background: linear-gradient(180deg, #d84fdc, #a226b0); }
.hj-inv__side-name { font-size: clamp(18px, 2.2vw, 28px); text-align: center; }
.hj-inv__side-art { width: 78%; aspect-ratio: 1; border: 4px solid var(--hj-ink); border-radius: 16px; background: linear-gradient(180deg, #ffffff, #e4e7ec); display: grid; place-items: center; overflow: hidden; }
.hj-inv__side-art img { width: 92%; height: 92%; object-fit: contain; }
.hj-inv__stats { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; font-size: clamp(16px, 1.9vw, 24px); }
.hj-inv__stats span { display: flex; align-items: center; gap: 3px; white-space: nowrap; }
.hj-inv__stats svg, .hj-inv__stats img { height: 1.2em; width: auto; }
.hj-inv__actions { display: flex; gap: 8px; width: 100%; }
.hj-inv__actions .hj-btn { flex: 1 1 auto; }
.hj-inv__actions .hj-btn--red { flex: 0 0 auto; padding: 8px 12px; }
.hj-inv__hint { font-size: 14px; text-align: center; }

/* ---- Egg menu ---- */
.hj-panel--egg .hj-panel__box { width: min(640px, 94vw); background: linear-gradient(180deg, #ffe37a, #ffb52b); }
.hj-egg__top { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
.hj-egg__shell { width: 64px; height: 82px; flex: none; border-radius: 50% 50% 46% 46% / 60% 60% 40% 40%; border: 4px solid var(--hj-ink); box-shadow: inset 8px 10px 0 rgba(255,255,255,.35); }
.hj-egg__name { font-size: clamp(22px, 2.8vw, 34px); }
.hj-egg__price { font-size: clamp(15px, 1.7vw, 20px); color: #fff36b; display: flex; align-items: center; gap: 4px; }
.hj-egg__price img { height: 1.3em; }
.hj-egg__pets { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
.hj-egg__pets .hj-inv__card { cursor: default; aspect-ratio: auto; min-height: 150px; }
.hj-egg__chance { font-size: clamp(13px, 1.4vw, 17px); }
.hj-egg__bonus { font-size: 12px; color: #1b2433; font-family: system-ui, sans-serif; font-weight: 800; text-align: center; line-height: 1.2; }
.hj-egg__actions { display: flex; justify-content: center; }
.hj-egg__note { text-align: center; margin-top: 10px; font-weight: 800; color: #5a3a00; font-family: system-ui, sans-serif; }

/* ---- Hatch reveal ---- */
.hj-hatch { position: fixed; inset: 0; z-index: 45; display: grid; place-items: center; background: radial-gradient(circle, rgba(20,24,40,.55), rgba(6,8,16,.8)); cursor: pointer; }
.hj-hatch[hidden] { display: none; }
.hj-hatch__stage { position: relative; display: grid; place-items: center; }
.hj-hatch__egg { width: clamp(150px, 22vmin, 220px); height: clamp(190px, 28vmin, 280px); border-radius: 50% 50% 46% 46% / 60% 60% 40% 40%; border: 6px solid var(--hj-ink); box-shadow: inset 20px 24px 0 rgba(255,255,255,.3); }
.hj-hatch__egg--shake { animation: hj-egg-shake 1100ms ease-in forwards; }
@keyframes hj-egg-shake {
  0% { transform: rotate(0) scale(.6); } 12% { transform: rotate(0) scale(1); }
  25% { transform: rotate(-10deg); } 35% { transform: rotate(10deg); } 45% { transform: rotate(-14deg); } 55% { transform: rotate(14deg); }
  65% { transform: rotate(-18deg) scale(1.05); } 75% { transform: rotate(18deg) scale(1.08); } 88% { transform: rotate(-6deg) scale(1.15); }
  100% { transform: rotate(0) scale(1.3); opacity: 0; }
}
.hj-hatch__flash { position: absolute; width: 140vmax; height: 140vmax; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,240,180,.7) 18%, rgba(255,255,255,0) 45%); opacity: 0; pointer-events: none; }
.hj-hatch__flash--run { animation: hj-flash 700ms ease-out forwards; }
@keyframes hj-flash { 0% { opacity: 0; transform: scale(.2); } 30% { opacity: 1; } 100% { opacity: 0; transform: scale(1); } }
.hj-hatch__card[hidden], .hj-hatch__egg[hidden] { display: none; }
.hj-hatch__card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px 26px 20px; border: 6px solid var(--hj-ink); border-radius: 24px; background: linear-gradient(180deg, #ffffff, #dfe4ec); box-shadow: 0 0 0 6px var(--hj-rarity, #9ca3af), 0 20px 50px rgba(0,0,0,.5); }
.hj-hatch__card--run { animation: hj-card-in 520ms cubic-bezier(.2, 1.6, .4, 1) forwards; }
@keyframes hj-card-in { 0% { transform: scale(.2) rotate(-12deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
.hj-hatch__art { width: clamp(150px, 24vmin, 220px); height: clamp(150px, 24vmin, 220px); object-fit: contain; }
.hj-hatch__name { font-size: clamp(28px, 4vw, 48px); }
.hj-hatch__rarity { font-size: clamp(18px, 2.4vw, 28px); }
.hj-hatch__stats { font-size: clamp(16px, 2vw, 22px); display: flex; gap: 16px; }
.hj-hatch__tap { color: #fff; font-size: 14px; margin-top: 16px; opacity: .8; font-family: system-ui, sans-serif; }

/* ---- Bloxity account chip, top right (key hints sit below it) ---- */
.hj-account {
  position: fixed; top: max(12px, env(safe-area-inset-top, 0px)); right: max(12px, env(safe-area-inset-right, 0px));
  z-index: 23; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
}
.hj-account__row { display: flex; align-items: center; gap: 8px; padding: 4px 10px 4px 4px; border: 3px solid var(--hj-ink); border-radius: 999px; background: rgba(18, 24, 38, 0.82); }
.hj-account__pfp { width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--hj-ink); object-fit: cover; }
.hj-account__name { font-size: clamp(12px, 1.2vw, 15px); color: #fff; max-width: 22vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hj-account__note { font-size: clamp(10px, 1vw, 13px); color: #fff; opacity: .75; }
.hj-account__actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.hj-account__btn, .hj-account__login {
  cursor: pointer; border: 3px solid var(--hj-ink); border-radius: 10px; padding: 5px 10px;
  font-size: clamp(11px, 1.1vw, 14px); color: #fff; box-shadow: 0 3px 0 rgba(0,0,0,.3);
  background: linear-gradient(180deg, #6de6ff 0%, #2aa8f5 55%, #1670d0 100%);
  text-shadow: 1px 0 0 var(--hj-ink), -1px 0 0 var(--hj-ink), 0 1px 0 var(--hj-ink), 0 -1px 0 var(--hj-ink);
}
.hj-account__login { background: linear-gradient(180deg, #ffd76b 0%, #ffa32b 55%, #d97708 100%); padding: 7px 14px; }
.hj-account__btn:hover, .hj-account__login:hover { filter: brightness(1.1); }
body.hj-touch-mode .hj-account__name { max-width: 30vw; }

/* Friends, Bux and avatar panels */
.hj-panel__note { margin: 4px 0 12px; line-height: 1.5; }
.hj-action {
  width: 100%; margin-top: 8px; padding: 11px; border: 4px solid var(--hj-ink); border-radius: 14px;
  background: linear-gradient(180deg, #58e06a, #2fae42); color: #fff; font-size: 17px; cursor: pointer;
}
.hj-action:disabled { background: linear-gradient(180deg, #b9c2cc, #93a0ad); cursor: not-allowed; }
.hj-friend, .hj-bux { display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 2px solid rgba(43,60,88,.16); }
.hj-friend:last-of-type, .hj-bux:last-of-type { border-bottom: none; }
.hj-friend__pfp { width: 34px; height: 34px; border-radius: 50%; border: 2px solid var(--hj-ink); object-fit: cover; flex: none; }
.hj-friend__name, .hj-bux__text { display: flex; flex-direction: column; line-height: 1.25; flex: 1 1 auto; min-width: 0; }
.hj-friend__name b, .hj-friend__name small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hj-friend__name small, .hj-bux__text small { opacity: .65; }
.hj-friend__status { font-size: 12px; opacity: .75; flex: none; }
.hj-friend__invite, .hj-bux__buy {
  cursor: pointer; flex: none; border: 3px solid var(--hj-ink); border-radius: 9px; padding: 5px 11px;
  color: #fff; font-size: 13px; background: linear-gradient(180deg, #9bf06a 0%, #4fce2e 60%, #37a81f 100%);
}
.hj-bux__buy { background: linear-gradient(180deg, #ffd76b 0%, #ffa32b 55%, #d97708 100%); }
.hj-friend__invite:disabled, .hj-bux__buy:disabled { filter: saturate(.3) brightness(.85); cursor: default; }
.hj-slider { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 13px; }
.hj-slider input { width: 100%; accent-color: #b44bff; }

/* FPS readout (Bloxity show_fps) */
.hj-fps {
  position: fixed; right: max(12px, env(safe-area-inset-right, 0px)); bottom: max(12px, env(safe-area-inset-bottom, 0px));
  z-index: 23; padding: 3px 8px; border-radius: 8px; background: rgba(10,16,28,.6); color: #b8ff5c; font-size: 13px; pointer-events: none;
}

/* Phones on their side: the rail becomes a row across the top-left. */
@media (orientation: landscape) and (max-height: 500px) {
  .hj-rail { top: max(8px, env(safe-area-inset-top, 0px)); transform: none; flex-direction: row; gap: 10px; }
  .hj-tile { width: 118px; height: 42px; }
  .hj-tile__label { font-size: 13px; }
  body.hj-touch-mode .hj-meter { bottom: 8px; width: 44vw; }
  .hj-panel__box { max-height: 94vh; }
  .hj-inv__grid { max-height: 44vh; }
}
@media (max-width: 640px) {
  .hj-rail { top: 26%; gap: 10px; }
  .hj-tile { width: 122px; height: 44px; }
  .hj-tile__label { font-size: 13px; }
  body.hj-touch-mode .hj-meter { width: 74vw; bottom: calc(2vh + 124px); }
  .hj-inv { grid-template-columns: 1fr; }
  .hj-inv__side { flex-direction: row; flex-wrap: wrap; justify-content: center; }
  .hj-inv__side-art { width: 90px; }
  .hj-inv__grid { max-height: 36vh; }
  .hj-egg__pets { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (prefers-reduced-motion: reduce) {
  .hj-tile { transition: none; }
  .hj-pop--run { animation-duration: 1ms; }
}
`;
  document.head.appendChild(style);
};

/** Supplied HUD art, served from the repo-level assets folder. */
export const iconUrl = (file: string): string => `/ui/${file}`;
const icon = (file: string): string => `<img class="hj-icon" src="${iconUrl(file)}" alt="" draggable="false">`;

/** A red rubber balloon on a string, drawn as SVG so it costs a few hundred bytes. */
const BALLOON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 72">' +
  '<path d="M24 50c-2 6 4 8 0 14s2 6 0 8" stroke="#12181f" stroke-width="3" fill="none" stroke-linecap="round"/>' +
  '<path d="M24 4C12 4 5 13 5 24c0 13 10 24 19 26 9-2 19-13 19-26C43 13 36 4 24 4z" fill="#ef3b3b" stroke="#12181f" stroke-width="4" stroke-linejoin="round"/>' +
  '<path d="M20 50l4 5 4-5z" fill="#ef3b3b" stroke="#12181f" stroke-width="3" stroke-linejoin="round"/>' +
  '<ellipse cx="16" cy="18" rx="4" ry="7" fill="#fff" opacity=".6" transform="rotate(-20 16 18)"/></svg>';

export const BALLOON_ICON_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BALLOON_SVG)}`;

const CLOCK_SVG =
  '<svg class="hj-icon" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="#ef3b3b" stroke="#12181f" stroke-width="3"/>' +
  '<circle cx="16" cy="16" r="8.5" fill="#fff"/><path d="M16 10v6l4 3" stroke="#12181f" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>';

const PLAY_SVG = '<svg class="hj-icon" viewBox="0 0 20 24" aria-hidden="true"><path d="M3 2l15 10-15 10z" fill="#fff" stroke="#12181f" stroke-width="3" stroke-linejoin="round"/></svg>';

const PAW_SVG =
  '<svg class="hj-icon" viewBox="0 0 32 32" aria-hidden="true"><g fill="#ffc98a" stroke="#12181f" stroke-width="2.2">' +
  '<ellipse cx="16" cy="21" rx="7.5" ry="6"/><circle cx="7" cy="13" r="3.3"/><circle cx="12.5" cy="8" r="3.3"/><circle cx="19.5" cy="8" r="3.3"/><circle cx="25" cy="13" r="3.3"/></g></svg>';

const BAG_SVG =
  '<svg class="hj-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 11h16l2 17H6z" fill="#b5793f" stroke="#12181f" stroke-width="2.4" stroke-linejoin="round"/>' +
  '<path d="M11 11c0-7 10-7 10 0" stroke="#12181f" stroke-width="2.4" fill="none"/><rect x="11" y="16" width="10" height="6" rx="2" fill="#8a5a2b" stroke="#12181f" stroke-width="2"/></svg>';

const SPEAKER_SVG =
  '<svg class="hj-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" stroke="#12181f" stroke-width="1.2" d="M4 9h3.2L12 4.6v14.8L7.2 15H4z"/>' +
  '<path fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" d="M15.6 8.6a4.6 4.6 0 0 1 0 6.8M18.4 5.8a8.4 8.4 0 0 1 0 12.4"/></svg>';

export const ICONS = {
  trophy: icon('trophy.png'),
  balloon: `<img class="hj-icon" src="${BALLOON_ICON_URL}" alt="" draggable="false">`,
  pets: icon('inventory.png'),
  shop: icon('shop.png'),
  clock: CLOCK_SVG,
  play: PLAY_SVG,
  paw: PAW_SVG,
  bag: BAG_SVG,
  audio: SPEAKER_SVG,
} as const;
