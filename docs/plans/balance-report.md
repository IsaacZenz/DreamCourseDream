# Balance report (Milestone 8 round 3)

Made by `npm run balance 1`: 18 courses and boss fights, 1 minutes. Everything is seeded, so running it again gives the same numbers.

**How to read it.** "Par bot" is the course check's bot with the region's par kit (the upgrades and gear a player is expected to have by then), at full health. "First-try win" is how often it beats a freshly made course: the generator throws away courses it loses, so this is its honest win rate. "Starter bot" plays the kept courses as Rollo with nothing: no par kit, no gear. Health lost and shots are on the courses kept.

## Courses

| Region | Point | Par bot first-try win | Shots (limit) | Health lost | Stars on course | + finish reward | Starter bot wins | Starter health lost | Fallback courses | Seconds each |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | course, after 0 | 50% | 5.0 (30) | 0.0 | 3.0 | +2 | 100% | 0.0 | 0 | 4.1 |
| 1 | course, after 3 | 100% | 9.0 (39) | 0.0 | 5.0 | +2 | 100% | 0.0 | 0 | 1.8 |
| 1 | hard, after 3 | 50% | 15.0 (48) | 3.0 | 8.0 | +6 | 100% | 3.0 | 0 | 5.8 |
| 1 | course, after 6 | 50% | 17.0 (57) | 0.0 | 6.0 | +2 | 100% | 0.0 | 0 | 6.2 |
| 1 | hard, after 6 | 100% | 19.0 (57) | 0.0 | 7.0 | +6 | 100% | 0.0 | 0 | 4.7 |
| 2 | course, after 0 | 100% | 12.0 (39) | 1.0 | 5.0 | +2 | 100% | 0.0 | 0 | 3.6 |
| 2 | course, after 3 | 100% | 20.0 (48) | 0.0 | 8.0 | +2 | 0% | 0.0 | 0 | 5.4 |
| 2 | hard, after 3 | 33% | 17.0 (57) | 0.0 | 8.0 | +6 | 0% | 0.0 | 0 | 10.7 |
| 2 | course, after 6 | 50% | 21.0 (57) | 4.0 | 11.0 | +2 | 0% | 0.0 | 0 | 10.4 |
| 2 | hard, after 6 | 33% | 24.0 (57) | 0.0 | 11.0 | +6 | 0% | 0.0 | 0 | 9.1 |
| 3 | course, after 0 | 100% | 16.0 (48) | 0.0 | 7.0 | +2 | 0% | 0.0 | 0 | 5.0 |
| 3 | course, after 3 | 50% | 15.0 (57) | 2.0 | 11.0 | +2 | 0% | 0.0 | 0 | 9.1 |
| 3 | hard, after 3 | 50% | 23.0 (66) | 0.0 | 19.0 | +6 | 0% | 0.0 | 0 | 12.6 |
| 3 | course, after 6 | 50% | 25.0 (66) | 0.0 | 16.0 | +2 | 0% | 0.0 | 0 | 12.5 |
| 3 | hard, after 6 | 50% | 25.0 (66) | 1.0 | 13.0 | +6 | 0% | 0.0 | 0 | 8.2 |

## Boss fights

| Region | Boss | Par bot wins | Shots | Health lost | Starter bot wins |
|---|---|---|---|---|---|
| 1 | The Stagwarden | 100% | 34.0 | 0.0 | 100% |
| 2 | Gloamhorn | 100% | 16.0 | 1.0 | 0% |
| 3 | The Brood Queen | 100% | 16.0 | 0.0 | 0% |

## The economy

Yellow stars from a course are the stars the bot collected plus the finish reward. A town usually comes after about 3 counted nodes. Prices are before Haggler and Lucky gear.

| Region | Stars per normal course | Stars per hard course | About 3 courses (2 normal, 1 hard) | Blue stars per region (6 courses, 1 hard, the boss) |
|---|---|---|---|---|
| 1 | 6.7 | 13.5 | 27 | about 13 |
| 2 | 10.0 | 15.5 | 36 | about 16 |
| 3 | 13.3 | 22.0 | 49 | about 20 |

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
