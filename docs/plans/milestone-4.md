# Milestone 4 design sheet — Enemies and abilities

**Status: waiting for the owner's sign-off.** Nothing on this sheet is built until the owner signs it off (CLAUDE.md, "Plan before building").

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
2. **Shot.** The simulation runs until the ball rests. Hit and pass-by triggers fire as they happen. "Immediate" responses act at once.
3. **Rest check.** Rest triggers fire. Pending dropped stars and flag poles settle.
4. **Enemy turn.** Every activated sentinel takes one action, in the order they are listed in the course file. Stunned ones skip (section 4). The display shows each action for about 0.4 s; input is locked until it finishes.
5. If shots are 0: recover turn (step 4 runs again), then shots refill. Otherwise back to step 1.

**Ball damage during enemy turns:** the "once per shot" rule covers the shot only. In an enemy turn, each enemy that attacks can hurt the ball once. Two Lungers next to you can each hit you.

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

- **Behaviour** is picked from a fixed list with settings: `none`, `patrol` (speed), `lob` (projectile settings), `chase` (move and strike settings). A fourth enemy that mixes these with new numbers is a new data entry only. A truly new kind of behaviour would need code, once.
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

All have `element: none`, no weak/resistant elements, no weak spots or guarded sides, no traits, no gear, no squad themes (these come in Milestone 8). Shape is a circle, radius 0.3, height 0.6, bounce 0.6, unless noted.

### 2.1 Trundler — patroller, tier 2

| Field | Value |
|---|---|
| Health / stars / cost | 2 / 2 / 3 |
| Movement | Follows its `path` at 1.5 tiles/s, there and back, all the time (also while you aim) |
| Contact effect | When the ball hits it **and it survives**: the ball takes 1 damage (attack damage 1) and is knocked back — bounced away from the Trundler at at least 5 tiles/s |
| Defeated by the hit | No contact effect; the ball carries on; flag pole goes up (section 3.3) |
| Triggers | None (patrollers do not use sentinel triggers) |
| Running into a resting ball | Turns round, as if it hit the end of its path (question 3). Never hurts a resting ball |
| Stunned | Freezes in place until after the next enemy turn |

How it plays: the first hit costs you 1 health unless you finish it in one (two damage needs gear later, or two shots). Timing your shot to meet it head-on vs. from behind does not matter yet.

### 2.2 Spitter — sentinel, tier 2 (the ranged one)

| Field | Value |
|---|---|
| Health / stars / cost | 2 / 2 / 3 |
| Outer radius / inner radius | 3.5 / 1.5 |
| Hit | Activated |
| Rest (ball stops inside 3.5) | Activated |
| Pass-by (ball goes through 1.5) | Activated |
| Action each enemy turn | **Lob:** spits a seed at the spot where the ball is now. A target ring appears there. On the **next** enemy turn the seed lands: if the ball is within 0.75 tiles of the ring, 1 damage. Then it spits again. Range 8 tiles; if the ball is further away it waits. |
| Once activated | Stays activated for the rest of the course |

How it plays: once woken it is a slow, readable threat — you always get one shot to move off the ring. See question 1 for the alternative (a seed that travels along the ground in real time).

### 2.3 Lunger — sentinel, tier 2 (the one that chases)

**Decided** shape: rest trigger activates it; pass-by makes it strike at once; moves toward the ball each turn.

| Field | Value |
|---|---|
| Health / stars / cost | 2 / 2 / 3 |
| Outer radius / inner radius | 3 / 1.25 |
| Hit | Activated |
| Rest | Activated |
| Pass-by | **Immediate:** strikes the ball mid-shot — 1 damage (once-per-shot rule applies) and the ball's speed is halved and turned away from the Lunger. Then it is activated. Fires once per shot. |
| Action each enemy turn | If the ball is within 0.8 tiles (attack range): strike for 1 damage. Otherwise move straight toward the ball, up to 1.5 tiles (move range). |
| Movement limits | Stops before blockers, other enemies, water, void, out of bounds, hazard tiles, and any rise or drop of more than one step |

How it plays: striking and moving are separate turns, so after it closes in you get one shot to get away before it hits.

### 2.4 Ability carriers — sentinel, tier 1

Mossback copies with a coloured shell and the ability's icon on their back.

| Working name | Grants | Health / stars / cost |
|---|---|---|
| Anchorback | Anchor | 1 / 1 / 2 |
| Emberback | Burner | 1 / 1 / 2 |
| Hopback | Hop | 1 / 1 / 2 |

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
| Meets a resting ball | Turns round (question 3) | Stays open until the ball has left the tile |
| Cost | 2 | 2 |

### 3.2 Destructibles

| | Crate | Cracked tile |
|---|---|---|
| Looks like | Wooden box, 0.8 × 0.8, height 0.5 | Cracked floor drawn on the tile; flat, nothing to bump |
| Broken by | Any hit from the ball (health 1, goes through the damage steps) | Only the Anchor: the ball stopping on it after using Anchor |
| On breaking | Ball carries on at 85% speed (`defeatSpeedKeep`); drops its `drops` like an enemy drops stars. Default drop: 1 yellow star | Releases its `drops` (default: 2 yellow stars) and becomes plain ground (question 5) |
| Flag pole | No | No |
| Cost | 1 | 1 |

### 3.3 Flag pole (Decided by owner; defaults restated)

- Goes up where a defeated enemy stood, once the ball has moved clear (0.1 tiles past touching), so it never traps the ball. Stays for the rest of the course and is never knocked down.
- Thin pole, radius 0.08, height 1.5 (as tall as the post). A lofted ball higher than 1.5 passes over.
- Hit below **8 tiles/s**: bounces off (bounce 0.75, like the post).
- Hit at 8 or more: pushes past, keeps **25%** of its speed.
- Replaces the old "carry on through a defeated enemy at 85%" rule for enemies. The defeating hit still counts.
- A Burner burst pushes past poles **without** losing speed (question 7).
- Tuning panel gets `poleThroughSpeed` and `polePassKeep`.

### 3.4 Thunder cloud (Decided by owner; defaults restated)

| Field | Value |
|---|---|
| Covers | One tile (square, 1 × 1), floating over it |
| Danger zone | From the ground up to **0.5 tiles** (one step) above the ground. The ball is safe only if its bottom is above that |
| Zap | 1 damage (skipped if the ball was already hurt this shot) and the ball is thrown along the ground in a random direction from the seed at 6 tiles/s with a small hop (2 tiles/s up) |
| Repeat | Each cloud zaps at most once per shot |
| Stationary or drifting | Set per placement: no `path` = stationary; with a `path` it drifts there and back at 1 tile/s, also while you aim |
| Aim guide | Stops at a stationary cloud and marks it. For a drifting cloud, the guide shows the cloud's lane (its whole path) faintly, because the guide cannot know where the cloud will be |
| Ways over | Lofted shot, spring, bounce boost, Hop |
| Health, stars, flag pole | None — cannot be beaten |
| Cost | Stationary 2, drifting 3 |

Why 0.5: a bounce boost from a normal landing reaches about 0.6 tiles, so it just clears; a rolling ball never does. Hop clears it easily (section 4).

---

## 4. Abilities (FEATURES.md section 7)

All: one slot; **press F during a shot** (question 6), **once per shot**, unlimited shots until replaced (DESIGN.md open question 5 default). Shown as an icon in the HUD; greyed out after use until the next shot. The aim guide does not predict ability use.

| | Anchor | Burner | Hop |
|---|---|---|---|
| Element | None | Fire | None |
| Works when | Ball in the air or rolling | Ball in the air or rolling | Ball in the air or rolling |
| Effect | All sideways speed is removed and the ball drops straight down at 12 tiles/s. On landing it does not bounce and stops dead, even on a slope or ice. Normal rules after that (water still sinks it; pads still act) | Sideways speed becomes at least 14 tiles/s in the current direction, for 0.6 s. No curve during the burst. Gravity still applies | Upward speed becomes 6 tiles/s (about 0.9 tiles high); sideways speed kept |
| Extra rule | Breaks a cracked tile it stops on. **Ground pound:** enemies within 1 tile of where it stops are Stunned (question 2) | During the burst, passes through tier 1 enemies it defeats with no bounce and no speed loss; hits on others are normal hits with the fire element. Pushes past flag poles with no speed loss | Clears thunder clouds, low walls, gates, sliding blocks and rocks |
| Modifiers while active | None | None | None |
| Duration | Until it lands | 0.6 s | Instant |

---

## 5. Display

- **Debug overlay (G):** each sentinel's outer radius (thin ring) and inner radius (dashed ring), patroller and obstacle paths, cloud danger zones, Lob target rings.
- **In-game cue:** aim-guide dots turn orange where they pass through a sentinel's inner radius; during a shot, a sentinel's eyes flash when the ball comes within 0.5 tiles of its inner radius.
- Activated sentinels show a small "!" above them for the rest of the course.
- HUD gains the ability icon and status icons.

New placeholder sprites (via `npm run art` and the manifest only): trundler, spitter, lunger, anchorback, emberback, hopback, lob seed, target ring, sliding block, gate open, gate closed, crate, cracked tile, flag pole, thunder cloud, zap spark, three ability icons, stun icon, "!" mark.

---

## 6. Test course: "Enemies and abilities" (key 4, or N to cycle courses)

One hand-built course with three areas, so each trigger can be tried on purpose:

1. **Patrol yard:** a Trundler on a straight path, a sliding block, and a gate between you and an Emberback.
2. **Sentinel field:** a Spitter and a Lunger on open grass with room to try rest, pass-by and hit on each; an Anchorback nearby; a crate.
3. **Sky lane:** a stationary cloud and a drifting cloud across a narrow strip, a Hopback before it, and a cracked tile on a ledge you can only break with Anchor.

Quota set so you must clear at least two of the three areas. Exact layout drawn when building.

---

## 7. Tests (Vitest, simulation only)

- World clock: same clock step gives the same positions; a replayed run gives the same final state.
- Damage order: each step separately (element ×2 and half-down, from-above, from-behind, guarded side blocks, shield blocks the first hit only), using test-only enemy entries.
- Each trigger × each response: hit/rest/pass-by × none/immediate/activated.
- Spitter lob lands for damage, and misses when the ball moved away; Lunger moves, stops at limits, strikes in range; Lunger immediate strike fires once per shot.
- Stunned: enemy skips one action; ball loses one shot; reapplying is ignored.
- Trundler contact effect only when it survives; turns round at a resting ball.
- Flag pole: bounce below threshold, push-past above, lofted ball passes over, pole appears only once the ball is clear.
- Thunder cloud: rolling zapped, high ball safe, once per cloud per shot, same seed same throw direction, no second damage after spikes.
- Each ability's effect, once per shot, replaced on pickup.
- Gate never closes on a ball; crate and cracked tile drops.
- A fourth enemy defined only in a test data file plays correctly (proves "no logic changes").

---

## 8. Not in this milestone

Traits, elements on enemies, weak spots and guarded sides on real enemies, squads, enemy gear, other statuses, linked objects, the other six abilities, the generator placing any of this (Milestone 5).

---

## 9. Questions for the owner

Each has a default that this sheet already uses. Answer only the ones you want to change.

1. **Spitter's projectile.** Default: a lobbed seed that lands on next enemy turn where you were (a ring shows where). Alternative: a seed that rolls along the ground in real time and hits you if you are in its way — more action, but it can hit you while you aim.
2. **What causes Stunned now?** Default: Anchor's ground pound stuns enemies within 1 tile. Alternatives: the thunder cloud zap also stuns the ball (you lose a shot), or nothing causes it yet (built and tested only).
3. **Moving things meeting a resting ball.** Default: they turn round, so nothing pushes or hurts you while you aim. Alternative: they shove the ball (and a Trundler hurts it).
4. **Trundler.** Default: health 2, hitting it without defeating it costs you 1 health. Alternative: health 1, and it only hurts you when it runs into the moving ball.
5. **Cracked tile.** Default: breaking it releases hidden stars and it becomes normal ground. Alternative: it becomes a hole one step deeper (a new route or a trap). Harder to build.
6. **Ability key.** Default F (E, Q, Space and others are already used).
7. **Burner and flag poles.** Default: a Burner burst pushes past poles with no speed loss. Alternative: poles slow it like any fast ball.

---

## Sign-off

- [ ] Owner sign-off (date, and any changes made)
