// Direct offers: answers by (driver lives near the gig's END) x (driver viewed one of our gigs earlier that day / in the last 2 h). Offline.
import fs from 'node:fs'
const variants = process.argv.slice(2).length ? process.argv.slice(2) : ['OP114']
const all = fs.readFileSync('runs/grind/results.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.level === 8 && x.clean && variants.includes(x.variant))
const map = JSON.parse(fs.readFileSync('runs/l7-next/data/map.json')); const road = new Map(map.roads.map(r => [r.from + '>' + r.to, r.minutes]))
const mins = (a, b) => a === b ? 0 : road.get(a + '>' + b) ?? 9999
const T = {}; const add = (k, e, fee) => { const x = T[k] ??= { n: 0, accepted: 0, declined: 0, expired: 0, fee: 0 }; x.n++; x[e.answer]++; x.fee += fee }
let weeks = 0
for (const r of all) {
  const f = `runs/l7-next/data/${r.worldId}.json`, sp = `runs/grind/runs/l8/${r.variant}/${r.seed}/${r.worldId}/steps.jsonl`
  if (!fs.existsSync(f) || !fs.existsSync(sp)) continue
  weeks++
  const d = JSON.parse(fs.readFileSync(f)), ev = d.events
  const steps = fs.readFileSync(sp, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const won = new Map(ev.filter(e => e.kind === 'order_won').map(e => [e.order.id, e.order]))
  const req = new Map(d.reveal.requests.map(x => [x.request.id, x.request]))
  const home = new Map(d.drivers.map(x => [x.id, x.homePlaceId]))
  const gigs = new Map(), offers = new Map()
  for (const s of steps) for (const [i, a] of (s.actions || []).entries()) {
    if (a.type === 'post' && s.results[i]?.ok) { const os = [...new Set(a.stops.map(x => x.orderId))]; const cars = os.map(o => won.get(o)?.legs[0]).filter(Boolean); if (!cars.length) continue
      gigs.set(s.results[i].id, { P: cars[0].pickup.placeId, Q: cars.at(-1).delivery.placeId, ref: os.reduce((t, o) => t + (req.get(o)?.referenceFeeCents ?? 0), 0), from: Math.max(...cars.map(c => c.pickup.window.from)) }) }
    if (a.type === 'offer' && s.results[i]?.ok) offers.set(a.gigId + '/' + a.driverId, { at: s.now, fee: a.feeCents })
  }
  const views = new Map() // driver -> sorted view minutes
  for (const e of ev) if (e.kind === 'gig_viewed') { let v = views.get(e.driverId); if (!v) views.set(e.driverId, v = []); v.push(e.at) }
  for (const e of ev) { if (e.kind !== 'offer_answered') continue
    const g = gigs.get(e.gigId), o = offers.get(e.gigId + '/' + e.driverId); if (!g || !o) continue
    const h = home.get(e.driverId), v = views.get(e.driverId) ?? []
    const day0 = Math.floor(o.at / 1440) * 1440
    const today = v.some(t => t >= day0 && t < o.at), recent = v.some(t => t >= o.at - 120 && t < o.at)
    const near = mins(g.Q, h) <= 30 ? 'END near home' : mins(h, g.P) <= 30 ? 'START near home' : 'neither'
    const soon = g.from - o.at <= 240 ? 'car ready within 4 h' : 'car ready later'
    add(`${near.padEnd(16)} | ${recent ? 'viewed in last 2 h' : today ? 'viewed today     ' : 'not seen today   '}`, e, o.fee / g.ref)
    add(`${near.padEnd(16)} | ${soon}`, e, o.fee / g.ref)
  }
}
console.log(variants.join('+'), weeks, 'weeks')
for (const [k, x] of Object.entries(T).sort()) console.log(k.padEnd(48), 'offers', String(x.n).padStart(6), 'accepted', (100 * x.accepted / x.n).toFixed(2).padStart(5) + '%', 'declined', (100 * x.declined / x.n).toFixed(0).padStart(3) + '%', 'unread/expired', (100 * x.expired / x.n).toFixed(0).padStart(3) + '%', 'at', (x.fee / x.n).toFixed(2), 'x typical')
