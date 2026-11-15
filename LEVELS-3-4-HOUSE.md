# Northbound Dispatch · House best challenge

## Selected dispatchers

| Level and practice weeks | Weeks | Gross margin | Won orders | On time | Worst week | Undelivered |
|---|---:|---:|---:|---:|---:|---:|
| 3 · Lake and Birch | 2 | €27,770.96 | 1,794 | 95.65% | 94.91% | 0 |
| 3 · Scarce-driver diagnostics | 2 | €22,339.36 | 1,625 | 92.68% | 92.29% | 0 |
| 3 · Ten preregistered random weeks | 10 | €135,942.79 | 8,755 | 95.15% | 92.94% | 0 |
| 4 · Lake and Birch | 2 | €16,940.07 | 958 | 97.49% | 97.33% | 0 |
| 4 · Five unseen weeks | 5 | €43,795.46 | 2,688 | 94.94% | 93.52% | 2 |
| 4 · Ten preregistered random weeks | 10 | €78,781.56 | 5,219 | 94.31% | 91.17% | 1 |

Each selected dispatcher qualified in every week shown. Only the secret weeks in the same official round can establish a win over House best. The named and random practice weeks are independent of the ranked weeks. [Level 3 leaderboard](https://spread.bahnexpress.com/v1/leaderboards/practice?level=3) · [Level 4 leaderboard](https://spread.bahnexpress.com/v1/leaderboards/practice?level=4)

**Level 3.** The dealer pays list price. The dispatcher estimates the driver fee needed to book each trip, using both towns, travel distance, time remaining and appointment type. When late deliveries accumulate or open gigs approach their pickup deadlines, it raises driver fees and becomes more selective about new commitments. Two scarce-driver cases that an earlier build failed at 85.26% and 86.01% reached 92.29% and 93.06% with this policy.

**Level 4.** The dispatcher prices delivery options according to estimated cost and the probability of winning the order. Trade-ins use one driver for the round trip. The fee rises as the driver’s last feasible departure for the private handover approaches. This candidate earned €758.55 more than the previous model across five matched unseen weeks and won four of those comparisons. [Level 4 validation and individual receipts](LEVEL4-HOUSE-VALIDATION.md)

## Matched against the previous dispatcher

| Original five named weeks | Weeks | Gross margin | Won orders | On time | Worst week | Undelivered |
|---|---:|---:|---:|---:|---:|---:|
| 3 · Selected dispatcher | 5 | €75,100.16 | 4,489 | 95.79% | 94.91% | 0 |
| 4 · Selected dispatcher | 5 | €38,738.18 | 2,496 | 94.11% | 90.70% | 0 |

On the same Lake, Birch, Rail, Harbor and Spruce seeds, the previous round 3 policies earned €53,166.14 and €21,611.83. The selected policies improved five-week margin by €21,934.02 and €17,126.35. These five weeks include the two development seeds shown above. [Previous dispatcher](LEVELS-3-4.md) · [Level 3 official score checks](runs/l4-price/l3-original5.json) · [Level 4 official score checks](runs/l4-price/l4-original5.json)

## Level 3 practice receipts

| Seed | Gross margin | Won orders | On time | Undelivered | Official practice world |
|---|---:|---:|---:|---:|---|
| l3-lake | €14,491.30 | 871 | 96.44% | 0 | `w5ef65af31fefa2e35a71` |
| l3-birch | €13,279.66 | 923 | 94.91% | 0 | `w44b1a6fd9b9a7143951a` |
| l3-stress-d41f18acee7f0c | €10,887.36 | 804 | 92.29% | 0 | `wbff902ab9ea348b7792f` |
| l3-stress-ced66c9f76c422 | €11,452.00 | 821 | 93.06% | 0 | `wb82b95e8b7475a254b94` |
| l3-proof-7ecd26564084 | €13,320.76 | 865 | 94.57% | 0 | `wc311614a55aeeffed7dd` |
| l3-proof-18b0ca685394 | €12,181.69 | 871 | 95.52% | 0 | `w065b3d822a9cb8f784b4` |
| l3-proof-befbd1e3f6c2 | €14,241.59 | 879 | 95.56% | 0 | `wc188febb245bbc25e3ff` |
| l3-proof-3e1181276eb9 | €16,209.69 | 909 | 95.71% | 0 | `we3ab4e056eda6f1b580f` |
| l3-proof-3869768550dc | €10,470.57 | 807 | 92.94% | 0 | `wa3457d7e251fed83e44e` |
| l3-proof-886220bec20d | €15,664.98 | 914 | 95.84% | 0 | `w68060f1dd3e8215e0011` |
| l3-proof-6925e38cc36f | €14,768.23 | 920 | 95.00% | 0 | `w45f256783c135a8d0d94` |
| l3-proof-3b879cda555f | €14,675.74 | 847 | 95.75% | 0 | `w6bea86fac9449a94f405` |
| l3-proof-652e9c782d8a | €14,275.45 | 897 | 96.43% | 0 | `wb56909e4d1264667e1a4` |
| l3-proof-8ba31a6c5d8c | €10,134.09 | 846 | 93.85% | 0 | `wb8db3580ba1abba7245f` |

Run source and settings were frozen before the random weeks. Official world metadata and final scores were checked for every receipt. Three level 3 replays produced 5,526 identical actions in the tested and integrated dispatchers, including the first scarce-driver diagnostic. Two level 4 replays reproduced all 3,034 recorded actions. On reconnection the level 3 runner recovers completed and late order counts from the ledger. [Level 3 verification](runs/l4-price/l3-verified.json) · [Level 3 ranking build](runs/l4-price/rank-3-validated-feedback/rank-build.json) · [Level 4 ranking build](runs/l4-price/rank-4-validated-trades/rank-build.json)

## Previous official round

Northbound Dispatch had already completed all five attempts at both levels in round 3 when this work began. The team ranked first of two eligible competitors at verification. House best was ahead by €7,293.55 at level 3 and €15,692.89 at level 4. [Verified round 3 scores](ROUND-3-LEVELS-3-4.md)
