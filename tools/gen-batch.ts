/**
 * Batch test for the course generator (Milestone 5 design sheet, section 6.3).
 *
 *   npm run gen:batch                 500 courses and a contact sheet of 48
 *   npm run gen:batch -- 100 0        100 courses, no contact sheet
 *
 * Seeds come from a fixed list (B0000, B0001, ...) and budgets cycle through
 * 8, 12, 20 and 30, so every run tests the same courses. Reports the pass rate on
 * the first try, the overall pass rate, generation times and rejection
 * reasons. The contact sheet is drawn by the real renderer in a headless
 * browser. Everything is written to tools/out/ (not committed).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DEFAULT_TUNING } from '../src/content/tuning.ts';
import { generateCourse } from '../src/gen/validate.ts';

const COUNT = Number(process.argv[2] ?? 500);
const SHEET = Number(process.argv[3] ?? 48);
const BUDGETS = [8, 12, 20, 30];
const OUT = new URL('./out/', import.meta.url);
mkdirSync(OUT, { recursive: true });

interface Row {
  seed: string;
  budget: number;
  ms: number;
  attempts: number;
  passed: boolean;
  firstTry: boolean;
  botShots: number;
  botHealth: number;
}

const rows: Row[] = [];
const reasons: Record<string, number> = {};
const t0 = performance.now();
for (let i = 0; i < COUNT; i++) {
  const seed = `B${String(i).padStart(4, '0')}`;
  const budget = BUDGETS[i % BUDGETS.length]!;
  const s = performance.now();
  const r = generateCourse(seed, budget, DEFAULT_TUNING);
  const ms = performance.now() - s;
  for (const [k, n] of Object.entries(r.rejections)) reasons[k] = (reasons[k] ?? 0) + n;
  rows.push({ seed, budget, ms, attempts: r.attempts, passed: !r.fallback, firstTry: r.attempts === 1, botShots: r.bot?.shots ?? 0, botHealth: r.bot?.health ?? 0 });
  if ((i + 1) % 50 === 0) process.stdout.write(`  ${i + 1}/${COUNT}\n`);
}
const total = performance.now() - t0;

const pct = (n: number) => `${((100 * n) / rows.length).toFixed(1)}%`;
const times = rows.map((r) => r.ms).sort((a, b) => a - b);
const lines = [
  `Generated ${rows.length} courses in ${(total / 1000).toFixed(1)} s.`,
  `Passed on the first try: ${pct(rows.filter((r) => r.firstTry).length)} (target 95%).`,
  `Passed overall (no fallback): ${pct(rows.filter((r) => r.passed).length)}.`,
  `Generation time: average ${Math.round(total / rows.length)} ms, median ${Math.round(times[Math.floor(times.length / 2)]!)} ms, 95th percentile ${Math.round(times[Math.floor(times.length * 0.95)]!)} ms, slowest ${Math.round(times[times.length - 1]!)} ms.`,
  `Targets (5b sheet): average under 1 s up to budget 14, up to 5 s above. Under 1 s: ${pct(rows.filter((r) => r.ms < 1000).length)}; under 5 s: ${pct(rows.filter((r) => r.ms < 5000).length)}.`,
];
for (const b of BUDGETS) {
  const rs = rows.filter((r) => r.budget === b);
  const avg = rs.reduce((n, r) => n + r.ms, 0) / rs.length;
  const shots = rs.reduce((n, r) => n + r.botShots, 0) / rs.length;
  lines.push(`  Budget ${b}: ${rs.length} courses, first try ${((100 * rs.filter((r) => r.firstTry).length) / rs.length).toFixed(1)}%, average ${Math.round(avg)} ms, bot used ${shots.toFixed(1)} shots on average.`);
}
lines.push(Object.keys(reasons).length ? `Rejections: ${Object.entries(reasons).map(([k, n]) => `${k} ×${n}`).join(', ')}` : 'Rejections: none.');
const report = lines.join('\n');
console.log(`\n${report}`);
writeFileSync(new URL('batch-report.txt', OUT), report + '\n');
writeFileSync(new URL('batch-results.json', OUT), JSON.stringify(rows, null, 1));

if (SHEET > 0) await contactSheet(rows.slice(0, SHEET));

/** The few Playwright calls used here (Playwright is optional, so its types are not installed). */
interface PwPage {
  goto(url: string): Promise<unknown>;
  waitForEvent(e: 'console', o: { predicate: (m: { text(): string }) => boolean; timeout: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(o?: { path?: string; fullPage?: boolean }): Promise<Buffer>;
  setContent(html: string): Promise<void>;
}
interface PlaywrightChromium {
  launch(): Promise<{ newPage(o: { viewport: { width: number; height: number }; deviceScaleFactor?: number }): Promise<PwPage>; close(): Promise<void> }>;
}

/** Draw each course with the real renderer and lay the pictures out in a grid. */
async function contactSheet(list: Row[]): Promise<void> {
  const { createServer } = await import('vite');
  // Playwright is not a project dependency: use it if it is installed (it is on the cloud machines).
  let chromium: PlaywrightChromium;
  try {
    chromium = (createRequire(import.meta.url)('playwright') as { chromium: PlaywrightChromium }).chromium;
  } catch {
    console.log('\nNo contact sheet: Playwright is not installed. Run "npm install --no-save playwright" and "npx playwright install chromium", then try again.');
    return;
  }
  const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const port = server.config.server.port ?? 5199;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 384, height: 216 }, deviceScaleFactor: 1 });
  const shots: { row: Row; png: string }[] = [];
  for (const row of list) {
    const ready = page.waitForEvent('console', { predicate: (m) => m.text().includes(`Course #${row.seed}`), timeout: 30_000 });
    await page.goto(`http://localhost:${port}/?course=generated&seed=${row.seed}&budget=${row.budget}&thumb=1`);
    await ready;
    await page.waitForTimeout(250);
    shots.push({ row, png: (await page.screenshot()).toString('base64') });
    process.stdout.write('.');
  }
  const cells = shots
    .map(
      ({ row, png }) =>
        `<figure><img src="data:image/png;base64,${png}"><figcaption>#${row.seed} B${row.budget} <b class="${row.passed ? 'p' : 'f'}">${row.passed ? 'PASS' : 'FAIL'}</b> ${row.attempts > 1 ? `try ${row.attempts}` : ''} ${Math.round(row.ms)} ms</figcaption></figure>`,
    )
    .join('');
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await sheet.setContent(`<style>body{margin:8px;background:#101020;color:#ddd;font:12px monospace;display:grid;grid-template-columns:repeat(6,256px);gap:6px}
    figure{margin:0}img{width:256px;height:144px;image-rendering:pixelated;display:block}.p{color:#80f080}.f{color:#ff8080}</style>${cells}`);
  await sheet.screenshot({ path: new URL('contact-sheet.png', OUT).pathname, fullPage: true });
  await browser.close();
  await server.close();
  console.log(`\nContact sheet: tools/out/contact-sheet.png (${shots.length} courses)`);
}
