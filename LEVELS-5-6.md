# Northbound Dispatch · levels 5 and 6

The dispatcher and the official starter each played 5 named, unranked practice weeks per level. Each pair used the same seed, including its level prefix. Qualification requires winning at least one order and delivering at least 90% on time in that week. Practice results do not earn a leaderboard place. [Bahn rules](https://spread.bahnexpress.com/kit/RULES.md)

| Level | System | Total margin | Orders won | On time | Undelivered | Lowest weekly on-time share | Qualified weeks |
|---:|---|---:|---:|---:|---:|---:|---:|
| 5 | Dispatcher | €33,955.31 | 2027 | 94.72% | 7 | 93.38% | 5/5 |
| 5 | Official starter | -€22,072.33 | 2966 | 94.84% | 0 | 92.68% | 5/5 |
| 6 | Dispatcher | €28,796.08 | 1769 | 94.06% | 6 | 93.13% | 5/5 |
| 6 | Official starter | -€21,312.82 | 2572 | 94.79% | 0 | 92.07% | 5/5 |

## Settings comparison

We compared settings on Lake and Birch. After selection, we checked the chosen settings on Rail, Harbor and Spruce.

Each row uses two complete candidate runs from the same source build as that level’s selected policy. Alternative rows list only changes from the selected settings.

| Level | Dispatcher settings | Two-week margin | Lowest on-time share |
|---:|---|---:|---:|
| 5 | Selected settings | €12,413.17 | 93.72% |
| 5 | chargeReserveKm 40, long-haul pickup buffer (min) 200, maximum drive (min) 330, usable pickup time (min) 160, nextDayPremium 0.04, offerDelay 12, opening fee factor 0.79, price adaptation 0.3, list-price multiplier 0.96, quote floor 0.89, sameDayPremium 0.1 | €12,274.71 | 92.03% |
| 5 | sameDayPremium 0.14 | €11,045.53 | 92.19% |
| 6 | Selected settings | €12,689.50 | 93.26% |
| 6 | chargeReserveKm 40, long-haul pickup buffer (min) 200, maximum drive (min) 330, usable pickup time (min) 160, nextDayPremium 0.04, offerDelay 12, opening fee factor 0.79, price adaptation 0.3, list-price multiplier 0.96, quote floor 0.89, sameDayPremium 0.1 | €11,466.88 | 92.63% |
| 6 | sameDayPremium 0.14 | €11,892.34 | 93.38% |

## Level 5

The dispatcher earned €56,027.64 more gross margin than the starter on these weeks.

| Seed | Dispatcher margin | On time | Won | Undelivered | Starter margin | On time | Won | Undelivered |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| l5-lake | €5,512.10 | 93.76% | 417 | 4 | -€5,629.99 | 96.42% | 558 | 0 |
| l5-birch | €6,901.07 | 93.72% | 430 | 2 | -€5,019.21 | 94.52% | 657 | 0 |
| l5-rail | €8,706.05 | 95.19% | 437 | 0 | -€5,078.68 | 94.27% | 646 | 0 |
| l5-harbor | €6,825.23 | 93.38% | 408 | 1 | -€4,849.03 | 92.68% | 615 | 0 |
| l5-spruce | €6,010.86 | 98.21% | 335 | 0 | -€1,495.42 | 96.94% | 490 | 0 |

Dispatcher settings: [level5-practice.json](level5-practice.json). Benchmark source fingerprint: `98fe8295722197e88a1e194a8ffd56d170a3dc0adb25a923c29727ea46f6c3f0`.

## Level 6

The dispatcher earned €50,108.90 more gross margin than the starter on these weeks.

| Seed | Dispatcher margin | On time | Won | Undelivered | Starter margin | On time | Won | Undelivered |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| l6-lake | €6,540.30 | 95.59% | 340 | 2 | -€3,447.72 | 95.68% | 533 | 0 |
| l6-birch | €6,149.20 | 93.26% | 386 | 2 | -€3,724.43 | 94.82% | 560 | 0 |
| l6-rail | €6,709.70 | 93.21% | 383 | 0 | -€5,665.55 | 94.59% | 591 | 0 |
| l6-harbor | €5,619.88 | 95.12% | 369 | 2 | -€7,633.50 | 92.07% | 517 | 0 |
| l6-spruce | €3,777.00 | 93.13% | 291 | 0 | -€841.62 | 97.57% | 371 | 0 |

Dispatcher settings: [level6-practice.json](level6-practice.json). Benchmark source fingerprint: `98fe8295722197e88a1e194a8ffd56d170a3dc0adb25a923c29727ea46f6c3f0`.

## Verification

Totals sum weekly margins in game euros and weight on-time shares by orders won. Each result was checked against its final score and team world listing. The API identifies the level, completion and unranked status; seed labels come from the local benchmark receipts. The paired outcomes reflect the full policies together. [Bahn API](https://spread.bahnexpress.com/kit/API.md)

Official starter fingerprint: `26e5b9cfa9406ea2eec37c513112f567fb8124ed4813087c1e55ae4c433a1499`.

| Named seed | Dispatcher world | Official starter world |
|---|---|---|
| l5-lake | `w58be21af9b78f634644d` | `w0b1045a44bfe2c61eeeb` |
| l5-birch | `wb6676b488094e72527aa` | `wdb3db684d794a85d8ab2` |
| l5-rail | `wf715863b0340de95a4ec` | `w812efd81d963967d1c29` |
| l5-harbor | `wc34d36604f2cb8940b88` | `w230659b5d81f908fd555` |
| l5-spruce | `w0059cc7e48272dd6edc3` | `w8bfa52b900b8deb6c8b9` |
| l6-lake | `w0f296c69070172fb8ba1` | `w5c609f5a85868a586239` |
| l6-birch | `w66ff481c286e586b36e2` | `w18134f801895cc973e56` |
| l6-rail | `w039e8a23ccf00551870f` | `wefe3eda51048c1fc9d86` |
| l6-harbor | `w3c92094fef4d9f7083dc` | `w233b163965fcaaba04be` |
| l6-spruce | `w0a779bd22d963dc59f5b` | `w88b1965be47271753ac9` |
