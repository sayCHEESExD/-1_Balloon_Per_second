import { RARITIES, eggBySlot, petById } from '@highjump/shared';
import { thumbnails } from '../rendering/Thumbnails.js';
import { injectHudStyles } from './hudStyles.js';
import { petBuffHtml } from './PetsPanel.js';

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/** Milliseconds of shaking before the egg bursts, and the card stays up. */
const SHAKE_MS = 1100;
const CARD_MS = 2600;

export interface HatchCues {
  /** The egg starts to wobble. */
  crack(): void;
  /** The pet appears. */
  reveal(rarity: string): void;
}

/**
 * The hatch presentation: the egg pops up and shakes harder and harder, bursts
 * in a flash, and the pet's card springs out with its name, rarity and buffs.
 * A click skips it.
 *
 * Presentation only: the pet is already in the replicated inventory by the
 * time this plays.
 */
export class HatchReveal {
  private readonly root: HTMLDivElement;
  private readonly egg: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly timers: number[] = [];

  constructor(parent: HTMLElement, private readonly cues: HatchCues) {
    injectHudStyles();
    this.root = document.createElement('div');
    this.root.className = 'hj-hatch hj-font';
    this.root.hidden = true;
    this.root.innerHTML =
      '<div class="hj-hatch__stage"><div class="hj-hatch__flash"></div><div class="hj-hatch__egg"></div>' +
      '<div class="hj-hatch__card" hidden><img class="hj-hatch__art" alt=""><div class="hj-hatch__name hj-outline"></div>' +
      '<div class="hj-hatch__rarity hj-outline"></div><div class="hj-hatch__stats hj-inv__stats hj-outline"></div></div>' +
      '<div class="hj-hatch__tap">Click to continue</div></div>';
    this.egg = this.root.querySelector('.hj-hatch__egg') as HTMLDivElement;
    this.flash = this.root.querySelector('.hj-hatch__flash') as HTMLDivElement;
    this.card = this.root.querySelector('.hj-hatch__card') as HTMLDivElement;
    this.root.addEventListener('click', () => this.hide());
    parent.appendChild(this.root);
  }

  get isShowing(): boolean {
    return !this.root.hidden;
  }

  show(eggSlot: number, petId: string): void {
    const egg = eggBySlot(eggSlot);
    const pet = petById(petId);
    if (!egg || !pet) return;
    this.clearTimers();

    this.egg.style.background = `radial-gradient(circle at 35% 30%, #ffffff, ${hex(egg.accent)} 30%, ${hex(egg.color)} 72%)`;
    this.egg.hidden = false;
    this.card.hidden = true;
    this.card.classList.remove('hj-hatch__card--run');
    this.flash.classList.remove('hj-hatch__flash--run');
    this.egg.classList.remove('hj-hatch__egg--shake');
    void this.egg.offsetWidth;
    this.egg.classList.add('hj-hatch__egg--shake');
    this.root.hidden = false;
    this.cues.crack();

    const rarity = RARITIES[pet.rarity].color;
    (this.card.querySelector('.hj-hatch__art') as HTMLImageElement).src = thumbnails.pet(pet.id);
    const name = this.card.querySelector('.hj-hatch__name') as HTMLDivElement;
    name.textContent = pet.name;
    const rarityLine = this.card.querySelector('.hj-hatch__rarity') as HTMLDivElement;
    rarityLine.textContent = `${pet.rarity} · ${pet.chance}%`;
    rarityLine.style.color = rarity;
    (this.card.querySelector('.hj-hatch__stats') as HTMLDivElement).innerHTML = petBuffHtml(pet);
    this.card.style.setProperty('--hj-rarity', rarity);

    this.timers.push(
      window.setTimeout(() => {
        this.egg.hidden = true;
        this.flash.classList.add('hj-hatch__flash--run');
        this.card.hidden = false;
        this.card.classList.add('hj-hatch__card--run');
        this.cues.reveal(pet.rarity);
      }, SHAKE_MS),
      window.setTimeout(() => this.hide(), SHAKE_MS + CARD_MS),
    );
  }

  hide(): void {
    this.clearTimers();
    this.root.hidden = true;
  }

  dispose(): void {
    this.clearTimers();
    this.root.remove();
  }

  private clearTimers(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.length = 0;
  }
}
