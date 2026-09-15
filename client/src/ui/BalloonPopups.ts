import { formatNumber } from '@highjump/shared';
import { BALLOON_ICON_URL, injectHudStyles } from './hudStyles.js';

/** Most popups on screen at once. A hard ceiling allocated once. */
const POOL_SIZE = 6;
const LIFETIME = 1.3;

/**
 * The floating "+7" balloon popups, one per payout, on the right of the screen
 * as in the reference.
 *
 * Driven by the replicated balloon count: only an increase counts, and the
 * first reading only takes a baseline, so joining never fires a popup.
 */
export class BalloonPopups {
  private readonly root: HTMLDivElement;
  private readonly pool: HTMLDivElement[] = [];
  private next = 0;
  private lastTotal = -1;
  private readonly timers: number[] = [];

  constructor(parent: HTMLElement) {
    injectHudStyles();
    this.root = document.createElement('div');
    this.root.className = 'hj-pops';
    parent.appendChild(this.root);
    for (let i = 0; i < POOL_SIZE; i += 1) {
      const node = document.createElement('div');
      node.className = 'hj-pop hj-font';
      node.innerHTML =
        '<span class="hj-pop__value hj-outline"></span>' +
        `<img class="hj-pop__icon" src="${BALLOON_ICON_URL}" alt="" draggable="false">`;
      node.hidden = true;
      this.root.appendChild(node);
      this.pool.push(node);
    }
  }

  observe(total: number): void {
    if (!Number.isFinite(total)) return;
    if (this.lastTotal < 0 || total <= this.lastTotal) {
      this.lastTotal = total;
      return;
    }
    const gained = total - this.lastTotal;
    this.lastTotal = total;
    this.spawn(gained);
  }

  dispose(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.root.remove();
  }

  private spawn(amount: number): void {
    const index = this.next;
    this.next = (this.next + 1) % POOL_SIZE;
    const node = this.pool[index];
    if (!node) return;
    window.clearTimeout(this.timers[index]);

    const value = node.querySelector('.hj-pop__value');
    if (value) value.textContent = `+${formatNumber(amount)}`;
    node.style.left = `${70 + Math.random() * 14}%`;
    node.style.top = `${38 + Math.random() * 18}%`;
    node.style.setProperty('--hj-pop-tilt', `${(Math.random() * 2 - 1) * 8}deg`);
    node.hidden = false;
    node.classList.remove('hj-pop--run');
    void node.offsetWidth;
    node.classList.add('hj-pop--run');
    this.timers[index] = window.setTimeout(() => {
      node.hidden = true;
      node.classList.remove('hj-pop--run');
    }, LIFETIME * 1000);
  }
}
