/** Diagnose one completed practice week from the dispatcher’s own orders, gigs and account. */
import { Client } from './reference/typescript/spread.ts'
import type { DeskEvent, DeskSnapshot, Gig, PriceRequest } from './reference/typescript/types.ts'

function diagnose(snapshot: DeskSnapshot, events: DeskEvent[]) {
  const eventsByRefund = new Set<string>()
  const requests = new Map<string, PriceRequest>()
  const gigs = new Map(snapshot.gigs.map(g => [g.id,g]))
  const byOrder = new Map<string,Gig[]>()
  for (const gig of gigs.values()) {
    const order = gig.stops[0]?.orderId
    if (order) { const list = byOrder.get(order) ?? []; list.push(gig); byOrder.set(order,list) }
  }
  const margin = new Map<string,number>()
  const ledger: Record<string,number> = {}
  for (const e of events) {
    if (e.kind === 'price_request') requests.set(e.request.id,e.request)
    if (e.kind !== 'ledger') continue
    const line = e.line
    if (line.kind === 'late_refund' && line.orderId) eventsByRefund.add(line.orderId)
    ledger[line.kind] = (ledger[line.kind] ?? 0) + line.cents
    const id = line.orderId ?? (line.gigId ? gigs.get(line.gigId)?.stops[0]?.orderId : undefined)
    if (id) margin.set(id,(margin.get(id) ?? 0) + line.cents)
  }
  const orders = snapshot.orders.filter(o => o.status !== 'cancelled').map(o => {
    const req = requests.get(o.id)
    const pickup = o.legs[0].pickup.placeId
    const destination = o.legs[0].delivery.placeId
    const priceRatio = req?.referenceFeeCents ? o.priceCents/req.referenceFeeCents : null
    const privateStop = o.legs.some(l=>l.pickup.privateAddress || l.delivery.privateAddress)
    const work = byOrder.get(o.id) ?? []
    return {
      id:o.id, lane:pickup+' → '+destination, marginCents:margin.get(o.id) ?? 0,
      priceCents:o.priceCents, typicalFeeCents:req?.referenceFeeCents, priceRatio,
      privateStop, legs:o.legs.length, posts:work.length, status:o.status,
      refund:eventsByRefund.has(o.id),
    }
  })
  return {ledger, orders}
}

// The CLI reports official score and account lines for this team’s world. The runner uses
// one car per gig, so a driver fee indexed only by gig can be assigned to its order.
if (import.meta.main) {
  const [worldId] = process.argv.slice(2)
  if (!worldId || !/^[a-zA-Z0-9_-]+$/.test(worldId)) throw new Error('Usage: node inspect-week.ts WORLD_ID')
  const client = new Client({url:'https://spread.bahnexpress.com'})
  const world = client.world(worldId)
  const snapshot = await world.snapshot()
  if (snapshot.now < snapshot.endsAt) throw new Error('This week is still in progress')
  const events = await world.events()
  const {ledger, orders} = diagnose(snapshot, events)
  const groups = new Map<string, {n:number; marginCents:number; late:number; undelivered:number}>()
  for (const o of orders) {
    const ratio = o.priceRatio
    const labels = [o.legs === 2 ? 'trade-in' : o.privateStop ? 'private stop' : 'dealer sites',
      ratio === null ? 'unknown price/reference' : ratio < 0.8 ? 'price/reference <0.8' : ratio < 1 ? 'price/reference 0.8–1.0' : ratio < 1.25 ? 'price/reference 1.0–1.25' : 'price/reference ≥1.25']
    for (const label of labels) {
      const g = groups.get(label) ?? {n:0,marginCents:0,late:0,undelivered:0}
      g.n++; g.marginCents += o.marginCents
      if (o.refund) g.late++
      if (o.status !== 'delivered') g.undelivered++
      groups.set(label,g)
    }
  }
  const ledgerTotal = Object.values(ledger).reduce((a,b)=>a+b,0)
  const totals = {ledgerTotalCents:ledgerTotal,unattributedCents:ledgerTotal - orders.reduce((s,o)=>s+o.marginCents,0)}
  console.log(JSON.stringify({worldId,score:snapshot.score,ledger,totals,groups:Object.fromEntries(groups),lowestMargins:orders.sort((a,b)=>a.marginCents-b.marginCents).slice(0,12)},null,2))
}
