// What predicts that a posted two-car gig finds a driver. Offline, on recorded weeks.
//   node runs/grind/pairfit.mjs VARIANT
import fs from 'node:fs'
const [variant = 'OP114'] = process.argv.slice(2)
const rows = fs.readFileSync('runs/grind/results.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.level === 8 && x.clean && x.variant === variant)
const map = JSON.parse(fs.readFileSync('runs/l7-next/data/map.json')); const road = new Map(map.roads.map(r => [r.from + '>' + r.to, r.minutes]))
const mins = (a, b) => a === b ? 0 : road.get(a + '>' + b) ?? 9999
const B = {}
const add = (group, key, booked, extra = {}) => { const x = (B[group] ??= {})[key] ??= { n: 0, booked: 0, lag: 0, rel: 0, views: 0 }; x.n++; if (booked) { x.booked++; x.lag += extra.lag; x.rel += extra.rel } x.views += extra.views ?? 0 }
const bucket = (v, edges) => { for (const e of edges) if (v <= e) return '<=' + e; return '>' + edges.at(-1) }
let weeks = 0
for (const r of rows) {
  const f = `runs/l7-next/data/${r.worldId}.json`, sp = `runs/grind/runs/l8/${variant}/${r.seed}/${r.worldId}/steps.jsonl`
  if (!fs.existsSync(f) || !fs.existsSync(sp)) continue
  weeks++
  const d = JSON.parse(fs.readFileSync(f)), ev = d.events
  const steps = fs.readFileSync(sp, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const won = new Map(ev.filter(e => e.kind === 'order_won').map(e => [e.order.id, e.order]))
  const req = new Map(d.reveal.requests.map(x => [x.request.id, x.request]))
  const booked = new Map(); for (const e of ev) if (e.kind === 'gig_booked' && !booked.has(e.gigId)) booked.set(e.gigId, e)
  const views = new Map(); for (const e of ev) if (e.kind === 'gig_viewed') views.set(e.gigId, (views.get(e.gigId) ?? 0) + 1)
  const homes = {}; for (const dr of d.drivers) homes[dr.homePlaceId] = (homes[dr.homePlaceId] ?? 0) + 1
  const near = (place, m) => Object.entries(homes).reduce((s, [h, n]) => s + (mins(h, place) <= m ? n : 0), 0)
  for (const s of steps) for (const [i, a] of (s.actions || []).entries()) {
    if (a.type !== 'post' || !s.results[i]?.ok) continue
    const os = [...new Set(a.stops.map(x => x.orderId))]; if (os.length < 2) continue
    const A = won.get(os[0]).legs[0], Bc = won.get(os[1]).legs[0]
    const P = A.pickup.placeId, X = A.delivery.placeId, Q = Bc.delivery.placeId
    const b = booked.get(s.results[i].id)
    const ref = (req.get(os[0])?.referenceFeeCents ?? 0) + (req.get(os[1])?.referenceFeeCents ?? 0)
    const extra = { lag: b ? b.at - s.now : 0, rel: b ? b.feeCents / ref : 0, views: views.get(s.results[i].id) ?? 0 }
    const back = mins(Q, P), total = mins(P, X) + mins(Bc.pickup.placeId, Q)
    const clock = s.now % 1440, day = Math.floor(s.now / 1440)
    const startIn = Math.max(A.pickup.window.from, Bc.pickup.window.from) - s.now
    add('return leg Q->P minutes', bucket(back, [0, 45, 90, 150, 240, 400]), b, extra)
    add('return / total road', bucket(back / total, [0.15, 0.3, 0.5, 0.75, 1]), b, extra)
    add('total road minutes', bucket(total, [120, 200, 280, 360, 449]), b, extra)
    add('drivers with home at P', bucket(homes[P] ?? 0, [10, 20, 30, 50, 80]), b, extra)
    add('drivers with home at Q', bucket(homes[Q] ?? 0, [10, 20, 30, 50, 80]), b, extra)
    add('drivers home within 60 of P', bucket(near(P, 60), [20, 40, 80, 120, 200]), b, extra)
    add('drivers home within 60 of Q', bucket(near(Q, 60), [20, 40, 80, 120, 200]), b, extra)
    add('opening fee / typical of both', bucket(a.schedule[0].feeCents / ref, [0.6, 0.7, 0.8, 0.9, 1.0]), b, extra)
    add('posted at clock', bucket(clock, [420, 600, 780, 960, 1140]), b, extra)
    add('weekday', String(day), b, extra)
    add('first window opens in (min)', bucket(startIn, [60, 240, 720, 1440, 2880]), b, extra)
    add('link wait: A open gig or both new', a.stops.length === 4 ? (s.actions.some((z, j) => j < i && z.type === 'withdraw') ? 'with an open gig' : 'both new') : 'other', b, extra)
  }
}
console.log(variant, weeks, 'weeks')
for (const [g, keys] of Object.entries(B)) { console.log('\n' + g)
  for (const [k, x] of Object.entries(keys).sort((p, q) => parseFloat(p[0].replace(/[<=>]/g, '')) - parseFloat(q[0].replace(/[<=>]/g, '')) || p[0].localeCompare(q[0])))
    console.log('  ' + k.padEnd(18), 'posted', String(x.n).padStart(5), 'booked', (100 * x.booked / x.n).toFixed(0).padStart(3) + '%', 'after', (x.lag / (x.booked || 1)).toFixed(0).padStart(3), 'min at', (x.rel / (x.booked || 1)).toFixed(2), 'x typical; views/gig', (x.views / x.n).toFixed(0)) }
