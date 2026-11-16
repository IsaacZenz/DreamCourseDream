/**
 * Keeps the save in the browser (Milestone 7 design sheet section 7). One key
 * holds everything; the tuning panel keeps its own key. The format and its
 * checks are in saveData.ts.
 *
 * If the save cannot be read, a copy of its text is kept under the ".broken"
 * key, a fresh save starts, and `notice` says so (shown on the start menu).
 * If storage is blocked, the game still works until the page is closed.
 */
import { emptySave, parseSave, serializeSave, type SaveData } from './saveData';

export const SAVE_KEY = 'dreamcoursedream.save';
export const BROKEN_KEY = 'dreamcoursedream.save.broken';
/** The Milestone 6 Burrow key, moved into the save once and then removed. */
const OLD_BURROW_KEY = 'dreamcoursedream.burrow';

export interface Loaded {
  readonly data: SaveData;
  readonly notice: string | null;
}

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: carry on without saving.
  }
}

export function loadSave(): Loaded {
  const text = get(SAVE_KEY);
  const parsed = parseSave(text, text === null ? get(OLD_BURROW_KEY) : null);
  if (parsed.ok) {
    if (parsed.migratedBurrow) {
      writeSave(parsed.data);
      try {
        localStorage.removeItem(OLD_BURROW_KEY);
      } catch {
        // ignore
      }
    }
    return { data: parsed.data, notice: null };
  }
  if (text !== null) set(BROKEN_KEY, text);
  const data = emptySave();
  writeSave(data);
  return { data, notice: 'YOUR SAVE COULD NOT BE READ AND WAS RESET. A COPY WAS KEPT.' };
}

export function writeSave(data: SaveData): void {
  set(SAVE_KEY, serializeSave(data));
}

/** Testing aid: write nonsense into the save, to try the fallback. */
export function breakSave(): void {
  set(SAVE_KEY, '{ this is not a save');
}
