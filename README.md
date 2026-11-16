# DreamCourseDream

An original browser game: an isometric mini-golf roguelike with 16-bit-style pixel art. You are the ball.

**Play:** https://isaaczenz.github.io/DreamCourseDream/ (updates automatically when `main` changes)

Design and plan: [`docs/DESIGN.md`](docs/DESIGN.md), [`docs/FEATURES.md`](docs/FEATURES.md), [`docs/PLAN.md`](docs/PLAN.md).

## Run it locally

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the game with live reload |
| `npm test` | Run the unit tests once |
| `npm run test:watch` | Re-run tests as you edit |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Check code rules, including that `src/sim/` and `src/gen/` stay free of Phaser, the browser, the clock and `Math.random` |
| `npm run check` | Type check, lint and test in one go |
| `npm run art` | Regenerate the placeholder sprites and `assets/manifest.json` |
| `npm run gen -- ABC123 12` | Print one generated course (seed, budget) as text, with pass or fail |
| `npm run gen:batch` | Generate 500 courses (budgets 8, 12, 20, 30), report the pass rate and times, and draw a contact sheet in `tools/out/` (the pictures need Playwright) |
| `npm run boss:report` | Milestone 7: the bot fights every built boss combination (10 seeds, three loadouts) and writes `docs/reports/boss-combinations.md`, listing the ones it struggles with. Takes about 10 minutes |
| `npm run build` | Build the site into `dist/` |
| `npm run preview` | Serve the built site locally |

## Controls (Milestone 5b)

Every mechanic works from the keyboard alone; the mouse is optional (owner decision).

| Key | Action |
|---|---|
| Left / Right (or A / D) | Turn the aim around the ball. Hold Shift for fine turning. While a Tornado is active: steer it. |
| Up / Down (or W / S) | Raise or lower the planned power (the dotted preview) |
| Space (aiming) | Hold to charge the meter (up, down, up, down), release to shoot. Release at the very top for a PERFECT shot. |
| Space (ball moving) | Bounce boost: press just before the ball lands, just before it skips on water, or just before it hits a guard rail |
| F | Use your ability (once per shot, while the ball moves) |
| Esc | Drop the plan and aim again |
| Mouse: press, pull back, release; then hold and release | The same two-step shot with the mouse (slingshot pull to plan, hold to charge) |
| Right-click | Drop the plan (mouse) |
| T | Ground shot or lofted shot |
| X / Z | More topspin / more backspin |
| E / Q | Curve right / curve left |
| P | Testing only: quick shot. The pull fires straight away at the pulled power, with no meter. |
| R | Restart the course (same seed) |
| Enter | On the end screen: next course after a win, restart after a loss |
| I / J / K / L, or drag with the right mouse button | Pan the camera (moved from the arrows and WASD, which now aim) |
| C | Centre the camera on the ball |
| O | Overview: zoom out to see the whole course; O again goes back to the ball |
| 1, 2, 3, 4, 5, N | Switch test course (4 is the enemies and abilities course, 5 the test bench) |
| 6 | A generated course: a journey across one landmass (Milestones 5 and 5b). Same seed and budget always give the same course. Bigger budgets make bigger courses; a loading screen shows while it is made |
| [ / ] | Generated course: lower or raise the budget by 2 and make a new course |
| V | Seed viewer: type a seed and a budget, see the course and whether it passed the checks |
| B | Generated course: watch the bot play it (press again to stop) |
| Enter (after winning a generated course) | The next generated course: new seed, budget up by a random 0 to 4 |
| G | Cycle the debug overlay: coordinates, heights, surfaces, areas (generated courses: the journey's areas, passages and pockets, and the budget spend), off. Shows sentinel radii (outer solid, inner dashed), paths and cloud danger zones. |
| U | Tuning panel (debug) |
| H | Show or hide the help lines |

### Screens outside a course (Milestone 7)

The game opens on a placeholder **start menu**: Continue run (when a run was saved in a town), New run, Upgrades. Up/Down and Enter.

- **Upgrades (the hub):** spend stashed blue stars. Up/Down choose, Enter buy, Left/Right pick the starting ability once it is unlocked, Esc back.
- **Map:** Left/Right choose a node, Enter go. The boss marker shows the boss's bug in its colour. After a run ends, Enter goes back to the start menu.
- **Town:** Left/Right walk, Enter go in. In the Burrow: Enter swaps the worn and stored item, **X sells the stored item** for 25%. If something waits in the hold, a sorting screen comes first: Up/Down choose, Enter cycles WEAR / HOUSE / SELL, C confirms.
- **Boss prize:** Left/Right choose, Enter take it, Esc skip.
- Key 7 on a test course opens the start menu (or goes back to the run in progress).

### The HUD

Top left: health (hearts), shots left (blue orbs), the star meter (stars towards the course's quota; it turns green and says OPEN when the exit opens), yellow stars held, and the seed (`#ABC123`). Each shot uses one orb. When they run out you get a recover turn and they refill. Next to it: the ability slot (the ability you hold; greyed once used this shot).

You can also open a course directly: `?course=course-rules`, `?course=flat-walls`, `?course=slopes-surfaces` or `?course=enemies-abilities` or `?course=generated` (add `&budget=12` for the budget), or `?course=test-bench&bench=rail` for the test bench with something chosen (any object id, or `rail`), and add `&seed=ABC123` to replay a seed, `?boss=ABC` to fight a bug boss at once with base stats (pick parts with `&bug=goliath|mantis|grasshopper`, `&colour=red|blue|yellow|green|rainbow`, `&skill=slam|pods|charge`, and `&region=2` for the stronger version), `&debug=heights` (or `coords`, `surfaces`) or `&tune=1` to open the tuning panel.

## Folder layout

```
src/
  sim/      game rules and physics; runs in Node, no Phaser
  gen/      course and map generators
  content/  definitions and tuning numbers
  render/   Phaser scenes that draw the sim state
  ui/       HUD and menus
  input/    mouse and keyboard to shot commands
  save/     local storage
assets/     sprites, manifest, LICENSES.md
tools/      helper scripts
tests/      unit tests
```

## Deployment

Every push runs the CI workflow (type check, lint, tests, build). Every push to `main` also publishes the game to GitHub Pages.

One-time setup: in the repository on GitHub, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
