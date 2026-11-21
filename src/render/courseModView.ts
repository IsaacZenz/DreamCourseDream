import { COURSE_MODS, WIND_STRENGTHS, type CourseMod } from '../content/modifiers';

/** Screen words for the four grid directions (x runs to the lower right, y to the lower left). */
const SCREEN_DIR: Record<string, string> = { ne: 'UP-RIGHT', se: 'DOWN-RIGHT', sw: 'DOWN-LEFT', nw: 'UP-LEFT' };

/** "WIND: BLOWS UP-RIGHT", "LOW GRAVITY", "DARKNESS" (round 2b sheet section 3). */
export function courseModLabel(mod: CourseMod): string {
  const def = COURSE_MODS.get(mod.id);
  const name = (def?.name ?? mod.id).toUpperCase();
  return mod.id === 'wind' && mod.dir ? `${WIND_STRENGTHS[mod.strength ?? 2].name.toUpperCase()} ${name}: BLOWS ${SCREEN_DIR[mod.dir]}` : name;
}

/** The short HUD label: "STRONG WIND" (the vane shows which way), "LOW GRAVITY", "DARKNESS". */
export function courseModShort(mod: CourseMod): string {
  const def = COURSE_MODS.get(mod.id);
  const name = (def?.name ?? mod.id).toUpperCase();
  return mod.id === 'wind' ? `${WIND_STRENGTHS[mod.strength ?? 2].name.toUpperCase()} ${name}` : name;
}

/** The longer line for the banner when the course opens. */
export function courseModBanner(mod: CourseMod): string {
  const def = COURSE_MODS.get(mod.id);
  return `${courseModLabel(mod)}. ${(def?.desc ?? '').toUpperCase()}`;
}
