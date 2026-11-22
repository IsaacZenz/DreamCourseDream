/**
 * The list of permanent upgrades and starting abilities (Milestone 7 sheet
 * section 5), shared by the Burrow between runs and the Burrow in a town.
 * Each row says what it is, what the next level costs, and what Enter does.
 */
import Phaser from 'phaser';
import { ABILITIES } from '../content/abilities';
import { ABILITY_PRICE, PERMANENT_UPGRADE_LIST, STARTING_ABILITIES } from '../content/progress';
import { buyAbility, buyCharacter, cannotBuyAbility, cannotBuyCharacter, cannotBuyUpgrade, cycleCharacter, cycleStartAbility, ownsCharacter, upgradeCost, type Profile } from '../sim/profile';
import { CHARACTER_LIST, CHARACTER_TRAITS, CHARACTERS, DEFAULT_CHARACTER } from '../content/characters';
import { pixelText } from './pixelText';
import { shared } from './shared';

export interface MenuRow {
  readonly icon: string | null;
  readonly text: string;
  readonly detail: string;
  /** Greyed out: cannot be done now. */
  readonly dim: boolean;
  /** Enter: returns a message, and whether it worked. */
  readonly act?: () => { ok: boolean; say: string };
  /** Left and right (the starting-ability toggle). */
  readonly step?: (dir: 1 | -1) => void;
}

const UI_TEXT = 0xf0f0f0;
const UI_DIM = 0xa0a8c0;
const SELECT = 0xf8d030;
const BLUE = 0x80c8ff;

/**
 * Upgrade and ability rows. `buyUpgrade` does the buying (between runs it is
 * the profile's; in a town it also applies the level to the run at once).
 * `toggle` is false in a town: the run has already started.
 */
export function progressRows(p: Profile, buyUpgrade: (id: string) => string | null, toggle: boolean): MenuRow[] {
  const rows: MenuRow[] = [];
  // Round 3 (owner, 2026-11-22): characters, bought once and chosen per run.
  const me = CHARACTERS.get(p.character) ?? CHARACTERS.get(DEFAULT_CHARACTER)!;
  rows.push({
    icon: me.sprite,
    text: `PLAY AS: < ${me.name.toUpperCase()} >`,
    detail: toggle ? `${characterLine(me.id)}` : 'CHOSEN BETWEEN RUNS',
    dim: !toggle,
    ...(toggle && { step: (dir: 1 | -1) => cycleCharacter(p, dir) }),
  });
  for (const c of CHARACTER_LIST) {
    if (c.unlockCost === 0) continue;
    const owned = ownsCharacter(p, c.id);
    rows.push({
      icon: c.sprite,
      text: `${c.name.toUpperCase()} (CHARACTER)`,
      detail: owned ? `OWNED. ${characterLine(c.id)}` : `${characterLine(c.id)}   ${c.unlockCost} BLUE`,
      dim: !owned && !!cannotBuyCharacter(p, c.id),
      act: () => {
        const err = buyCharacter(p, c.id);
        return err ? { ok: false, say: err } : { ok: true, say: `${c.name.toUpperCase()} JOINS YOU! ${toggle ? 'CHOSEN FOR THE NEXT RUN' : 'PLAY AS THEM FROM THE NEXT RUN'}` };
      },
    });
  }
  for (const u of PERMANENT_UPGRADE_LIST) {
    const lv = p.levels[u.id] ?? 0;
    const cost = upgradeCost(p, u.id);
    const why = cannotBuyUpgrade(p, u.id);
    rows.push({
      icon: u.icon,
      text: `${u.name.toUpperCase()}  LV ${lv}/${u.costs.length}`,
      detail: `${u.desc.toUpperCase()}   ${cost === null ? 'TOP LEVEL' : `NEXT: ${cost} BLUE`}`,
      dim: !!why,
      act: () => {
        const err = buyUpgrade(u.id);
        return err ? { ok: false, say: err } : { ok: true, say: `${u.name.toUpperCase()} LEVEL ${lv + 1}!` };
      },
    });
  }
  for (const id of STARTING_ABILITIES) {
    const a = ABILITIES.get(id)!;
    const owned = p.abilities.includes(id);
    rows.push({
      icon: a.icon,
      text: `${a.name.toUpperCase()} (STARTING ABILITY)`,
      detail: owned ? 'OWNED' : `${ABILITY_PRICE} BLUE`,
      dim: !owned && !!cannotBuyAbility(p, id),
      act: () => {
        const err = buyAbility(p, id);
        return err ? { ok: false, say: err } : { ok: true, say: `${a.name.toUpperCase()} BOUGHT! YOU CAN START RUNS WITH IT` };
      },
    });
  }
  const start = p.startAbility ? ABILITIES.get(p.startAbility)!.name.toUpperCase() : 'NONE';
  rows.push({
    icon: p.startAbility ? ABILITIES.get(p.startAbility)!.icon : null,
    text: `START RUNS WITH: < ${start} >`,
    detail: toggle ? (p.abilities.length ? 'LEFT/RIGHT TO CHOOSE' : 'BUY AN ABILITY FIRST') : 'BETWEEN RUNS ONLY',
    dim: !toggle || !p.abilities.length,
    ...(toggle && { step: (dir: 1 | -1) => cycleStartAbility(p, dir) }),
  });
  return rows;
}

/** A character's numbers in a few words: health, shots, damage and trait. */
export function characterLine(id: string): string {
  const c = CHARACTERS.get(id)!;
  const s = c.stats;
  const t = c.trait ? CHARACTER_TRAITS[c.trait] : undefined;
  return `HP ${s.maxHealth} SHOTS ${s.maxShots} DMG ${s.hitDamage}${t ? ` ${t.name.toUpperCase()}` : ''}`;
}

/** Draw rows from `first`, `count` at a time, with the selected one framed. */
export function drawRows(scene: Phaser.Scene, rows: readonly MenuRow[], sel: number, x: number, y: number, w: number, count: number, onClick: (i: number) => void): void {
  const m = shared.manifest;
  const first = Math.max(0, Math.min(sel - Math.floor(count / 2), rows.length - count));
  rows.slice(first, first + count).forEach((r, k) => {
    const i = first + k;
    const ry = y + k * 13;
    const selected = i === sel;
    scene.add.rectangle(x, ry, w, 12, 0x1c1c34, 0.95).setOrigin(0, 0).setStrokeStyle(selected ? 2 : 1, selected ? SELECT : 0x404060);
    scene.add
      .rectangle(x, ry, w, 12, 0, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      // Only clicks on the game itself: Phaser also hears clicks on the testing panel drawn over it.
      .on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        if (ptr.event?.target === scene.game.canvas) onClick(i);
      });
    if (r.icon) scene.add.image(x + 2, ry + 1, r.icon, 0).setOrigin(0, 0).setAlpha(r.dim ? 0.5 : 1);
    pixelText(scene, m, x + 16, ry + 3, r.text, { color: r.dim ? UI_DIM : UI_TEXT });
    const d = pixelText(scene, m, 0, ry + 3, r.detail, { color: r.dim ? UI_DIM : r.detail.includes('BLUE') ? BLUE : UI_TEXT });
    d.x = x + w - 4 - d.width;
  });
}
