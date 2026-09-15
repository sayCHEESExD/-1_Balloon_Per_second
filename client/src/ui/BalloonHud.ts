import { BALLOON_TICK_SECONDS, formatClock, formatNumber, highestReachableStep, nextStepFor, totalBalloonsForHeight } from '@highjump/shared';
import { BALLOON_ICON_URL, ICONS, injectHudStyles } from './hudStyles.js';

const studs = (n: number): string => `${formatNumber(n)} Stud${n === 1 ? '' : 's'}`;

/**
 * The bottom HUD: the balloon meter.
 *
 * A clock counting down to the next payout, "+N Balloon(s)", and a bar that
 * fills continuously over `BALLOON_TICK_SECONDS`. Above it, the balloon count
 * and what it reaches: the stud height the player can climb to now, and the
 * next step up with how many more balloons it takes (wait, or buy a balloon that
 * multiplies them).
 *
 * The SERVER pays balloons; this only shows it. The bar runs on a local clock
 * that is re-synced to zero every time the replicated count rises, so it fills
 * smoothly between patches and always empties exactly on a payout.
 */
export class BalloonHud {
  private readonly root: HTMLDivElement;
  private readonly count: HTMLSpanElement;
  private readonly next: HTMLDivElement;
  private readonly clock: HTMLSpanElement;
  private readonly gain: HTMLSpanElement;
  private readonly fill: HTMLDivElement;
  private elapsed = 0;
  private lastBalloons = -1;
  private signature = '';
  private lastWidth = '';

  constructor(parent: HTMLElement) {
    injectHudStyles();
    this.root = document.createElement('div');
    this.root.className = 'hj-meter hj-font';
    this.root.innerHTML =
      '<div class="hj-meter__stats">' +
      `<div class="hj-meter__count hj-outline">${ICONS.balloon}<span></span></div>` +
      '<div class="hj-meter__next hj-outline"></div></div>' +
      '<div class="hj-meter__info">' +
      `<div class="hj-meter__clock hj-outline">${ICONS.clock}<span></span></div>${ICONS.play}` +
      '<div class="hj-meter__gain hj-outline"><span></span></div></div>' +
      `<div class="hj-meter__track"><img class="hj-meter__balloon" src="${BALLOON_ICON_URL}" alt="" draggable="false">` +
      '<div class="hj-meter__bar"><div class="hj-meter__fill"></div></div></div>';
    this.count = this.root.querySelector('.hj-meter__count span') as HTMLSpanElement;
    this.next = this.root.querySelector('.hj-meter__next') as HTMLDivElement;
    this.clock = this.root.querySelector('.hj-meter__clock span') as HTMLSpanElement;
    this.gain = this.root.querySelector('.hj-meter__gain span') as HTMLSpanElement;
    this.fill = this.root.querySelector('.hj-meter__fill') as HTMLDivElement;
    parent.appendChild(this.root);
  }

  /** The replicated balloon count. A rise is a payout: the bar restarts. */
  observe(balloons: number): void {
    if (this.lastBalloons >= 0 && balloons > this.lastBalloons) {
      this.elapsed = 0;
      this.root.classList.remove('hj-meter--payout');
      void this.root.offsetWidth;
      this.root.classList.add('hj-meter--payout');
    }
    this.lastBalloons = balloons;
  }

  update(delta: number, balloons: number, perTick: number, climbHeight: number, owned: number, world = 1): void {
    this.elapsed = Math.min(this.elapsed + Math.max(0, delta), BALLOON_TICK_SECONDS);
    const width = `${((this.elapsed / BALLOON_TICK_SECONDS) * 100).toFixed(1)}%`;
    if (width !== this.lastWidth) {
      this.lastWidth = width;
      this.fill.style.width = width;
    }

    const remaining = BALLOON_TICK_SECONDS - this.elapsed;
    const signature = `${Math.floor(balloons)}|${perTick}|${Math.ceil(remaining)}|${climbHeight}|${owned}|${world}`;
    if (signature === this.signature) return;
    this.signature = signature;

    this.clock.textContent = formatClock(remaining);
    this.gain.textContent = `+ ${formatNumber(perTick)} Balloon(s)`;
    // The count is always the full total; the reach is the current world's climb.
    const reached = highestReachableStep(climbHeight);
    const prefix = world === 2 ? 'World 2 · ' : '';
    this.count.textContent = `${formatNumber(balloons)}  ·  ${prefix}Reach ${studs(reached?.studs ?? 0)}`;
    const next = nextStepFor(climbHeight);
    const more = next ? Math.max(1, totalBalloonsForHeight(world, next.top, owned) - Math.floor(balloons)) : 0;
    this.next.textContent = next ? `Next: ${studs(next.studs)} (+${formatNumber(more)} balloons)` : 'You can reach the top!';
    this.next.classList.toggle('hj-meter__next--top', !next);
  }

  dispose(): void {
    this.root.remove();
  }
}
