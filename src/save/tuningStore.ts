/**
 * Keeps the tuning panel's values in the browser between reloads, so a tuning
 * session is not lost. Versioned; anything unreadable falls back to defaults.
 */
import { DEFAULT_TUNING, TUNING_CONTROLS, cloneTuning, getTuningValue, setTuningValue, type Tuning } from '../content/tuning';

const KEY = 'dreamcoursedream.tuning';
const VERSION = 3; // 3: bounce +10% (round 3); older saved values are dropped so the new defaults show.

export function loadTuning(): Tuning {
  const t = cloneTuning(DEFAULT_TUNING);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return t;
    const saved = JSON.parse(raw) as { version?: number; values?: Record<string, unknown> };
    if (saved.version !== VERSION || !saved.values) return t;
    for (const c of TUNING_CONTROLS) {
      const v = saved.values[c.key];
      if (typeof v === 'number' && Number.isFinite(v)) setTuningValue(t, c.key, v);
    }
  } catch {
    // Unreadable or blocked storage: use defaults.
  }
  return t;
}

export function saveTuning(t: Tuning): void {
  const values: Record<string, number> = {};
  for (const c of TUNING_CONTROLS) values[c.key] = getTuningValue(t, c.key);
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, values }));
  } catch {
    // Storage blocked: tuning still works for this session.
  }
}

export function clearTuning(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
