import { PET_LIMITS, RARITIES, eggBySlot, formatNumber, parsePets, petsInEgg } from '@highjump/shared';
import { thumbnails } from '../rendering/Thumbnails.js';
import { ICONS } from './hudStyles.js';
import { Panel } from './Panel.js';
import { petBuffHtml } from './PetsPanel.js';

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/**
 * One egg's menu, opened by walking up to that egg in the Eggs area.
 *
 * The egg, its price, and its four pets with their rarity, percent chance and
 * buffs. The Hatch button ASKS the server, which re-checks that the player is
 * standing at this egg, the inventory space and the Wins, and rolls the pet.
 */
export class EggShopPanel extends Panel {
  private readonly shell: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly price: HTMLSpanElement;
  private readonly pets: HTMLDivElement;
  private readonly hatch: HTMLButtonElement;
  private readonly note: HTMLParagraphElement;
  private slot = 1;
  private wins = 0;
  private full = false;
  private atEgg = 0;
  private signature = '';

  constructor(parent: HTMLElement, private readonly onHatch: (slot: number) => void) {
    super(parent, 'egg', 'Hatch');
    this.body.innerHTML =
      '<div class="hj-font"><div class="hj-egg__top"><div class="hj-egg__shell"></div><div>' +
      `<div class="hj-egg__name hj-outline"></div><div class="hj-egg__price hj-outline"><span></span>${ICONS.trophy}</div></div></div>` +
      '<div class="hj-egg__pets"></div><div class="hj-egg__actions">' +
      '<button type="button" class="hj-btn hj-btn--green hj-font"></button></div><p class="hj-egg__note"></p></div>';
    this.shell = this.body.querySelector('.hj-egg__shell') as HTMLDivElement;
    this.name = this.body.querySelector('.hj-egg__name') as HTMLDivElement;
    this.price = this.body.querySelector('.hj-egg__price span') as HTMLSpanElement;
    this.pets = this.body.querySelector('.hj-egg__pets') as HTMLDivElement;
    this.hatch = this.body.querySelector('.hj-egg__actions button') as HTMLButtonElement;
    this.note = this.body.querySelector('.hj-egg__note') as HTMLParagraphElement;
    this.hatch.addEventListener('click', () => {
      if (!this.hatch.disabled) this.onHatch(this.slot);
    });
  }

  /** Open this egg's menu. */
  openFor(slot: number): void {
    this.slot = slot;
    this.signature = '';
    this.renderEgg();
    this.setOpen(true);
  }

  /** Mirror everything the button depends on. Cheap when nothing changed. */
  sync(wins: number, pets: string, atEgg: number): void {
    const full = parsePets(pets).length >= PET_LIMITS.maxOwned;
    const signature = `${Math.floor(wins)}|${full}|${atEgg}|${this.slot}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.wins = wins;
    this.full = full;
    this.atEgg = atEgg;
    this.renderButton();
  }

  private renderEgg(): void {
    const egg = eggBySlot(this.slot);
    if (!egg) return;
    this.shell.style.background = `radial-gradient(circle at 35% 30%, #ffffff, ${hex(egg.accent)} 30%, ${hex(egg.color)} 70%)`;
    this.name.textContent = egg.name;
    this.price.textContent = formatNumber(egg.cost);
    this.pets.textContent = '';
    for (const pet of petsInEgg(egg.slot)) {
      const card = document.createElement('div');
      card.className = 'hj-inv__card';
      const name = document.createElement('div');
      name.className = 'hj-inv__name hj-outline';
      name.style.color = RARITIES[pet.rarity].color;
      name.textContent = pet.name;
      const url = thumbnails.pet(pet.id);
      const art = document.createElement(url ? 'img' : 'div');
      if (url) {
        art.className = 'hj-inv__img';
        (art as HTMLImageElement).src = url;
      } else {
        art.className = 'hj-inv__swatch';
        art.style.background = `radial-gradient(circle at 35% 30%, ${hex(pet.accent)}, ${hex(pet.color)} 60%)`;
      }
      const chance = document.createElement('div');
      chance.className = 'hj-egg__chance hj-outline';
      chance.style.color = RARITIES[pet.rarity].color;
      chance.textContent = `${pet.rarity} ${pet.chance}%`;
      const buffs = document.createElement('div');
      buffs.className = 'hj-inv__stats hj-outline';
      buffs.style.fontSize = '14px';
      buffs.innerHTML = petBuffHtml(pet);
      card.append(name, art, chance, buffs);
      this.pets.appendChild(card);
    }
    this.renderButton();
  }

  private renderButton(): void {
    const egg = eggBySlot(this.slot);
    if (!egg) return;
    this.hatch.innerHTML = `Hatch <span></span>${ICONS.trophy}`;
    (this.hatch.querySelector('span') as HTMLSpanElement).textContent = formatNumber(egg.cost);
    const here = this.atEgg === egg.slot;
    this.hatch.disabled = this.full || !here || this.wins < egg.cost;
    this.note.textContent = !here
      ? 'Walk up to this egg to hatch it.'
      : this.full
        ? `Pet inventory full (${PET_LIMITS.maxOwned}/${PET_LIMITS.maxOwned}) - delete a pet to hatch more.`
        : this.wins < egg.cost
          ? `You need ${formatNumber(egg.cost - this.wins)} more Wins. Climb to a win area!`
          : `Equip up to ${PET_LIMITS.maxEquipped} pets to boost your balloons and wins.`;
  }
}
