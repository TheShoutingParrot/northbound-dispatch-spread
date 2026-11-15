# Northbound Dispatch: levels 3 and 4

The dispatcher and the official starter each played 5 named, unranked practice weeks per level. Each pair used the same seed, including its level prefix. Qualification requires winning at least one order and delivering at least 90% on time in that week. Practice results do not earn a leaderboard place. [Bahn rules](https://spread.bahnexpress.com/kit/RULES.md)

| Level | System | Total margin | Orders won | On time | Undelivered | Lowest weekly on-time share | Qualified weeks |
|---:|---|---:|---:|---:|---:|---:|---:|
| 3 | Dispatcher | €53,166.14 | 3474 | 94.82% | 1 | 93.43% | 5/5 |
| 3 | Official starter | -€26,112.69 | 4957 | 95.46% | 0 | 94.05% | 5/5 |
| 4 | Dispatcher | €21,611.83 | 2065 | 94.58% | 0 | 93.62% | 5/5 |
| 4 | Official starter | -€14,002.90 | 2105 | 95.91% | 0 | 92.94% | 5/5 |

## Settings comparison

We compared settings on Lake and Birch. After selection, we checked the chosen settings on Rail, Harbor and Spruce.

Each row uses two complete candidate runs from the same source build as that level’s selected policy. Alternative rows list only changes from the selected settings.

| Level | Dispatcher settings | Two-week margin | Lowest on-time share |
|---:|---|---:|---:|
| 3 | Selected settings | €20,816.07 | 94.79% |
| 3 | usable pickup time (min) 210, offerDelay 8, offerFactor 0.97, opening fee factor 0.7, fee increase 0.22 | €18,884.96 | 92.24% |
| 4 | Selected settings | €8,344.81 | 93.62% |
| 4 | long-haul pickup buffer (min) 150, usable pickup time (min) 150, nextDayPremium 0.02, offerDelay 10, offerFactor 0.97, opening fee factor 0.67, price adaptation 0.12, list-price multiplier 0.88, quote floor 0.78, sameDayPremium 0.06, fee increase 0.21 | €7,023.77 | 88.53% |
| 4 | long-haul pickup buffer (min) 160, nextDayPremium 0.03, offerDelay 10, opening fee factor 0.78, price adaptation 0.25, list-price multiplier 0.93, quote floor 0.86, sameDayPremium 0.12, fee increase 0.14 | €8,390.12 | 91.94% |
| 4 | usable pickup time (min) 150, nextDayPremium 0.03, offerDelay 8, offerFactor 0.98, opening fee factor 0.65, price adaptation 0.28, list-price multiplier 0.99, quote floor 0.79, sameDayPremium 0.09, fee increase 0.2 | €6,941.26 | 89.21% |

## Level 3

The dispatcher earned €79,278.83 more gross margin than the starter on these weeks.

| Seed | Dispatcher margin | On time | Won | Undelivered | Starter margin | On time | Won | Undelivered |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| l3-lake | €10,352.10 | 96.03% | 680 | 0 | -€10,288.89 | 94.05% | 991 | 0 |
| l3-birch | €10,463.97 | 94.79% | 748 | 0 | -€4,137.43 | 96.58% | 993 | 0 |
| l3-rail | €9,940.75 | 93.43% | 685 | 0 | -€2,503.50 | 95.77% | 992 | 0 |
| l3-harbor | €11,274.35 | 94.45% | 685 | 1 | -€3,159.06 | 96.46% | 990 | 0 |
| l3-spruce | €11,134.97 | 95.41% | 676 | 0 | -€6,023.81 | 94.45% | 991 | 0 |

Dispatcher settings: [level3-practice.json](level3-practice.json). Benchmark source fingerprint: `1f50b36beaecf0f48365bf47af7bd607d45b3b88be406b080ecd39abe573a909`.

## Level 4

The dispatcher earned €35,614.73 more gross margin than the starter on these weeks.

| Seed | Dispatcher margin | On time | Won | Undelivered | Starter margin | On time | Won | Undelivered |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| l4-lake | €2,482.73 | 93.62% | 282 | 0 | -€239.35 | 97.79% | 181 | 0 |
| l4-birch | €5,862.08 | 93.68% | 475 | 0 | -€5,707.75 | 97.12% | 590 | 0 |
| l4-rail | €6,733.03 | 94.94% | 593 | 0 | -€5,887.84 | 92.94% | 666 | 0 |
| l4-harbor | €2,043.55 | 94.62% | 316 | 0 | -€1,059.71 | 97.21% | 251 | 0 |
| l4-spruce | €4,490.44 | 95.74% | 399 | 0 | -€1,108.25 | 97.36% | 417 | 0 |

Dispatcher settings: [level4-practice.json](level4-practice.json). Benchmark source fingerprint: `1f50b36beaecf0f48365bf47af7bd607d45b3b88be406b080ecd39abe573a909`.

## Verification

Totals sum weekly margins in game euros and weight on-time shares by orders won. Each result was checked against its final score and team world listing. The API identifies the level, completion and unranked status; seed labels come from the local benchmark receipts. The paired outcomes reflect the full policies together. [Bahn API](https://spread.bahnexpress.com/kit/API.md)

Official starter fingerprint: `26e5b9cfa9406ea2eec37c513112f567fb8124ed4813087c1e55ae4c433a1499`.

| Named seed | Dispatcher world | Official starter world |
|---|---|---|
| l3-lake | `w2f8cacd41addf020c518` | `w30ecb96cfbff35fa2835` |
| l3-birch | `wd702bfeb053a44c6510e` | `wafcf2d4e335604bff3d4` |
| l3-rail | `wada272e376a7b2ee1ac5` | `w0c642ce1a3b0c369d1b3` |
| l3-harbor | `w7f25bb21d9c4c90e2a69` | `wead5683ed7539f181a8c` |
| l3-spruce | `wd1e0384075e056ec6442` | `wba3d076242b9bad366b0` |
| l4-lake | `w07833299b5bdc41b9835` | `wabfe0f41a37369d66a51` |
| l4-birch | `wd4db1ec3be83e5cfff58` | `w6832cce4f81885bb8f62` |
| l4-rail | `wcca6fb78d631ab82c4d4` | `we3dfef5db8c055588e03` |
| l4-harbor | `we2d0bf2c108c8b9abaf5` | `w7a7466fdd5b2ffa7c402` |
| l4-spruce | `w93769feb58226a956057` | `wa92ba85921b5de352c9c` |
