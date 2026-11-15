// Play one level's five ranked weeks of the current round with a frozen build, one week at a time.
//   hsec exec --only SPREAD_KEY -- node runs/grind/play-round.mjs LEVEL runs/grind/rank/NAME SEASON
// Guards: the build's hashes are checked before every week; the round must still be SEASON; a ranked world of
// this level and round that has no local receipt here is someone else's, and the script stops instead of touching it.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import { Client } from '../../reference/typescript/spread.ts'
const [levelText, dir, seasonText] = process.argv.slice(2)
const level = Number(levelText), season = Number(seasonText)
assert.ok(level >= 1 && level <= 8 && Number.isSafeInteger(season) && season > 0 && dir)
const base = resolve(dir), runs = resolve('runs')
const manifest = JSON.parse(readFileSync(join(base, 'rank-build.json'), 'utf8'))
assert.equal(manifest.level, level, 'the frozen build is for another level')
const verifySource = () => { for (const [f, h] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(readFileSync(join(base, f))).digest('hex'), h, 'Frozen source changed: ' + f) }
const c = new Client({ url: 'https://spread.bahnexpress.com' })
async function retry(op) { for (let i = 0; ; i++) { try { return await op() } catch (e) { if (i >= 12 || (e.status != null && ![0, 408, 429, 500, 502, 503, 504].includes(e.status))) throw e; await wait(Math.min(15000, 750 * (i + 1))) } } }
const board = () => retry(async () => { const r = await fetch('https://spread.bahnexpress.com/v1/leaderboards/practice?level=' + level, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw Object.assign(Error('board ' + r.status), { status: r.status }); return (await r.json()).current })
const receiptPath = k => join(runs, (level === 1 ? 'rank' : 'rank-l' + level) + '-' + season + '-' + k + '.json')
const us = b => b.teams.find(t => t.team === 'northbound-dispatch')
verifySource()
for (let attempt = 1; attempt <= 5; attempt++) {
  for (;;) {
    verifySource()
    const b = await board()
    assert.equal(b?.season, season, 'The round changed; stop and reconcile')
    const worlds = await retry(() => c.worlds())
    const existing = worlds.find(w => w.kind === 'practice' && w.level === level && w.season === season && w.boardRun === attempt)
    const receipt = existsSync(receiptPath(attempt)) ? JSON.parse(readFileSync(receiptPath(attempt), 'utf8')) : null
    if (existing && !receipt?.worldId && !receipt?.pendingAt) throw Error(`Week ${attempt} of level ${level} round ${season} (${existing.worldId}) was started elsewhere. Not touching it.`)
    if (existing && receipt?.worldId) assert.equal(receipt.worldId, existing.worldId, 'receipt and server disagree')
    if (existing?.ended) {
      const entry = us(b)?.runs.find(r => r.run === attempt)
      if (!entry) { await wait(2200); continue }
      const score = await retry(() => c.world(existing.worldId).score())
      for (const p of ['marginCents', 'onTimeShare', 'wonOrders', 'ranked']) assert.equal(entry[p], score[p])
      console.log('Verified', JSON.stringify({ level, season, attempt, worldId: existing.worldId, margin: score.marginCents / 100, won: score.wonOrders, onTime: score.onTimeShare, ranked: score.ranked }))
      break
    }
    if (receipt && !existing && !receipt.pendingAt) throw Error('Receipt without an official world; reconcile by hand')
    if (!existing && worlds.filter(w => !w.ended && w.kind === 'practice').length >= 8) { await wait(3000); continue }
    const child = spawn(process.execPath, [join(base, 'runner.ts'), 'rank', '--level', String(level), '--season', String(season), '--attempt', String(attempt), '--runs-dir', runs], { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    child.stdout.on('data', d => process.stdout.write(d)); child.stderr.on('data', d => { err += d; process.stderr.write(d) })
    const code = await new Promise((res, rej) => { child.once('error', rej); child.once('close', res) })
    if (code !== 0 && !/8 practice worlds|another runner is using|connection|502|503|504|429|fetch failed|Unreachable|Cannot reach/i.test(err)) throw Error('Ranked runner failed; reconcile before continuing: ' + err.trim().split('\n').at(-1))
    await wait(code === 0 ? 2200 : 5000)
  }
}
const b = await board(), t = us(b), house = b.teams.find(x => x.team === 'house-strong')
const out = join(resolve('runs/grind'), `official-${level}-${season}.json`)
writeFileSync(out + '.tmp', JSON.stringify({ level, season, build: manifest.name, overrides: manifest.overrides, checkedAt: new Date().toISOString(), team: t, house }, null, 2)); renameSync(out + '.tmp', out)
console.log('Round done', JSON.stringify({ level, season, rank: t.rank, margin: t.marginCents / 100, onTime: t.onTimeShare, house: house?.marginCents / 100 }))
