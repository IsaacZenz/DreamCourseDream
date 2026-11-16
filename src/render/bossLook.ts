/**
 * How bosses look on screen (display only; Milestone 7). The tint for each
 * boss colour, used by the map icon, the title card and the health bar.
 */
import type { ColourId } from '../content/bosses';

export const BOSS_TINT: Record<ColourId, number> = { red: 0xe04838, blue: 0x4888f0, yellow: 0xf0d040, green: 0x58c048, rainbow: 0xf0f0f0 };
