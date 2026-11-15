# Spread Level 7 handoff

Work in this checkout, the repository root, with Node 24+. The team is Northbound Dispatch. Its objective is first place among eligible teams on Level 7. Spread execution was stopped at Victor's request. This document prepares the next operator.

## Position at the handoff

At 23:34 Helsinki on 13 November 2026, round 3 (“Friday 20:01”) had Northbound Dispatch second with **€40,060.91** across all five completed weeks. Bob the builders led with **€42,281.07**. The margin gap was **€2,220.16**. Week 2 was the largest deficit (€11,046.12 versus €13,837.06); our weeks 3 and 4 beat the leader. Across the five weeks we won 1,565 orders, delivered 97.00% on time, and left zero undelivered. Recheck standings before using this snapshot. [Public Level 7 leaderboard](https://spread.bahnexpress.com/v1/leaderboards/practice?level=7)

Every week individually needs at least one won order and 90% on-time delivery. The five secret worlds in round 3 are exhausted for our team. A new ranked attempt becomes possible when organizers open a new round. The house best is an unranked comparison. [API rules](reference/API.md) · [Official round evidence](ROUND-3-LEVELS-7.md)

## Start from the implementation that played

The ranked build is in `runs/l7-rank/build-dispatch-v1/`, with the official snapshot in `runs/l7-rank/official-7-3.json`. These files are local. The working tree includes uncommitted and untracked Level 7 and Level 8 work. Preserve it. The checked-in HEAD alone does not reproduce the submitted Level 7 policy. Inspect `git status --short` first.

Read [shortage dispatch](level7-policy.ts), [selected configuration](level7-practice.json), [regression tests](level7-policy.test.ts), and the Level 7 branches in [policy.ts](policy.ts). The baseline adjusts gig fees for sparse driver supply and protects slack when accepting jobs. `runs/l7-work/verified.json` lists five qualifying practice seeds with margins and fulfillment. `l7-harbor` had the smallest on-time buffer at 91.67%. Use the frozen policy and identical named seeds for each comparison, then check fresh seeds.

1. Open the saved week-2 trace and compare booking fees, won orders, unclaimed gigs, and margin per delivery to the stronger weeks. The leaderboard proves the margin gap; it does not identify its cause.
2. Change one decision at a time. Compare quote floors and driver-fee escalation separately; report euros and on-time share for every week. Retain the baseline for comparison.
3. When authorized to resume practice, run `npm test` first, then `hsec exec --only SPREAD_KEY -- node runner.ts practice --level 7 --seed l7-lake`. The team credential belongs in hsec. New seeds should be unranked and shared by both policies.
4. On the next official round, check its season ID. Use the guarded ranked command from [SETUP.md](SETUP.md) with explicit level 7, season and attempt. Keep the five world receipts. Verify first place using the public leaderboard when all five weeks have qualified.

## Verified operating details

The incoming agent checked the handoff at 23:40 Helsinki and stood down. The most recent board check at 23:37 still had Northbound second. House best earned €45,002.75. An outright lead over Bob on those particular weeks would have needed €2,220.17 more. Bob won 897 orders and earned €47.14 per win; Northbound earned €25.60 per win. This motivates a controlled price experiment. The competitors’ actual prices and driver costs are unavailable.

| Practice seed | Baseline margin | Orders won | On time |
|---|---:|---:|---:|
| l7-lake | €9,285.36 | 353 | 96.32% |
| l7-birch | €7,058.51 | 272 | 98.53% |
| l7-rail | €11,655.25 | 436 | 92.66% |
| l7-harbor | €8,131.24 | 372 | 91.67% |
| l7-spruce | €5,770.76 | 296 | 93.92% |

These five practice weeks earned €41,901.12 and had zero undelivered. Use Lake and Birch for selection. All three former held-out results have been seen; use new names for fresh paired validation after tuning. Seek positive margin, at least one win, and at least 90% on time in each week. One candidate to test is higher quotes for short and premium moves with driver fees fixed. The economic alternate’s Lake run lost €2 across 13 premium cars; that result is from a single week. [Practice evidence](runs/l7-work/verified.json) · [Frozen build manifest, all 15 hashes verified](runs/l7-rank/build-dispatch-v1/rank-build.json)

At the stop, all eight shared slots contained level 8 practice worlds. One belonged to this chat, the unfinished Lake world `w41f9901e082b2c2d27cd`. Its [receipt](runs/l8-work/v1/runs/w41f9901e082b2c2d27cd/run.json) remains on disk. The other unfinished worlds were preserved. No ranked level 8 attempt was submitted by this chat. Recheck ownership and slots. Use the official URL and inject only the team key via hsec. Do not display, export or store it.

```sh
cd spread-dispatch
hsec exec --only SPREAD_KEY -- node --input-type=module -e 'import {Client} from "./reference/typescript/spread.ts"; const c=new Client({url:"https://spread.bahnexpress.com"}); const [b,w]=await Promise.all([c.board(7),c.worlds()]); console.log(b.current.season,b.current.name); console.table(b.current.teams.filter(t=>t.rank||["northbound-dispatch","house-strong"].includes(t.team)).map(t=>({team:t.name,played:t.played,rank:t.rank,marginCents:t.marginCents}))); console.table(w.filter(v=>!v.ended||v.level===7&&v.season===b.current.season))'
```

For a matched baseline practice week use `runs/l7-rank/build-dispatch-v1/runner.ts` in place of the shared runner and pass a separate `--runs-dir`. Its source predates the shared checkout’s level 8 imports. Preserve the original snapshot and include all new imports in any challenger snapshot. On a new official round, replace BUILD, S and K with the validated build directory, verified season and next attempt. Keep a single shared ranked receipts directory. Before resuming after an interruption, reconcile the receipt world ID with the team world’s level, season and boardRun, then use the same ordinal.

```sh
hsec exec --only SPREAD_KEY -- node BUILD/runner.ts rank --level 7 --season S --attempt K --runs-dir runs
hsec exec --only SPREAD_KEY -- node ranked-round.ts S --levels 7
```

Run the report command after all five official weeks. Report rank at verification, margin, on-time share and undelivered count per week, plus House best. Read [SETUP.md](SETUP.md), then [the handbook](reference/HANDBOOK.md), [the governing rules](reference/RULES.md), and [the API](reference/API.md).
