/**
 * Proves the lint rules that keep src/sim and src/gen pure actually fire.
 * `npm run lint` applies them to the real code; these tests make sure nobody
 * weakens the rules without noticing.
 */
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIdsFor(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'parse-error');
}

const forbidden: Array<[string, string, string]> = [
  ['imports Phaser', "import Phaser from 'phaser';\nexport const x = Phaser;", 'no-restricted-imports'],
  ['imports render code', "import { x } from '../render/game';\nexport const y = x;", 'no-restricted-imports'],
  ['imports UI code', "import { x } from '../ui/hud';\nexport const y = x;", 'no-restricted-imports'],
  ['calls Math.random', 'export const x = Math.random();', 'no-restricted-properties'],
  ['reads Date.now', 'export const x = Date.now();', 'no-restricted-properties'],
  ['reads performance.now', 'export const x = performance.now();', 'no-restricted-properties'],
  ['constructs a Date', 'export const x = new Date();', 'no-restricted-syntax'],
  ['uses window', 'export const x = window.innerWidth;', 'no-restricted-globals'],
];

describe('sim/gen purity rules', () => {
  for (const folder of ['src/sim', 'src/gen']) {
    for (const [name, code, rule] of forbidden) {
      it(`${folder}: flags code that ${name}`, async () => {
        expect(await ruleIdsFor(code, `${folder}/example.ts`)).toContain(rule);
      });
    }
  }

  it('allows the seeded generator inside src/sim', async () => {
    const code = "import { Rng } from './rng';\nexport const x = Rng.fromSeed('ok').next();";
    expect(await ruleIdsFor(code, 'src/sim/example.ts')).toEqual([]);
  });

  it('does not restrict Phaser or Math.random in src/render', async () => {
    const code = "import Phaser from 'phaser';\nexport const x = [Phaser, Math.random()];";
    expect(await ruleIdsFor(code, 'src/render/example.ts')).toEqual([]);
  });
});
