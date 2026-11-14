/**
 * Debug tuning panel: a plain HTML side panel with a slider for every tuning
 * number. Changes apply to the next shot and to the aim guide straight away.
 * Hidden until toggled (U key in the game, or ?tune=1 in the address).
 */
import { DEFAULT_TUNING, TUNING_CONTROLS, getTuningValue, setTuningValue, type Tuning } from '../content/tuning';
import { clearTuning, saveTuning } from '../save/tuningStore';

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
`;

export class TuningPanel {
  private readonly root: HTMLDivElement;
  private readonly rows = new Map<string, { input: HTMLInputElement; value: HTMLSpanElement; name: HTMLSpanElement }>();

  private readonly tuning: Tuning;

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
    head.append(copy, reset);
    this.root.appendChild(head);

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

  private button(text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.addEventListener('click', onClick);
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
