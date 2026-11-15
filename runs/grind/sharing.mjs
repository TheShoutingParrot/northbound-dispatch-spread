// What a car costs alone and in a shared gig, and how many one-car orders had a possible partner. Offline.
//   node runs/grind/sharing.mjs VARIANT
import fs from 'node:fs'
const [variant = 'OP114'] = process.argv.slice(2)
const map = JSON.parse(fs.readFileSync('runs/l7-next/data/map.json'))
const P = new Map(map.places.map(p => [p.id, p]))
const km = (a, b) => { const A = P.get(a), B = P.get(b), r = Math.PI / 180, h = Math.sin((B.lat - A.lat) * r / 2) ** 2 + Math.cos(A.lat * r) * Math.cos(B.lat * r) * Math.sin((B.lon - A.lon) * r / 2) ** 2; return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h))) }
const rows = fs.readFileSync('runs/grind/results.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.level === 8 && x.clean && x.variant === variant)
const T = { weeks: 0, orders: 0, single: { cars: 0, fee: 0, ref: 0 }, pair: { cars: 0, fee: 0, ref: 0 }, self: { cars: 0, fee: 0, ref: 0 }, alone: { cars: 0, fee: 0, ref: 0 },
  partner50: 0, partnerSame: 0, partner50free: 0, partnerSameFree: 0, paired: 0, oneCar: 0 }
for (const r of rows) {
  const f = `runs/l7-next/data/${r.worldId}.json`, sp = `runs/grind/runs/l8/${variant}/${r.seed}/${r.worldId}/steps.jsonl`
  if (!fs.existsSync(f) || !fs.existsSync(sp)) continue
  T.weeks++
  const ev = JSON.parse(fs.readFileSync(f)).events
  const steps = fs.readFileSync(sp, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const req = new Map(ev.filter(e => e.kind === 'price_request').map(e => [e.request.id, e.request]))
  const won = new Map(ev.filter(e => e.kind === 'order_won').map(e => [e.order.id, e]))
  const gigOrders = new Map(); for (const s of steps) for (const [i, a] of (s.actions || []).entries()) if (a.type === 'post' && s.results[i]?.ok) gigOrders.set(s.results[i].id, [...new Set(a.stops.map(x => x.orderId))])
  // the booking that carried each gig to the end: last gig_booked before gig_started
  const lastBook = new Map(), started = new Map(), firstBooked = new Map()
  for (const e of ev) {
    if (e.kind === 'gig_booked') { lastBook.set(e.gigId, e); for (const o of gigOrders.get(e.gigId) ?? []) if (!firstBooked.has(o)) firstBooked.set(o, e.at) }
    if (e.kind === 'gig_started') started.set(e.gigId, { at: e.at, driver: e.driverId })
  }
  // per driver: the gigs they drove, in order, with places
  const byDriver = new Map()
  for (const [g, st] of started) { const b = lastBook.get(g), os = gigOrders.get(g); if (!b || !os) continue
    const cars = os.map(o => won.get(o)?.order).filter(Boolean); if (!cars.length) continue
    const ref = os.reduce((s, o) => s + (req.get(o)?.referenceFeeCents ?? 0), 0)
    const rec = { g, at: st.at, fee: b.feeCents, ref, n: os.length, from: cars[0].legs[0].pickup.placeId, to: cars.at(-1).legs[0].delivery.placeId, day: Math.floor(st.at / 1440) }
    ;(byDriver.get(st.driver) ?? byDriver.set(st.driver, []).get(st.driver)).push(rec) }
  for (const list of byDriver.values()) { list.sort((a, b) => a.at - b.at)
    for (const [i, x] of list.entries()) {
      if (x.n > 1) { T.pair.cars += x.n; T.pair.fee += x.fee; T.pair.ref += x.ref; continue }
      T.single.cars++; T.single.fee += x.fee; T.single.ref += x.ref
      // a single gig that the driver chained by themselves: another of our gigs the same day starting near where this ends, or ending near where this starts
      const chained = list.some((y, j) => j !== i && y.day === x.day && (km(x.to, y.from) <= 50 && y.at > x.at || km(y.to, x.from) <= 50 && y.at < x.at))
      const k = chained ? T.self : T.alone; k.cars++; k.fee += x.fee; k.ref += x.ref } }
  // possible partners among one-car orders
  const one = [...won.values()].filter(w => w.order.legs.length === 1)
  const inPair = new Set([...gigOrders.entries()].filter(([g, os]) => os.length > 1 && started.has(g)).flatMap(([, os]) => os))
  for (const a of one) { T.oneCar++; if (inPair.has(a.order.id)) T.paired++
    const A = a.order.legs[0]; let p50 = false, pSame = false, p50f = false, pSameF = false
    for (const b of one) { if (b === a) continue
      const B = b.order.legs[0]
      for (const [x, y, X, Y] of [[a, b, A, B], [b, a, B, A]]) { // x first, y second
        const d = km(X.delivery.placeId, Y.pickup.placeId); if (d > 50) continue
        const from = Math.max(x.at, y.at), until = Math.min(x.order.lastPickupAt, y.order.lastPickupAt) - 240
        if (until < from) continue
        p50 = true; if (d < 0.5) pSame = true
        // both still without a driver at some minute in that span?
        const free = Math.min(firstBooked.get(x.order.id) ?? Infinity, firstBooked.get(y.order.id) ?? Infinity)
        if (free > from) { p50f = true; if (d < 0.5) pSameF = true } } }
    if (p50) T.partner50++; if (pSame) T.partnerSame++; if (p50f) T.partner50free++; if (pSameF) T.partnerSameFree++ }
}
const x = k => `${k.cars} cars, fee ${(k.fee / k.ref).toFixed(2)}x typical (€${(k.fee / k.cars / 100).toFixed(1)} a car; typical €${(k.ref / k.cars / 100).toFixed(1)})`
console.log(`${variant}: ${T.weeks} weeks`)
console.log('cars driven in our two-car gigs:      ', x(T.pair))
console.log('cars driven in one-car gigs:          ', x(T.single))
console.log('  of these, chained by the driver:    ', x(T.self), '(same driver, same day, another of our gigs within 50 km)')
console.log('  of these, driven alone:             ', x(T.alone))
const pc = n => (100 * n / T.oneCar).toFixed(0) + '%'
console.log(`one-car orders: ${T.oneCar}`)
console.log(`  had a possible partner within 50 km, four hours to spare (the quote's bound):  ${pc(T.partner50)}`)
console.log(`  ... with the partner in the same town:                                         ${pc(T.partnerSame)}`)
console.log(`  ... within 50 km and both still without a driver when the later one was won:   ${pc(T.partner50free)}`)
console.log(`  ... same town and both still without a driver when the later one was won:      ${pc(T.partnerSameFree)}`)
console.log(`  actually driven in one of our two-car gigs:                                    ${pc(T.paired)}`)
