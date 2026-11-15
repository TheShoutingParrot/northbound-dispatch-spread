import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer } from "node:http"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { assertRankingOpen, createRanked, lock, OPENING, selectAttempt } from "./runner.ts"
import { Client, Unreachable } from "./reference/typescript/spread.ts"
import type { BoardSeason, WorldSummary } from "./reference/typescript/types.ts"

const friday: BoardSeason = { season: 2, name: "Friday 19:30", startedAt: new Date(OPENING).toISOString(), teams: [] }
const row = (attempt: number, ended = true): WorldSummary => ({
  worldId: "w-" + attempt, level: 1, kind: "practice", parent: null, season: 2, boardRun: attempt, ended,
})
test("ranking checks Helsinki winter time and the active round", () => {
  assert.throws(() => assertRankingOpen(Date.parse("2026-11-13T19:29:59+02:00"), friday), /19:30/)
  assert.throws(() => assertRankingOpen(OPENING, friday), /19:30/)
  assert.throws(() => assertRankingOpen(OPENING + 1, null), /round/)
  assert.throws(() => assertRankingOpen(OPENING + 1, { ...friday, name: "Warm-up" }), /round/)
  assert.doesNotThrow(() => assertRankingOpen(OPENING + 1, friday))
})
test("current season and the exact ordinal distinguish resumption from creation", () => {
  const old = { ...row(1), season: 1 }
  assert.equal(selectAttempt([old], 2, 1), undefined)
  assert.equal(selectAttempt([old, row(1)], 2, 1)?.worldId, "w-1")
  assert.equal(selectAttempt([row(1)], 2, 2), undefined)
  assert.throws(() => selectAttempt([row(1, false)], 2, 2))
  assert.throws(() => selectAttempt([row(1)], 2, 3))
  assert.throws(() => selectAttempt([], 2, 6))
})
test("an operating-system lock excludes a second writer and releases after closing", t => {
  const dir = mkdtempSync(join(tmpdir(), "spread-lock-"))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, "lock")
  const unlock = lock(path)
  assert.throws(() => lock(path), /Another runner/)
  unlock()
  lock(path)()
})
test("a lost ranking creation response recovers the same ordinal and reruns never create another world", async t => {
  t.mock.method(Date, "now", () => OPENING + 60000)
  const dir = mkdtempSync(join(tmpdir(), "spread-rank-"))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const worlds: WorldSummary[] = []
  let starts = 0
  const client = new Client({ url: "http://127.0.0.1", key: "fixture" })
  t.mock.method(client, "board", async () => ({ level: 1, current: friday, previous: null }))
  t.mock.method(client, "worlds", async () => worlds)
  t.mock.method(client, "create", async () => {
    starts++
    worlds.push(row(1, false))
    throw new Unreachable(0, "response lost")
  })
  assert.equal((await createRanked(client, dir, 1)).id, "w-1")
  worlds[0]!.ended = true
  assert.equal((await createRanked(client, dir, 1)).id, "w-1")
  assert.equal(starts, 1)
})
test("an ambiguous ranking creation without a world is never retried implicitly", async t => {
  t.mock.method(Date, "now", () => OPENING + 60000)
  const dir = mkdtempSync(join(tmpdir(), "spread-rank-"))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const client = new Client({ url: "http://127.0.0.1", key: "fixture" })
  t.mock.method(client, "board", async () => ({ level: 1, current: friday, previous: null }))
  t.mock.method(client, "worlds", async () => [])
  let starts = 0
  t.mock.method(client, "create", async () => { starts++; throw new Unreachable(0, "response lost") })
  await assert.rejects(createRanked(client, dir, 1), /response lost/)
  await assert.rejects(createRanked(client, dir, 1), /receipt/)
  assert.equal(starts, 1)
})

test("all seven levels isolate the same season and attempt, including recovery and legacy level 1 receipts", async t => {
  t.mock.method(Date, "now", () => OPENING + 60000)
  const dir = mkdtempSync(join(tmpdir(), "spread-two-levels-"))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const worlds: WorldSummary[] = [{ ...row(1), season: 3 }]
  const client = new Client({ url: "http://127.0.0.1", key: "fixture" })
  const boards: number[] = []
  t.mock.method(client, "board", async (level: number) => {
    boards.push(level)
    return { level, current: { ...friday, season: 3 }, previous: null }
  })
  t.mock.method(client, "worlds", async () => worlds)
  const starts: number[] = []
  t.mock.method(client, "create", async (level: number, options: unknown) => {
    assert.deepEqual(options, { board: true })
    starts.push(level)
    worlds.push({ ...row(1, false), worldId: `w-level${level}`, level, season: 3 })
    throw new Unreachable(0, "response lost")
  })
  for (const level of [2, 3, 4, 5, 6, 7, 8] as const) {
    boards.length = 0
    await assert.rejects(createRanked(client, dir, 1, 4, level), /round has changed/)
    assert.equal((await createRanked(client, dir, 1, 3, level)).id, `w-level${level}`)
    assert.ok(boards.length > 1 && boards.every(checked => checked === level))
  }
  for (const level of [8, 7, 6, 5, 4, 3, 2, 1] as const) {
    const id = level === 1 ? "w-1" : `w-level${level}`
    const path = level === 1 ? "rank-3-1.json" : `rank-l${level}-3-1.json`
    assert.equal((await createRanked(client, dir, 1, 3, level)).id, id)
    const receipt = JSON.parse(readFileSync(join(dir, path), "utf8"))
    assert.equal(receipt.level, level)
    assert.equal(receipt.worldId, id)
  }
  assert.deepEqual(starts, [2,3,4,5,6,7,8])
})

for (const level of [2, 3, 4, 5, 6, 7, 8]) test(`level ${level} plays a fresh practice week and resumes with the server level`, async t => {
  const dir = mkdtempSync(join(tmpdir(), `spread-level${level}-`))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const score = { marginCents: 101, revenueCents: 222, marginShare: 101 / 222, wonOrders: 1, onTimeShare: 1, undeliveredShare: 0, ranked: true }
  let now = 0
  let starts = 0
  let advances = 0
  let boardRun: number | null = null
  const server = createServer(async (req, res) => {
    let body = ""
    for await (const chunk of req) body += chunk
    let result: unknown
    let status = 200
    const path = req.url?.split("?")[0]
    if (path === "/v1/worlds" && req.method === "POST") {
      assert.deepEqual(JSON.parse(body), { level, seed: "fixture" })
      starts++
      result = { worldId: "w-fixture" }
      status = 201
    } else if (path === "/v1/worlds") {
      result = [{ worldId: "w-fixture", level, kind: "practice", season: boardRun ? 2 : null, boardRun, ended: now >= 2 }]
    } else if (path === "/v1/leaderboards/practice") {
      assert.equal(req.url, `/v1/leaderboards/practice?level=${level}`)
      result = { level, current: friday, previous: null }
    } else if (path === "/v1/map") result = { places: [], roads: [] }
    else if (path === "/v1/worlds/w-fixture") result = { worldId: "w-fixture", now, endsAt: 2, score, orders: [], openRequests: [], gigs: [], driverPositions: [] }
    else if (path === "/v1/worlds/w-fixture/drivers" || path === "/v1/worlds/w-fixture/events") result = []
    else if (path === "/v1/worlds/w-fixture/score") result = score
    else if (path === "/v1/worlds/w-fixture/advance") {
      const request = JSON.parse(body)
      assert.ok(request.untilEvent.includes("gig_dropped") && request.untilEvent.includes("no_show"))
      advances++
      now = request.max
      result = { now, events: [], results: [] }
    } else {
      status = 404
      result = { error: "unexpected fixture path" }
    }
    res.writeHead(status, { "content-type": "application/json" })
    res.end(JSON.stringify(result))
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() }))
  const address = server.address()
  assert.ok(address && typeof address === "object")
  // The timeout includes Node startup and TypeScript parsing under host load.
  // Allow the SDK's own 20-second request timeout to surface transport failures.
  const fixtureTimeoutMs = 30_000
  const run = (...args: string[]) => promisify(execFile)(process.execPath, ["runner.ts", ...args, "--runs-dir", dir], {
    cwd: import.meta.dirname, env: { SPREAD_KEY: "fixture", SPREAD_URL: `http://127.0.0.1:${address.port}` }, timeout: fixtureTimeoutMs,
  })
  const { stdout } = await run("practice", "--level", String(level), "--seed", "fixture")
  assert.equal(JSON.parse(stdout).level, level)
  const saved = JSON.parse(readFileSync(join(dir, "w-fixture", "run.json"), "utf8"))
  assert.equal(saved.level, level)
  assert.ok(saved.config.opening > 0)
  assert.equal(advances, 1)
  assert.equal(JSON.parse((await run("resume", "--world", "w-fixture")).stdout).score.marginCents, 101)
  await assert.rejects(run("resume", "--world", "w-fixture", "--level", "1"), /different level/)
  boardRun = 1
  assert.equal(JSON.parse((await run("resume", "--world", "w-fixture")).stdout).level, level)
  assert.equal(JSON.parse((await run("rank", "--level", String(level), "--season", "2", "--attempt", "1")).stdout).worldId, "w-fixture")
  assert.equal(starts, 1)
  assert.equal(advances, 1)
})
