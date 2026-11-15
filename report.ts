// node report.ts [--season 2] writes LEVEL1.md. --preview prints the completed weeks so far.
import assert from 'node:assert/strict'
import { readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import type { PracticeBoard, Score } from './reference/typescript/types.ts'

const root = import.meta.dirname
const runs = join(root, 'runs')
const boardURL = 'https://spread.bahnexpress.com/v1/leaderboards/practice?level=1'
const { values } = parseArgs({ options: { season: { type: 'string', default: '2' }, preview: { type: 'boolean' } } })
const seasonNo = Number(values.season)
assert.ok(Number.isSafeInteger(seasonNo) && seasonNo > 0, 'Expected a positive season number')
const target = 'northbound-dispatch'
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'))
const money = (cents: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const percent = (share: number) => (100 * share).toFixed(2) + '%'
const configId = (config: Record<string, number>) => JSON.stringify(Object.fromEntries(Object.entries(config).sort(([a], [b]) => a.localeCompare(b))))
const boardAt = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', dateStyle: 'long', timeStyle: 'medium' }).format(new Date())
const fmtInt = (n: number) => n.toLocaleString('en-IE')
const round = (n: number) => { assert.ok(Math.abs(Math.round(n) - n) < 0.00001, 'Share did not match an integer order count'); return Math.round(n) }

async function loadBoard() {
  const response = await fetch(boardURL, { signal: AbortSignal.timeout(15000), redirect: 'error' })
  if (!response.ok) throw Error(`Leaderboard HTTP ${response.status}`)
  const board: PracticeBoard = await response.json()
  assert.equal(board.level, 1)
  const season = [board.current, board.previous].find(item => item?.season === seasonNo)
  if (!season) throw Error(`Season ${seasonNo} is no longer on the public board`)
  const team = season.teams.find(item => item.team === target)
  if (!team) throw Error('Northbound Dispatch is absent from this leaderboard')
  return { season, team }
}
let { season, team } = await loadBoard()
if (!values.preview && team.played < 5) {
  await sleep(2300) // The public board can lag the recorded result by two seconds.
  ;({ season, team } = await loadBoard())
}
assert.ok(team.played > 0 && (team.played === 5 || values.preview), `The public board shows ${team.played}/5 weeks. Use --preview to inspect progress.`)
const starter = season.teams.find(t => t.team === 'house-starter')
const houseBest = season.teams.find(t => t.team === 'house-strong')
const policies = new Map<string, string>()
const rows: { week: number; startedAt: string; score: Score; policy: string }[] = []
for (let i = 1; i <= team.played; i++) {
  const boardRun = team.runs.find(r => r.run === i)
  assert.ok(boardRun)
  const receipt = await json(join(runs, `rank-${seasonNo}-${i}.json`))
  assert.ok(receipt.season === seasonNo && receipt.attempt === i && /^[\w-]+$/.test(receipt.worldId))
  const directory = join(runs, receipt.worldId)
  const [run, result] = await Promise.all([json(join(directory, 'run.json')), json(join(directory, 'result.json'))])
  assert.equal(result.worldId, receipt.worldId)
  assert.equal(run.worldId, receipt.worldId)
  assert.equal(run.mode, 'rank')
  const score: Score = result.score
  assert.equal(score.marginCents, boardRun.marginCents)
  assert.equal(score.wonOrders, boardRun.wonOrders)
  assert.equal(score.ranked, boardRun.ranked)
  assert.ok(Math.abs(score.onTimeShare - boardRun.onTimeShare) < 1e-9)
  const config = configId(run.config)
  if (!policies.has(config)) policies.set(config, 'Policy ' + (policies.size + 1))
  rows.push({ week: i, startedAt: run.startedAt, score, policy: policies.get(config)! })
}
const scores = rows.map(r => r.score)
const sum = (f: (score: Score) => number) => scores.reduce((total, score) => total + f(score), 0)
const won = sum(s => s.wonOrders)
const onTime = sum(s => round(s.onTimeShare * s.wonOrders))
const undelivered = sum(s => round(s.undeliveredShare * s.wonOrders))
const margin = sum(s => s.marginCents)
if (team.played === 5) {
  assert.equal(team.marginCents, margin)
  assert.ok(team.onTimeShare !== null && Math.abs(team.onTimeShare - onTime / won) < 1e-9)
}
const startTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(rows[0]!.startedAt))
const competitors = season.teams.filter(t => t.rank !== null).length
const asOf = boardAt()
const lines = [
  '# Northbound Dispatch · Level 1', '',
  `**${money(margin)} gross margin** across ${team.played} secret weeks of the ${season.name} ranking round. ${fmtInt(onTime)} of ${fmtInt(won)} orders arrived on time (${percent(onTime / won)}). ${undelivered} remained undelivered. ` +
  (team.rank !== null ? `The official board listed the team at **#${team.rank}** among ${competitors} ranked ${competitors === 1 ? 'team' : 'teams'}.` :
  (team.played === 5 ? 'The official board did not assign the team a rank.' : 'Rank is assigned after five qualifying weeks.')),
  '', `First ranked world started at ${startTime} Helsinki time. Leaderboard checked ${asOf} Helsinki time. [Official level 1 board](${boardURL})`, '',
  '| Secret week | Gross margin | Orders won | On time | Undelivered | Policy |',
  '|---:|---:|---:|---:|---:|---|',
  ...rows.map(({ week, score, policy }) => `| ${week} | ${money(score.marginCents)} | ${fmtInt(score.wonOrders)} | ${percent(score.onTimeShare)} | ${round(score.undeliveredShare * score.wonOrders)} | ${policy} |`),
  '', 'Each secret week must reach 90% on time. The combined share weights each week by orders won. These level 1 rounds are practice rankings. The competition final uses a separate level 8 world. [Judging and format](https://spread.bahnexpress.com/judging)', '',
]
if (starter) {
  const starterRuns = starter.runs.filter(r => r.run <= team.played)
  if (starterRuns.length === team.played) {
    const subtotal = starterRuns.reduce((a, b) => a + b.marginCents, 0)
    lines.push(`House starter earned **${money(subtotal)}** on the same ${team.played} secret weeks. Northbound Dispatch’s margin was ${money(Math.abs(margin - subtotal))} ${margin >= subtotal ? 'higher' : 'lower'}.`, '')
  }
}
if (team.played === 5 && houseBest?.marginCents != null) {
  lines.push(`House best earned **${money(houseBest.marginCents)}** and qualified on ${houseBest.runs.filter(r => r.ranked).length}/5 weeks.`, '')
}
lines.push('## How the dispatcher chose orders', '', 'At level 1 each accepted request earns the list price of its first option. The dispatcher can decline a request by leaving it unquoted. It checks the road time and the latest feasible pickup against both sites’ opening hours. For cars it wins, it posts a one-car gig and adjusts its fee while it remains open.', '')
for (const [id, name] of policies) {
  const c = JSON.parse(id)
  const conditions: string[] = []
  if (c.maxLegs === 1) conditions.push('single-car orders')
  if (c.maxRoadMinutes !== undefined) conditions.push(`drives up to ${c.maxRoadMinutes} minutes`)
  if (c.minSlack !== undefined) conditions.push(`at least ${c.minSlack} minutes from the quote deadline to the latest feasible pickup`)
  if (c.longRoadMinutes !== undefined && c.longRoadMinSlack !== undefined) conditions.push(`at least ${c.longRoadMinSlack} minutes for drives over ${c.longRoadMinutes} minutes`)
  if (c.minUsableSlack !== undefined) conditions.push(`at least ${c.minUsableSlack} minutes of usable pickup time`)
  if (c.skipPrivatePickup) conditions.push('dealer-site pickups')
  lines.push(`**${name}.** The filters included ${conditions.join(', ') || 'the default eligibility checks'}. ${c.opening !== undefined ? `The base opening fee was ${percent(c.opening)} of the typical fee before adjustments.` : ''}`.trim(), '')
}
type Benchmark = { level?: number; variant: string; seed: string; worldId: string; version: string; config: Record<string, number>; score: Score }
const benchmarks: Benchmark[] = await Promise.all((await readdir(join(runs, 'benchmarks'))).filter(f => f.endsWith('.json')).map(f => json(join(runs, 'benchmarks', f))))
const baselines = ['Kit starter', 'Initial dispatcher']
const table = new Map<string, Map<string, Score>>()
for (const trial of benchmarks) {
  if ((trial.level ?? 1) !== 1) continue
  const id = configId(trial.config)
  const label = trial.variant === 'starter' ? baselines[0] : id === '{}' ? baselines[1] : policies.get(id)
  if (!label) continue
  if (trial.variant === 'candidate') {
    const result = await json(join(runs, trial.worldId, 'result.json'))
    assert.equal(result.worldId, trial.worldId)
    assert.deepEqual(result.score, trial.score)
  }
  const entry = table.get(trial.seed) ?? new Map<string, Score>()
  const existing = entry.get(label)
  if (existing) assert.deepEqual(existing, trial.score, `Ambiguous versions for ${trial.seed}, ${label}`)
  entry.set(label, trial.score)
  table.set(trial.seed, entry)
}
const cols = [...baselines, ...policies.values()]
lines.push('## Practice evidence', '', 'Each cell gives weekly gross margin and on-time delivery share. Compare cells on the same seed. Initial trials use the north-trial seeds. Other named seeds are additional practice checks. An em dash means there is no saved result for that pairing.', '', `| Practice seed | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---:|').join('')}`)
for (const [seed, data] of [...table.entries()].sort(([a], [b]) => Number(b.startsWith('north-trial')) - Number(a.startsWith('north-trial')) || a.localeCompare(b))) {
  const cells = cols.map(c => { const s = data.get(c); return s ? `${money(s.marginCents)} · ${percent(s.onTimeShare)}` : '—' })
  lines.push(`| ${seed} | ${cells.join(' | ')} |`)
}
lines.push('', 'Practice results use the server’s final score for each completed world. Secret-week scores were cross-checked against the public board. Undelivered counts are computed from the final score stored for each world.', '')
const output = lines.join('\n')
if (values.preview) console.log(output)
else {
  const path = join(root, 'LEVEL1.md')
  const tmp = path + '.' + process.pid
  await writeFile(tmp, output)
  await rename(tmp, path)
  console.log(path)
}
