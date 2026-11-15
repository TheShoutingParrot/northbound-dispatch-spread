// One-car gigs: how fast and how dear they book, by the driver supply near the START and near the END. Offline.
import fs from 'node:fs'
const [variant = 'OP114'] = process.argv.slice(2)
const rows = fs.readFileSync('runs/grind/results.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(x => x.level === 8 && x.clean && x.variant === variant)
const map = JSON.parse(fs.readFileSync('runs/l7-next/data/map.json')); const km = new Map(map.roads.map(r => [r.from + '>' + r.to, r.km])), mn = new Map(map.roads.map(r => [r.from + '>' + r.to, r.minutes]))
const bucket = (v, edges) => { for (const e of edges) if (v <= e) return '<=' + e; return '>' + edges.at(-1) }
const T = {}
const add = (g, k, x) => { const y = (T[g] ??= {})[k] ??= { n: 0, drove: 0, fee: 0, ref: 0, lag: 0, b60: 0, open: 0, late: 0, first: 0 }; y.n++; y.open += x.open; if (x.drove) { y.drove++; y.fee += x.fee; y.ref += x.ref; y.lag += x.lag; if (x.lag <= 60) y.b60++; if (x.first) y.first++ } }
const E = [8, 20, 40, 80, 160]
for (const r of rows) {
  const f = `runs/l7-next/data/${r.worldId}.json`, sp = `runs/grind/runs/l8/${variant}/${r.seed}/${r.worldId}/steps.jsonl`
  if (!fs.existsSync(f) || !fs.existsSync(sp)) continue
  const d = JSON.parse(fs.readFileSync(f)), ev = d.events
  const steps = fs.readFileSync(sp, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const won = new Map(ev.filter(e => e.kind === 'order_won').map(e => [e.order.id, e.order]))
  const req = new Map(d.reveal.requests.map(x => [x.request.id, x.request]))
  const homes = {}; for (const x of d.drivers) homes[x.homePlaceId] = (homes[x.homePlaceId] ?? 0) + 1
  const supply = {}; for (const p of map.places) supply[p.id] = Object.entries(homes).reduce((s, [h, n]) => s + n * Math.exp(-(h === p.id ? 0 : km.get(h + '>' + p.id) ?? 1e9) / 38), 0)
  const lastBook = new Map(); for (const e of ev) if (e.kind === 'gig_booked') lastBook.set(e.gigId, e)
  const started = new Set(ev.filter(e => e.kind === 'gig_started').map(e => e.gigId))
  // first post of each order only (a clean look at a new gig), single-leg, not private
  const seen = new Set()
  for (const s of steps) for (const [i, a] of (s.actions || []).entries()) if (a.type === 'post' && s.results[i]?.ok) {
    const os = [...new Set(a.stops.map(x => x.orderId))]; if (os.length !== 1) { for (const o of os) seen.add(o); continue }
    const o = won.get(os[0]); if (!o || o.legs.length !== 1 || seen.has(o.id)) continue; seen.add(o.id)
    const L = o.legs[0], ref = req.get(o.id)?.referenceFeeCents; if (!ref) continue
    const id = s.results[i].id, b = lastBook.get(id), drove = !!b && started.has(id)
    const x = { drove, fee: b?.feeCents ?? 0, ref, lag: b ? b.at - s.now : 0, open: a.schedule[0].feeCents / ref, first: drove && b.feeCents <= a.schedule[0].feeCents * 1.001 }
    const so = supply[L.pickup.placeId], sd = supply[L.delivery.placeId]
    add('by supply near the END', bucket(sd, E), x)
    add('by supply near the START', bucket(so, E), x)
    add('END supply (rows) within START supply > 80', so > 80 ? bucket(sd, E) : 'skip', x)
    add('END supply (rows) within START supply <= 40', so <= 40 ? bucket(sd, E) : 'skip', x)
    add('by road minutes', bucket(mn.get(L.pickup.placeId + '>' + L.delivery.placeId) ?? 0, [60, 120, 200, 320]), x)
  }
}
for (const [g, keys] of Object.entries(T)) { console.log('\n' + g + ' (first posting of each one-car order)')
  for (const [k, y] of Object.entries(keys).filter(([k]) => k !== 'skip').sort((p, q) => parseFloat(p[0].replace(/[<=>]/g, '')) - parseFloat(q[0].replace(/[<=>]/g, '')) || p[0].localeCompare(q[0])))
    console.log('  ' + k.padEnd(8), 'gigs', String(y.n).padStart(5), 'opened at', (y.open / y.n).toFixed(2), 'x typical; driven from this posting', (100 * y.drove / y.n).toFixed(0).padStart(3) + '%', 'at', (y.fee / y.ref).toFixed(2), 'x typical after', (y.lag / (y.drove || 1)).toFixed(0).padStart(4), 'min; within 60 min', (100 * y.b60 / y.n).toFixed(0).padStart(3) + '%', '; at the opening fee', (100 * y.first / y.n).toFixed(0).padStart(3) + '%') }
