/** node network-practice-report.ts [--seeds lake,birch,rail,harbor,spruce]
 *  Override ambiguous source cohorts with --l3-version/--l4-version and --starter-version (full benchmark SHA-256).
 *  Local cache reads and official HTTP GETs only. Writes one report after verifying all matched trials.
 */
import assert from 'node:assert/strict'
import { readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { Client } from './reference/typescript/spread.ts'
import type { Score, WorldSummary } from './reference/typescript/types.ts'

const root = import.meta.dirname
type Level = 3 | 4 | 5 | 6
type Variant = 'candidate' | 'starter'
type Config = Record<string, number>
type Trial = { level: Level; seed: string; variant: Variant; config: Config; version: string; worldId: string; score: Score }
type Pair = { seed: string; candidate: Trial; starter: Trial }
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'))
const stable = (config: Config) => JSON.stringify(Object.fromEntries(Object.entries(config).sort(([a], [b]) => a.localeCompare(b))))
const money = (cents: number) => new Intl.NumberFormat('en-IE', {style:'currency', currency:'EUR'}).format(cents/100)
const pct = (v: number) => (v*100).toFixed(2)+'%'
const defaultSeeds = ['lake','birch','rail','harbor','spruce']
const settingNames: Record<string,string> = {
  longRoadMinSlack:'long-haul pickup buffer (min)', minUsableSlack:'usable pickup time (min)',
  opening:'opening fee factor', maxRoadMinutes:'maximum drive (min)', maxLegs:'maximum cars',
  quoteAdapt:'price adaptation', quoteFactor:'list-price multiplier', quoteFloor:'quote floor',
  scheduleRise:'fee increase', scheduleDelay:'fee delay (min)', dropBump:'increase after drop',
}

function tuningPairs(trials: Trial[], level: Level, version: string) {
  // Compare settings on the exact same source build as the official matched candidate cohort.
  const byConfig = new Map<string,Map<string,Trial>>()
  const seeds = ['lake','birch'].map(s=>`l${level}-${s}`)
  for (const t of trials.filter(t=>t.variant==='candidate' && t.version===version && seeds.includes(t.seed))) {
    const key = stable(t.config)
    const group = byConfig.get(key) ?? new Map<string,Trial>()
    assert.ok(!group.has(t.seed), `Duplicate tuning receipt for ${t.seed} and ${key}`)
    group.set(t.seed,t); byConfig.set(key,group)
  }
  return [...byConfig.values()].filter(g=>seeds.every(s=>g.has(s))).map(g=>seeds.map(s=>g.get(s)!))
}

function settingsLabel(config: Config, canonical: Config) {
  const changes = [...new Set([...Object.keys(canonical),...Object.keys(config)])].sort()
    .filter(k=>config[k]!==canonical[k]).map(k=>`${settingNames[k]??k} ${config[k]??'default'}`)
  return changes.join(', ') || 'Selected settings'
}

function select(trials: Trial[], seeds: string[], variant: Variant, config: Config, version?: string) {
  const cohorts = new Map<string, Map<string, Trial>>()
  for (const t of trials) {
    if (t.variant !== variant || !seeds.includes(t.seed) || stable(t.config) !== stable(config) || (version && t.version !== version)) continue
    assert.match(t.version, /^[0-9a-f]{64}$/)
    const cohort = cohorts.get(t.version) ?? new Map<string, Trial>()
    assert.ok(!cohort.has(t.seed), `Duplicate ${variant} receipt for ${t.seed} at ${t.version}`)
    cohort.set(t.seed, t)
    cohorts.set(t.version, cohort)
  }
  const complete = [...cohorts.values()].filter(cohort => seeds.every(seed => cohort.has(seed)))
  if (complete.length !== 1) {
    const info = [...cohorts].map(([hash, c]) => `${hash}: ${c.size}/${seeds.length}`).join(', ') || 'no matching receipts'
    throw Error(`Expected one complete, consistent ${variant} version on ${seeds.join(', ')}; found ${complete.length} (${info}). Use a full version hash when multiple cohorts match.`)
  }
  return complete[0]!
}

function count(share: number, won: number) {
  assert.ok(Number.isSafeInteger(won) && won >= 0 && Number.isFinite(share) && share >= 0 && share <= 1)
  const n = Math.round(share * won)
  assert.ok(Math.abs(n - share * won) < 1e-7, 'Reported share is inconsistent with an integer order count')
  return n
}

async function verify(client: Client, worlds: WorldSummary[], trial: Trial) {
  const found = worlds.filter(w => w.worldId === trial.worldId)
  assert.equal(found.length, 1, `Unknown team world ${trial.worldId}`)
  const w = found[0]!
  assert.ok(w.kind === 'practice' && w.ended && w.level === trial.level && w.boardRun === null && w.season === null && w.parent === null,
    `Expected a completed, independent, unranked level ${trial.level} practice world: ${w.worldId}`)
  const official = await client.world(w.worldId).score()
  assert.deepEqual(official, trial.score, `Score mismatch for ${trial.variant}: ${w.worldId}`)
  assert.equal(official.ranked, official.wonOrders > 0 && count(official.onTimeShare, official.wonOrders)*10 >= official.wonOrders*9)
  if (trial.variant === 'candidate') {
    const [run, result] = await Promise.all(['run.json', 'result.json'].map(f => json(join(root, 'runs', w.worldId, f))))
    assert.ok(run.mode === 'practice' && run.level === trial.level && run.seed === trial.seed && run.worldId === w.worldId)
    assert.equal(stable(run.config), stable(trial.config))
    assert.equal(result.worldId, w.worldId)
    assert.deepEqual(result.score, official)
  }
}

function summarize(trials: Trial[]) {
  const scores = trials.map(t => t.score)
  const won = scores.reduce((n,s) => n + s.wonOrders, 0)
  const onTime = scores.reduce((n,s) => n + count(s.onTimeShare,s.wonOrders),0)
  return { won, onTime, share: won ? pct(onTime/won) : 'No orders',
    undelivered: scores.reduce((n,s) => n+count(s.undeliveredShare,s.wonOrders),0),
    margin: scores.reduce((n,s) => n+s.marginCents,0), qualified: scores.filter(s=>s.ranked).length,
    minimum: scores.some(s=>s.wonOrders===0) ? 'No orders in one or more weeks' : pct(Math.min(...scores.map(s=>s.onTimeShare))) }
}

async function main() {
  const { values } = parseArgs({ options: {
    seeds: { type: 'string', default: defaultSeeds.join(',') },
    levels: { type: 'string', default: '3,4' }, 'l5-version': { type: 'string' }, 'l6-version': { type: 'string' },
    'l3-version': { type: 'string' }, 'l4-version': { type: 'string' }, 'starter-version': { type: 'string' },
  } })
  const suffixes = values.seeds!.split(',').map(s => s.trim())
  assert.ok(suffixes.length && suffixes.every(s => /^[a-z0-9][a-z0-9-]*$/.test(s)) && new Set(suffixes).size === suffixes.length, 'Supply distinct seed suffixes')
  const showSelection = defaultSeeds.length === suffixes.length && defaultSeeds.every(s=>suffixes.includes(s))
  const blocks: { level: Level; pairs: Pair[]; tuning: Trial[][] }[] = []
  assert.ok(['3,4','5,6'].includes(values.levels!), 'Choose the 3,4 or 5,6 practice report')
  const levels: Level[] = values.levels === '5,6' ? [5,6] : [3,4]
  for (const level of levels) {
    const cache = join(root,'runs',`benchmarks-level-${level}`)
    const seeds = suffixes.map(s => `l${level}-${s}`)
    const [config, names] = await Promise.all([json(join(root,`level${level}-practice.json`)), readdir(cache)])
    const trials: Trial[] = await Promise.all(names.filter(f=>f.endsWith('.json')).map(f=>json(join(cache,f))))
    assert.ok(trials.every(t=>t.level===level), `Unexpected level in ${cache}`)
    const candidate = select(trials,seeds,'candidate',config,values[`l${level}-version`])
    const starter = select(trials,seeds,'starter',{},values['starter-version'])
    blocks.push({level,pairs:seeds.map(seed=>({seed,candidate:candidate.get(seed)!,starter:starter.get(seed)!})),
      tuning: showSelection ? tuningPairs(trials,level,candidate.get(seeds[0]!)!.version) : []})
  }
  const all = blocks.flatMap(b=>b.pairs.flatMap(p=>[p.candidate,p.starter]))
  assert.equal(new Set(all.map(t=>t.worldId)).size,all.length,'One world is credited to multiple benchmark entries')
  // A different candidate implementation per level is legitimate. The official control is the same on both.
  assert.equal(new Set(all.filter(t=>t.variant==='starter').map(t=>t.version)).size,1,'Mismatched starter source versions between levels')
  const client = new Client({url:'https://spread.bahnexpress.com'})
  const worlds = await client.worlds()
  const unique = new Map(all.map(t=>[t.worldId,t]))
  for (const b of blocks) for (const t of b.tuning.flat()) {
    if (unique.has(t.worldId)) assert.deepEqual(unique.get(t.worldId),t,'World reused between trials')
    else unique.set(t.worldId,t)
  }
  const evidence = [...unique.values()]
  for (let i=0;i<evidence.length;i+=4) await Promise.all(evidence.slice(i,i+4).map(t=>verify(client,worlds,t)))
  const lines = [
    `# Northbound Dispatch · levels ${levels.join(' and ')}`, '',
    `The dispatcher and the official starter each played ${suffixes.length} named, unranked practice weeks per level. Each pair used the same seed, including its level prefix. Qualification requires winning at least one order and delivering at least 90% on time in that week. Practice results do not earn a leaderboard place. [Bahn rules](https://spread.bahnexpress.com/kit/RULES.md)`, '',
    '| Level | System | Total margin | Orders won | On time | Undelivered | Lowest weekly on-time share | Qualified weeks |',
    '|---:|---|---:|---:|---:|---:|---:|---:|',
  ]
  for (const b of blocks) for (const v of ['candidate','starter'] as const) {
    const s = summarize(b.pairs.map(p=>p[v]))
    lines.push(`| ${b.level} | ${v==='candidate'?'Dispatcher':'Official starter'} | ${money(s.margin)} | ${s.won} | ${s.share} | ${s.undelivered} | ${s.minimum} | ${s.qualified}/${b.pairs.length} |`)
  }
  if (showSelection) {
    lines.push('', '## Settings comparison', '',
      'We compared settings on Lake and Birch. After selection, we checked the chosen settings on Rail, Harbor and Spruce.', '',
      'Each row uses two complete candidate runs from the same source build as that level’s selected policy. Alternative rows list only changes from the selected settings.', '',
      '| Level | Dispatcher settings | Two-week margin | Lowest on-time share |', '|---:|---|---:|---:|')
    for (const b of blocks) {
      const config=b.pairs[0]!.candidate.config
      const rows=b.tuning.map(group=>({label:settingsLabel(group[0]!.config,config),summary:summarize(group)}))
      rows.sort((a,b)=>Number(b.label==='Selected settings')-Number(a.label==='Selected settings') || a.label.localeCompare(b.label))
      for (const r of rows) lines.push(`| ${b.level} | ${r.label} | ${money(r.summary.margin)} | ${r.summary.minimum} |`)
    }
  }
  for (const {level,pairs} of blocks) {
    const a = summarize(pairs.map(p=>p.candidate)), b = summarize(pairs.map(p=>p.starter))
    const diff=a.margin-b.margin
    lines.push('',`## Level ${level}`,'',`The dispatcher earned ${money(Math.abs(diff))} ${diff<0?'less':'more'} gross margin than the starter on these weeks.`, '',
      '| Seed | Dispatcher margin | On time | Won | Undelivered | Starter margin | On time | Won | Undelivered |',
      '|---|---:|---:|---:|---:|---:|---:|---:|---:|')
    for (const p of pairs) {
      const cells = [p.candidate,p.starter].flatMap(({score:s})=>[money(s.marginCents),s.wonOrders?pct(s.onTimeShare):'No orders',s.wonOrders,count(s.undeliveredShare,s.wonOrders)])
      lines.push(`| ${p.seed} | ${cells.join(' | ')} |`)
    }
    lines.push('',`Dispatcher settings: [level${level}-practice.json](level${level}-practice.json). Benchmark source fingerprint: \`${pairs[0]!.candidate.version}\`.`)
  }
  lines.push('', '## Verification', '',
    'Totals sum weekly margins in game euros and weight on-time shares by orders won. Each result was checked against its final score and team world listing. The API identifies the level, completion and unranked status; seed labels come from the local benchmark receipts. The paired outcomes reflect the full policies together. [Bahn API](https://spread.bahnexpress.com/kit/API.md)', '',
    `Official starter fingerprint: \`${blocks[0]!.pairs[0]!.starter.version}\`.`, '',
    '| Named seed | Dispatcher world | Official starter world |', '|---|---|---|')
  for (const {pairs} of blocks) for (const p of pairs) lines.push(`| ${p.seed} | \`${p.candidate.worldId}\` | \`${p.starter.worldId}\` |`)
  const path = join(root,`LEVELS-${levels.join('-')}.md`), temporary = path+'.'+process.pid
  await writeFile(temporary,lines.join('\n')+'\n'); await rename(temporary,path)
  console.log(path)
}
if (import.meta.main) await main()
