# Spread dispatch

Use Node 24 from this directory. The project has no npm dependencies. `reference/` contains Bahn’s published handbook, rules, API, map and unmodified TypeScript kit. The rules take precedence. [Challenge materials](https://spread.bahnexpress.com/kit/)

## Level 2 unranked practice

Run a named week with `hsec exec --only SPREAD_KEY -- node runner.ts practice --level 2 --seed example-week`. The runner uses `level2-practice.json` and posts a fee schedule for each gig. It responds if a driver drops the booking or fails to show. To compare the dispatcher with the official starter on the same weeks, run `hsec exec --only SPREAD_KEY -- node benchmark.ts --level 2 --seeds example-a,example-b`. The benchmark verifies the server’s level and unranked status for each completed world.

## Ranking rounds

`hsec exec --only SPREAD_KEY -- node runner.ts rank --level 2 --season 3 --attempt 1` plays or resumes week 1 of level 2 in round 3. Select the level, round number and week (1 through 5) for the intended submission. Each level has its own five secret weeks. To save a report after both levels finish, run `hsec exec --only SPREAD_KEY -- node ranked-round.ts 3`. It checks each completed world against the public leaderboard.

The [public webpage](https://spread.bahnexpress.com/leaderboard#rounds) opens on level 8 and shows the current round. Select a level to see teams that have completed a week. The public API also includes the previous round: [level 1](https://spread.bahnexpress.com/v1/leaderboards/practice?level=1) and [level 2](https://spread.bahnexpress.com/v1/leaderboards/practice?level=2). After five weeks the API publishes a team's total margin, and it assigns a rank if each week qualified.

## Running level 1

Save the Spread team key in hsec as `SPREAD_KEY`. The team registration page accepts the event code from Bahn’s Junction challenge page or booth and a public team name. The team key grants access to the simulator. The team page also provides a separate submission hash for the jury. [Team registration](https://spread.bahnexpress.com/join)

```sh
npm test
hsec exec --only SPREAD_KEY -- node benchmark.ts --seeds trial-a,trial-b,trial-c
hsec exec --only SPREAD_KEY -- node runner.ts practice --seed trial-d
hsec exec --only SPREAD_KEY -- node runner.ts rank --attempt 1
```

The runner and benchmark default to the tuned settings in `level1-final.json`. Pass `--config` with a JSON object to test an alternative. `level1.json` records the settings used in ranking weeks 1 and 2.

The benchmark runs the official starter and the candidate on the same practice seeds. It reports euros, order volume, and on-time share for each world. Repeat it on fresh seeds to check how well a change generalizes. Trial results in `runs/benchmarks/` are keyed by seed, source version and configuration.

A level 1 quote always wins the first listed option at the list price, so the dispatcher can improve margin by choosing orders and controlling driver fees. It estimates whether the drive fits the pickup and delivery hours, considers how many drivers live near the pickup, then quotes orders whose list price covers the estimated work. Each car gets a separate gig. A fee can rise while the gig is open as its last feasible pickup approaches. [Spread rules](https://spread.bahnexpress.com/kit/RULES.md)

Use `rank --attempt 1` through `rank --attempt 5` once the official round opens. Repeating an attempt resumes its world or returns its completed score. The leaderboard awards a place after five secret weeks, each with at least 90% of won orders on time. The user asked that the first ranked attempt occur after Friday 19:30 Helsinki time. The runner also checks that the warm-up has ended. [Level 1 rankings](https://spread.bahnexpress.com/v1/leaderboards/practice?level=1)

## Provenance for Junction

On Friday 13 November, before the published 19:30 hacking start, we downloaded the official client, reference documents and road map, wrote the initial TypeScript policy, runner, paired benchmark and offline tests with Codex, and tested them locally. The integration fixture exercises 53 fictional requests and the API’s 50-action limit. Its bookings are scripted. Real delivery rates and margins must come from Bahn’s simulator. Identify these pre-existing materials in the Junction submission, and record the subsequent event work separately. [Junction fair play rules](https://www.hackjunction.com/terms-of-service) · [Bahn judging and submission](https://spread.bahnexpress.com/judging)
