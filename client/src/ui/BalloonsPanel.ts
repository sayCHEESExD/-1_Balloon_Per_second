import { BALLOONS, balloonBySlot, formatNumber, heldBalloon, isBalloonOwned, ownedBalloonCount } from '@highjump/shared';
import { thumbnails } from '../rendering/Thumbnails.js';
import { ICONS } from './hudStyles.js';
import { Panel } from './Panel.js';

export interface BalloonActions {
  buy(slot: number): void;
  equip(slot: number): void;
}

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/**
 * The Balloons menu, laid out as the reference: a grid of balloon cards (name,
 * picture, price or "Equipped") under a Wins figure, "Unlocked N/18" below,
 * and a detail card on the right with the balloon's bonuses (balloons, wins and
 * the climb multiplier) and one button -
 * Buy, Equip or Equipped.
 *
 * Mirrors replicated ownership; every button only asks the server.
 */
export class BalloonsPanel extends Panel {
  private readonly wins: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly unlocked: HTMLSpanElement;
  private readonly sideName: HTMLDivElement;
  private readonly sideArt: HTMLDivElement;
  private readonly sideStats: HTMLDivElement;
  private readonly action: HTMLButtonElement;
  private owned = 1;
  private equipped = 1;
  private winsTotal = 0;
  private selected = 1;
  private signature = '';

  constructor(parent: HTMLElement, private readonly actions: BalloonActions) {
    super(parent, 'balloons', 'BALLOONS');
    this.body.innerHTML =
      '<div class="hj-inv hj-font"><div class="hj-inv__main">' +
      '<div class="hj-inv__wins hj-outline"></div><div class="hj-inv__grid"></div>' +
      '<div class="hj-inv__footer"><span class="hj-outline"></span></div></div>' +
      '<div class="hj-inv__side"><div class="hj-inv__side-name hj-outline"></div><div class="hj-inv__side-art"></div>' +
      '<div class="hj-inv__stats hj-outline"></div><div class="hj-inv__actions"><button type="button" class="hj-btn hj-btn--green hj-font"></button></div></div></div>';
    this.wins = this.body.querySelector('.hj-inv__wins') as HTMLDivElement;
    this.grid = this.body.querySelector('.hj-inv__grid') as HTMLDivElement;
    this.unlocked = this.body.querySelector('.hj-inv__footer span') as HTMLSpanElement;
    this.sideName = this.body.querySelector('.hj-inv__side-name') as HTMLDivElement;
    this.sideArt = this.body.querySelector('.hj-inv__side-art') as HTMLDivElement;
    this.sideStats = this.body.querySelector('.hj-inv__stats') as HTMLDivElement;
    this.action = this.body.querySelector('.hj-inv__actions button') as HTMLButtonElement;
    this.action.addEventListener('click', () => {
      if (this.action.disabled) return;
      if (isBalloonOwned(this.owned, this.selected)) this.actions.equip(this.selected);
      else this.actions.buy(this.selected);
    });
  }

  /** True when some unowned balloon is affordable - the rail badge. */
  get hasAffordable(): boolean {
    return BALLOONS.some((balloon) => !isBalloonOwned(this.owned, balloon.slot) && this.winsTotal >= balloon.cost);
  }

  setInventory(owned: number, equipped: number, wins: number): void {
    const signature = `${owned}|${equipped}|${Math.floor(wins)}`;
    if (signature === this.signature) return;
    // A purchase lands with the new balloon equipped: follow it.
    if (heldBalloon(equipped, owned).slot !== heldBalloon(this.equipped, this.owned).slot) this.selected = heldBalloon(equipped, owned).slot;
    this.signature = signature;
    this.owned = owned;
    this.equipped = equipped;
    this.winsTotal = wins;
    if (this.isOpen) this.render();
  }

  protected override onOpened(): void {
    this.selected = heldBalloon(this.equipped, this.owned).slot;
    this.render();
  }

  private render(): void {
    const held = heldBalloon(this.equipped, this.owned).slot;
    this.wins.textContent = `Wins: ${formatNumber(this.winsTotal)}`;
    this.unlocked.textContent = `Unlocked ${ownedBalloonCount(this.owned)}/${BALLOONS.length}`;
    this.grid.textContent = '';
    for (const balloon of BALLOONS) {
      const owned = isBalloonOwned(this.owned, balloon.slot);
      const card = document.createElement('div');
      card.className = `hj-inv__card${owned ? '' : ' hj-inv__card--locked'}${balloon.slot === this.selected ? ' hj-inv__card--sel' : ''}`;
      card.appendChild(this.nameNode(balloon.name));
      card.appendChild(this.art(thumbnails.balloon(balloon.slot), balloon.color));
      const foot = document.createElement('div');
      if (balloon.slot === held) {
        foot.className = 'hj-inv__foot hj-inv__foot--green hj-outline';
        foot.textContent = 'Equipped';
        const check = document.createElement('div');
        check.className = 'hj-inv__check';
        check.textContent = '✔';
        card.appendChild(check);
      } else if (owned) {
        foot.className = 'hj-inv__foot hj-outline';
        foot.textContent = 'Owned';
      } else {
        foot.className = 'hj-inv__foot hj-inv__foot--gold hj-outline';
        foot.innerHTML = `<span></span>${ICONS.trophy}`;
        (foot.querySelector('span') as HTMLSpanElement).textContent = formatNumber(balloon.cost);
      }
      card.appendChild(foot);
      card.addEventListener('click', () => {
        this.selected = balloon.slot;
        this.render();
      });
      this.grid.appendChild(card);
    }
    this.renderSide(held);
  }

  private renderSide(held: number): void {
    const balloon = balloonBySlot(this.selected) ?? BALLOONS[0];
    if (!balloon) return;
    const owned = isBalloonOwned(this.owned, balloon.slot);
    this.sideName.textContent = balloon.name;
    this.sideArt.textContent = '';
    this.sideArt.appendChild(this.art(thumbnails.balloon(balloon.slot), balloon.color));
    this.sideStats.innerHTML = `<span>+<b></b>${ICONS.balloon}</span><span>+<b></b>%${ICONS.trophy}</span><span title="Climb multiplier">⬆×<b></b></span>`;
    const figures = this.sideStats.querySelectorAll('b');
    (figures[0] as HTMLElement).textContent = formatNumber(balloon.balloons);
    (figures[1] as HTMLElement).textContent = formatNumber(balloon.winsPercent);
    (figures[2] as HTMLElement).textContent = String(balloon.climb);

    if (balloon.slot === held) {
      this.action.className = 'hj-btn hj-btn--green hj-font';
      this.action.textContent = 'Equipped';
      this.action.disabled = true;
    } else if (owned) {
      this.action.className = 'hj-btn hj-btn--green hj-font';
      this.action.textContent = 'Equip';
      this.action.disabled = false;
    } else {
      this.action.className = 'hj-btn hj-btn--gold hj-font';
      this.action.innerHTML = `Buy <span></span>${ICONS.trophy}`;
      (this.action.querySelector('span') as HTMLSpanElement).textContent = formatNumber(balloon.cost);
      this.action.disabled = this.winsTotal < balloon.cost;
    }
  }

  private nameNode(text: string): HTMLDivElement {
    const name = document.createElement('div');
    name.className = 'hj-inv__name hj-outline';
    name.textContent = text;
    return name;
  }

  private art(url: string, color: number): HTMLElement {
    if (!url) {
      const swatch = document.createElement('div');
      swatch.className = 'hj-inv__swatch';
      swatch.style.background = `radial-gradient(circle at 35% 30%, #ffffff, ${hex(color)} 55%)`;
      return swatch;
    }
    const image = document.createElement('img');
    image.className = 'hj-inv__img';
    image.src = url;
    image.alt = '';
    image.draggable = false;
    return image;
  }
}
