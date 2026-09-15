import { PET_LIMITS, RARITIES, formatNumber, parsePets, petById, type PetDefinition } from '@highjump/shared';
import { thumbnails } from '../rendering/Thumbnails.js';
import { ICONS } from './hudStyles.js';
import { Panel } from './Panel.js';

export interface PetActions {
  equipBest(): void;
  toggle(index: number): void;
  remove(index: number): void;
}

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/** "+2 🎈" and/or "+10% 🏆" for a pet's buffs. */
export const petBuffHtml = (pet: PetDefinition): string => {
  const parts: string[] = [];
  if (pet.balloons > 0) parts.push(`<span>+${formatNumber(pet.balloons)}${ICONS.balloon}</span>`);
  if (pet.winsPercent > 0) parts.push(`<span>+${formatNumber(pet.winsPercent)}%${ICONS.trophy}</span>`);
  return parts.join('');
};

/**
 * The Pets menu, laid out as the reference: owned pets as cards (name in its
 * rarity colour, picture, balloon bonus, a tick when equipped), "N/3" equipped
 * and "N/40" owned with Equip Best below, and a detail card on the right with
 * the pet's rarity and buffs, Equip/Unequip and a delete button that asks twice.
 *
 * Every action only asks the server.
 */
export class PetsPanel extends Panel {
  private readonly grid: HTMLDivElement;
  private readonly equippedCount: HTMLSpanElement;
  private readonly ownedCount: HTMLSpanElement;
  private readonly bestButton: HTMLButtonElement;
  private readonly side: HTMLDivElement;
  private readonly sideName: HTMLDivElement;
  private readonly sideArt: HTMLDivElement;
  private readonly sideStats: HTMLDivElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly deleteButton: HTMLButtonElement;
  private pets = '';
  private selected = -1;
  private confirmDelete = false;

  constructor(parent: HTMLElement, private readonly actions: PetActions) {
    super(parent, 'pets', 'PETS');
    this.body.innerHTML =
      '<div class="hj-inv hj-font"><div class="hj-inv__main"><div class="hj-inv__grid"></div>' +
      '<div class="hj-inv__footer">' +
      `<span class="hj-outline">${ICONS.paw}<b class="hj-pets__equipped"></b></span>` +
      `<span class="hj-outline">${ICONS.bag}<b class="hj-pets__owned"></b></span>` +
      '<button type="button" class="hj-btn hj-btn--green hj-font">Equip Best</button></div></div>' +
      '<div class="hj-inv__side"><div class="hj-inv__side-name hj-outline"></div><div class="hj-inv__side-art"></div>' +
      '<div class="hj-inv__stats hj-outline"></div><div class="hj-inv__actions">' +
      '<button type="button" class="hj-btn hj-btn--green hj-font"></button>' +
      '<button type="button" class="hj-btn hj-btn--red hj-font" aria-label="Delete pet">🗑</button></div></div></div>';
    this.grid = this.body.querySelector('.hj-inv__grid') as HTMLDivElement;
    this.equippedCount = this.body.querySelector('.hj-pets__equipped') as HTMLSpanElement;
    this.ownedCount = this.body.querySelector('.hj-pets__owned') as HTMLSpanElement;
    this.bestButton = this.body.querySelector('.hj-inv__footer button') as HTMLButtonElement;
    this.side = this.body.querySelector('.hj-inv__side') as HTMLDivElement;
    this.sideName = this.body.querySelector('.hj-inv__side-name') as HTMLDivElement;
    this.sideArt = this.body.querySelector('.hj-inv__side-art') as HTMLDivElement;
    this.sideStats = this.body.querySelector('.hj-inv__stats') as HTMLDivElement;
    const buttons = this.body.querySelectorAll<HTMLButtonElement>('.hj-inv__actions button');
    this.toggleButton = buttons[0] as HTMLButtonElement;
    this.deleteButton = buttons[1] as HTMLButtonElement;

    this.bestButton.addEventListener('click', () => {
      if (!this.bestButton.disabled) this.actions.equipBest();
    });
    this.toggleButton.addEventListener('click', () => {
      if (!this.toggleButton.disabled && this.selected >= 0) this.actions.toggle(this.selected);
    });
    this.deleteButton.addEventListener('click', () => {
      if (this.selected < 0) return;
      if (!this.confirmDelete) {
        this.confirmDelete = true;
        this.render();
        return;
      }
      this.actions.remove(this.selected);
      this.selected = -1;
      this.confirmDelete = false;
    });
  }

  setInventory(pets: string): void {
    if (pets === this.pets) return;
    const before = parsePets(this.pets).length;
    const after = parsePets(pets);
    // A new hatch selects the new pet; a deletion clears the selection.
    if (after.length > before) this.selected = after.length - 1;
    else if (after.length < before) this.selected = -1;
    this.confirmDelete = false;
    this.pets = pets;
    if (this.isOpen) this.render();
  }

  protected override onOpened(): void {
    this.confirmDelete = false;
    if (this.selected < 0 && parsePets(this.pets).length > 0) this.selected = 0;
    this.render();
  }

  private render(): void {
    const pets = parsePets(this.pets);
    const equipped = pets.filter((pet) => pet.equipped).length;
    this.equippedCount.textContent = `${equipped}/${PET_LIMITS.maxEquipped}`;
    this.ownedCount.textContent = `${pets.length}/${PET_LIMITS.maxOwned}`;
    this.bestButton.disabled = pets.length === 0;
    this.grid.textContent = '';

    if (pets.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hj-inv__empty hj-outline';
      empty.textContent = 'No pets yet - hatch an egg in the Eggs area!';
      this.grid.appendChild(empty);
    }
    pets.forEach((entry, index) => {
      const pet = petById(entry.id);
      if (!pet) return;
      const card = document.createElement('div');
      card.className = `hj-inv__card${index === this.selected ? ' hj-inv__card--sel' : ''}`;
      const name = document.createElement('div');
      name.className = 'hj-inv__name hj-outline';
      name.style.color = RARITIES[pet.rarity].color;
      name.textContent = pet.name;
      card.appendChild(name);
      card.appendChild(this.art(pet));
      const foot = document.createElement('div');
      foot.className = 'hj-inv__foot hj-outline';
      foot.innerHTML = pet.balloons > 0 ? `+${formatNumber(pet.balloons)}${ICONS.balloon}` : `+${formatNumber(pet.winsPercent)}%${ICONS.trophy}`;
      card.appendChild(foot);
      if (entry.equipped) {
        const check = document.createElement('div');
        check.className = 'hj-inv__check';
        check.textContent = '✔';
        card.appendChild(check);
      }
      card.addEventListener('click', () => {
        this.selected = index;
        this.confirmDelete = false;
        this.render();
      });
      this.grid.appendChild(card);
    });

    const chosen = pets[this.selected];
    const pet = chosen ? petById(chosen.id) : undefined;
    this.side.style.visibility = pet ? 'visible' : 'hidden';
    if (!chosen || !pet) return;
    this.sideName.textContent = `${pet.name} (${pet.rarity})`;
    this.sideName.style.color = RARITIES[pet.rarity].color;
    this.sideArt.textContent = '';
    this.sideArt.appendChild(this.art(pet));
    this.sideStats.innerHTML = petBuffHtml(pet);
    this.toggleButton.textContent = chosen.equipped ? 'Unequip' : 'Equip';
    this.toggleButton.disabled = !chosen.equipped && equipped >= PET_LIMITS.maxEquipped;
    this.deleteButton.textContent = this.confirmDelete ? 'Sure?' : '🗑';
  }

  private art(pet: PetDefinition): HTMLElement {
    const url = thumbnails.pet(pet.id);
    if (!url) {
      const swatch = document.createElement('div');
      swatch.className = 'hj-inv__swatch';
      swatch.style.background = `radial-gradient(circle at 35% 30%, ${hex(pet.accent)}, ${hex(pet.color)} 60%)`;
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
