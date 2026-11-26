/**
 * The light lab (round 9L sheet section 4; owner, 2026-11-26): a section of
 * the U panel for tuning the light by eye. Sliders change the current theme's
 * look straight away; "Copy light numbers" gives them as text to keep (paste
 * them to Claude, or into src/content/atmosphere.ts).
 *
 * The values start from src/content/atmosphere.ts and are not saved: reload
 * the page to go back to the file's numbers.
 */
import { ATMOSPHERE, LIGHT_MAP, presetFor } from '../content/atmosphere';

/** The lab's live numbers: the light map's, and each theme's. */
export interface LightLabValues {
  bands: number;
  dither: number;
  falloff: number;
  glow: number;
  /** By theme: multiplies the ambient colour, every light's strength, and how many lights are placed. */
  themes: Record<string, { ambient: number; lightStrength: number; amount: number }>;
}

export function defaultLightLab(): LightLabValues {
  return {
    bands: LIGHT_MAP.bands,
    dither: LIGHT_MAP.dither,
    falloff: LIGHT_MAP.falloff,
    glow: LIGHT_MAP.glow,
    themes: Object.fromEntries(Object.entries(ATMOSPHERE).map(([t, p]) => [t, { ambient: p.ambient, lightStrength: p.lightStrength, amount: 1 }])),
  };
}

/** The lab's numbers for a theme (a theme the file doesn't list starts as day). */
export function labTheme(lab: LightLabValues, theme: string): { ambient: number; lightStrength: number; amount: number } {
  return (lab.themes[theme] ??= { ambient: presetFor(theme).ambient, lightStrength: presetFor(theme).lightStrength, amount: 1 });
}

interface Slider {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly get: () => number;
  readonly set: (v: number) => void;
  /** Placing lights again needs the course drawn again; the rest change live. */
  readonly replace?: boolean;
}

/**
 * Build the lab's box. `theme()` is the theme on screen now, `onChange(replace)`
 * redraws the light (replace: place the lights again).
 */
export function buildLightLab(lab: LightLabValues, theme: () => string, onChange: (replace: boolean) => void, button: (text: string, onClick: () => void) => HTMLButtonElement): { box: HTMLDivElement; refresh: () => void } {
  const box = document.createElement('div');
  box.className = 'bench';
  const h = document.createElement('h3');
  h.textContent = 'Light lab';
  const hint = document.createElement('p');
  const rows: { input: HTMLInputElement; value: HTMLSpanElement; s: Slider }[] = [];
  const t = () => labTheme(lab, theme());
  const sliders: Slider[] = [
    { label: 'ambient (this theme)', min: 0.2, max: 2, step: 0.05, get: () => t().ambient, set: (v) => (t().ambient = v) },
    { label: 'light strength (this theme)', min: 0, max: 2, step: 0.05, get: () => t().lightStrength, set: (v) => (t().lightStrength = v) },
    { label: 'how many lights (this theme)', min: 0, max: 3, step: 0.25, get: () => t().amount, set: (v) => (t().amount = v), replace: true },
    { label: 'bands (all)', min: 1, max: 12, step: 1, get: () => lab.bands, set: (v) => (lab.bands = v) },
    { label: 'dither (all)', min: 0, max: 1.5, step: 0.05, get: () => lab.dither, set: (v) => (lab.dither = v) },
    { label: 'falloff (all)', min: 0.5, max: 3, step: 0.1, get: () => lab.falloff, set: (v) => (lab.falloff = v) },
    { label: 'glow on top (all)', min: 0, max: 1, step: 0.05, get: () => lab.glow, set: (v) => (lab.glow = v) },
  ];
  const sliderBox = document.createElement('div');
  for (const s of sliders) {
    const label = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = s.label;
    const value = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(s.min);
    input.max = String(s.max);
    input.step = String(s.step);
    input.addEventListener('input', () => {
      s.set(Number(input.value));
      value.textContent = String(Number(input.value));
    });
    // Placing lights again redraws the course, so do it once the slider is let go.
    input.addEventListener('change', () => {
      onChange(!!s.replace);
      input.blur();
    });
    input.addEventListener('input', () => {
      if (!s.replace) onChange(false);
    });
    label.append(name, value, input);
    sliderBox.appendChild(label);
    rows.push({ input, value, s });
  }
  const copy = button('Copy light numbers', () => {
    const th = theme();
    const p = presetFor(th);
    const v = t();
    const lightsPer100 = Object.fromEntries(Object.entries(p.lightsPer100).map(([id, n]) => [id, Math.round(n * v.amount * 100) / 100]));
    const text = [
      `// LIGHT_MAP: bands ${lab.bands}, dither ${lab.dither}, falloff ${lab.falloff}, glow ${lab.glow}`,
      `${th}: ${JSON.stringify({ ...p, ambient: v.ambient, lightStrength: v.lightStrength, lightsPer100, treeLanterns: Math.min(1, Math.round(p.treeLanterns * v.amount * 100) / 100) })},`,
    ].join('\n');
    void navigator.clipboard?.writeText(text).then(
      () => (copy.textContent = 'Copied!'),
      () => window.prompt('Copy these numbers:', text),
    );
    setTimeout(() => (copy.textContent = 'Copy light numbers'), 1500);
  });
  const refresh = () => {
    hint.textContent = `Theme on screen: ${theme()}. Pick another with the theme list above.`;
    for (const r of rows) {
      r.input.value = String(r.s.get());
      r.value.textContent = String(r.s.get());
    }
  };
  box.append(h, hint, sliderBox, copy);
  refresh();
  return { box, refresh };
}
