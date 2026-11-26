/**
 * Debug tuning panel: a plain HTML side panel with a slider for every tuning
 * number. Changes apply to the next shot and to the aim guide straight away.
 * Hidden until toggled (U key in the game, or ?tune=1 in the address).
 */
import { THEMES } from '../content/biomes';
import { DEFAULT_TUNING, TUNING_CONTROLS, getTuningValue, setTuningValue, type Tuning } from '../content/tuning';
import { clearTuning, saveTuning } from '../save/tuningStore';
import { buildLightLab, defaultLightLab, type LightLabValues } from './lightLab';

const CSS = `
#tuning-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 300px; overflow-y: auto; z-index: 10;
  background: rgba(16,16,32,0.94); color: #e8e8f0; font: 12px/1.3 ui-monospace, Menlo, Consolas, monospace;
  padding: 8px 10px; box-sizing: border-box; border-left: 2px solid #3a3a5a; }
#tuning-panel h2 { font-size: 13px; margin: 0 0 6px; color: #f8e048; }
#tuning-panel h3 { font-size: 12px; margin: 10px 0 2px; color: #a0c8ff; }
#tuning-panel label { display: grid; grid-template-columns: 1fr 56px; gap: 4px; align-items: center; margin: 2px 0; }
#tuning-panel input[type=range] { grid-column: 1 / 3; width: 100%; margin: 0; }
#tuning-panel .changed { color: #f8b048; }
#tuning-panel button { font: inherit; margin: 0 4px 4px 0; padding: 3px 8px; background: #2a2a48; color: #fff;
  border: 1px solid #5a5a8a; cursor: pointer; }
#tuning-panel p { margin: 4px 0; color: #a0a8c0; }
#tuning-panel select { font: inherit; width: 100%; margin: 2px 0 4px; background: #2a2a48; color: #fff; border: 1px solid #5a5a8a; }
#tuning-panel .bench { border: 1px solid #3a3a5a; padding: 6px; margin: 6px 0 4px; }
`;

/** The test bench section (owner request, 2026-11-14): pick what stands at the centre of a blank course. */
export interface BenchOptions {
  readonly choices: readonly { id: string; label: string }[];
  readonly abilities: readonly { id: string; label: string }[];
  readonly current: { object: string; ability: string; rank: string; trait: string; element: string };
  /** Milestone 8: a rank, a trait and an element for the enemy at the centre. */
  readonly ranks: readonly { id: string; label: string }[];
  readonly traits: readonly { id: string; label: string }[];
  readonly elements: readonly { id: string; label: string }[];
  /** Load the bench with this choice. */
  readonly onLoad: (object: string, ability: string, extras: { rank: string; trait: string; element: string }) => void;
}

/** Testing aids for a run (Milestone 6 design sheet, section 9.4). */
export interface RunOptions {
  readonly gear: readonly { id: string; label: string }[];
  readonly upgrades: readonly { id: string; label: string }[];
  readonly countdown: number;
  /** A course is being played, so "win this course" works. */
  readonly canWin: boolean;
  readonly onStars: () => void;
  readonly onGear: (id: string) => void;
  readonly onUpgrade: (id: string) => void;
  readonly onCountdown: (n: number) => void;
  readonly onWin: () => void;
}

/** Milestone 7 testing aids (sheet section 8.2): buttons, and a choice of arena to fight the boss in. */
export interface ProgressOptions {
  readonly title: string;
  readonly buttons: readonly { readonly label: string; readonly onClick: () => void }[];
  readonly arenas?: readonly { id: string; label: string }[];
  readonly onArena?: (id: string) => void;
  /** Text shown below (the save, when asked for). */
  readonly text?: string;
}

export class TuningPanel {
  private readonly root: HTMLDivElement;
  private readonly rows = new Map<string, { input: HTMLInputElement; value: HTMLSpanElement; name: HTMLSpanElement }>();

  private readonly tuning: Tuning;
  private benchBox: HTMLDivElement | null = null;
  private runBox: HTMLDivElement | null = null;
  private progressBox: HTMLDivElement | null = null;

  constructor(tuning: Tuning) {
    this.tuning = tuning;
    if (!document.getElementById('tuning-panel-css')) {
      const style = document.createElement('style');
      style.id = 'tuning-panel-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.id = 'tuning-panel';
    this.root.style.display = 'none';
    // Keep key presses on the sliders from also moving the camera.
    this.root.addEventListener('keydown', (e) => e.stopPropagation());
    this.build();
    document.body.appendChild(this.root);
  }

  /** Round 2a: show or hide the scenery on courses (a testing aid; sheet section 2.6). */
  showScenery = true;
  /** Round 2b: a theme to show every course in ('' = the region's own), and what to do when it changes. */
  theme = '';
  onTheme: (() => void) | null = null;
  /** Called when the whole-map switch changes (the map screen redraws). */
  onMap: (() => void) | null = null;
  /** Owner, 2026-11-21: the course check's bot plays the real game while this is on (Y on a course), so you can watch it. */
  botPlays = false;
  /** Milestone 8b: pick courses on the old map screen and use the old town street instead of walking (a testing view). */
  useMapScreen = false;
  /** Owner, 2026-11-21: draw flat grass, rough and sand tiles slightly raised at random (looks only). */
  groundBumps = true;
  /** Owner, 2026-11-26: organic wall textures (off: the old repeating face sprites, for comparing). */
  organicWalls = true;
  /** Owner, 2026-11-26: the grass overhang along the top of organic walls. */
  wallOverhang = true;
  /** Round 3: draw every map node (off: only the path taken and the next choices). */
  wholeMap = false;
  /** Round 9L (owner, 2026-11-26): the light map. Off: every theme at normal brightness, no lights. */
  lighting = new URLSearchParams(window.location.search).get('lighting') !== '0';
  /** Round 9L: the light lab's live numbers, the theme on screen, and how to redraw the light (replace: place the lights again). */
  readonly lightLab: LightLabValues = defaultLightLab();
  lightTheme = 'day';
  onLight: ((replace: boolean) => void) | null = null;
  private labRefresh: (() => void) | null = null;
  /** The course screen calls this when a course opens, so the lab shows that theme's numbers. */
  setLightTheme(theme: string): void {
    this.lightTheme = theme;
    this.labRefresh?.();
  }
  private botButton: HTMLButtonElement | null = null;
  setBotPlays(on: boolean): void {
    this.botPlays = on;
    if (this.botButton) this.botButton.textContent = on ? 'Bot plays: ON (Y)' : 'Bot plays: off (Y)';
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  toggle(show = !this.visible): void {
    this.root.style.display = show ? 'block' : 'none';
  }

  destroy(): void {
    this.root.remove();
  }

  private build(): void {
    const head = document.createElement('div');
    head.innerHTML = '<h2>Tuning (U to hide)</h2><p>Changes apply to the next shot. Orange = changed from the default.</p>';
    const copy = this.button('Copy values', () => {
      const json = JSON.stringify(this.tuning, null, 2);
      void navigator.clipboard?.writeText(json).then(
        () => (copy.textContent = 'Copied!'),
        () => window.prompt('Copy these values:', json),
      );
      setTimeout(() => (copy.textContent = 'Copy values'), 1500);
    });
    const reset = this.button('Reset all', () => {
      for (const c of TUNING_CONTROLS) setTuningValue(this.tuning, c.key, getTuningValue(DEFAULT_TUNING, c.key));
      clearTuning();
      this.refresh();
    });
    const scenery = this.button('Hide scenery', () => {
      this.showScenery = !this.showScenery;
      scenery.textContent = this.showScenery ? 'Hide scenery' : 'Show scenery';
    });
    const theme = document.createElement('select');
    for (const t of ['', ...THEMES]) {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = t ? `Theme: ${t}` : 'Theme: by region';
      theme.appendChild(o);
    }
    theme.addEventListener('change', () => {
      this.theme = theme.value;
      theme.blur();
      this.onTheme?.();
    });
    const bot = this.button('Bot plays: off (Y)', () => this.setBotPlays(!this.botPlays));
    this.botButton = bot;
    const mapScreen = this.button('Use the map screen: off', () => {
      this.useMapScreen = !this.useMapScreen;
      mapScreen.textContent = `Use the map screen: ${this.useMapScreen ? 'ON' : 'off'}`;
    });
    const bumps = this.button('Ground bumps: ON', () => {
      this.groundBumps = !this.groundBumps;
      bumps.textContent = `Ground bumps: ${this.groundBumps ? 'ON' : 'off'}`;
      this.onTheme?.();
    });
    const walls = this.button('Organic walls: ON', () => {
      this.organicWalls = !this.organicWalls;
      walls.textContent = `Organic walls: ${this.organicWalls ? 'ON' : 'off'}`;
      this.onTheme?.();
    });
    const overhang = this.button('Wall overhang: ON', () => {
      this.wallOverhang = !this.wallOverhang;
      overhang.textContent = `Wall overhang: ${this.wallOverhang ? 'ON' : 'off'}`;
      this.onTheme?.();
    });
    const whole = this.button('Show the whole map: off', () => {
      this.wholeMap = !this.wholeMap;
      whole.textContent = `Show the whole map: ${this.wholeMap ? 'ON' : 'off'}`;
      this.onMap?.();
    });
    const lighting = this.button(`Lighting: ${this.lighting ? 'ON' : 'off'}`, () => {
      this.lighting = !this.lighting;
      lighting.textContent = `Lighting: ${this.lighting ? 'ON' : 'off'}`;
      this.onTheme?.();
    });
    head.append(copy, reset, scenery, theme, bot, mapScreen, bumps, walls, overhang, whole, lighting);
    this.root.appendChild(head);
    const lab = buildLightLab(this.lightLab, () => this.lightTheme, (replace) => (replace ? this.onTheme?.() : this.onLight?.(false)), (text, onClick) => this.button(text, onClick));
    this.labRefresh = lab.refresh;
    this.root.appendChild(lab.box);
    this.benchBox = document.createElement('div');
    this.benchBox.className = 'bench';
    this.benchBox.style.display = 'none';
    this.root.appendChild(this.benchBox);
    this.runBox = document.createElement('div');
    this.runBox.className = 'bench';
    this.runBox.style.display = 'none';
    this.root.insertBefore(this.runBox, this.benchBox);
    this.progressBox = document.createElement('div');
    this.progressBox.className = 'bench';
    this.progressBox.style.display = 'none';
    this.root.insertBefore(this.progressBox, this.runBox);

    let group = '';
    for (const c of TUNING_CONTROLS) {
      if (c.group !== group) {
        group = c.group;
        const h = document.createElement('h3');
        h.textContent = group;
        this.root.appendChild(h);
      }
      const label = document.createElement('label');
      const name = document.createElement('span');
      name.textContent = c.key.split('.').pop()!;
      name.title = c.key;
      const value = document.createElement('span');
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(c.min);
      input.max = String(c.max);
      input.step = String(c.step);
      input.addEventListener('input', () => {
        setTuningValue(this.tuning, c.key, Number(input.value));
        saveTuning(this.tuning);
        this.refreshRow(c.key);
      });
      label.append(name, value, input);
      this.root.appendChild(label);
      this.rows.set(c.key, { input, value, name });
    }
    this.refresh();
  }

  /** Show the test bench controls. Called by the game once it knows what can be chosen. */
  setBench(opts: BenchOptions): void {
    const box = this.benchBox;
    if (!box) return;
    box.replaceChildren();
    box.style.display = 'block';
    const h = document.createElement('h3');
    h.textContent = 'Test bench (key 5)';
    const hint = document.createElement('p');
    hint.textContent = 'A blank course with one thing at the centre. Pick it, then Load. Moving things cross the centre.';
    const select = (id: string, items: readonly { id: string; label: string }[], value: string) => {
      const el = document.createElement('select');
      el.id = id;
      for (const it of items) {
        const o = document.createElement('option');
        o.value = it.id;
        o.textContent = it.label;
        el.appendChild(o);
      }
      el.value = value;
      return el;
    };
    const objLabel = document.createElement('p');
    objLabel.textContent = 'At the centre:';
    const obj = select('bench-object', opts.choices, opts.current.object);
    const abLabel = document.createElement('p');
    abLabel.textContent = 'Start with ability:';
    const ab = select('bench-ability', opts.abilities, opts.current.ability);
    const exLabel = document.createElement('p');
    exLabel.textContent = 'Enemy rank, trait and element (Milestone 8):';
    const rank = select('bench-rank', opts.ranks, opts.current.rank);
    const trait = select('bench-trait', opts.traits, opts.current.trait);
    const element = select('bench-element', opts.elements, opts.current.element);
    const load = this.button('Load test bench', () => {
      // Give the keys back to the game.
      for (const el of [obj, ab, rank, trait, element]) el.blur();
      opts.onLoad(obj.value, ab.value, { rank: rank.value, trait: trait.value, element: element.value });
    });
    box.append(h, hint, objLabel, obj, abLabel, ab, exLabel, rank, trait, element, load);
  }

  /** Show the run's testing aids, or hide them (null) when no run is going. */
  setRun(opts: RunOptions | null): void {
    const box = this.runBox;
    if (!box) return;
    box.replaceChildren();
    box.style.display = opts ? 'block' : 'none';
    if (!opts) return;
    const h = document.createElement('h3');
    h.textContent = 'Run testing aids (key 7)';
    const select = (items: readonly { id: string; label: string }[]) => {
      const el = document.createElement('select');
      for (const it of items) {
        const o = document.createElement('option');
        o.value = it.id;
        o.textContent = it.label;
        el.appendChild(o);
      }
      return el;
    };
    const gear = select(opts.gear);
    const ups = select(opts.upgrades);
    const count = document.createElement('input');
    count.type = 'number';
    count.min = '0';
    count.max = '9';
    count.value = String(opts.countdown);
    count.style.width = '48px';
    const done = (el: HTMLElement) => el.blur();
    box.append(
      h,
      this.button('+20 yellow stars', () => opts.onStars()),
      ...(opts.canWin ? [this.button('Win this course', () => opts.onWin())] : []),
      document.createElement('br'),
      gear,
      this.button('Give gear', () => {
        done(gear);
        opts.onGear(gear.value);
      }),
      ups,
      this.button('Give upgrade', () => {
        done(ups);
        opts.onUpgrade(ups.value);
      }),
      document.createElement('br'),
      document.createTextNode('Boss countdown '),
      count,
      this.button('Set', () => {
        done(count);
        opts.onCountdown(Number(count.value));
      }),
    );
  }

  setProgress(opts: ProgressOptions | null): void {
    const box = this.progressBox;
    if (!box) return;
    box.replaceChildren();
    box.style.display = opts ? 'block' : 'none';
    if (!opts) return;
    const h = document.createElement('h3');
    h.textContent = opts.title;
    box.append(h, ...opts.buttons.map((b) => this.button(b.label, b.onClick)));
    if (opts.arenas && opts.onArena) {
      const el = document.createElement('select');
      for (const a of opts.arenas) {
        const o = document.createElement('option');
        o.value = a.id;
        o.textContent = a.label;
        el.appendChild(o);
      }
      box.append(document.createElement('br'), el, this.button('Fight the boss here', () => {
        el.blur();
        opts.onArena!(el.value);
      }));
    }
    if (opts.text) {
      const pre = document.createElement('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.maxHeight = '160px';
      pre.style.overflow = 'auto';
      pre.style.fontSize = '10px';
      pre.textContent = opts.text;
      box.append(pre);
    }
  }

  private button(text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.addEventListener('click', () => {
      onClick();
      // Give the keys back to the game (the panel keeps key presses to itself).
      b.blur();
    });
    return b;
  }

  private refresh(): void {
    for (const key of this.rows.keys()) this.refreshRow(key);
  }

  private refreshRow(key: string): void {
    const row = this.rows.get(key)!;
    const v = getTuningValue(this.tuning, key);
    row.input.value = String(v);
    row.value.textContent = String(Math.round(v * 1000) / 1000);
    row.name.classList.toggle('changed', v !== getTuningValue(DEFAULT_TUNING, key));
  }
}
