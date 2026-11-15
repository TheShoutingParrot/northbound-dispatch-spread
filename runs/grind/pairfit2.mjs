// Posted two-car gigs: booked share by way back (rows) and driver supply near the pair's END (columns). Offline.
import fs from 'node:fs'
const [variant = 'OP114'] = process.argv.slice(2)
const rows = fs.readFileSync('runs/grind/results.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.level === 8 && x.clean && x.variant === variant)
const map = JSON.parse(fs.readFileSync('runs/l7-next/data/map.json')); const km = new Map(map.roads.map(r => [r.from + '>' + r.to, r.km])), mn = new Map(map.roads.map(r => [r.from + '>' + r.to, r.minutes]))
const mins = (a, b) => a === b ? 0 : mn.get(a + '>' + b) ?? 9999
const bucket = (v, edges) => { for (const e of edges) if (v <= e) return '<=' + e; return '>' + edges.at(-1) }
const T = {}, R = [0.3, 0.6, 0.85], C = [20, 60, 160]
for (const r of rows) {
  const f = `runs/l7-next/data/${r.worldId}.json`, sp = `runs/grind/runs/l8/${variant}/${r.seed}/${r.worldId}/steps.jsonl`
  if (!fs.existsSync(f) || !fs.existsSync(sp)) continue
  const d = JSON.parse(fs.readFileSync(f)), ev = d.events
  const steps = fs.readFileSync(sp, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const won = new Map(ev.filter(e => e.kind === 'order_won').map(e => [e.order.id, e.order]))
  const req = new Map(d.reveal.requests.map(x => [x.request.id, x.request]))
  const homes = {}; for (const x of d.drivers) homes[x.homePlaceId] = (homes[x.homePlaceId] ?? 0) + 1
  const supply = {}; for (const p of map.places) supply[p.id] = Object.entries(homes).reduce((s, [h, n]) => s + n * Math.exp(-(h === p.id ? 0 : km.get(h + '>' + p.id) ?? 1e9) / 38), 0)
  const booked = new Map(); for (const e of ev) if (e.kind === 'gig_booked' && !booked.has(e.gigId)) booked.set(e.gigId, e)
  for (const s of steps) for (const [i, a] of (s.actions || []).entries()) {
    if (a.type !== 'post' || !s.results[i]?.ok) continue
    const os = [...new Set(a.stops.map(x => x.orderId))]; if (os.length < 2) continue
    const A = won.get(os[0]).legs[0], B = won.get(os[1]).legs[0]
    const back = mins(B.delivery.placeId, A.pickup.placeId) / (mins(A.pickup.placeId, A.delivery.placeId) + mins(B.pickup.placeId, B.delivery.placeId))
    const ref = (req.get(os[0])?.referenceFeeCents ?? 0) + (req.get(os[1])?.referenceFeeCents ?? 0)
    const b = booked.get(s.results[i].id)
    const x = (T[bucket(back, R)] ??= {})[bucket(supply[B.delivery.placeId], C)] ??= { n: 0, booked: 0, fee: 0, ref: 0, lag: 0 }
    x.n++; if (b) { x.booked++; x.fee += b.feeCents; x.ref += ref; x.lag += b.at - s.now }
  }
}
const cols = [...C.map(e => '<=' + e), '>' + C.at(-1)]
console.log('way back \\ END supply'.padEnd(22) + cols.map(c => c.padStart(30)).join(''))
for (const k of [...R.map(e => '<=' + e), '>' + R.at(-1)]) console.log(k.padEnd(22) + cols.map(c => { const x = T[k]?.[c]; return (x ? `${x.n} posted ${(100 * x.booked / x.n).toFixed(0)}% @${(x.fee / (x.ref || 1)).toFixed(2)} ${(x.lag / (x.booked || 1)).toFixed(0)}min` : '-').padStart(30) }).join(''))
