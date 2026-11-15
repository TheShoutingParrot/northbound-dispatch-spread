/** Builds a level 2 report only from finished, ordinary practice worlds checked against Bahn. */
import assert from 'node:assert/strict'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Client } from './reference/typescript/spread.ts'
import type { Score } from './reference/typescript/types.ts'

const root = import.meta.dirname
const seeds = process.argv.slice(2)
if (!seeds.length || new Set(seeds).size !== seeds.length) throw Error('Pass the distinct practice seeds for the final policy')
const reportDir = join(root, 'runs', 'benchmarks-level-2')
const read = async (path: string) => JSON.parse(await readFile(path,'utf8'))
type Trial = {seed: string; variant: string; config?: Record<string,number>; level: number; worldId: string; score: Score}
const trials: Trial[] = await Promise.all((await readdir(reportDir)).filter(f=>f.endsWith('.json')).map(f=>read(join(reportDir,f))))
const extra: Trial[] = await read(join(root, 'runs', 'level2', 'starter-results.json'))
const config = await read(join(root, 'level2-practice.json'))
const trainingSeeds = ['l2-lake', 'l2-rail', 'l2-birch']
const variants = new Map<string, Map<string,Score>>()
for (const t of trials.filter(t=>t.variant==='candidate' && t.config && trainingSeeds.includes(t.seed))) {
  const key = [t.config!.opening,t.config!.scheduleRise,t.config!.dropBump].join('/')
  const v = variants.get(key) ?? new Map<string,Score>(); v.set(t.seed,t.score); variants.set(key,v)
}
const comparisons = [...variants.entries()].filter(([,v])=>v.size===trainingSeeds.length).map(([key,v])=>{
  const [opening,rise,bump] = key.split('/').map(Number)
  const scores = [...v.values()]; return {opening,rise,bump,margin:scores.reduce((n,s)=>n+s.marginCents,0),worst:Math.min(...scores.map(s=>s.onTimeShare))}
}).sort((a,b)=>b.margin-a.margin)
const same = (a: Record<string,number>, b: Record<string,number>) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k=>a[k]===b[k])
const c = new Client({url:'https://spread.bahnexpress.com'})
const worlds = await c.worlds()
async function verify(trial: Trial) {
  const world=worlds.find(w=>w.worldId===trial.worldId)
  assert.ok(world && world.kind==='practice' && world.level===2 && world.boardRun===null && world.season===null && world.parent===null && world.ended)
  assert.deepEqual(await c.world(trial.worldId).score(), trial.score)
  return trial
}
const euros = (n:number) => new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(n/100)
const pct = (n:number) => (100*n).toFixed(2)+'%'
const rows=[]
for (const seed of seeds) {
  const active = trials.find(t=>t.seed===seed && t.variant==='candidate' && t.level===2 && same(t.config??{},config))
  assert.ok(active, `Selected dispatcher is missing a completed run on ${seed}`)
  const starter = [...trials,...extra].find(t=>t.seed===seed && t.variant==='starter' && t.level===2)
  assert.ok(starter, `Starter is missing from ${seed}`)
  const [a,b] = await Promise.all([verify(active),verify(starter)])
  const events = await c.world(a.worldId).events()
  const dropped = new Set<string>()
  let drops = 0, noShows = 0, rebookings = 0
  for (const event of events) {
    if (event.kind === 'gig_booked') {
      if (dropped.delete(event.gigId)) rebookings++
    }
    if (event.kind === 'gig_dropped' || event.kind === 'no_show') {
      if (event.kind === 'gig_dropped') drops++
      else noShows++
      dropped.add(event.gigId)
    }
  }
  rows.push({seed,a,b,drops,noShows,rebookings})
}
const scores=rows.map(r=>r.a.score)
const won=scores.reduce((s,x)=>s+x.wonOrders,0)
const ontime=scores.reduce((s,x)=>s+Math.round(x.onTimeShare*x.wonOrders),0)
const missing=scores.reduce((s,x)=>s+Math.round(x.undeliveredShare*x.wonOrders),0)
const margin=scores.reduce((s,x)=>s+x.marginCents,0)
const base=rows.reduce((s,x)=>s+x.b.score.marginCents,0)
const marketEvents = rows.reduce((t,r)=>({drops:t.drops+r.drops,noShows:t.noShows+r.noShows,rebookings:t.rebookings+r.rebookings}),{drops:0,noShows:0,rebookings:0})
const report=[`# Level 2 practice · Northbound Dispatch`, '',
  `Bahn’s simulator recorded **${euros(margin)} gross margin** and **${pct(ontime/won)} on time** (${ontime.toLocaleString('en-IE')} of ${won.toLocaleString('en-IE')} won orders). ${missing} orders remained undelivered. ${scores.filter(s=>s.ranked).length} of ${scores.length} weeks met the 90% delivery threshold.`, '',
  `The official starter earned ${euros(base)} on the same seeds. The difference in gross margin was ${euros(margin-base)}.`, '',
  '| Named seed | Dispatcher margin | On time | Orders won | Undelivered | Starter margin | Starter on time |', '|---|---:|---:|---:|---:|---:|---:|',
  ...rows.map(({a,b,seed})=>`| ${seed} | ${euros(a.score.marginCents)} | ${pct(a.score.onTimeShare)} | ${a.score.wonOrders} | ${Math.round(a.score.wonOrders*a.score.undeliveredShare)} | ${euros(b.score.marginCents)} | ${pct(b.score.onTimeShare)} |`), '',
  'We selected the fee settings on the lake, rail and birch weeks. Harbor and spruce were fresh validation seeds run after the selection.', '',
  '| Opening fee / typical fee | Scheduled increase / typical fee | Raise after a drop | Margin on three selection weeks | Lowest weekly on-time share |', '|---:|---:|---:|---:|---:|',
  ...comparisons.map(v=>`| ${pct(v.opening)} | ${pct(v.rise)} | ${pct(v.bump)} | ${euros(v.margin)} | ${pct(v.worst)} |`), '',
  'At level 2 drivers learn from fee increases and can drop bookings. The dispatcher checks which jobs fit pickup hours, posts a single car per gig, and schedules its fees in advance. It handles drops and no-shows on the existing gig. The selected settings are in [level2-practice.json](level2-practice.json).', '',
  `The event histories recorded ${marketEvents.drops} dropped bookings, ${marketEvents.noShows} no-shows and ${marketEvents.rebookings} subsequent rebookings of affected gigs.`, '',
  'Each score was read from its completed world. The team world list identified every run below as level 2 private practice, with no board-run number or ranking season. [Bahn API reference](https://spread.bahnexpress.com/kit/API.md)', '',
  '| Seed | Dispatcher world | Starter world |','|---|---|---|',...rows.map(({seed,a,b})=>`| ${seed} | \`${a.worldId}\` | \`${b.worldId}\` |`),''].join('\n')
await writeFile(join(root,'LEVEL2.md'),report)
console.log(report)
