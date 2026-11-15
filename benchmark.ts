/** Paired trials on named, unranked practice seeds. Usage: node benchmark.ts --level 2 --seeds a,b,c */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, promisify } from 'node:util'
import { Client } from './reference/typescript/spread.ts'
import { parseLevel, configFilename } from './runner.ts'
import type { Score } from './reference/typescript/types.ts'

const execute = promisify(execFile)
const root = fileURLToPath(new URL('.', import.meta.url))
const url = 'https://spread.bahnexpress.com'
const { values } = parseArgs({options: {
  seeds: { type: 'string' }, config: { type: 'string' }, level: { type: 'string', default: '1' },
  label: { type: 'string', default: 'candidate' }, 'skip-starter': { type: 'boolean' },
  workers: { type: 'string', default: '2' }, 'only-starter': {type:'boolean'},
}})
const level = parseLevel(values.level)
if (values['skip-starter'] && values['only-starter']) throw new Error('Choose --skip-starter or --only-starter, not both')
const seeds = [...new Set((values.seeds ?? '').split(',').map(s => s.trim()).filter(Boolean))]
if (!seeds.length) throw new Error('Provide named practice weeks with --seeds seed-a,seed-b,seed-c')
const concurrency = Number(values.workers)
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('--workers must be 1, 2, 3 or 4')
const baseConfig = values['only-starter'] ? {} : JSON.parse(await readFile(join(root, configFilename(level)), 'utf8'))
const override = values.config === undefined ? undefined : JSON.parse(values.config)
if (override !== undefined && (!override || typeof override !== 'object' || Array.isArray(override))) throw new Error('--config expects a JSON object')
const config = level >= 2 ? { ...baseConfig, ...override } : override ?? baseConfig
const configText = JSON.stringify(config, Object.keys(config).sort())
const client = new Client({url})
// Keep the legacy level 1 report's flat directory free of other levels.
const cache = join(root, 'runs', level === 1 ? 'benchmarks' : `benchmarks-level-${level}`)
await mkdir(cache, {recursive:true})
const weekSlots = (await client.worlds()).filter(w => w.kind === 'practice' && !w.ended).length
if (weekSlots >= 8) throw new Error('All eight practice slots are occupied. Resume unfinished runs before starting a sweep.')
const starter = 'reference/typescript/starter.ts'
const runner = 'runner.ts'
async function fingerprint(files: string[]) {
  const hash = createHash('sha256')
  for (const file of files) hash.update(await readFile(join(root, file)))
  return hash.digest('hex')
}
const baseFiles = ['reference/typescript/spread.ts', 'reference/typescript/types.ts']
const levelFiles: Record<number, string[]> = {
  3: ['level4-fee.ts', 'level4-supply-weights.ts'],
  4: ['level4-fee.ts', 'level4-supply-weights.ts', 'level4-pricing.ts', 'level4-price-weights.ts', 'level4-trade-pricing.ts', 'level4-trade-price-weights.ts'],
  5: ['notes-risk.ts', 'market.ts'],
  6: ['notes-risk.ts', 'market.ts'],
  7: ['notes-risk.ts', 'market.ts', 'level7-policy.ts', 'level4-fee.ts', 'level4-supply-weights.ts'],
  8: ['notes-risk.ts', 'market.ts', 'level8-policy.ts', 'level7-policy.ts', 'level4-fee.ts', 'level4-supply-weights.ts'],
}
const versions = {
  starter: await fingerprint([...baseFiles, starter]),
  candidate: values['only-starter'] ? '' : await fingerprint([...baseFiles, runner, 'policy.ts', ...(levelFiles[level] ?? [])]),
}
const env = {...process.env, SPREAD_URL: url}
type Variant = 'starter' | 'candidate'
type Trial = { level: number, variant: Variant, seed: string, worldId: string, score: Score, version: string, config: object }
const results: Trial[] = []
const variants: Variant[] = values['only-starter'] ? ['starter'] : values['skip-starter'] ? ['candidate'] : ['starter','candidate']
const jobs = seeds.flatMap(seed => variants.map(variant => ({seed,variant})))
async function verifyUnrankedPractice(worldId: string) {
  const world = (await client.worlds()).find(w => w.worldId === worldId)
  if (!world || world.level !== level || world.kind !== 'practice' || !world.ended || world.boardRun !== null || world.season !== null || world.parent !== null) {
    throw new Error(`Cannot verify ${worldId} as a completed, independent, unranked level ${level} practice week`)
  }
}
async function play(seed: string, variant: Variant): Promise<Trial> {
  const params = variant === 'starter' ? {} : config
  const id = createHash('sha256').update(JSON.stringify([url, level, seed, variant, versions[variant], variant === 'starter' ? '{}' : configText])).digest('hex')
  const path = join(cache, id + '.json')
  let cached: Trial | undefined
  try { cached = JSON.parse(await readFile(path, 'utf8')) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
  if (cached) {
    if (cached.level !== level || cached.variant !== variant || cached.seed !== seed || cached.version !== versions[variant]) throw new Error('Invalid benchmark cache record')
    await verifyUnrankedPractice(cached.worldId)
    return cached
  }
  const args = variant === 'starter' ? [starter,'--level',String(level),'--seed',seed] : [runner,'practice','--level',String(level),'--seed',seed,'--config',configText]
  const { stdout } = await execute(process.execPath, args, {cwd:root, env, maxBuffer:4*1024*1024})
  let worldId: string, score: Score
  if (variant === 'starter') {
    const match = stdout.match(/^Practice world ([a-zA-Z0-9_-]+), level (\d+)\./m)
    if (!match || Number(match[2]) !== level) throw new Error(`The official starter did not identify a level ${level} practice world`)
    worldId = match[1]
    await verifyUnrankedPractice(worldId)
    score = await client.world(worldId).score()
  } else {
    const outcome = JSON.parse(stdout.trim().split('\n').at(-1) ?? '')
    worldId = outcome.worldId
    await verifyUnrankedPractice(worldId)
    score = outcome.score
  }
  if (!worldId || !score || !Number.isSafeInteger(score.marginCents) || !Number.isFinite(score.onTimeShare)) throw new Error('Missing world or score in completed trial')
  const trial = {level, variant, seed, worldId, score, version: versions[variant], config: params}
  const temp = path + '.' + process.pid
  await writeFile(temp, JSON.stringify(trial) + '\n', {mode:0o600}); await rename(temp,path)
  return trial
}
let failure: unknown
await Promise.all(Array.from({length:Math.min(concurrency, 8-weekSlots)}, async () => {
  while (!failure && jobs.length) {
    const {seed,variant} = jobs.shift()!
    try {
      const trial = await play(seed, variant)
      results.push(trial)
      const {onTimeShare, marginCents, wonOrders, ranked} = trial.score
      console.log(`level ${trial.level}\t${variant === 'candidate' ? values.label : variant}\t${seed}\t€${(marginCents/100).toFixed(2)}\t${(onTimeShare*100).toFixed(2)}%\t${wonOrders} orders\t${ranked?'qualified':'missed'}\t${trial.worldId}`)
    } catch (err) { failure = err }
  }
}))
if (failure) {
  // Child errors can contain serialized options. Surface only the program's own error output.
  const e = failure as Error & {stderr?:string}
  throw new Error((e.stderr || e.message).slice(-1800))
}
for (const variant of ['starter','candidate'] as const) {
  const trials = results.filter(t => t.variant === variant)
  if (!trials.length) continue
  const cents = trials.reduce((sum,t)=>sum+t.score.marginCents,0)
  const worstWeek = Math.min(...trials.map(t=>t.score.onTimeShare))
  console.log(`level ${level} ${variant === 'candidate' ? values.label : variant}: €${(cents/100).toFixed(2)} total, ${trials.filter(t=>t.score.ranked).length}/${trials.length} qualifying weeks, worst week ${(worstWeek*100).toFixed(2)}% on time`)
}
