import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reportOptions, standing, totals, verifyWeeks } from './ranked-round.ts'
import { Client } from './reference/typescript/spread.ts'
import type { BoardSeason, BoardTeam, Score, WorldSummary } from './reference/typescript/types.ts'

const team: BoardTeam = { team: 'us', name: 'Us', played: 5, ranked: true, rank: 1, marginCents: 1234, onTimeShare: .9, runs: [] }

test('the legacy and explicitly selected reports use distinct paths', () => {
  assert.deepEqual(reportOptions(['3']), { season: 3, levels: [1,2], filename: 'ROUND-3.md' })
  assert.deepEqual(reportOptions(['3','--levels','4,3']), { season: 3, levels: [3,4], filename: 'ROUND-3-LEVELS-3-4.md' })
  assert.equal(reportOptions(['--levels','4','3']).filename, 'ROUND-3-LEVELS-4.md')
  assert.equal(reportOptions(['3','--levels','1,2']).filename, 'ROUND-3-LEVELS-1-2.md')
  assert.deepEqual(reportOptions(['4','--levels','6,5']), { season: 4, levels: [5,6], filename: 'ROUND-4-LEVELS-5-6.md' })
  for (const invalid of ['3,3','0','9','2,','../3']) assert.throws(() => reportOptions(['3','--levels',invalid]))
})

test('ties count only ranked competitors, including others sharing the same place', () => {
  const teams = [team, { ...team, team: 'rival' }, { ...team, team: 'house-strong', rank: null }, { ...team, team: 'partial', played: 4, rank: null }]
  assert.equal(standing(team, teams), 'Tied #1 of 2 ranked')
  assert.equal(standing(teams[3]!, teams), 'In progress (4/5)')
  assert.equal(standing({ ...team, ranked: false, rank: null }, teams), 'Unranked')
})

test('aggregate delivery rate weights the number of orders in each week', () => {
  const makeScore = (wonOrders: number, onTimeShare: number, marginCents: number): Score =>
    ({ wonOrders, onTimeShare, marginCents, revenueCents: 0, marginShare: 0, undeliveredShare: 0, ranked: onTimeShare >= .9 && wonOrders > 0 })
  const weeks = [makeScore(5, .8, -100), makeScore(15, 14/15, 1334), makeScore(0, 0, 0)].map((score, i) => ({ number: i+1, worldId: String(i), score }))
  assert.deepEqual(totals(weeks, team), { margin: 1234, won: 20, onTime: 18, undelivered: 0 })
  assert.throws(() => totals(weeks, { ...team, onTimeShare: .8667 }))
})

test('level 6 verification resolves the five world IDs independently of level 5, practice seeds and other rounds', async t => {
  const score: Score = { marginCents: 1200, revenueCents: 2000, marginShare: .6, wonOrders: 10, onTimeShare: 1, undeliveredShare: 0, ranked: true }
  const runs = Array.from({length: 5}, (_, i) => ({ run: i+1, marginCents: score.marginCents, wonOrders: 10, onTimeShare: 1, ranked: true, deletedAt: null }))
  const competitor = { ...team, runs }
  const round: BoardSeason = { season: 3, name: 'Round', startedAt: '', teams: [competitor] }
  const matching: WorldSummary[] = runs.map(r => ({ worldId: `w6-${r.run}`, kind: 'practice', level: 6, parent: null, season: 3, boardRun: r.run, ended: true }))
  const distractors = matching.flatMap(w => [
    { ...w, worldId: w.worldId+'-5', level: 5 },
    { ...w, worldId: w.worldId+'-old', season: 2 },
    { ...w, worldId: w.worldId+'-practice', season: null, boardRun: null },
  ])
  const api = new Client({ url: 'http://127.0.0.1', key: 'fixture' })
  t.mock.method(api, 'call', async (method: string, path: string) => {
    assert.equal(method, 'GET')
    assert.match(path, /^\/v1\/worlds\/w6-[1-5]\/score$/)
    return score
  })
  const weeks = await verifyWeeks(api, 6, round, competitor, [...distractors, ...matching])
  assert.deepEqual(weeks.map(w => w.worldId), matching.map(w => w.worldId))
  await assert.rejects(verifyWeeks(api, 6, round, competitor, [...distractors, ...matching.slice(1)]), /Expected one completed team world/)
})
