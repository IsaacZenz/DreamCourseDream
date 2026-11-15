/**
 * Keeps the Burrow's contents in the browser (owner, 2026-11-15): gear stored
 * in the Burrow survives death and closing the page. Versioned; anything
 * unreadable falls back to an empty Burrow. The full save of a run in progress
 * (at a town) comes in Milestone 7.
 */
import { NO_GEAR, type GearSlots } from '../content/gear';

const KEY = 'dreamcoursedream.burrow';
const VERSION = 1;

export function loadBurrow(): GearSlots {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return NO_GEAR;
    const saved = JSON.parse(raw) as { version?: number; slots?: Record<string, unknown> };
    if (saved.version !== VERSION || !saved.slots) return NO_GEAR;
    const pick = (v: unknown) => (typeof v === 'string' ? v : null);
    // The run checks that each id is still a gear item of that slot.
    return { weapon: pick(saved.slots.weapon), armour: pick(saved.slots.armour), bauble: pick(saved.slots.bauble) };
  } catch {
    return NO_GEAR;
  }
}

export function saveBurrow(slots: GearSlots): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, slots }));
  } catch {
    // Storage blocked: the Burrow still works until the page is closed.
  }
}
