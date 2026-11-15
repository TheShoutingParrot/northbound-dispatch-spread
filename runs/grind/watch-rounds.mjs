// Keeps watching: whenever a new ranking round opens, plays all eight levels once with the frozen builds named in
// runs/grind/round-builds.json (read again for every round), two levels at a time, then goes on watching.
//   hsec exec --only SPREAD_KEY -- node runs/grind/watch-rounds.mjs 7      (7 = the round already played)
// It only starts play-round.mjs (which has its own guards) and never touches practice worlds.
// To stop it and the level being played: pkill -f watch-rounds.mjs; pkill -f play-round.mjs; pkill -f 'runner.ts rank'
// (stopping only the watcher leaves the levels in progress running to their end; play-round.mjs continues an
// interrupted level when it is started again for the same round).
import { spawn } from 'node:child_process'
import { appendFileSync, openSync, readFileSync } from 'node:fs'
import { setTimeout as wait } from 'node:timers/promises'
let played = Number(process.argv[2])
if (!Number.isSafeInteger(played) || played < 1) throw Error('Usage: watch-rounds.mjs PLAYED_ROUND')
const log = m => { const line = new Date().toISOString() + ' ' + m; console.log(line); appendFileSync('runs/grind/watch-round.log', line + '\n') }
async function season() {
  try { const r = await fetch('https://spread.bahnexpress.com/v1/leaderboards/practice?level=8', { signal: AbortSignal.timeout(15000) }); const j = await r.json(); return j.current ? { season: j.current.season, name: j.current.name } : null } catch { return null }
}
let builds = JSON.parse(readFileSync('runs/grind/round-builds.json', 'utf8'))
// No level is started around Sunday's final (set 07:30, played 08:00-08:34 Helsinki time): it waits until 08:45.
// A level already under way is left to finish (a level takes five to ten minutes).
const HOLD = [Date.parse('2026-11-15T07:15:00+02:00'), Date.parse('2026-11-15T08:45:00+02:00')]
async function holdForFinal(what) {
  for (let said = false; Date.now() >= HOLD[0] && Date.now() < HOLD[1]; said = true) {
    if (!said) log(`holding ${what} until 08:45: the final is on`)
    await wait(30_000)
  }
}
for (;;) {
  log(`watching for a round after ${played}`)
  let next
  for (;;) { const s = await season(); if (s && s.season > played && !/warm[\s_-]*up/i.test(s.name)) { next = s; break } await wait(60_000) }
  // A build list that cannot be read at this moment must not stop the night: keep the last good one.
  try { builds = JSON.parse(readFileSync('runs/grind/round-builds.json', 'utf8')) } catch (e) { log(`round-builds.json could not be read (${String(e.message).slice(0, 80)}): using the last good list`) }
  log(`round ${next.season} "${next.name}" is open: playing all levels with ${JSON.stringify(builds)}`)
  const play = level => new Promise(done => {
    try {
      const out = openSync(`runs/grind/play-l${level}-s${next.season}.log`, 'a')
      const child = spawn(process.execPath, ['runs/grind/play-round.mjs', String(level), `runs/grind/rank/${builds[level]}`, String(next.season)], { stdio: ['ignore', out, out] })
      child.once('error', e => { log(`level ${level} could not start: ${String(e.message).slice(0, 80)}`); done(1) })
      child.once('close', code => { log(`level ${level} finished with exit ${code}`); done(code ?? 1) })
    } catch (e) { log(`level ${level} could not start: ${String(e.message).slice(0, 80)}`); done(1) }
  })
  // A level that fails is put back at the end of the queue, up to five times, while this round is still the current one.
  const queue = [8, 7, 2, 3, 6, 5, 4, 1], tries = {}
  await Promise.all([0, 1].map(async () => {
    for (let l; (l = queue.shift()) !== undefined;) {
      await holdForFinal(`level ${l} of round ${next.season}`)
      if (await play(l) === 0) continue
      tries[l] = (tries[l] ?? 0) + 1
      const now = await season()
      if (tries[l] < 5 && now && now.season === next.season) { log(`level ${l} failed (try ${tries[l]}): trying again after the other levels`); await wait(20_000); queue.push(l) }
      else log(`level ${l} given up for round ${next.season} after ${tries[l]} tries`)
    }
  }))
  log(`round ${next.season}: all levels attempted`)
  played = next.season
}
