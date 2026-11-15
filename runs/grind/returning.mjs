// Returning drivers: when we post a one-car gig P->Q, is a driver who lives near Q standing in P (or about to be)
// because of one of our own gigs, and does that driver take it? Offline.
import fs from 'node:fs'
const [variant = 'OP114'] = process.argv.slice(2)
const rows = fs.readFileSync('runs/grind/results.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.level === 8 && x.clean && x.variant === variant)
const map = JSON.parse(fs.readFileSync('runs/l7-next/data/map.json')); const road = new Map(map.roads.map(r => [r.from + '>' + r.to, r.minutes]))
const mins = (a, b) => a === b ? 0 : road.get(a + '>' + b) ?? 9999
const T = { weeks: 0, singles: 0, booked: 0, feeAll: 0, refAll: 0, cand: 0, candBookedByCand: 0, candBookedOther: 0, candFee: 0, candRef: 0, candLag: 0, otherFee: 0, otherRef: 0,
  byEndHome: 0, byEndHomeFee: 0, byEndHomeRef: 0, away: 0, awayFee: 0, awayRef: 0, lagBuckets: {} }
for (const r of rows) {
  const f = `runs/l7-next/data/${r.worldId}.json`, sp = `runs/grind/runs/l8/${variant}/${r.seed}/${r.worldId}/steps.jsonl`
  if (!fs.existsSync(f) || !fs.existsSync(sp)) continue
  T.weeks++
  const d = JSON.parse(fs.readFileSync(f)), ev = d.events
  const steps = fs.readFileSync(sp, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const won = new Map(ev.filter(e => e.kind === 'order_won').map(e => [e.order.id, e.order]))
  const req = new Map(d.reveal.requests.map(x => [x.request.id, x.request]))
  const home = new Map(d.drivers.map(x => [x.id, x.homePlaceId]))
  const gigs = new Map()
  for (const s of steps) for (const [i, a] of (s.actions || []).entries()) if (a.type === 'post' && s.results[i]?.ok) {
    const os = [...new Set(a.stops.map(x => x.orderId))]; const cars = os.map(o => won.get(o)?.legs[0]).filter(Boolean); if (cars.length !== os.length) continue
    gigs.set(s.results[i].id, { id: s.results[i].id, at: s.now, P: cars[0].pickup.placeId, Q: cars.at(-1).delivery.placeId, single: os.length === 1 && won.get(os[0]).legs.length === 1,
      ref: os.reduce((t, o) => t + (req.get(o)?.referenceFeeCents ?? 0), 0), last: won.get(os[0]).lastPickupAt })
  }
  // where each driver was put by our gigs: the last delivery of each started gig
  const driverOf = new Map(); for (const e of ev) if (e.kind === 'gig_started') driverOf.set(e.gigId, e.driverId)
  const arrivals = [] // { driver, place, at }
  const lastDelivery = new Map(); for (const e of ev) if (e.kind === 'delivered') lastDelivery.set(e.gigId, e)
  for (const [g, e] of lastDelivery) { const dr = driverOf.get(g); if (dr) arrivals.push({ driver: dr, place: e.placeId, at: e.at, gig: g }) }
  // bookings that held (last booking before start), and booked-but-not-yet-delivered intervals
  const lastBook = new Map(); for (const e of ev) if (e.kind === 'gig_booked') lastBook.set(e.gigId, e)
  const startAt = new Map(); for (const e of ev) if (e.kind === 'gig_started') startAt.set(e.gigId, e.at)
  for (const g of gigs.values()) {
    if (!g.single) continue
    T.singles++
    const b = lastBook.get(g.id); const drove = b && startAt.has(g.id)
    // candidates: drivers living within 30 min of Q (not living within 30 of P) whom our gigs put within 30 min of P
    // from 240 min before the post until the last pickup; or who at posting hold a booked gig of ours that ends near P
    const cands = new Set()
    for (const a of arrivals) { if (a.at < g.at - 240 || a.at > g.last) continue
      const h = home.get(a.driver); if (mins(a.place, g.P) > 30 || mins(g.Q, h) > 30 || mins(h, g.P) <= 30) continue
      // known at posting only if that gig was booked by this driver before the post
      const bk = lastBook.get(a.gig); if (!bk || bk.at > g.at) continue
      cands.add(a.driver) }
    if (drove) { T.booked++; T.feeAll += b.feeCents; T.refAll += g.ref
      const h = home.get(b.driverId)
      if (mins(g.Q, h) <= 30) { T.byEndHome++; T.byEndHomeFee += b.feeCents; T.byEndHomeRef += g.ref } else if (mins(h, g.P) > 30) { T.away++; T.awayFee += b.feeCents; T.awayRef += g.ref } }
    if (!cands.size) continue
    T.cand++
    if (drove && cands.has(b.driverId)) { T.candBookedByCand++; T.candFee += b.feeCents; T.candRef += g.ref; T.candLag += b.at - g.at
      const k = b.at - g.at <= 30 ? '<=30' : b.at - g.at <= 90 ? '<=90' : b.at - g.at <= 240 ? '<=240' : '>240'; T.lagBuckets[k] = (T.lagBuckets[k] ?? 0) + 1 }
    else if (drove) { T.candBookedOther++; T.otherFee += b.feeCents; T.otherRef += g.ref }
  }
}
const w = T.weeks
console.log(variant, w, 'weeks; one-car gig posts', (T.singles / w).toFixed(0), 'a week; driven', (T.booked / w).toFixed(0), 'at', (T.feeAll / T.refAll).toFixed(2), 'x typical')
console.log('driven by a driver living within 30 min of the END:', (T.byEndHome / w).toFixed(1), 'a week =', (100 * T.byEndHome / T.booked).toFixed(0) + '% of driven, at', (T.byEndHomeFee / T.byEndHomeRef).toFixed(2), 'x typical')
console.log('driven by a driver living over 30 min from both ends:', (T.away / w).toFixed(1), 'a week, at', (T.awayFee / T.awayRef).toFixed(2), 'x typical')
console.log('posts with a returning driver we could know of (our gig brings a driver who lives near the END to the START):', (T.cand / w).toFixed(1), 'a week')
console.log('  taken by that driver:', (T.candBookedByCand / w).toFixed(1), 'a week =', (100 * T.candBookedByCand / T.cand).toFixed(0) + '%, at', (T.candFee / T.candRef).toFixed(2), 'x typical,', (T.candLag / (T.candBookedByCand || 1)).toFixed(0), 'min after posting', JSON.stringify(T.lagBuckets))
console.log('  taken by someone else:', (T.candBookedOther / w).toFixed(1), 'a week, at', (T.otherFee / T.otherRef).toFixed(2), 'x typical')
