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
| `npm run build` | Build the site into `dist/` |
| `npm run preview` | Serve the built site locally |

## Controls (Milestone 2)

| Key | Action |
|---|---|
| Step 1: press left mouse, pull back, release | Plan the shot like a slingshot: the ball goes the opposite way to the pull. The dotted line previews the path (yellow dots = in the air). The pull's power is a preview only. |
| Step 2: hold left mouse, release | Charge: the meter goes up, down, up, down. Release to shoot; the meter alone sets the real power. The white mark on the meter is your planned power. If you never release, the ball launches on its own at 10% ("TOO SLOW!"). |
| Release at the very top | Release in the red zone at the top of the meter for a PERFECT shot (extra power) |
| Right-click or Esc | Drop the plan and pull again |
| P | Testing only: quick shot. The pull fires straight away at the pulled power, with no meter. |
| T | Ground shot or lofted shot |
| X / Z | More topspin / more backspin |
| E / Q | Curve right / curve left |
| Space | Bounce boost: press just before the ball lands |
| R | Put the ball back at the start |
| U | Tuning panel (debug): sliders for every physics number. Changes are remembered in your browser; "Reset all" undoes them. |
| H | Show or hide the help lines |
| Arrow keys / WASD, or drag with the right mouse button | Pan the camera |
| C | Centre the camera on the ball |
| 1, 2, N | Switch test course |
| G | Cycle the debug overlay: coordinates, heights, surfaces, off. Hover a tile for its details. |

You can also open a course directly: `?course=flat-walls` or `?course=slopes-surfaces`, and add `&debug=heights` (or `coords`, `surfaces`) or `&tune=1` to open the tuning panel.

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
