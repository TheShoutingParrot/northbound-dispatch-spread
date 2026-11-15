# Level 2 practice · Northbound Dispatch

Bahn’s simulator recorded **€47,926.94 gross margin** and **95.89% on time** (3,263 of 3,403 won orders). 0 orders remained undelivered. 5 of 5 weeks met the 90% delivery threshold.

The official starter earned -€60,830.70 on the same seeds. The difference in gross margin was €108,757.64.

| Named seed | Dispatcher margin | On time | Orders won | Undelivered | Starter margin | Starter on time |
|---|---:|---:|---:|---:|---:|---:|
| l2-lake | €10,002.71 | 97.09% | 688 | 0 | -€6,882.93 | 95.98% |
| l2-rail | €10,103.01 | 96.70% | 696 | 0 | -€18,151.10 | 92.23% |
| l2-birch | €9,503.77 | 96.52% | 661 | 0 | -€11,297.92 | 93.52% |
| l2-harbor | €10,566.58 | 96.47% | 679 | 0 | -€4,975.44 | 95.57% |
| l2-spruce | €7,750.87 | 92.64% | 679 | 0 | -€19,523.31 | 88.71% |

We selected the fee settings on the lake, rail and birch weeks. Harbor and spruce were fresh validation seeds run after the selection.

| Opening fee / typical fee | Scheduled increase / typical fee | Raise after a drop | Margin on three selection weeks | Lowest weekly on-time share |
|---:|---:|---:|---:|---:|
| 78.00% | 14.00% | 8.00% | €29,609.49 | 96.52% |
| 69.00% | 24.00% | 10.00% | €28,893.20 | 94.89% |
| 84.00% | 0.00% | 5.00% | €28,252.30 | 96.66% |

At level 2 drivers learn from fee increases and can drop bookings. The dispatcher checks which jobs fit pickup hours, posts a single car per gig, and schedules its fees in advance. It handles drops and no-shows on the existing gig. The selected settings are in [level2-practice.json](level2-practice.json).

The event histories recorded 243 dropped bookings, 38 no-shows and 274 subsequent rebookings of affected gigs.

Each score was read from its completed world. The team world list identified every run below as level 2 private practice, with no board-run number or ranking season. [Bahn API reference](https://spread.bahnexpress.com/kit/API.md)

| Seed | Dispatcher world | Starter world |
|---|---|---|
| l2-lake | `w8f73f06bd9087e09b18f` | `wab7624ffdbbfeb76850a` |
| l2-rail | `wd61847ffec26d45c7e37` | `w037422fc4fd732878483` |
| l2-birch | `wa0c6fb2e230606527708` | `w6fa5c55b6200bf46f0bb` |
| l2-harbor | `w421c7d428ce8daf57fc7` | `w72420d67287ea8cd32c3` |
| l2-spruce | `w30ee589e53e25c6955d5` | `w7d931ace9ba9ea7775ee` |
