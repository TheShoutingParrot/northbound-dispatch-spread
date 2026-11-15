// Won one-car orders by END and START supply: price, driver fee, margin per order in euros. Offline.
import fs from 'node:fs'
const [variant = 'OP114'] = process.argv.slice(2)
const rows = fs.readFileSync('runs/grind/results.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.level === 8 && x.clean && x.variant === variant)
const map = JSON.parse(fs.readFileSync('runs/l7-next/data/map.json')); const km = new Map(map.roads.map(r => [r.from + '>' + r.to, r.km]))
const T = {}; let weeks = 0
for (const r of rows) {
  const f = `runs/l7-next/data/${r.worldId}.json`; if (!fs.existsSync(f)) continue
  weeks++
  const d = JSON.parse(fs.readFileSync(f)), ev = d.events
  const homes = {}; for (const x of d.drivers) homes[x.homePlaceId] = (homes[x.homePlaceId] ?? 0) + 1
  const supply = {}; for (const p of map.places) supply[p.id] = Object.entries(homes).reduce((s, [h, n]) => s + n * Math.exp(-(h === p.id ? 0 : km.get(h + '>' + p.id) ?? 1e9) / 38), 0)
  const led = new Map(); for (const e of ev) if (e.kind === 'ledger' && e.line.orderId) { const x = led.get(e.line.orderId) ?? { rev: 0, fee: 0, other: 0 }; if (e.line.kind === 'revenue') x.rev += e.line.cents; else if (e.line.kind === 'driver_fee') x.fee -= e.line.cents; else x.other += e.line.cents; led.set(e.line.orderId, x) }
  const req = new Map(d.reveal.requests.map(x => [x.request.id, x]))
  for (const e of ev) { if (e.kind !== 'order_won' || e.order.legs.length !== 1) continue
    const L = e.order.legs[0], so = supply[L.pickup.placeId], sd = supply[L.delivery.placeId], x = led.get(e.order.id) ?? { rev: 0, fee: 0, other: 0 }, q = req.get(e.order.id)?.request
    const g = `${sd >= 160 ? 'END rich ' : sd <= 20 ? 'END thin ' : 'END mid  '} | ${so >= 160 ? 'START rich' : so <= 20 ? 'START thin' : 'START mid '}`
    for (const k of [g, sd >= 160 ? 'END rich  (all)' : sd <= 20 ? 'END thin  (all)' : 'END mid   (all)']) { const c = T[k] ??= { n: 0, rev: 0, fee: 0, other: 0, ref: 0, list: 0, km: 0 }
      c.n++; c.rev += x.rev; c.fee += x.fee; c.other += x.other; c.ref += q?.referenceFeeCents ?? 0; c.list += q?.options[0].listPriceCents ?? 0; c.km += km.get(L.pickup.placeId + '>' + L.delivery.placeId) ?? 0 } }
}
console.log(variant, weeks, 'weeks; per won one-car order')
for (const [k, c] of Object.entries(T).sort()) console.log(k.padEnd(24), 'orders/wk', (c.n / weeks).toFixed(1).padStart(6), 'km', (c.km / c.n).toFixed(0).padStart(4), 'list €' + (c.list / c.n / 100).toFixed(0).padStart(4), 'typical €' + (c.ref / c.n / 100).toFixed(0).padStart(4), 'revenue €' + (c.rev / c.n / 100).toFixed(1).padStart(6), 'driver fee €' + (c.fee / c.n / 100).toFixed(1).padStart(6), 'other €' + (c.other / c.n / 100).toFixed(1).padStart(5), 'MARGIN €' + ((c.rev - c.fee + c.other) / c.n / 100).toFixed(1).padStart(6))
