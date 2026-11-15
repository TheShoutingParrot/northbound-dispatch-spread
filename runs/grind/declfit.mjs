// Requests by driver supply near the START and near the END: how many we decline, win, and how the won ones went. Offline.
import fs from 'node:fs'
const [variant = 'OP114'] = process.argv.slice(2)
const rows = fs.readFileSync('runs/grind/results.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.level === 8 && x.clean && x.variant === variant)
const map = JSON.parse(fs.readFileSync('runs/l7-next/data/map.json')); const km = new Map(map.roads.map(r => [r.from + '>' + r.to, r.km])), mn = new Map(map.roads.map(r => [r.from + '>' + r.to, r.minutes]))
const bucket = (v, edges) => { for (const e of edges) if (v <= e) return '<=' + e; return '>' + edges.at(-1) }
const S = [6, 20, 60, 160]
const T = {}; let weeks = 0
const cell = (g, k) => (T[g] ??= {})[k] ??= { n: 0, declined: 0, won: 0, late: 0, delivered: 0, fee: 0, ref: 0, price: 0, list: 0 }
for (const r of rows) {
  const f = `runs/l7-next/data/${r.worldId}.json`
  if (!fs.existsSync(f)) continue
  weeks++
  const d = JSON.parse(fs.readFileSync(f)), ev = d.events
  const homes = {}; for (const x of d.drivers) homes[x.homePlaceId] = (homes[x.homePlaceId] ?? 0) + 1
  const supply = {}; for (const p of map.places) supply[p.id] = Object.entries(homes).reduce((s, [h, n]) => s + n * Math.exp(-(h === p.id ? 0 : km.get(h + '>' + p.id) ?? 1e9) / 38), 0)
  const fees = new Map(), deliveredAt = new Map(), won = new Map()
  for (const e of ev) { if (e.kind === 'ledger' && e.line.kind === 'driver_fee') fees.set(e.line.orderId, (fees.get(e.line.orderId) ?? 0) - e.line.cents)
    if (e.kind === 'delivered') deliveredAt.set(e.orderId, e.at); if (e.kind === 'order_won') won.set(e.order.id, e.order) }
  for (const x of d.reveal.requests) {
    const q = x.request; if (q.legs.length !== 1) continue
    const L = q.legs[0], so = supply[L.pickup.placeId], sd = supply[L.delivery.placeId]
    const first = q.options[0], prices = Object.values(x.quote ?? {})
    const declined = !prices.length || Math.min(...prices) > 5 * first.listPriceCents
    const road = mn.get(L.pickup.placeId + '>' + L.delivery.placeId) ?? 0
    for (const [g, k] of [['START supply (rows) x END supply', `${bucket(so, S).padEnd(6)} | END ${bucket(sd, S)}`], ['END supply', bucket(sd, S)], ['START supply', bucket(so, S)],
      ['road minutes x END supply', `${bucket(road, [120, 320]).padEnd(6)} | END ${bucket(sd, [20, 160])}`], ['private pickup or delivery x END supply', `${L.pickup.privateAddress || L.delivery.privateAddress ? 'private' : 'dealer '} | END ${bucket(sd, [20, 160])}`]]) {
      const c = cell(g, k); c.n++; if (declined) c.declined++
      if (x.outcome === 'won') { c.won++; const o = won.get(q.id); const at = deliveredAt.get(q.id)
        if (o) { c.price += o.priceCents; c.list += first.listPriceCents }
        if (at !== undefined) { c.delivered++; if (o && at > o.deadline) c.late++; c.fee += fees.get(q.id) ?? 0; c.ref += q.referenceFeeCents } else c.late++ }
    }
  }
}
console.log(variant, weeks, 'weeks (one-car requests)')
for (const [g, keys] of Object.entries(T)) { console.log('\n' + g)
  for (const [k, c] of Object.entries(keys).sort((p, q) => p[0].localeCompare(q[0], undefined, { numeric: true })))
    console.log('  ' + k.padEnd(22), 'requests/wk', (c.n / weeks).toFixed(1).padStart(6), 'declined', (100 * c.declined / c.n).toFixed(0).padStart(3) + '%', 'won', (100 * c.won / (c.n - c.declined || 1)).toFixed(0).padStart(3) + '% of quoted =', (c.won / weeks).toFixed(1).padStart(5) + '/wk', 'late', (100 * c.late / (c.won || 1)).toFixed(1).padStart(4) + '%', 'fee', (c.fee / (c.ref || 1)).toFixed(2), 'x typical', 'price', (c.price / (c.list || 1)).toFixed(2), 'x list') }
