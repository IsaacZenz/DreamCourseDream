# Balance report (Milestone 8 round 3)

Made by `npm run balance 30`: 540 courses and boss fights, 17 minutes. Everything is seeded, so running it again gives the same numbers.

**How to read it.** "Par bot" is the course check's bot with the region's par kit (the upgrades and gear a player is expected to have by then), at full health. "First-try win" is how often it beats a freshly made course: the generator throws away courses it loses, so this is its honest win rate. "Starter bot" plays the kept courses as Rollo with nothing: no par kit, no gear. Health lost and shots are on the courses kept.

## Courses

| Region | Point | Par bot first-try win | Shots (limit) | Health lost | Stars on course | + finish reward | Starter bot wins | Starter health lost | Fallback courses | Seconds each |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | course, after 0 | 94% | 5.7 (30) | 0.0 | 2.5 | +2 | 100% | 0.0 | 0 | 0.9 |
| 1 | course, after 3 | 88% | 10.6 (39) | 0.2 | 4.5 | +2 | 100% | 0.2 | 0 | 1.9 |
| 1 | hard, after 3 | 65% | 14.1 (48) | 0.3 | 6.5 | +6 | 100% | 0.3 | 0 | 3.8 |
| 1 | course, after 6 | 58% | 14.7 (57) | 0.0 | 6.3 | +2 | 100% | 0.0 | 0 | 4.2 |
| 1 | hard, after 6 | 33% | 17.2 (57) | 0.4 | 7.7 | +6 | 100% | 0.4 | 0 | 9.0 |
| 2 | course, after 0 | 81% | 12.8 (39) | 0.3 | 5.4 | +2 | 47% | 0.4 | 0 | 4.0 |
| 2 | course, after 3 | 53% | 17.8 (48) | 0.6 | 7.6 | +2 | 30% | 0.6 | 0 | 7.4 |
| 2 | hard, after 3 | 33% | 19.6 (57) | 0.9 | 8.9 | +6 | 0% | 0.0 | 0 | 12.0 |
| 2 | course, after 6 | 31% | 19.1 (57) | 0.7 | 8.7 | +2 | 10% | 0.7 | 0 | 12.8 |
| 2 | hard, after 6 | 23% | 20.4 (57) | 0.8 | 9.1 | +6 | 7% | 0.0 | 0 | 14.2 |
| 3 | course, after 0 | 81% | 16.2 (48) | 0.0 | 8.0 | +2 | 3% | 1.0 | 0 | 5.2 |
| 3 | course, after 3 | 75% | 19.4 (57) | 0.4 | 10.3 | +2 | 3% | 3.0 | 0 | 7.2 |
| 3 | hard, after 3 | 77% | 26.9 (66) | 1.1 | 14.6 | +6 | 0% | 0.0 | 0 | 10.3 |
| 3 | course, after 6 | 64% | 27.5 (66) | 0.5 | 13.4 | +2 | 0% | 0.0 | 0 | 10.0 |
| 3 | hard, after 6 | 56% | 25.4 (66) | 1.0 | 15.1 | +6 | 0% | 0.0 | 0 | 10.9 |

## Boss fights

| Region | Boss | Par bot wins | Shots | Health lost | Starter bot wins |
|---|---|---|---|---|---|
| 1 | The Stagwarden | 87% | 25.7 | 0.7 | 87% |
| 2 | Gloamhorn | 80% | 19.4 | 0.8 | 13% |
| 3 | The Brood Queen | 100% | 24.1 | 0.0 | 0% |

## The economy

Yellow stars from a course are the stars the bot collected plus the finish reward. A town usually comes after about 3 counted nodes. Prices are before Haggler and Lucky gear.

| Region | Stars per normal course | Stars per hard course | About 3 courses (2 normal, 1 hard) | Blue stars per region (6 courses, 1 hard, the boss) |
|---|---|---|---|---|
| 1 | 6.5 | 13.1 | 26 | about 13 |
| 2 | 9.2 | 15.0 | 33 | about 16 |
| 3 | 12.6 | 20.9 | 46 | about 20 |

Gear prices: common 10, uncommon 15, rare 30, double rare 45, special rare 70, legendary 100. Grab Bag 25. Food: 4 for one course of a stat food (+1 per region). Blue-star prices: second pockets 17 each, characters 21 each, Vitality and Stamina 5 to 20 a level.

## Targets (owner-approved, round 3 sheet section 5.2)

| Measure | Region 1 | Region 2 | Region 3 |
|---|---|---|---|
| Bot wins a course (par kit, full health) | 95% or more | 90% or more | 85% or more |
| Health lost per course, on average | 0.5 to 1 | 1 to 1.5 | 1.5 to 2.5 |
| Shots per course, on average | well under the limit | under the limit | close to the limit on late and hard courses |
| Stars on reaching a town | enough for 2 common or uncommon items | about 1 rare item | about 1 double rare item |
| Boss fight: bot wins | 90% or more | 85% or more | 80% or more |

## Proposed changes

_Written by hand after reading the tables above. Nothing here changes until the owner approves it._
### What the numbers say

1. **The economy is on target.** About 26 stars on reaching a town in region 1 (2 commons or uncommons cost 25), 33 in region 2 (a rare costs 30), 46 in region 3 (a double rare costs 45). **No change proposed.**
2. **The curve between regions is steep and clear.** The starter bot (no upgrades, no gear) wins every region 1 course, about a third of region 2's, and almost none of region 3's. Upgrades and gear are what carry you forward, as designed.
3. **Courses that reach the player are gentle on health.** On the courses kept, the par bot loses 0 to 1.1 health, below every health target. But the bot plays very carefully (it tries many shots before choosing), so a person will lose more. **No change proposed until you have played a run**; if it feels too easy, the lever is region toughness (`attackDamage` in `src/content/run.ts`).
4. **"First-try win" misses its targets everywhere (33% to 94%).** This measures the generator against the bot, not against you: a course the bot cannot finish is thrown away and made again, so you never see it. The cost is time: a late hard course in region 1 takes about 9 seconds to make. I propose we **drop this target** and judge difficulty by health lost and by your playtest instead.
5. **The bosses run the wrong way.** The Stagwarden (region 1) is won 87% of the time and Gloamhorn (region 2) 80%, both a little under target, while the final boss, the Brood Queen, is won 100% of the time with no health lost.

### Proposals (nothing changes until you approve)

| # | Change | From | To | Why |
|---|---|---|---|---|
| P1 | Brood Queen health, region 3 | 20 | 26 | The final boss should be the hardest; it is now the easiest |
| P2 | Stagwarden health, region 1 | 12 | 11 | 87% wins, target 90% |
| P3 | Gloamhorn health, region 2 | 12 | 11 | 80% wins, target 85% |
| P4 | Replace the "first-try win" target | 95 / 90 / 85% | health lost per course, starter bot share, and your playtest | It measures the bot, not the player |
| P5 | Course damage | as now | no change yet | Decide after you play a run |

After you approve, I make the changes, run `npm run balance` again and show the before and after.
