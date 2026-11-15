# Level 7: diagnosis and challengers after round 3

Prepared on 13 November 2026, 23:44–00:10 Helsinki, from [the Level 7 handoff](LEVEL7-HANDOFF.md). No practice or ranked world was created, finished or deleted. The new work is in `runs/l7-next/` (local, ignored by git).

## Position at 23:44

Round 3 (“Friday 20:01”, season 3) is still the current round. No new round is open, so a ranked attempt is not possible now.

| Team | Margin | Orders | € per order | On time |
|---|---:|---:|---:|---:|
| House best (unranked) | €45,002.75 | 1,504 | 29.92 | 96.54% |
| Bob the builders (#1) | €42,281.07 | 897 | 47.14 | 97.99% |
| Northbound Dispatch (#2) | €40,060.91 | 1,565 | 25.60 | 96.99% |

The gap to first place is €2,220.16. All 8 practice slots hold unfinished level 8 worlds. One of them, `w41f9901e082b2c2d27cd` (l8-lake), belongs to this handoff. The other 7 belong to other operators and were not touched.

## Week 2 diagnosis

Week by week, against the leader (Bob) and House best:

| Week | Our margin | Orders | €/order | Bob margin | Bob orders | Bob €/order | House margin | House orders |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | €10,028.69 | 363 | 27.63 | €10,734.60 | 231 | 46.47 | €11,361.72 | 393 |
| 2 | €11,046.12 | 404 | 27.34 | €13,837.06 | 244 | 56.71 | €13,252.22 | 365 |
| 3 | €5,480.06 | 230 | 23.83 | €4,824.38 | 114 | 42.32 | €5,431.53 | 215 |
| 4 | €3,949.41 | 216 | 18.28 | €3,174.53 | 88 | 36.07 | €3,948.38 | 172 |
| 5 | €9,556.63 | 352 | 27.15 | €9,710.50 | 220 | 44.14 | €11,008.90 | 359 |

Our execution in week 2 was normal. These figures come from the full event histories of our five ranked worlds (`runs/l7-next/data/`, saved with read-only calls):

| Week | Real quotes | Win share | Quote ÷ list | Fee per order | Expired gigs | Deadline warnings | Late refunds | Failed visits |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 727 | 50.6% | 1.29 | €59.65 | 7 | 21 | €289.70 | €0.00 |
| 2 | 744 | 54.8% | 1.29 | €59.29 | 4 | 17 | €228.90 | €179.09 |
| 3 | 707 | 33.4% | 1.23 | €58.79 | 2 | 8 | €68.79 | €36.82 |
| 4 | 729 | 29.9% | 1.22 | €61.57 | 4 | 14 | €170.44 | €55.05 |
| 5 | 754 | 47.1% | 1.28 | €56.71 | 6 | 18 | €298.23 | €96.65 |

- The gap is on the revenue side. In weeks 1, 2 and 5 the competitor was dear: we won about half of our real quotes at about 1.29× list. Bob won 40% fewer orders and earned about €29 more per order in week 2. Our quote rose by only about 0.017 when our win share was 55%, because `quoteAdapt` is 0.34 × (win share − 0.5).
- In weeks 3 and 4 the competitor was cheap (win share 30–33%), and we beat Bob there.
- Fee escalation is a small lever. Spend above each gig's opening fee was €416–1,121 a week, which is 2.4–5.3% of driver fees (`runs/l7-next/escalation.mjs`).
- Short moves (under 60 road minutes) earn €12–17 per order, and 200+ minute moves earn €22–47 (`runs/l7-next/segments.mjs`).

## Challengers, one decision each

`runs/l7-next/build-dispatch-v2/` is the frozen v1 build plus switches that are off by default. `runs/l7-next/plan.json` lists the variants:

| Variant | Build | Change | Fees |
|---|---|---|---|
| `baseline` | v1 | none | unchanged |
| `adaptUp` | v2 | raise every quote by (decayed win share − 0.45) while that is positive | unchanged |
| `shortPremium` | v2 | +10% on moves under 60 road minutes and on premium cars (the handoff's candidate) | unchanged |
| `flatQuote` | v1 | `quoteFactor` 1.22 → 1.30 | unchanged |
| `escalation` | v2 | deadline pressure in the shortage fee 0.55 → 0.40 | lower near the deadline |

These are first-order estimates on the five ranked weeks, with each dealer's decision held as recorded (`runs/l7-next/counterfactual.ts`):

| Variant | Wins affected | Added revenue if those wins hold | Break-even loss of affected wins |
|---|---:|---:|---:|
| `adaptUp` | 925 (W1 289, W2 379, W5 247, W3 9, W4 1) | €7,574 (W1 €2,468, W2 €3,028, W5 €2,063) | 23% |
| `shortPremium` | 472 | €2,533 | 24% |

`adaptUp` acts almost only on the weeks we lost to Bob and leaves weeks 3 and 4 alone. To overtake Bob on round 3's weeks it may lose at most about 16% of the affected wins (7,574 − L × (7,574 + 25,300) ≥ 2,220.17). Lost orders also free scarce drivers, which this estimate does not count. These numbers are not evidence until paired practice weeks confirm them.

### Offline checks

- `node --test runs/l7-next/challenger.test.ts` (4 tests pass). On recorded ranked weeks 2 and 4, v2 with default switches makes exactly the v1 decisions at every step. Each switch changes only the decision that it names.
- `node runs/l7-next/fidelity.ts w214f5b7473e8ff2b6f2d w27d9d3ac812df8e1b045`. The offline replay reproduces all 1,035 and 1,033 real quotes of weeks 2 and 1 exactly.
- `npm test`: 50 of 50 pass. The shared checkout's files are unchanged.
- The frozen v1 manifest verifies (15 of 15 hashes).
- Repeat-run noise: two Lake baselines differ by €72.56 because one run reconnected and rebuilt state at minute 5264. The harness marks a run with a reconnect as unclean and repeats it once.
- An independent review (3 reviewers, each finding checked by a skeptic) confirmed no defect in the challenger code and no error in the diagnosis or the counterfactual. It confirmed 2 test gaps and 4 harness defects, and all six are fixed. The tests now rebuild the adaptive win share from the recorded outcomes and check the escalation fee through the policy. Four deliberate code mutations each make a test fail. The harness retries server reads, records and later finishes a world whose runner stopped early (so no slot is lost), counts a result only for the exact build, hash and settings in `plan.json`, and reports the select and validate stages separately.
- The harness was run end to end against a loopback fake server, with a fake key and a scratch copy: crash, recovery, skip, stale settings. It sent no DELETE and created no ranked world.

## To resume (needs Victor's authorization)

1. Free one practice slot. The slot that belongs to this handoff can be freed by finishing its world with its own frozen runner:
   `hsec exec --only SPREAD_KEY -- node runs/l8-work/v1/runner.ts resume --world w41f9901e082b2c2d27cd --runs-dir runs/l8-work/v1/runs`
2. Selection on Lake and Birch (10 practice weeks, about 1 minute each):
   `hsec exec --only SPREAD_KEY -- node runs/l7-next/experiment.mjs select --wait 10`
3. Fresh paired validation of the selected challenger and the baseline on unseen seeds (`l7-fjord`, `l7-moss`, `l7-pine`, `l7-reed`, `l7-cliff`):
   `hsec exec --only SPREAD_KEY -- node runs/l7-next/experiment.mjs validate --only baseline --wait 10`
   `hsec exec --only SPREAD_KEY -- node runs/l7-next/experiment.mjs validate --only adaptUp --wait 10`
4. `node runs/l7-next/experiment.mjs report` prints euros, orders, on-time share, undelivered count and qualification per week, and the paired totals, separately for each stage.

Choose on the select stage. Decide on the validate stage only: accept a challenger only if every fresh week has at least one win, at least 90% on time and positive margin, and it beats the baseline in total on the fresh seeds. If a run stops early, run the same command again: it finishes the left world first.

## Next official round

**Update, 14 November 00:37 Helsinki:** round 4 (“Saturday 00:00”, season 4) is open. It started at 00:00. Northbound and Bob have played 0 of 5. Edge101 leads with €32,444.56 (alignas €27,656.00, Upsala €25,795.73, Bidcast €22,508.38). House best has €34,900.33. Round 3 is final, with Northbound #2. A ranked week also needs a free practice slot, and all 8 are in use. For round 4, S = 4 and the first attempt is K = 1.

1. Check the current season ID and name on the public leaderboard, and confirm that it is a new round.
2. Freeze the validated challenger: `node runs/l7-next/freeze.mjs dispatch-v2 '{"quoteAdaptUp":1}'`. This writes `runs/l7-rank/build-dispatch-v2/` with `rank-build.json`. If no challenger wins, use `runs/l7-rank/build-dispatch-v1`.
3. Play the five weeks with the guarded loop, which verifies the build hashes and the round before each week:
   `hsec exec --only SPREAD_KEY -- node runs/l7-rank/round.mjs 7 runs/l7-rank/build-dispatch-v2 S`
   (or one week at a time: `hsec exec --only SPREAD_KEY -- node runs/l7-rank/build-dispatch-v2/runner.ts rank --level 7 --season S --attempt K --runs-dir runs`).
4. After week 5: `hsec exec --only SPREAD_KEY -- node ranked-round.ts S --levels 7`, and record the rank, the margin, on-time share and undelivered count per week, and House best.
