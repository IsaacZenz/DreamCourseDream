/**
 * Seed viewer (Milestone 5 design sheet, section 6.2; V key): type a seed and a
 * budget, generate the course, and see whether it passed the checks. A plain
 * HTML panel like the tuning panel.
 */
const CSS = `
#seed-viewer { position: fixed; top: 0; left: 0; width: 300px; max-height: 100vh; overflow-y: auto; z-index: 11;
  background: rgba(16,16,32,0.94); color: #e8e8f0; font: 12px/1.35 ui-monospace, Menlo, Consolas, monospace;
  padding: 8px 10px; box-sizing: border-box; border-right: 2px solid #3a3a5a; }
#seed-viewer h2 { font-size: 13px; margin: 0 0 6px; color: #f8e048; }
#seed-viewer label { display: grid; grid-template-columns: 70px 1fr; gap: 4px; align-items: center; margin: 3px 0; }
#seed-viewer input { font: inherit; background: #2a2a48; color: #fff; border: 1px solid #5a5a8a; padding: 2px 4px; }
#seed-viewer button { font: inherit; margin: 6px 4px 0 0; padding: 3px 8px; background: #2a2a48; color: #fff;
  border: 1px solid #5a5a8a; cursor: pointer; }
#seed-viewer .pass { color: #80f080; font-weight: bold; }
#seed-viewer .fail { color: #ff8080; font-weight: bold; }
#seed-viewer p { margin: 3px 0; color: #c0c8e0; white-space: pre-wrap; }
#seed-viewer .dim { color: #8088a0; }
`;

export interface SeedViewerInfo {
  readonly seed: string;
  readonly budget: number;
  readonly passed: boolean;
  /** Lines of detail (attempts, rejections, time, bot result, spend). */
  readonly lines: readonly string[];
  readonly json: string;
}

export interface SeedViewerActions {
  readonly generate: (seed: string, budget: number) => void;
  readonly watchBot: () => void;
}

export class SeedViewer {
  private readonly root: HTMLDivElement;
  private readonly seedIn: HTMLInputElement;
  private readonly budgetIn: HTMLInputElement;
  private readonly result: HTMLDivElement;
  private json = '';
  private readonly onGenerate: SeedViewerActions['generate'];

  constructor(actions: SeedViewerActions) {
    if (!document.getElementById('seed-viewer-css')) {
      const style = document.createElement('style');
      style.id = 'seed-viewer-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.onGenerate = actions.generate;
    const root = document.createElement('div');
    root.id = 'seed-viewer';
    root.style.display = 'none';
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.submit();
      if (e.key === 'Escape') this.toggle(false);
    });
    const h = document.createElement('h2');
    h.textContent = 'Seed viewer (V)';
    root.appendChild(h);
    const field = (name: string, input: HTMLInputElement) => {
      const l = document.createElement('label');
      l.append(name, input);
      root.appendChild(l);
    };
    this.seedIn = document.createElement('input');
    this.seedIn.maxLength = 12;
    this.budgetIn = document.createElement('input');
    this.budgetIn.type = 'number';
    this.budgetIn.min = '4';
    this.budgetIn.max = '40';
    field('Seed', this.seedIn);
    field('Budget', this.budgetIn);
    const button = (text: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.addEventListener('click', fn);
      root.appendChild(b);
    };
    button('Generate (Enter)', () => this.submit());
    button('Watch the bot (B)', () => actions.watchBot());
    button('Copy course JSON', () => void navigator.clipboard?.writeText(this.json));
    this.result = document.createElement('div');
    root.appendChild(this.result);
    const tip = document.createElement('p');
    tip.className = 'dim';
    tip.textContent = 'Same seed and budget always give the same course. Esc closes.';
    root.appendChild(tip);
    document.body.appendChild(root);
    this.root = root;
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  toggle(show = !this.visible): void {
    this.root.style.display = show ? 'block' : 'none';
    // Focus after this key press has finished, so the V does not land in the box.
    if (show) setTimeout(() => this.seedIn.focus(), 0);
  }

  /** Show the course that is loaded now. */
  show(info: SeedViewerInfo): void {
    this.seedIn.value = info.seed;
    this.budgetIn.value = String(info.budget);
    this.json = info.json;
    this.result.replaceChildren();
    const verdict = document.createElement('p');
    verdict.className = info.passed ? 'pass' : 'fail';
    verdict.textContent = info.passed ? 'PASS' : 'FAIL';
    this.result.appendChild(verdict);
    for (const line of info.lines) {
      const p = document.createElement('p');
      p.textContent = line;
      this.result.appendChild(p);
    }
  }

  private submit(): void {
    const seed = this.seedIn.value.trim().toUpperCase();
    const budget = Number(this.budgetIn.value);
    if (!seed || !Number.isFinite(budget)) return;
    this.onGenerate(seed, Math.round(budget));
  }
}
