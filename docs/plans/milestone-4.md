# Milestone 4 design sheet — Enemies and abilities

**Status: signed off by the owner, 2026-11-14.** Built on branch `milestone-4-enemies-abilities`.

How to review: read each item, change any number or behaviour you want, and answer the numbered questions in [section 9](#9-questions-for-the-owner). Every number here is a starting value and goes into `src/content/` so it can be tuned later. Items marked **Decided** come from you already and are only restated.

Speeds are in tiles per second, distances and heights in tiles. For scale: gravity is 20, a full ground shot is 13.2, a spring throws the ball up at 9 (about 2 tiles high), and one height step is 0.5 tiles.

---

## 1. Systems

### 1.1 World clock (how things move "in real time" and stay deterministic)

Patrollers, moving obstacles and drifting clouds keep moving while you aim (DESIGN.md section 8). The simulation must still give the same result for the same seed and inputs (CLAUDE.md rule 3).

- The simulation keeps a **world clock** that counts fixed 1/120 s steps. The display advances it while you aim; the shot advances it while the ball moves.
- Every moving thing's position is worked out from the clock alone (go along the path, turn round at the end, repeat). Nothing reads the real time.
- A shot records the clock step it was fired on. Replaying the same shots at the same steps gives the same course every time, so the bot (Milestone 5) and the tests can replay games.
- The clock pauses on the course-complete, run-over and tuning-panel screens.

### 1.2 Turn order (DESIGN.md section 8)

1. **Aim.** Clock runs; patrollers, moving obstacles and drifting clouds move. Sentinels wait.
2. **Shot.** The simulation runs until the ball **and any enemy launched during the shot** (Lunger, Mole) have stopped. Hit and pass-by triggers fire as they happen. "Immediate" responses act at once.
3. **Rest check.** Rest triggers fire. Pending dropped stars and flag poles settle.
4. **Enemy turn.** Every activated sentinel takes one action (a Lunger's launch is simulated until it stops), in the order they are listed in the course file. Stunned ones skip (section 4). The display shows each action for about 0.4 s; input is locked until it finishes.
5. If shots are 0: recover turn (step 4 runs again), then shots refill. Otherwise back to step 1.

**Damage immunity (owner, 2026-11-14):** after taking any damage, the ball cannot be damaged again for **0.5 seconds** of game time (`damageImmunity` in `src/content/rules.ts`). The ball blinks while it is immune. This **replaces** the Milestone 3 rule "damaged at most once per shot": a ball knocked about can now take several hits, and spikes followed by sinking can cost 2 health if more than 0.5 s apart. Enemy-turn actions are played one after another, so each can hurt.

### 1.2a Moving things hitting the ball (owner, 2026-11-14)

- **Free-rolling things** (Lunger, Mole, Spitter seed) and the ball deflect off each other like two balls colliding: both bounce away.
- **Things on a fixed route** (Trundler, sliding block) keep going on their route and knock the ball out of the way. The ball is pushed off at the mover's speed plus a knock of 5 tiles/s away from it.
- This can happen to a resting ball, even while you are aiming. The ball then rolls under normal physics until it rests: it can be bounced into more enemies, hazards or water and take several hits on the way (with the 0.5 s immunity between hits). This does **not** use up a shot. Your aim and any meter charge are cancelled; you aim again once the ball rests.
- A gate still never closes on the ball: it stays open until the ball has left its tile.

### 1.3 Damage calculation (FEATURES.md section 2, in this order)

| Step | What it does | Used by a Milestone 4 enemy? |
|---|---|---|
| 1. Hit damage | The ball's hit damage stat after modifiers (starts at 1) | Yes |
| 2. Element | Weak to the hit's element: ×2. Resistant: half, rounded down | Built and tested; no starter enemy is weak or resistant. Burner hits are fire. |
| 3. Position | "From above" = ball was in the air just before contact. "From behind" = from the half opposite the enemy's facing. Weak spot ×2; guarded side blocks the hit | Built and tested with test-only enemy entries; no starter enemy uses it |
| 4. Shield or block | A shield (the Shielded trait, Milestone 8) blocks the first hit each shot | Built and tested with a test-only entry |
| 5. Subtract | Take the result from the enemy's health; 0 or less defeats it | Yes |

- A blocked hit (guarded side or shield) does no damage, but the ball still bounces off and the **hit trigger still fires** (it was hit).
- The half-second same-enemy cooldown stays (`hitCooldown` 0.5).
- **Damage to the ball** goes: enemy's attack damage after modifiers → armour step (empty until gear in Milestone 6) → subtract from health.

### 1.4 Enemy template (FEATURES.md section 4)

Every enemy entry in `src/content/objects.ts` gets all template fields, even unused ones:

`id, name, sprite, family, tier, stats (health, attackDamage, moveRange, attackRange, outerRadius, innerRadius), starValue, element, weakTo[], resists[], weakSpots[], guardedSides[], triggers {hit, rest, passBy}, behaviour, contact, grantsAbility, allowedTraits[], allowedGear[], squadThemes[], cost`, plus the existing shape, height and bounce.

- **Behaviour** is picked from a fixed list with settings: `none`, `patrol` (speed), `lob` (projectile settings), `launch` (rolls like the ball: aimed at the ball or in a random direction, with speed settings), `burrow` (hidden under a hill, surfaces when rolled over, stays up for N turns). A fourth enemy that mixes these with new numbers is a new data entry only. A truly new kind of behaviour would need code, once.
- **Facing:** each enemy faces one of the four diagonal directions (ne, se, sw, nw). The course file can set it (default se). Patrollers face where they are going; a Lunger turns to face the ball when it moves.

### 1.5 Status effects (FEATURES.md section 12)

Template: `id, name, icon, modifiers while active, effect each turn, duration in turns, reapply rule (add time / ignore / reset)`. Statuses apply through the modifier system, with "N turns" as the duration. For the ball, one turn is one shot.

**Stunned** (the only status built now):

| | On an enemy | On the ball |
|---|---|---|
| Effect | Skips its next action. A stunned patroller stops moving until after the next enemy turn. | Loses 1 shot at once |
| Lasts | 1 enemy turn | 1 shot |
| Reapplied while active | Ignored | Ignored |
| Shown as | Small stars icon over its head | Icon by the shots counter |

What causes Stunned in this milestone: see question 2. Default: the Anchor's landing stuns enemies near it.

### 1.6 Course file additions

Course format goes to version 2; version 1 files still load. New optional fields on an object:

| Field | Used by | Example |
|---|---|---|
| `path` | Trundler, sliding block, drifting cloud | `"path": [[3,4],[8,4],[8,6]]` — tile centres, walked there and back |
| `facing` | Enemies | `"facing": "nw"` |
| `phase` | Patrollers, moving obstacles | `"phase": 0.5` — start halfway round its cycle, so two gates are not in step |
| `orient` | Gate | `"orient": "x"` or `"y"` — which way the bars run |
| `drops` | Crate, cracked tile | `"drops": ["heart"]` |

The schema check rejects paths that leave the course, cross out of bounds or a face higher than one step, and a `path` on an object that does not move. Stars inside crates and cracked tiles count towards the "enough stars for the quota" check.

---

## 2. Enemies

**Owner, 2026-11-14:** for now every enemy is worth **1 star**. When an enemy is defeated, its star is secured and shown hovering above its flag pole (section 3.3).

All have `element: none`, no weak/resistant elements, no weak spots or guarded sides, no traits, no gear, no squad themes (these come in Milestone 8). Shape is a circle, radius 0.3, height 0.6, bounce 0.6, unless noted.

### 2.1 Trundler — patroller, tier 2

| Field | Value |
|---|---|
| Health / stars / cost | 2 / 1 / 3 |
| Movement | Follows its `path` at 1.5 tiles/s, there and back, all the time (also while you aim) |
| Contact effect | When the ball hits it **and it survives**: the ball takes 1 damage (attack damage 1) and is knocked away (section 1.2a) |
| Defeated by the hit | No contact effect; the ball carries on; flag pole goes up (section 3.3) |
| Triggers | None (patrollers do not use sentinel triggers) |
| Running into the ball | Keeps going on its path and knocks the ball out of the way (section 1.2a). The ball takes 1 damage, whether it was moving or resting |
| Stunned | Freezes in place until after the next enemy turn |

How it plays: the first hit costs you 1 health unless you finish it in one (two damage needs gear later, or two shots). Timing your shot to meet it head-on vs. from behind does not matter yet.

### 2.2 Spitter — sentinel, tier 2 (the ranged one)

| Field | Value |
|---|---|
| Health / stars / cost | 2 / 1 / 3 |
| Outer radius / inner radius | 3.5 / 1.5 |
| Hit | Activated |
| Rest (ball stops inside 3.5) | Activated |
| Pass-by (ball goes through 1.5) | Activated |
| Action each enemy turn | **Lob (owner, 2026-11-14):** marks the spot where the ball is now with a target ring. On the **next** enemy turn it lobs a seed at that ring, then marks a new ring at the ball's new spot. Range 8 tiles; if the ball is further away it waits. |
| The seed | Has ball physics. It is launched as a lofted shot (50°) aimed so its first landing is on the ring, then carries on bouncing and rolling along that same line. It is affected by all terrain: slopes, surfaces, hazard tiles; it can fall off edges; water slows or stops it as it does the ball. It disappears once it stops, falls out of bounds or stops in water |
| Seed touches the ball | 1 damage while the seed is moving (flying, bouncing or rolling); the seed and the ball deflect off each other (section 1.2a) |
| Seed and other things | Bounces off blockers, enemies and moving obstacles. Does not hurt enemies, does not lower flags, is not zapped by clouds |
| Once activated | Stays activated for the rest of the course |

How it plays: once woken it is a slow, readable threat. You get one shot to move off the ring, but the seed keeps bouncing after it lands, so standing just past the ring in its line is still risky.

### 2.3 Lunger — sentinel, tier 2 (the one that chases)

**Decided** shape: rest trigger activates it; pass-by makes it act at once; it comes after the ball each turn.

**Owner, 2026-11-14:** the Lunger **launches itself and rolls like the golf ball**, using the same physics. It is affected by the terrain and bumps into obstacles. If it would fall off an edge it bounces back instead. If it rolls into water it bounces back out. Spikes still hurt it.

| Field | Value |
|---|---|
| Health / stars / cost | 2 / 1 / 3 |
| Outer radius / inner radius | 3 / 1.25 |
| Hit | Activated |
| Rest (ball stops inside 3) | Activated |
| Pass-by (ball goes through 1.25) | **Immediate:** it launches at the ball at once, while the ball is still moving. Then it is activated. Once per shot. |
| Action each enemy turn | **Launch:** rolls straight at the ball's spot along the ground. Launch speed is what would carry it to the ball on flat grass, capped at 10 tiles/s. It then rolls until it stops, like the ball. |
| Terrain | Slopes, friction per surface, boosters, conveyors, springs and warps all act on it as on the ball |
| Edges | Any drop to lower ground, or the edge of the course, works as a wall for it: it bounces back (bounce 0.6). Rising faces work as for the ball |
| Water | The edge of water works as a wall for it: it bounces off and never stops in water |
| Spikes | 1 damage to it, at most once per launch. If that defeats it, you still get its star and a flag pole |
| Obstacles | Bounces off blockers, crates, moving obstacles and other enemies. Passes through raised flag poles and lowers them (section 3.3) |
| Thunder cloud | Rolling under one zaps it: thrown in a random direction at 6 tiles/s (from the seed), **no damage**. Once per cloud per launch (owner, 2026-11-14) |
| Touching the ball while it is moving | The ball takes 1 damage, and the two deflect off each other (section 1.2a), even if the ball was resting |
| When it has stopped | Harmless: touching it does not hurt you. It is a normal target |
| Ball hits it while both are moving | Your hit counts against it **and** you take 1 damage |

How it plays: like a second golf ball aimed at you. You can use walls, slopes and water to make it miss, and you hit it safely once it has stopped.

### 2.5 Mole — sentinel, tier 2 (new, owner 2026-11-14)

**Owner, 2026-11-14:** the Mole lives underground under a molehill. Rolling directly over the molehill sets it off: it shoots out of the ground in a random direction and rolls to a stop. While it is moving it hurts the ball on contact; once stopped it does not. It stays still for one of your turns, then burrows back into the ground.

| Field | Value |
|---|---|
| Health / stars / cost | 1 / 1 / 3 |
| Underground | Only the molehill shows: a low mound (height 0.15) the ball rolls over without bouncing. The Mole cannot be hit while underground |
| Trigger | The ball **rolling** over the molehill: touching the ground within 0.35 tiles of its centre. A ball flying over it does not count. Response: immediate. Fires again each time it is underground and you roll over it |
| Launch | Out of the hill in a random direction (from the seed, so the same seed and shots give the same direction) at 8 tiles/s, then rolls with the same rules as the Lunger: terrain, edges and water bounce it back, spikes hurt it |
| Moving | Touching the ball costs the ball 1 damage, and the two deflect off each other (section 1.2a). Your ball and cannot hurt it while it moves (owner, 2026-11-14) |
| Thunder cloud | Same as the Lunger: thrown in a random direction, no damage |
| Stopped | Harmless and can be hit. One hit defeats it: star secured, flag pole where it stood |
| Burrowing | It stays up for the whole of your **next** shot. On the enemy turn after that shot it burrows where it stopped, and a new molehill appears there (owner, 2026-11-14) |
| Stunned | Stays up one turn longer before burrowing |

How it plays: a trap you can see. Roll over the hill on purpose to make it come up, dodge it, then hit it on your next shot before it goes back down.

### 2.4 Ability carriers — sentinel, tier 1

**Owner, 2026-11-14:** Tornado is added as a fourth ability, so a fourth carrier is added.

Mossback copies with a coloured shell and the ability's icon on their back.

| Working name | Grants | Health / stars / cost |
|---|---|---|
| Anchorback | Anchor | 1 / 1 / 2 |
| Emberback | Burner | 1 / 1 / 2 |
| Hopback | Hop | 1 / 1 / 2 |
| Whirlback | Tornado | 1 / 1 / 2 |

Never act; all triggers none. On defeat the ability goes straight into your slot (replacing what you held) and can be used in the same shot if you have not used one this shot.

---

## 3. Obstacles (FEATURES.md section 6)

### 3.1 Moving obstacles (cannot be defeated)

| | Sliding block | Gate |
|---|---|---|
| Shape | Square, 0.9 × 0.9 | Bar across the tile, 1.0 long × 0.2 thick (`orient` sets the direction) |
| Height | 0.5 | 1.0 when closed, 0 when open |
| Movement | Along its `path` at 1 tile/s, there and back | Open 2 s, closed 2 s, repeating; `phase` offsets it |
| Ball hits it | Bounces off as off a moving wall (its speed is taken into account), bounce 0.6 | Closed: bounces off, bounce 0.6. Open: nothing |
| Meets the ball | Keeps going and knocks the ball out of the way, no damage (section 1.2a) | Stays open until the ball has left the tile |
| Cost | 2 | 2 |

### 3.2 Destructibles

**Owner, 2026-11-14:** two kinds of crate: a plain crate and a secured crate that takes 2 hits.

| | Crate | Secured crate | Cracked tile |
|---|---|---|---|
| Looks like | Wooden box, 0.8 × 0.8, height 0.5 | Same box with metal bands; shows cracks after the first hit | Cracked floor drawn on the tile; flat, nothing to bump |
| Broken by | Any hit from the ball (health 1, goes through the damage steps) | **2 hits** (health 2). The same 0.5 s hit cooldown as enemies, so one bounce cannot count twice | Only the Anchor: the ball stopping on it after using Anchor |
| Hit that does not break it | — | The ball bounces off (bounce 0.6) | — |
| On breaking | Ball carries on at 85% speed (`defeatSpeedKeep`); drops its `drops` on the ground to be collected. Default drop: 1 yellow star | Same as the crate. Default drop: 2 yellow stars, plus a **10% chance of a Wild** (section 4a) | Releases its `drops` (default: 2 yellow stars) and becomes plain ground (question 5) |
| Flag pole | No | No | No |
| Cost | 1 | 2 | 1 |

### 3.2a Post becomes a tree stump (owner, 2026-11-14)

The Milestone 3 **post** is renamed **tree stump** and gets a new placeholder sprite (a cut stump with rings on top). Default: only its name and look change; its size and behaviour stay the same as the post (round, radius 0.14, height 1.5, bounce 0.75), so nothing you already tested plays differently. Its id becomes `stump` and the test courses are updated to match. (Question 12 offers a squatter stump instead.)

### 3.3 Flag pole (Decided by owner; defaults restated)

**Owner, 2026-11-14 — secured stars and lowered flags:**

- A star hovers above every raised flag pole, showing the star you secured by defeating that enemy. The star counts towards the meter **and** your wallet the moment the enemy is defeated. Enemies no longer drop a star to fetch. The hovering star is a marker and cannot be picked up.
- If any enemy passes over the tile of a raised flag, the flag slides down into its hole and the star above it disappears. The flag is **deactivated**: you lose that star from the meter and from your wallet.
- To reactivate it, the ball runs into the lowered flag. The flag goes back up, the star reappears, and you get the star back in the meter and the wallet.
- Once the exit has opened, it stays open even if stars are lost afterwards. But a star lost after that is still lost from your wallet, so you leave the course with fewer stars to spend.

**Default details (owner may change):**

- "Passes over" means the enemy's body enters the flag's tile. This covers the Trundler on its path, a rolling Lunger, a Mole rolling or stopping on it, and a Mole surfacing under it. A Spitter's seed does not count. Enemies are not blocked by raised poles; the flag drops as they arrive.
- A lowered flag is flat in its hole, so the ball rolls over it without bouncing. The ball reactivates it by touching the ground within 0.4 tiles of the hole (the same reach as a heart). A ball flying over does not count.
- A flag can be lowered and raised any number of times. An enemy passing over a lowered flag does nothing.
- The meter can drop below the quota. A closed exit opens again only when the meter is full again.
- The star marker and the lowered flag each get a placeholder sprite; the HUD meter shows the change at once.

**Raised pole (defaults restated):**

- Goes up where a defeated enemy stood, once the ball has moved clear (0.1 tiles past touching), so it never traps the ball. Stays for the rest of the course; the ball never knocks it down.
- Thin pole, radius 0.08, height 1.5 (as tall as the tree stump). A lofted ball higher than 1.5 passes over.
- Hit below **8 tiles/s**: bounces off (bounce 0.75, like the tree stump).
- Hit at 8 or more: pushes past, keeps **25%** of its speed.
- Replaces the old "carry on through a defeated enemy at 85%" rule for enemies. The defeating hit still counts.
- A Burner burst pushes past poles **without** losing speed (question 7).
- Tuning panel gets `poleThroughSpeed` and `polePassKeep`.

### 3.4 Thunder cloud (Decided by owner; defaults restated)

| Field | Value |
|---|---|
| Covers | One tile (square, 1 × 1), floating over it |
| Danger zone | From the ground up to **0.5 tiles** (one step) above the ground. The ball is safe only if its bottom is above that |
| Zap | 1 damage (skipped if the ball is still immune from damage in the last 0.5 s) and the ball is thrown along the ground in a random direction from the seed at 6 tiles/s with a small hop (2 tiles/s up) |
| Repeat | Each cloud zaps at most once per shot |
| Stationary or drifting | Set per placement: no `path` = stationary; with a `path` it drifts there and back at 1 tile/s, also while you aim |
| Aim guide | Stops at a stationary cloud and marks it. For a drifting cloud, the guide shows the cloud's lane (its whole path) faintly, because the guide cannot know where the cloud will be |
| Ways over | Lofted shot, spring, bounce boost, Hop |
| Enemies | **Owner, 2026-11-14:** a Lunger or Mole rolling under it is zapped: thrown in a random direction at 6 tiles/s, no damage. Once per cloud per launch. The Trundler is on a fixed path and is not affected |
| Health, stars, flag pole | None — cannot be beaten |
| Cost | Stationary 2, drifting 3 |

Why 0.5: a bounce boost from a normal landing reaches about 0.6 tiles, so it just clears; a rolling ball never does. Hop clears it easily (section 4). A Tornado hovering at ground height is under it and gets zapped.

---

## 4. Abilities (FEATURES.md section 7)

All: one slot; **press F during a shot** (question 6), **once per shot**, unlimited shots until replaced (DESIGN.md open question 5 default). Shown as an icon in the HUD; greyed out after use until the next shot. The aim guide does not predict ability use.

| | Anchor | Burner | Hop | Tornado |
|---|---|---|---|---|
| Element | None | Fire | None | None |
| Works when | Ball in the air or rolling | Ball in the air or rolling | Ball in the air or rolling | Ball in the air or rolling |
| Effect | All sideways speed is removed and the ball drops straight down at 12 tiles/s. On landing it does not bounce and stops dead, even on a slope or ice. Normal rules after that (water still sinks it; pads still act) | Sideways speed becomes at least 14 tiles/s in the current direction, for 0.6 s. No curve during the burst. Gravity still applies | Upward speed becomes 6.7 tiles/s, which lifts the bottom of the ball **1.1 tiles** from the ground (owner, 2026-11-14); sideways speed kept | The ball becomes a small whirlwind (owner, 2026-11-14). It whirls along at 10 tiles/s for **1.5 s**, starting in its current direction. Every 0.1 s its direction swings by a random amount up to 40° either way (from the seed), so it weaves and is hard to control |
| Extra rule | Breaks a cracked tile it stops on. **Ground pound:** enemies within 1 tile of where it stops are Stunned (question 2) | During the burst, passes through tier 1 enemies it defeats with no bounce and no speed loss; hits on others are normal hits with the fire element. Pushes past flag poles with no speed loss | Clears thunder clouds, low walls, sliding blocks, rocks and a closed gate (1.0). Not a tree stump (1.5) | **Edges:** while active it cannot fall: going over an edge, it stays at the height it was at and carries on over the drop (also over water, void and out of bounds). Rising faces and obstacles still bounce it off. **Ends over a drop:** it falls from there under normal physics, so it can land below, in water or out of bounds. **Enemies:** spiralling into one deals **1 damage** (through the damage steps, whatever the ball's hit damage), bounces off and keeps whirling; the 0.5 s hit cooldown stops one enemy being hit many times in one touch. While hovering it ignores surfaces and hazard tiles under it |
| When it ends | Lands | Normal rolling | — | Normal physics from there, keeping half its speed |
| Modifiers while active | None | None | None | None |
| Duration | Until it lands | 0.6 s | Instant | 1.5 s |

The ball can still be hurt during a Tornado by enemies, clouds and seeds, with the usual 0.5 s immunity.

**Tornado steering (owner, 2026-11-14):** while the Tornado is active, Left/Right arrows or A/D nudge it, turning it up to 120° per second on top of the random weave. These keys pan the camera today; while a Tornado is active they steer instead and the camera follows the ball (mouse-drag panning still works).

### 4a. Getting abilities, and the Wild (owner, 2026-11-14)

- Normally the **only** way to get an ability is to defeat its carrier enemy (Anchorback, Emberback, Hopback, Whirlback).
- The one exception is the **Wild**: a pickup that a secured crate drops with a small chance — **10%**, times the ball's drop luck, rolled from the seed. Rolling over it gives a random ability from the four (never the one you already hold), replacing what you held.
- The Wild can also be listed in a crate's or cracked tile's `drops` in a course file, for testing.
- **Milestone 4 look:** a placeholder "?" icon; on pickup the HUD ability slot flicks through the ability icons for about 1 s before settling. **Later (Milestone 9):** a flashy slot-machine wheel with sound. The sim decides the result at pickup; the animation only shows it.


---

## 4b. Keyboard-only controls (owner, 2026-11-14)

**Owner decision:** every mechanic must be playable from the keyboard alone; the mouse is optional. The mouse controls keep working exactly as now. Nothing in the simulation changes: keys produce the same shot commands as the mouse.

| Key | While aiming | While the ball moves |
|---|---|---|
| Left / Right (or A / D) | Turn the aim around the ball (hold; Shift for fine turning) | Steer the Tornado, when active |
| Up / Down (or W / S) | Raise / lower the planned power (the preview) | — |
| Space | Hold to charge the meter, release to shoot (same meter, perfect zone and auto-launch as the mouse) | Bounce boost |
| F | — | Use the ability |
| Esc | Drop the plan / cancel the charge | — |
| I / J / K / L | Pan the camera (moved here from the arrows and WASD, which now aim) | Pan the camera |
| C | Centre the camera on the ball | Same |
| T, X / Z, E / Q, R, Enter, G, H, U, P, 1–4, N | Unchanged | Unchanged |

The aim keys start from the last direction used, so small corrections are quick. The README controls table is updated to match.

## 5. Display

- **Debug overlay (G):** each sentinel's outer radius (thin ring) and inner radius (dashed ring), patroller and obstacle paths, cloud danger zones, Lob target rings.
- **In-game cue:** aim-guide dots turn orange where they pass through a sentinel's inner radius; during a shot, a sentinel's eyes flash when the ball comes within 0.5 tiles of its inner radius.
- Activated sentinels show a small "!" above them for the rest of the course.
- HUD gains the ability icon and status icons.

New placeholder sprites (via `npm run art` and the manifest only): trundler, spitter, lunger, mole, molehill, anchorback, emberback, hopback, whirlback, tornado ball (spinning frames), lob seed, target ring, sliding block, gate open, gate closed, crate, cracked tile, flag pole, hovering star marker, secured crate (whole and cracked), tree stump (replaces post), thunder cloud, zap spark, four ability icons, Wild pickup, stun icon, "!" mark.

---

## 6. Test course: "Enemies and abilities" (key 4, or N to cycle courses)

One hand-built course with three areas, so each trigger can be tried on purpose:

1. **Patrol yard:** a Trundler on a straight path, a sliding block, and a gate between you and an Emberback.
2. **Sentinel field:** a Spitter and a Lunger on open grass with room to try rest, pass-by and hit on each, next to a ledge, a pond and a spike strip so you can watch the Lunger bounce back and get hurt; two molehills; a Trundler path that runs over a spot where you can defeat an enemy, so you can watch its flag drop and raise it again; an Anchorback nearby; a crate and a secured crate set to always drop a Wild.
3. **Sky lane:** a stationary cloud and a drifting cloud across a narrow strip, a Hopback before it, a Whirlback by a cliff edge over a lower area so you can whirl out over the drop, and a cracked tile on a ledge you can only break with Anchor.

Quota set so you must clear at least two of the three areas. Exact layout drawn when building.

---

## 7. Tests (Vitest, simulation only)

- World clock: same clock step gives the same positions; a replayed run gives the same final state.
- Damage order: each step separately (element ×2 and half-down, from-above, from-behind, guarded side blocks, shield blocks the first hit only), using test-only enemy entries.
- Each trigger × each response: hit/rest/pass-by × none/immediate/activated.
- Damage immunity: a second hit within 0.5 s does nothing, after 0.5 s it counts.
- Knocked while resting: Trundler and sliding block keep their route and push the ball; Lunger, Mole and seed deflect with the ball; no shot is used; aim is cancelled.
- Spitter: ring marked, seed lobbed next turn lands on the ring on flat ground, then keeps bouncing along its line; slowed by water, falls off edges, disappears when stopped; hurts only while moving; Lunger launches at the ball, bounces back from edges and water, takes spike damage once per launch, hurts only while moving; its immediate launch fires once per shot. Mole: rolling over the hill triggers it, flying over does not; same seed same direction; hurts only while moving; cannot be hit while moving or underground; burrows after one shot and leaves a new hill.
- Stunned: enemy skips one action; ball loses one shot; reapplying is ignored.
- Trundler: contact effect when it survives your hit; hits a resting ball for 1 damage and keeps to its path.
- Defeating an enemy adds its star to the meter and wallet at once; a star marker sits above its pole.
- An enemy entering a raised flag's tile lowers it and takes 1 star from the meter and wallet; the ball touching a lowered flag raises it and gives the star back; repeatable; an open exit stays open when the meter drops; a closed exit opens only when the meter is full again.
- Thunder cloud throws a Lunger or Mole in a seeded random direction with no damage, once per cloud per launch.
- Flag pole: bounce below threshold, push-past above, lofted ball passes over, pole appears only once the ball is clear.
- Thunder cloud: rolling zapped, high ball safe, once per cloud per shot, same seed same throw direction, no second damage after spikes.
- Secured crate drops a Wild about 10% of the time over many seeds; the Wild gives a different ability from the one held; same seed gives the same result.
- Keyboard only: a full course can be played with no mouse input (Playwright test): aim, plan power, charge, perfect shot, auto-launch, spin, shot type, ability, Tornado steering, bounce boost.
- Each ability's effect, once per shot, replaced on pickup. Hop clears 1.1. Tornado: same seed gives the same weave; never falls while active, falls if it ends over a drop; 1 damage per enemy touched, with cooldown; ends after 1.5 s at half speed.
- Gate never closes on a ball; crate breaks in 1 hit, secured crate in 2 (with cooldown) and bounces the ball on the first; crate and cracked tile drops.
- Old course files using `post` are rejected with a message saying it is now `stump` (test courses updated).
- A fourth enemy defined only in a test data file plays correctly (proves "no logic changes").

---

## 8. Not in this milestone

Traits, elements on enemies, weak spots and guarded sides on real enemies, squads, enemy gear, other statuses, linked objects, the other six abilities, the generator placing any of this (Milestone 5).

---

## 9. Questions for the owner

All questions are answered.

Answered by the owner, 2026-11-14 (now written into the sheet above):

1. The Spitter's seed is a lobbed ball that lands on your old spot next turn and keeps bouncing with full physics (section 2.2).
2. Yes: Anchor's ground pound stuns enemies within 1 tile.
3. Moving things and the ball deflect off each other; fixed-route things keep going and knock the ball away. New: 0.5 s damage immunity after any hit, replacing once-per-shot (sections 1.2 and 1.2a).
4. Yes: Trundler has health 2; hitting it without defeating it costs 1 health.
5. Yes: a broken cracked tile releases hidden stars and becomes normal ground.
6. F for now. New: every mechanic must work from the keyboard alone (section 4b).
7. Yes: Burner pushes past flag poles with no speed loss.
8. The Mole burrows where it stops.
9. A moving Mole cannot be hit: the ball bounces off and takes the damage.
10. Thunder clouds zap the Lunger and the Mole, throwing them in a random direction with no damage.
11. The star counts the moment the enemy dies. New rule added: enemies passing over a flag lower it and take the star away until the ball raises it again (section 3.3).
12. Yes for now: the stump keeps the post's size. The owner may come up with something better later.
13. Tornado can be nudged left and right (section 4).

---

## Sign-off

- [x] Owner sign-off, 2026-11-14. Changes the owner made during review are marked "owner, 2026-11-14" throughout this sheet and recorded in FEATURES.md and DESIGN.md.
