/**
 * Keeps the save in the browser (Milestone 7 sheet section 6). The checking
 * and upgrading is in saveData.ts (plain TypeScript, tested in Node); this
 * file only reads and writes local storage.
 *
 * Safe fallback: an unreadable save never stops the game. Its text is copied
 * to a backup key and the unreadable part starts empty.
 */
import { decodeSave, emptySave, encodeSave, type Loaded, type SaveData } from './saveData';

const KEY = 'dreamcoursedream.save';
const BACKUP_KEY = 'dreamcoursedream.save.backup';
/** The Milestone 6 Burrow save: read once and moved into the new save. */
const OLD_BURROW_KEY = 'dreamcoursedream.burrow';

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadSave(): Loaded {
  const raw = get(KEY);
  if (raw === null) {
    // First time with the Milestone 7 save: bring the old Burrow over.
    const old = get(OLD_BURROW_KEY);
    if (old) {
      const moved = decodeSave(JSON.stringify({ version: 1, profile: emptySave().profile, burrow: safeSlots(old), run: null }));
      writeSave(moved.data);
      try {
        localStorage.removeItem(OLD_BURROW_KEY);
      } catch {
        // ignore
      }
      return moved;
    }
    return { data: emptySave(), broken: [] };
  }
  const loaded = decodeSave(raw);
  if (loaded.broken.length) set(BACKUP_KEY, raw);
  return loaded;
}

function safeSlots(raw: string): unknown {
  try {
    const o = JSON.parse(raw) as { slots?: unknown };
    return o.slots ?? null;
  } catch {
    return null;
  }
}

export function writeSave(d: SaveData): boolean {
  return set(KEY, encodeSave(d));
}

/** Testing aids: the save as text, and damaging it on purpose. */
export function rawSave(): string {
  return get(KEY) ?? '(no save yet)';
}
export function damageSave(): void {
  set(KEY, (get(KEY) ?? '{}').slice(0, 20) + '#@!');
}
