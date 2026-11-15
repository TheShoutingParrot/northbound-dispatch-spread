// How many price requests would make a short-return pair with one of our cars that is waiting without a driver. Offline.
//   node runs/grind/backhaul.mjs VARIANT
import fs from 'node:fs'
const [variant = 'OP114'] = process.argv.slice(2)
const rows = fs.readFileSync('runs/grind/results.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.level === 8 && x.clean && x.variant === variant)
const map = JSON.parse(fs.readFileSync('runs/l7-next/data/map.json')); const road = new Map(map.roads.map(r => [r.from + '>' + r.to, r.minutes]))
const mins = (a, b) => a === b ? 0 : road.get(a + '>' + b) ?? 9999
const cuts = [0.15, 0.3, 0.5, 0.75]
const T = { weeks: 0, requests: 0, quoted: 0, won: 0, by: Object.fromEntries(cuts.map(c => [c, { req: 0, quoted: 0, won: 0, sameTown: 0 }])) }
for (const r of rows) {
  const f = `runs/l7-next/data/${r.worldId}.json`, sp = `runs/grind/runs/l8/${variant}/${r.seed}/${r.worldId}/steps.jsonl`
  if (!fs.existsSync(f) || !fs.existsSync(sp)) continue
  T.weeks++
  const d = JSON.parse(fs.readFileSync(f)), ev = d.events
  const steps = fs.readFileSync(sp, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const won = new Map(ev.filter(e => e.kind === 'order_won').map(e => [e.order.id, e.order]))
  // open single gigs over time: posted at, closed at (first booking, withdraw, or expiry)
  const gigs = []
  const byId = new Map()
  for (const s of steps) for (const [i, a] of (s.actions || []).entries()) {
    if (a.type === 'post' && s.results[i]?.ok) { const os = [...new Set(a.stops.map(x => x.orderId))]; if (os.length !== 1) continue
      const o = won.get(os[0]); if (!o || o.legs.length !== 1) continue
      const g = { id: s.results[i].id, order: o, from: s.now, to: Infinity }; gigs.push(g); byId.set(g.id, g) }
    if (a.type === 'withdraw' && s.results[i]?.ok) { const g = byId.get(a.gigId); if (g) g.to = Math.min(g.to, s.now) }
  }
  for (const e of ev) if (e.kind === 'gig_booked' || e.kind === 'gig_expired') { const g = byId.get(e.gigId); if (g) g.to = Math.min(g.to, e.at) }
  for (const x of d.reveal.requests) {
    const q = x.request; T.requests++
    const quoted = !!x.quote, w = x.outcome === 'won'
    if (quoted) T.quoted++; if (w) T.won++
    if (q.legs.length !== 1 || q.legs[0].pickup.privateAddress || q.legs[0].delivery.privateAddress) continue
    const L = q.legs[0], t = q.arrivedAt
    let best = Infinity, same = false
    for (const g of gigs) {
      if (!(g.from <= t && g.to > t)) continue
      const G = g.order.legs[0]
      if (G.pickup.privateAddress || G.delivery.privateAddress || g.order.lastPickupAt - t < 420) continue
      // open car first, request second
      for (const [A, B] of [[G, L], [L, G]]) {
        const link = mins(A.delivery.placeId, B.pickup.placeId); if (link > 30) continue
        const a = mins(A.pickup.placeId, A.delivery.placeId), b = mins(B.pickup.placeId, B.delivery.placeId)
        if (a + b + link > 449) continue
        const ratio = mins(B.delivery.placeId, A.pickup.placeId) / (a + b)
        if (ratio < best) { best = ratio; same = link === 0 }
      }
    }
    for (const c of cuts) if (best <= c) { const y = T.by[c]; y.req++; if (quoted) y.quoted++; if (w) y.won++; if (same) y.sameTown++ }
  }
}
console.log(variant, T.weeks, 'weeks;', (T.requests / T.weeks).toFixed(0), 'requests a week, quoted', (100 * T.quoted / T.requests).toFixed(0) + '%, won', (100 * T.won / T.requests).toFixed(0) + '% of all,', (100 * T.won / T.quoted).toFixed(0) + '% of quoted')
for (const c of cuts) { const y = T.by[c]; console.log(`return/road <= ${c}:`.padEnd(22), (y.req / T.weeks).toFixed(1).padStart(6), 'requests a week;', 'quoted', (100 * y.quoted / y.req).toFixed(0) + '%', 'won', (y.won / T.weeks).toFixed(1), 'a week =', (100 * y.won / y.quoted).toFixed(0) + '% of quoted;', 'same town', (100 * y.sameTown / y.req).toFixed(0) + '%') }
