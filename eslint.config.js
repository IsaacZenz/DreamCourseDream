// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Folders that must stay pure: no rendering library, no browser, no clock,
 * no unseeded randomness. See CLAUDE.md rules 2 and 3.
 */
export const PURE_FOLDERS = ['src/sim/**/*.ts', 'src/gen/**/*.ts'];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: PURE_FOLDERS,
    rules: {
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'requestAnimationFrame', 'setTimeout', 'setInterval'].map(
          (name) => ({ name, message: 'src/sim and src/gen must run in Node with no browser and no real-time timers.' }),
        ),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['phaser', 'phaser/*'],
              message: 'src/sim and src/gen must not use Phaser. Keep the simulation separate from the display.',
            },
            {
              group: ['**/render', '**/render/**', '**/ui', '**/ui/**', '**/input', '**/input/**', '**/save', '**/save/**'],
              message: 'src/sim and src/gen must not import display, UI, input or save code.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded generator in src/sim/rng.ts.' },
        { object: 'Date', property: 'now', message: 'Do not read the clock in the simulation. It must be deterministic.' },
        { object: 'performance', property: 'now', message: 'Do not read the clock in the simulation. It must be deterministic.' },
        { object: 'crypto', property: 'getRandomValues', message: 'Use the seeded generator in src/sim/rng.ts.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'Do not read the clock in the simulation. It must be deterministic.' },
      ],
    },
  },
);
