// Variant table by name: each variant against a base variant on the seeds both have (latest clean run of each).
//   node runs/grind/vt.mjs BASE V1,V2,... [level]
import fs from 'node:fs'
const [base, list, levelText = '8'] = process.argv.slice(2)
const rows = fs.readFileSync('runs/grind/results.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.level === +levelText && x.clean)
const by = {}; for (const r of rows) (by[r.variant] ??= {})[r.seed] = r
const B = by[base] ?? {}
console.log('variant'.padEnd(10), 'seeds', 'margin vs base'.padStart(15), 'better'.padStart(7), 'orders'.padStart(8), 'on-time mean'.padStart(13), 'Δ on-time'.padStart(10), 'lowest'.padStart(7), 'base lowest'.padStart(12), ' €/week')
for (const v of list.split(',')) {
  const V = by[v] ?? {}, seeds = Object.keys(V).filter(s => B[s])
  if (!seeds.length) { console.log(v.padEnd(10), '    0'); continue }
  const sum = f => seeds.reduce((s, x) => s + f(x), 0)
  const m = sum(s => V[s].marginCents), mb = sum(s => B[s].marginCents)
  console.log(v.padEnd(10), String(seeds.length).padStart(5), ((100 * (m / mb - 1)).toFixed(1) + '%').padStart(15), (seeds.filter(s => V[s].marginCents > B[s].marginCents).length + '/' + seeds.length).padStart(7),
    ((100 * (sum(s => V[s].wonOrders) / sum(s => B[s].wonOrders) - 1)).toFixed(1) + '%').padStart(8), (100 * sum(s => V[s].onTimeShare) / seeds.length).toFixed(1).padStart(13),
    ((100 * (sum(s => V[s].onTimeShare) - sum(s => B[s].onTimeShare)) / seeds.length).toFixed(1)).padStart(10), (100 * Math.min(...seeds.map(s => V[s].onTimeShare))).toFixed(1).padStart(7), (100 * Math.min(...seeds.map(s => B[s].onTimeShare))).toFixed(1).padStart(12), ' ' + (m / seeds.length / 100).toFixed(0))
}
