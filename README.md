# Northbound Dispatch: Spread (Bahn challenge, Junction 2026)

A dispatcher for Bahn's Spread simulation: it quotes prices to car dealers and posts gigs to freelance drivers for one simulated week in Finland. This repository is the code our team ran in the ranking rounds and in the final (Level 8, Sunday 15 November 2026).

Main finding: **where the car goes decides who drives it.** A driver who lives in the town where a gig ends books 17–25% of the one-car gigs they look at. Every other driver books 1–3%.

## Where to look

| Path | What it is |
|---|---|
| `runs/grind/rank/l8-c2/` | **The build that played the final.** `policy.ts` is the whole decision logic; `level8-practice.json` holds its settings; `rank-build.json` lists the file hashes. |
| `runs/grind/rank/l1-…` to `l7-k2/` | The frozen builds that played Levels 1–7 in the last ranking rounds (`runs/grind/round-builds.json` maps level → build). |
| `runs/grind/live.ts` | The live-clock runner for the final: polling loop, per-request deadlines, rebuild from snapshot plus event history on any fault, and resync when a timed-out send still lands. |
| `runs/grind/live-loop.sh` | Keeps exactly one runner alive through the final and restarts it if it stops. |
| `runs/grind/lockstep.ts` | Replays two policies side by side on a recorded week. A change goes in behind a default-off switch, and this replay checks that the switch off reproduces the previous build, decision for decision. |
| `runs/grind/tune.mjs`, `vt.mjs`, `freeze.mjs` | Practice queue on named seeds, the paired comparison table, and freezing a build with a hash manifest. |
| `runs/grind/viewfit.mjs`, `destfit.mjs`, `pairfit2.mjs`, `offerfit2.mjs`, `sharing.mjs`, `marginfit.mjs`, `declfit.mjs` | The offline analyses behind the end-town finding (driver views, bookings, offers and margin by start and end town). |
| `policy.ts`, `runner.ts`, `level*-policy.ts`, … (root) | The earlier per-level code and the kit-based runner for practice and ranked weeks. |
| `reference/` | The challenge kit: rules, handbook, API and the TypeScript client. |

## The four ideas that did the most (Level 8, margin on the same practice weeks)

1. **Take the long hauls, then throttle them.** Quote hauls up to 450 road minutes (+18% to +43%). While three hauls over 320 minutes, won at least 20 hours ago, still have no driver, quote no new one (lowest week 94.9% on time instead of 93.0%).
2. **Raise fees before the deadline.** The top fee steps come two hours before the last pickup: +1.4% margin, +1.0 point on time. Late cars restart near a normal fee instead of about 1.9× (+3%). Opening fee 1.14× of our cost model (+2.2% over 1.17 on 31 weeks).
3. **Two cars, one driver.** A new car joins an unbooked car that ends in its pickup town, at 85% of the two single fees. A car in such a gig costs 0.75× the typical fee, against 0.94× alone (+4.7% on 19 weeks).
4. **Price by where the car goes.** Quote 10% lower into the four driver-rich towns (Helsinki, Vantaa, Espoo, Oulu) and 5% higher into thin ones. Send each open gig three direct offers every 11 minutes to drivers who live where it ends. Bid lower for requests that pair with a waiting car. Together: +3.8% on 56 weeks (44 better), orders +7.4%, on time 97.8%.

## Running it

Node 24 or later. The team key is read from the environment variable `SPREAD_KEY`; it is not in this repository.

```bash
# the final (waits until a final is set, plays it to the end)
SPREAD_KEY=… node runs/grind/live.ts runs/grind/rank/l8-c2
# a rehearsal on a practice world on a timer, with forced restarts
SPREAD_KEY=… node runs/grind/live.ts runs/grind/rank/l8-c2 --emulate --seed l8-bay --rejoin-at 2160,3480,5120
```

The practice results (`runs/grind/results.jsonl`) and recorded weeks are not included: they are game data from the challenge server.
