# Northbound Dispatch level 4 practice validation

The dispatcher earned **€122,577.02 across 15 unseen weeks**, with a positive margin and at least 90% on time in every week. Its updated pricing model allows longer dealer transfers and trade-ins. It prices a trade-in as one trip to the private handover and back, then posts the two cars together. Its fee rises as the latest feasible departure for the private handover approaches.

| Weeks | Qualified | Margin | Won | On time | Lowest weekly on time | Undelivered |
|---|---:|---:|---:|---:|---:|---:|
| Lake and Birch selection | 2/2 | €16,940.07 | 958 | 97.49% | 97.33% | 0 |
| Five new matched seeds | 5/5 | €43,795.46 | 2688 | 94.94% | 93.52% | 2 |
| Ten additional random seeds | 10/10 | €78,781.56 | 5219 | 94.31% | 91.17% | 1 |
| All unseen weeks | 15/15 | €122,577.02 | 7907 | 94.52% | 91.17% | 3 |

The candidate was selected on Lake and Birch, then frozen before the five comparison weeks. The ten random seed names were generated together before any of those ten ran. Identical settings ran on all 17 worlds. Official team world records identify each as completed, level 4 and unranked. The final API scores matched the local receipts. The stress roster ranged from 1,926 to 2,750 drivers. [Spread rules](https://spread.bahnexpress.com/kit/RULES.md) · [API and official scores](https://spread.bahnexpress.com/kit/API.md)

## Weekly evidence

| Practice seed | Gross margin | Won | On time | Undelivered | World |
|---|---:|---:|---:|---:|---|
| l4-lake | €4,466.74 | 374 | 97.33% | 0 | `wfd437083e8bd55e77ab6` |
| l4-birch | €12,473.33 | 584 | 97.60% | 0 | `w9985baa71dff401f7b30` |
| l4-tundra | €8,009.22 | 486 | 97.74% | 0 | `wc89d5370fc8d6ce6d68b` |
| l4-keel | €6,645.98 | 485 | 94.43% | 0 | `w45bbf59ad4e9eb494c80` |
| l4-sund | €8,657.11 | 522 | 95.40% | 0 | `w6274425dc00da112c975` |
| l4-tammisaari | €9,590.56 | 562 | 94.13% | 0 | `wbd9131a8fb4bfed10859` |
| l4-kalajoki | €10,892.59 | 633 | 93.52% | 2 | `wb036f0786e59c6eea15e` |
| l4-check-d1372b8f32a4 | €8,780.46 | 512 | 96.48% | 0 | `w09d81a74b55ca64bed73` |
| l4-check-13ee564059e5 | €9,878.86 | 515 | 97.09% | 0 | `w70e5dace73f0f526c44a` |
| l4-check-6a5103f56ab2 | €9,364.15 | 616 | 91.56% | 0 | `wf48ea94270172f19aa38` |
| l4-check-253bb98cc7e9 | €5,684.82 | 481 | 92.93% | 0 | `w8943d3a4ee848472fe71` |
| l4-check-61050907e37e | €5,760.02 | 420 | 97.14% | 0 | `wbd66cd96759efe05fce3` |
| l4-check-fa462fd58dc2 | €7,230.76 | 532 | 93.98% | 0 | `w07a46cb6d6f60f343ea8` |
| l4-check-e64f4154289f | €3,844.72 | 419 | 91.17% | 1 | `w7f9c024aea5b8f13b588` |
| l4-check-72813914f296 | €10,349.48 | 630 | 94.44% | 0 | `wb47904fb31e060f60346` |
| l4-check-a656c615ada7 | €6,446.30 | 480 | 95.83% | 0 | `waa6783451227aaf2d6d2` |
| l4-check-676948b87f3e | €11,441.99 | 614 | 93.16% | 0 | `w72708e622781487ac532` |

## Matched comparisons

The otherwise identical extended-distance policy used the preceding trade-in handling. It earned €4,197.63 on Lake and €11,729.78 on Birch. The selected policy improved margin by €269.11 and €743.55 respectively.

The following control used the separately frozen nested dealer-choice model. Both policies played the same seed for each row.

| Seed | Selected policy | Nested model | Difference | Control world |
|---|---:|---:|---:|---|
| l4-tundra | €8,009.22 | €6,822.77 | €1,186.45 | `wf82b0e7dcc0840b5453b` |
| l4-keel | €6,645.98 | €6,623.03 | €22.95 | `w44768f699226e39c5ed1` |
| l4-sund | €8,657.11 | €8,520.01 | €137.10 | `wa1cfe7138d7666243ca5` |
| l4-tammisaari | €9,590.56 | €8,701.18 | €889.38 | `w1be2ec5d44c19319a109` |
| l4-kalajoki | €10,892.59 | €12,369.92 | €-1,477.33 | `w9b9d283d43953f7cd940` |

The selected policy earned €758.55 more gross margin across the five matched weeks.

## Production verification

[Level 4 settings](level4-practice.json) select model 2. The integrated policy reproduced all 3,034 actions from the two development worlds, including 22 trade-in postings. A reconnect test checks the booked trade, the trained dealer-price model and a subsequent driver drop. Local official-score receipts, roster counts and the frozen source checksums are under `runs/econ-l4-combined/`. The public rankings use five separate secret weeks. [Official level 4 board](https://spread.bahnexpress.com/v1/leaderboards/practice?level=4)
