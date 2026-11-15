// Slot-aware practice queue for any level. Practice worlds only: named seeds, never `rank`, never DELETE.
//
//   hsec exec --only SPREAD_KEY -- node runs/grind/tune.mjs run --level 8 --seeds l8-lake,l8-birch \
//       --variants '{"base":{},"ramp70":{"rampStart":0.7}}' [--build build-s1] [--parallel 2] [--reserve 1] [--wait 30]
//   node runs/grind/tune.mjs table --level 8 [--seeds a,b] [--build build-s1]
//
// A result is identified by level, build hash, settings and seed, so a repeated request is free.
// The queue starts a world only while fewer than 8 - reserve practice worlds are unfinished, so
// other operators on the team key keep a free slot. A run that reconnected is kept but not counted.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { setTimeout as wait } from 'node:timers/promises'

const ROOT = resolve(import.meta.dirname, '../..')
const HERE = resolve(import.meta.dirname)
const RESULTS = join(HERE, 'results.jsonl')
const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  level: { type: 'string' }, seeds: { type: 'string' }, variants: { type: 'string' }, build: { type: 'string', default: 'build-s1' },
  parallel: { type: 'string', default: '1' }, reserve: { type: 'string', default: '1' }, wait: { type: 'string', default: '30' },
  base: { type: 'string', default: 'base' }, alias: { type: 'string', default: '' },
} })
const mode = positionals[0]
assert.ok(['run', 'table'].includes(mode), 'Usage: tune.mjs run|table --level N ...')
const level = Number(values.level)
assert.ok(Number.isInteger(level) && level >= 1 && level <= 8, '--level 1..8')
const buildDir = resolve(HERE, values.build)
const canon = o => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))))
function buildHash(dir) {
  const h = createHash('sha256')
  for (const f of readdirSync(dir).filter(f => /\.(ts|json)$/.test(f)).sort()) h.update(f).update(readFileSync(join(dir, f)))
  return h.digest('hex').slice(0, 16)
}
const hash = buildHash(buildDir)
// Builds listed in --alias are proven (by the lockstep tests) to decide identically when the newer switches are off,
// so their results count for this build too.
const same = new Set([hash, ...values.alias.split(',').filter(Boolean).map(b => buildHash(resolve(HERE, b)))])
const load = () => existsSync(RESULTS) ? readFileSync(RESULTS, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
const euro = c => Math.round(c) / 100
const keyOf = (config, seed) => `${level}|${hash}|${canon(config)}|${seed}`
const rowKey = r => `${r.level}|${same.has(r.buildHash) ? hash : r.buildHash}|${canon(r.config)}|${r.seed}`

function table() {
  const rows = load().filter(r => r.level === level && r.clean && same.has(r.buildHash))
  const seeds = values.seeds ? values.seeds.split(',') : [...new Set(rows.map(r => r.seed))]
  const byConfig = new Map()
  for (const r of rows) { if (!seeds.includes(r.seed)) continue; const k = canon(r.config); (byConfig.get(k) ?? byConfig.set(k, { name: r.variant, rows: new Map() }).get(k)).rows.set(r.seed, r) }
  const base = byConfig.get('{}')
  const out = [...byConfig.entries()].map(([k, v]) => {
    const have = seeds.filter(s => v.rows.has(s))
    const paired = base ? have.filter(s => base.rows.has(s)) : []
    return { variant: v.name, config: k.length > 70 ? k.slice(0, 67) + '...' : k, n: have.length,
      mean: euro(have.reduce((a, s) => a + v.rows.get(s).marginCents, 0) / Math.max(1, have.length)),
      vsBase: paired.length ? euro(paired.reduce((a, s) => a + v.rows.get(s).marginCents - base.rows.get(s).marginCents, 0) / paired.length) : null,
      better: paired.filter(s => v.rows.get(s).marginCents > base.rows.get(s).marginCents).length + '/' + paired.length,
      orders: Math.round(have.reduce((a, s) => a + v.rows.get(s).wonOrders, 0) / Math.max(1, have.length)),
      minOnTime: have.length ? +(100 * Math.min(...have.map(s => v.rows.get(s).onTimeShare))).toFixed(1) : null,
      weeks: have.map(s => Math.round(v.rows.get(s).marginCents / 100)).join(' ') }
  }).sort((a, b) => (b.vsBase ?? -1e9) - (a.vsBase ?? -1e9))
  console.log(`Level ${level}, build ${values.build} (${hash}), seeds ${seeds.join(', ')}`)
  console.table(out)
}
if (mode === 'table') { table(); process.exit(0) }

const seeds = values.seeds.split(',')
for (const s of seeds) assert.match(s, /^l[1-8]-[a-z0-9-]+$/, 'named seeds like l8-lake only')
const variants = JSON.parse(values.variants)
const { Client, SpreadError, Unreachable } = await import(join(ROOT, 'reference/typescript/spread.ts'))
const endpoint = new URL(process.env.SPREAD_URL ?? 'https://spread.bahnexpress.com')
assert.ok(endpoint.origin === 'https://spread.bahnexpress.com' || ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))
const client = new Client({ url: endpoint.origin })
async function read(op) {
  for (let i = 0; ; i++) {
    try { return await op() } catch (e) {
      if (!(e instanceof Unreachable || (e instanceof SpreadError && e.status >= 500)) || i >= 12) throw e
      await wait(Math.min(15_000, 1_000 * (i + 1)))
    }
  }
}
const worldDirs = dir => existsSync(dir) ? new Set(readdirSync(dir).filter(d => /^w[0-9a-f]+$/.test(d))) : new Set()
const runsDir = (name, seed) => join(HERE, 'runs', `l${level}`, name.replace(/[^a-zA-Z0-9_.-]/g, '_'), seed)

function spawnRunner(args, dir) {
  return new Promise(done => {
    const child = spawn(process.execPath, [join(buildDir, 'runner.ts'), ...args, '--runs-dir', dir], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    child.stdout.on('data', d => { out += d }); child.stderr.on('data', d => { err += d })
    child.once('error', error => done({ error }))
    child.once('close', code => {
      if (code !== 0) return done({ error: Error(`runner exited with ${code}: ${err.trim().split('\n').at(-1)}`) })
      try { done(JSON.parse(out.trim().split('\n').at(-1))) } catch (error) { done({ error }) }
    })
  })
}

let admission = Promise.resolve()
async function admit(start) {
  // One admission at a time: check the team's slots, start, and wait until the new world is visible.
  let release; const turn = new Promise(r => { release = r }); const prev = admission; admission = turn
  await prev
  try {
    const deadline = Date.now() + Number(values.wait) * 60_000
    for (;;) {
      const open = (await read(() => client.worlds())).filter(w => !w.ended && w.kind === 'practice').length
      if (open < 8 - Number(values.reserve)) break
      if (Date.now() >= deadline) throw Error(`No free practice slot within ${values.wait} min (${open}/8 unfinished). Nothing was deleted.`)
      await wait(5_000)
    }
    const running = start()
    await Promise.race([running.created, wait(15_000)])
    return running.done
  } finally { release() }
}

function record(row) { appendFileSync(RESULTS, JSON.stringify(row) + '\n') }

async function finishRow(name, config, seed, result, dir, restoresFloor = 0) {
  const summary = (await read(() => client.worlds())).find(w => w.worldId === result.worldId)
  assert.ok(summary && summary.kind === 'practice' && summary.level === level && summary.ended &&
    summary.season === null && summary.boardRun === null && summary.parent === null, `unexpected world ${result.worldId}`)
  const score = await read(() => client.world(result.worldId).score())
  assert.deepEqual(score, result.score, 'server score differs from the runner receipt')
  const log = join(dir, result.worldId, 'steps.jsonl')
  const steps = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
  const restores = Math.max(restoresFloor, steps.filter(s => s.kind === 'restore' && s.now > 0).length)
  const row = { level, build: values.build, buildHash: hash, variant: name, config, seed, worldId: result.worldId, ...score,
    undelivered: Math.round(score.undeliveredShare * score.wonOrders), restores, clean: restores === 0, finishedAt: new Date().toISOString() }
  record(row)
  console.error(`  L${level} ${seed} ${name}: €${euro(score.marginCents)}, ${score.wonOrders} won, ${(100 * score.onTimeShare).toFixed(1)}% on time${restores ? ' (reconnected, not counted)' : ''}`)
  return row
}

// Finish worlds that an earlier invocation of this queue left unfinished (same level and build only).
{
  const rows = load()
  const finished = new Set(rows.filter(r => !r.unfinished).map(r => r.worldId))
  for (const r of rows.filter(r => r.unfinished && r.level === level && r.buildHash === hash && !finished.has(r.worldId))) {
    const s = (await read(() => client.worlds())).find(w => w.worldId === r.worldId)
    if (!s || s.kind !== 'practice' || s.boardRun !== null) continue
    const dir = runsDir(r.variant, r.seed)
    console.error(`Finishing ${r.worldId} (${r.variant} on ${r.seed}) left by an earlier run`)
    const result = s.ended ? { worldId: r.worldId, score: await read(() => client.world(r.worldId).score()) } : await spawnRunner(['resume', '--world', r.worldId], dir)
    if (result.error) { console.error(`  could not finish ${r.worldId}: ${result.error.message}`); continue }
    await finishRow(r.variant, r.config, r.seed, result, dir, 1)
  }
}

const done = new Set(load().filter(r => r.clean).map(rowKey))
const jobs = []
for (const seed of seeds) for (const [name, config] of Object.entries(variants)) if (!done.has(keyOf(config, seed))) jobs.push({ name, config, seed })
console.error(`${jobs.length} runs to do (${seeds.length * Object.keys(variants).length - jobs.length} already known)`)

async function runJob({ name, config, seed }) {
  const dir = runsDir(name, seed)
  let busy = 0 // another queue took the slot between our check and our create: wait and try again
  for (let attempt = 1; attempt <= 2; attempt++) {
    const before = worldDirs(dir)
    const args = ['practice', '--level', String(level), '--seed', seed]
    // The runner replaces the whole level 1 settings file with --config (it merges only from level 2 up),
    // so at level 1 send the tuned file with the variant's changes applied on top.
    const sent = level === 1 && Object.keys(config).length ? { ...JSON.parse(readFileSync(join(buildDir, 'level1-final.json'), 'utf8')), ...config } : config
    if (Object.keys(sent).length) args.push('--config', JSON.stringify(sent))
    const result = await admit(() => {
      const done = spawnRunner(args, dir)
      const created = (async () => { for (let i = 0; i < 60; i++) { if ([...worldDirs(dir)].some(d => !before.has(d))) return; await wait(250) } })()
      return { done, created }
    })
    if (result.error && /8 practice worlds/.test(result.error.message) && busy++ < 120) { await wait(4_000 + 3_000 * Math.random()); attempt--; continue }
    if (result.error) {
      const created = [...worldDirs(dir)].filter(d => !before.has(d))
      for (const worldId of created) record({ level, build: values.build, buildHash: hash, variant: name, config, seed, worldId, unfinished: true, clean: false })
      console.error(`  L${level} ${seed} ${name} stopped: ${result.error.message}${created.length ? ` (unfinished ${created.join(', ')} recorded)` : ''}`)
      return
    }
    if ((await finishRow(name, config, seed, result, dir)).clean) return
  }
}
const workers = Array.from({ length: Math.max(1, Number(values.parallel)) }, async () => { for (let job; (job = jobs.shift());) await runJob(job) })
await Promise.all(workers)
table()
