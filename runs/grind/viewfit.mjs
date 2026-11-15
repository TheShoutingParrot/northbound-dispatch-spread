// Per view: how often a driver who looks at a gig books it, by fee (x typical) and by the pair's way back. Offline.
//   node runs/grind/viewfit.mjs VARIANT
import fs from 'node:fs'
const [variant = 'OP114'] = process.argv.slice(2)
const rows = fs.readFileSync('runs/grind/results.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.level === 8 && x.clean && x.variant === variant)
const map = JSON.parse(fs.readFileSync('runs/l7-next/data/map.json')); const road = new Map(map.roads.map(r => [r.from + '>' + r.to, r.minutes]))
const mins = (a, b) => a === b ? 0 : road.get(a + '>' + b) ?? 9999
const bucket = (v, edges) => { for (const e of edges) if (v <= e) return '<=' + e; return '>' + edges.at(-1) }
const T = {}
const add = (g, k1, k2, booked) => { const x = ((T[g] ??= {})[k1] ??= {})[k2] ??= { views: 0, booked: 0 }; x.views++; if (booked) x.booked++ }
const feeEdges = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.15, 1.3]
for (const r of rows) {
  const f = `runs/l7-next/data/${r.worldId}.json`, sp = `runs/grind/runs/l8/${variant}/${r.seed}/${r.worldId}/steps.jsonl`
  if (!fs.existsSync(f) || !fs.existsSync(sp)) continue
  const d = JSON.parse(fs.readFileSync(f)), ev = d.events
  const steps = fs.readFileSync(sp, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const won = new Map(ev.filter(e => e.kind === 'order_won').map(e => [e.order.id, e.order]))
  const req = new Map(d.reveal.requests.map(x => [x.request.id, x.request]))
  const home = new Map(d.drivers.map(x => [x.id, x.homePlaceId]))
  const gigs = new Map()
  for (const s of steps) for (const [i, a] of (s.actions || []).entries()) {
    if (a.type === 'post' && s.results[i]?.ok) { const os = [...new Set(a.stops.map(x => x.orderId))]
      const cars = os.map(o => won.get(o)?.legs[0]).filter(Boolean); if (cars.length !== os.length || os.some(o => won.get(o).legs.length !== 1)) continue
      const ref = os.reduce((t, o) => t + (req.get(o)?.referenceFeeCents ?? 0), 0); if (!ref) continue
      const P = cars[0].pickup.placeId, Q = cars.at(-1).delivery.placeId
      const total = cars.reduce((t, c) => t + mins(c.pickup.placeId, c.delivery.placeId), 0)
      gigs.set(s.results[i].id, { pair: os.length === 2, schedule: [...a.schedule], ref, P, Q, back: mins(Q, P) / total, total }) }
    if (a.type === 'reprice' && s.results[i]?.ok && gigs.has(a.gigId) && a.schedule) gigs.get(a.gigId).schedule = [...a.schedule]
  }
  const bookedBy = new Set(ev.filter(e => e.kind === 'gig_booked').map(e => e.gigId + '/' + e.driverId + '/' + e.at))
  const bookAt = new Map(); for (const e of ev) if (e.kind === 'gig_booked') bookAt.set(e.gigId + '/' + e.driverId, e.at)
  for (const e of ev) { if (e.kind !== 'gig_viewed') continue
    const g = gigs.get(e.gigId); if (!g) continue
    const fee = (g.schedule.findLast(s => s.at <= e.at) ?? g.schedule[0]).feeCents / g.ref
    const b = bookAt.get(e.gigId + '/' + e.driverId), booked = b !== undefined && b >= e.at && b - e.at <= 30
    const h = home.get(e.driverId), toStart = mins(h, g.P), fromEnd = mins(g.Q, h)
    if (g.pair) { add('PAIRS by way back (rows) and fee x typical (columns)', bucket(g.back, [0.15, 0.3, 0.5, 0.75, 1]), bucket(fee, feeEdges), booked)
      add('PAIRS by driver home to start (min)', bucket(toStart, [0, 30, 60, 120, 240]), bucket(fee, feeEdges), booked)
      add('PAIRS by end to driver home (min)', bucket(fromEnd, [0, 30, 60, 120, 240]), bucket(fee, feeEdges), booked) }
    else { add('SINGLES by road minutes', bucket(g.total, [60, 120, 200, 320]), bucket(fee, feeEdges), booked)
      add('SINGLES by driver home to start (min)', bucket(toStart, [0, 30, 60, 120, 240]), bucket(fee, feeEdges), booked)
      add('SINGLES by end to driver home (min)', bucket(fromEnd, [0, 30, 60, 120, 240]), bucket(fee, feeEdges), booked) }
  }
}
const cols = [...feeEdges.map(e => '<=' + e), '>' + feeEdges.at(-1)]
for (const [g, rowsG] of Object.entries(T)) { console.log('\n' + g + '   (booked % of views; views)')
  console.log(' '.repeat(10) + cols.map(c => c.padStart(12)).join(''))
  for (const [k, cells] of Object.entries(rowsG).sort((p, q) => parseFloat(p[0].replace(/[<=>]/g, '')) - parseFloat(q[0].replace(/[<=>]/g, '')) || p[0].localeCompare(q[0])))
    console.log(k.padEnd(10) + cols.map(c => { const x = cells[c]; return (x && x.views >= 20 ? (100 * x.booked / x.views).toFixed(1) + '% ' + String(x.views).padStart(5) : '-').padStart(12) }).join('')) }
