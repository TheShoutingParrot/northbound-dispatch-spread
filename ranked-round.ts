/** node ranked-round.ts <season> [--levels 5,6]. With no selector, report levels 1 and 2. */
import assert from 'node:assert/strict'
import { rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { Client, Unreachable } from './reference/typescript/spread.ts'
import { parseLevel, type Level } from './runner.ts'
import type { BoardSeason, BoardTeam, Score, WorldSummary } from './reference/typescript/types.ts'

const TEAM = 'northbound-dispatch'
const WEEKS = 5
export function reportOptions(args: string[]) {
  const { positionals, values } = parseArgs({ args, allowPositionals: true, options: { levels: { type: 'string' } } })
  const season = Number(positionals[0])
  assert.ok(positionals.length === 1 && Number.isSafeInteger(season) && season > 0, 'Provide one positive ranking round number')
  const fields = (values.levels ?? '1,2').split(',').map(s => s.trim())
  assert.equal(new Set(fields).size, fields.length, 'Choose distinct levels from 1 to 8, for example --levels 5,6')
  const levels = fields.map(s => parseLevel(s)).sort((a,b) => a-b)
  const filename = values.levels === undefined ? `ROUND-${season}.md` : `ROUND-${season}-LEVELS-${levels.join('-')}.md`
  return {season, levels, filename}
}
const euros = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })
const money = (cents: number) => euros.format(cents / 100)
const percent = (share: number) => (100 * share).toFixed(2) + '%'
type Week = { number: number; worldId: string; score: Score }

function orderCount(won: number, share: number) {
  assert.ok(Number.isSafeInteger(won) && won >= 0 && Number.isFinite(share) && share >= 0 && share <= 1)
  const n = Math.round(won * share)
  assert.ok(Math.abs(won * share - n) < 1e-7, 'Server share does not represent a whole number of orders')
  return n
}

export function totals(weeks: Week[], team: BoardTeam) {
  const margin = weeks.reduce((sum, week) => sum + week.score.marginCents, 0)
  const won = weeks.reduce((sum, week) => sum + week.score.wonOrders, 0)
  const onTime = weeks.reduce((sum, { score }) => sum + orderCount(score.wonOrders, score.onTimeShare), 0)
  const undelivered = weeks.reduce((sum, { score }) => sum + orderCount(score.wonOrders, score.undeliveredShare), 0)
  assert.equal(margin, team.marginCents, 'Official margin must equal the sum of weekly margins, in cents')
  if (won > 0) {
    assert.ok(team.onTimeShare !== null && Math.abs(onTime / won - team.onTimeShare) < 1e-9, 'Official on-time share must be weighted by orders won')
  }
  return { margin, won, onTime, undelivered }
}

export function standing(team: BoardTeam, teams: BoardTeam[]) {
  if (team.played < WEEKS) return `In progress (${team.played}/${WEEKS})`
  if (team.rank === null) return 'Unranked'
  const eligible = teams.filter(t => !t.team.startsWith('house-') && t.rank !== null)
  const tied = eligible.filter(t => t.rank === team.rank).length > 1
  return `${tied ? 'Tied ' : ''}#${team.rank} of ${eligible.length} ranked`
}

async function completedBoard(client: Client, level: Level, season: number) {
  for (let i = 0; ; i++) {
    try {
      const board = await client.board(level)
      assert.equal(board.level, level, 'Server returned a leaderboard for a different level')
      const round = [board.current, board.previous].find(r => r?.season === season)
      assert.ok(round, `The public level ${level} board no longer lists season ${season}`)
      const team = round.teams.find(t => t.team === TEAM)
      assert.ok(team, `The public board does not list ${TEAM}`)
      if (team.played === WEEKS && team.runs.length === WEEKS) return { level, round, team }
      if (i >= 2) throw Error(`Level ${level} still has ${team.played}/${WEEKS} completed weeks. Rerun when the selected levels have finished.`)
    } catch (e) {
      if (!(e instanceof Unreachable) || i >= 2) throw e
    }
    await sleep(2100) // The public board can trail a final world score by two seconds.
  }
}

export async function verifyWeeks(client: Client, level: number, round: BoardSeason, team: BoardTeam, worlds: WorldSummary[]): Promise<Week[]> {
  const entries = [...team.runs].sort((a, b) => a.run - b.run)
  assert.deepEqual(entries.map(e => e.run), [1, 2, 3, 4, 5], 'Missing or repeated ranking week')
  return Promise.all(entries.map(async entry => {
    assert.equal(entry.deletedAt, null, `Level ${level}, week ${entry.run} was deleted. Its board score counts but the original team world cannot be verified.`)
    const matched = worlds.filter(w => w.kind === 'practice' && w.parent === null && w.level === level && w.season === round.season && w.boardRun === entry.run && w.ended)
    assert.equal(matched.length, 1, `Expected one completed team world for level ${level}, week ${entry.run}`)
    const worldId = matched[0]!.worldId
    const score = await client.world(worldId).score()
    assert.equal(score.marginCents, entry.marginCents)
    assert.equal(score.wonOrders, entry.wonOrders)
    assert.equal(score.ranked, entry.ranked)
    assert.ok(Math.abs(score.onTimeShare - entry.onTimeShare) < 1e-9)
    return { number: entry.run, worldId, score }
  }))
}

function houseMargin(round: BoardSeason, teamId: string) {
  const team = round.teams.find(t => t.team === teamId)
  if (!team) return 'Unavailable'
  return team.marginCents === null ? `Pending (${team.played}/${WEEKS})` : money(team.marginCents)
}

async function main() {
  const { season, levels, filename } = reportOptions(process.argv.slice(2))
  const client = new Client({ url: 'https://spread.bahnexpress.com' })
  const boards = await Promise.all(levels.map(level => completedBoard(client, level, season)))
  const worlds = await client.worlds()
  const summaryRows: string[] = []
  const weeklyRows: string[] = []
  for (const { level, round, team } of boards) {
    const weeks = await verifyWeeks(client, level, round, team, worlds)
    const { margin, won, onTime, undelivered } = totals(weeks, team)
    summaryRows.push(`| ${level} | ${standing(team, round.teams)} | ${money(margin)} | ${won} | ${won ? percent(onTime / won) : 'No orders'} | ${undelivered} | ${houseMargin(round, 'house-strong')} | ${houseMargin(round, 'house-starter')} |`)
    for (const { number, worldId, score } of weeks) {
      weeklyRows.push(`| ${level} | ${number} | ${money(score.marginCents)} | ${score.wonOrders ? percent(score.onTimeShare) : 'No orders'} | \`${worldId}\` |`)
    }
  }
  const checked = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'medium', timeZone: 'Europe/Helsinki' }).format(new Date())
  const report = [
    `# Northbound Dispatch · ${boards[0]!.round.name}`, '',
    `Verified against the official leaderboards and completed team worlds on ${checked} Helsinki time.`, '',
    '| Level | Rank at verification | Margin | Orders won | On time | Undelivered | House best | House starter |',
    '|---|---|---:|---:|---:|---:|---:|---:|', ...summaryRows, '',
    'The standings count competitors whose five weeks each reached 90% on time. House teams serve as benchmarks. Other teams may still finish weeks in this round.', '',
    '| Level | Week | Margin | On time | World |', '|---:|---:|---:|---:|---|', ...weeklyRows, '',
    levels.map(level => `[Level ${level} leaderboard data](https://spread.bahnexpress.com/v1/leaderboards/practice?level=${level})`).join(' · '), '',
  ].join('\n')
  const target = resolve(import.meta.dirname, filename)
  const temporary = target + '.' + process.pid
  await writeFile(temporary, report)
  await rename(temporary, target)
  console.log(report)
}

if (import.meta.main) await main()
