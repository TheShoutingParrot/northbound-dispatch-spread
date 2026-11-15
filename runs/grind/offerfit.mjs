// Direct offers: how they were answered, by where the driver lives relative to the gig's start and end. Offline.
import fs from 'node:fs'
const [variant = 'OP114'] = process.argv.slice(2)
const rows = fs.readFileSync('runs/grind/results.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.level === 8 && x.clean && x.variant === variant)
const map = JSON.parse(fs.readFileSync('runs/l7-next/data/map.json')); const road = new Map(map.roads.map(r => [r.from + '>' + r.to, r.minutes]))
const mins = (a, b) => a === b ? 0 : road.get(a + '>' + b) ?? 9999
const bucket = (v, edges) => { for (const e of edges) if (v <= e) return '<=' + e; return '>' + edges.at(-1) }
const T = {}; const add = (g, k, ans) => { const x = (T[g] ??= {})[k] ??= { n: 0 }; x.n++; x[ans] = (x[ans] ?? 0) + 1 }
let weeks = 0, endHomeDrivers = 0, gigsN = 0, gigsWithEndHome = 0
for (const r of rows) {
  const f = `runs/l7-next/data/${r.worldId}.json`, sp = `runs/grind/runs/l8/${variant}/${r.seed}/${r.worldId}/steps.jsonl`
  if (!fs.existsSync(f) || !fs.existsSync(sp)) continue
  weeks++
  const d = JSON.parse(fs.readFileSync(f)), ev = d.events
  const steps = fs.readFileSync(sp, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const won = new Map(ev.filter(e => e.kind === 'order_won').map(e => [e.order.id, e.order]))
  const home = new Map(d.drivers.map(x => [x.id, x.homePlaceId]))
  const homes = {}; for (const x of d.drivers) homes[x.homePlaceId] = (homes[x.homePlaceId] ?? 0) + 1
  const gigs = new Map()
  for (const s of steps) for (const [i, a] of (s.actions || []).entries()) if (a.type === 'post' && s.results[i]?.ok) {
    const os = [...new Set(a.stops.map(x => x.orderId))]; const cars = os.map(o => won.get(o)?.legs[0]).filter(Boolean); if (!cars.length) continue
    gigs.set(s.results[i].id, { P: cars[0].pickup.placeId, Q: cars.at(-1).delivery.placeId, pair: os.length === 2 })
    gigsN++; endHomeDrivers += homes[cars.at(-1).delivery.placeId] ?? 0; if ((homes[cars.at(-1).delivery.placeId] ?? 0) >= 2) gigsWithEndHome++
  }
  for (const e of ev) { if (e.kind !== 'offer_answered') continue
    const g = gigs.get(e.gigId); if (!g) continue
    const h = home.get(e.driverId)
    add('by end to driver home (min)', bucket(mins(g.Q, h), [0, 30, 60, 120, 240]), e.answer)
    add('by driver home to start (min)', bucket(mins(h, g.P), [0, 30, 60, 120, 240]), e.answer)
    add('pair or single', g.pair ? 'pair' : 'single', e.answer)
  }
}
console.log(variant, weeks, 'weeks; gigs posted', gigsN, '; drivers living in the end town, mean per gig', (endHomeDrivers / gigsN).toFixed(1), '; gigs with at least 2 such drivers', (100 * gigsWithEndHome / gigsN).toFixed(0) + '%')
for (const [g, keys] of Object.entries(T)) { console.log('\n' + g)
  for (const [k, x] of Object.entries(keys).sort((p, q) => parseFloat(p[0].replace(/[<=>]/g, '')) - parseFloat(q[0].replace(/[<=>]/g, '')) || p[0].localeCompare(q[0])))
    console.log('  ' + k.padEnd(10), 'offers', String(x.n).padStart(6), Object.entries(x).filter(([a]) => a !== 'n').map(([a, n]) => a + ' ' + (100 * n / x.n).toFixed(1) + '%').join(', ')) }
