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
| Move the mouse | Aim. The dotted line is the predicted path (yellow dots = in the air). |
| Hold left mouse button, release | Power meter sweeps up and down; release to shoot. Right-click or Esc cancels. |
| Hold left mouse button at the top | Release in the red zone at the top of the meter for a PERFECT shot (extra power) |
| P | Testing only: switch to drag power (press, pull back like a slingshot, release). Same power rules as the meter. The real game is meter-only. |
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
