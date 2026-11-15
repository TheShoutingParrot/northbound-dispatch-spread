import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { setTimeout as sleep } from "node:timers/promises"
import { parseArgs } from "node:util"
import { Client, SpreadError, Unreachable, World } from "./reference/typescript/spread.ts"
import type { Action, BoardSeason, DeskEvent, Score, WorldSummary } from "./reference/typescript/spread.ts"
import type { Config } from "./policy.ts"

export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export function parseLevel(input = "1"): Level {
  if (!["1", "2", "3", "4", "5", "6", "7", "8"].includes(input)) throw Error("--level must be 1 through 8.")
  return Number(input) as Level
}

export function configFilename(level: Level): string {
  return level === 1 ? "level1-final.json" : `level${level}-practice.json`
}

export const OPENING = Date.parse("2026-11-13T19:30:00+02:00")
export function assertRankingOpen(now: number, season?: BoardSeason | null) {
  if (now <= OPENING) throw Error("Ranking opens after Friday 19:30 Helsinki time.")
  if (season !== undefined && (!season || /warm[\s_-]*up/i.test(season.name))) {
    throw Error("The first official ranking round has not opened yet.")
  }
}

export function selectAttempt(worlds: WorldSummary[], season: number, attempt: number, level: Level = 1) {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 5) throw Error("Choose an attempt from 1 to 5.")
  const rounds = worlds.filter(w => w.level === level && w.kind === "practice" && w.season === season && w.boardRun !== null)
  const existing = rounds.find(w => w.boardRun === attempt)
  if (existing) return existing
  if (rounds.some(w => !w.ended) || rounds.length !== attempt - 1 ||
    !Array.from({ length: attempt - 1 }, (_, i) => i + 1).every(i => rounds.some(w => w.boardRun === i))) {
    throw Error(`The completed level ${level} worlds do not match the requested attempt number.`)
  }
  return undefined
}

// SQLite's operating-system lock is automatically released if this process crashes.
export function lock(path: string) {
  const db = new DatabaseSync(path)
  try { db.exec("BEGIN EXCLUSIVE") }
  catch { db.close(); throw Error(`Another runner is using ${path}`) }
  return () => db.close()
}

function writeJson(path: string, value: unknown) {
  const tmp = path + "." + process.pid + ".tmp"
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 })
  renameSync(tmp, path)
}
function optionalJson(path: string) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined
}
function transient(error: unknown) {
  return error instanceof Unreachable || (error instanceof SpreadError && error.status >= 500) || error instanceof SyntaxError
}
async function read<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation() } catch (error) {
      if (!transient(error) || attempt >= 5) throw error
      await sleep(Math.min(5000, 250 * 2 ** attempt))
    }
  }
}

function checkWorldId(worldId: string) {
  if (!/^[\w-]{1,128}$/.test(worldId)) throw Error("Invalid world ID.")
  return worldId
}

export async function createRanked(client: Client, runs: string, attempt: number, expectedSeason?: number, level: Level = 1): Promise<World> {
  parseLevel(String(level))
  assertRankingOpen(Date.now())
  const season = (await read(() => client.board(level))).current
  assertRankingOpen(Date.now(), season)
  if (!season) throw Error("No active season.")
  if (expectedSeason !== undefined && expectedSeason !== season.season) throw Error("The requested ranking round has changed.")
  const prefix = level === 1 ? "rank" : `rank-l${level}`
  const key = join(runs, `${prefix}-${season.season}-${attempt}`)
  const release = lock(key + ".lock")
  try {
    const worlds = await read(() => client.worlds())
    const existing = selectAttempt(worlds, season.season, attempt, level)
    const previous = optionalJson(key + ".json")
    if (previous?.level !== undefined && previous.level !== level) throw Error("The saved receipt belongs to a different level.")
    if (existing) {
      if (previous?.worldId && previous.worldId !== existing.worldId) throw Error("The saved receipt and server resolve this attempt to different worlds.")
      writeJson(key + ".json", { worldId: existing.worldId, level, season: season.season, attempt })
      return client.world(checkWorldId(existing.worldId))
    }
    if (previous) throw Error("A creation receipt for this attempt already exists. Check the team worlds before another start.")
    const latest = (await read(() => client.board(level))).current
    assertRankingOpen(Date.now(), latest)
    if (latest?.season !== season.season) throw Error("The ranking round changed before creation.")
    writeJson(key + ".json", { level, season: season.season, attempt, pendingAt: new Date().toISOString() })
    let world: World
    try { world = await client.create(level, { board: true }) } catch (error) {
      // Creates have no idempotency key. Reconcile lost responses by ordinal, never resend the POST.
      const after = (await read(() => client.worlds())).find(w => w.kind === "practice" && w.level === level && w.season === season.season && w.boardRun === attempt)
      if (after) world = client.world(checkWorldId(after.worldId))
      else {
        // Explicit refusals cannot have created a world, so a later invocation may retry.
        if (error instanceof SpreadError && error.status >= 400 && error.status < 500) {
          unlinkSync(key + ".json")
        }
        throw error
      }
    }
    writeJson(key + ".json", { worldId: world.id, level, season: season.season, attempt })
    return world
  } finally { release() }
}

function resolveEndpoint() {
  const url = new URL(process.env.SPREAD_URL ?? "https://spread.bahnexpress.com")
  const local = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)
  if (!(url.origin === "https://spread.bahnexpress.com" || (local && ["http:", "https:"].includes(url.protocol))) ||
      url.pathname !== "/" || url.username || url.password || url.search || url.hash) throw Error("Use the official Spread URL or a loopback test server.")
  return url.origin
}

function checkConfig(raw?: string) {
  if (!raw) return undefined
  const config = JSON.parse(raw)
  if (!config || Array.isArray(config) || typeof config !== "object" ||
      !Object.values(config).every(v => typeof v === "number" && Number.isFinite(v))) throw Error("--config expects a JSON object of numeric settings.")
  return config as Partial<Config>
}

export async function play(world: World, directory: string, config: Partial<Config>, logEvents: boolean, resuming: boolean, level: Level = 1): Promise<Score> {
  const { Policy, wakeEventsFor } = await import("./policy.ts")
  const [map, drivers] = await Promise.all([read(() => world.client.map()), read(() => world.roster())])
  const log = (data: unknown) => appendFileSync(join(directory, "steps.jsonl"), JSON.stringify(data) + "\n", { mode: 0o600 })
  const wakeEvents = wakeEventsFor(level, config)
  let recovering = resuming
  let failures = 0
  while (true) {
    const snapshot = await read(() => world.snapshot())
    if (snapshot.now >= snapshot.endsAt) break
    const policy = new Policy(map, drivers, config, level)
    let seq = -1
    if (recovering || snapshot.now > 0 || snapshot.openRequests.length > 0) {
      const history = await read(() => world.events())
      policy.restore(snapshot, history)
      seq = history.at(-1)?.seq ?? -1
      log({ kind: "restore", now: snapshot.now, seq })
    }
    let now = snapshot.now
    let actions: Action[] = policy.step(now, [])
    try {
      while (now < snapshot.endsAt) {
        // New posts appear in policy state only when the reply supplies their gig IDs.
        // Check them on time even if the next dealer request comes the following day.
        const firstReview = level >= 3 ? Math.max(1, Math.min(30, policy.config.offerDelay)) : Math.min(30, policy.config.interval)
        const postCheck = actions.some(a => a.type === "post") ? now + firstReview : Infinity
        const max = Math.min(snapshot.endsAt, Math.max(now + 1, Math.ceil(Math.min(policy.nextWake(now), postCheck))))
        const next = await world.advance({ untilEvent: wakeEvents, max, actions })
        if (next.results.length !== actions.length) throw Error("Missing action results from advance.")
        const events: DeskEvent[] = next.events.filter(event => event.seq > seq)
        if (next.now < now || (next.now === now && !events.length && !actions.length)) throw Error("World clock made no progress.")
        policy.record(actions, next.results)
        seq = events.at(-1)?.seq ?? seq
        if (logEvents || actions.length) log({ now, to: next.now, actions, results: next.results, ...(logEvents ? { events } : {}) })
        const refusals = next.results.filter(result => !result.ok)
        if (refusals.length && refusals.length === actions.length && next.now === now && !events.length) {
          throw Error("All actions refused and the world clock did not advance: " + JSON.stringify(refusals))
        }
        now = next.now
        actions = now < snapshot.endsAt ? policy.step(now, events) : []
        failures = 0
      }
      break
    } catch (error) {
      if (!transient(error) || ++failures > 5) throw error
      // Advance or a preceding 50-action batch may already have committed.
      // Start from authoritative public history and current orders/gigs before acting again.
      recovering = true
      console.error(`Rejoining ${world.id} after a connection failure.`)
      await sleep(Math.min(5000, 250 * 2 ** failures))
    }
  }
  return read(() => world.score())
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    level: { type: "string" }, seed: { type: "string" }, attempt: { type: "string" }, season: { type: "string" },
    world: { type: "string" }, config: { type: "string" }, "log-events": { type: "boolean" },
    "runs-dir": { type: "string" },
  } })
  const mode = positionals[0]
  if (positionals.length !== 1 || !["practice", "rank", "resume"].includes(mode ?? "")) throw Error("Usage: node runner.ts practice [--level 1-8] --seed NAME | rank [--level 1-8] --attempt 1 [--season N] | resume --world ID")
  let level = parseLevel(values.level)
  if (mode === "rank") assertRankingOpen(Date.now())
  if (mode !== "practice" && values.seed || mode !== "rank" && (values.attempt || values.season) || mode !== "resume" && values.world) throw Error("A flag belongs to a different run mode.")
  const { Policy } = await import("./policy.ts")
  const override = checkConfig(values.config)
  const baseAt = (chosen: Level): Partial<Config> => JSON.parse(readFileSync(new URL(configFilename(chosen), import.meta.url), "utf8"))
  const effective = (chosen: Level, prior?: Partial<Config>) => {
    const base = baseAt(chosen)
    return chosen >= 2 ? { ...base, ...prior, ...override } : override ?? prior ?? base
  }
  if (mode !== "resume") new Policy({ roads: [], places: [] }, [], effective(level), level)
  const client = new Client({ url: resolveEndpoint() })
  const runs = resolve(values["runs-dir"] ?? "runs")
  mkdirSync(runs, { recursive: true, mode: 0o700 })
  let world: World
  if (mode === "rank") world = await createRanked(client, runs, Number(values.attempt), values.season === undefined ? undefined : Number(values.season), level)
  else if (mode === "resume") {
    if (!values.world) throw Error("Provide --world ID to resume.")
    const id = checkWorldId(values.world)
    const summary = (await read(() => client.worlds())).find(w => w.worldId === id)
    if (summary?.kind !== "practice") throw Error("Only the team's practice worlds can be resumed.")
    if (values.level !== undefined && summary.level !== level) throw Error("The selected world has a different level from --level.")
    level = parseLevel(String(summary.level))
    if (summary.boardRun !== null || summary.season !== null) {
      assertRankingOpen(Date.now())
      const board = await read(() => client.board(level))
      const season = [board.current, board.previous].find(s => s && s.season === summary.season)
      if (!season) throw Error("Cannot verify the round of this ranking world.")
      assertRankingOpen(Date.now(), season)
    }
    world = client.world(id)
  } else {
    if (!values.seed?.trim()) throw Error("Provide a named --seed for practice.")
    world = await client.create(level, { seed: values.seed })
  }

  const directory = join(runs, checkWorldId(world.id))
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  console.error(`Level ${level} ${mode} world ${world.id}, logs at ${directory}`)
  const release = lock(join(directory, "world.lock"))
  try {
    const path = join(directory, "run.json")
    const prior = optionalJson(path)
    const config = effective(level, prior?.config)
    new Policy({ roads: [], places: [] }, [], config, level)
    writeJson(path, { ...prior, worldId: world.id, level, mode: prior?.mode ?? mode, seed: prior?.seed ?? values.seed, config, startedAt: prior?.startedAt ?? new Date().toISOString() })
    const score = await play(world, directory, config, Boolean(values["log-events"]), mode !== "practice" || !!prior, level)
    const result = { worldId: world.id, level, score }
    writeJson(join(directory, "result.json"), result)
    console.log(JSON.stringify(result))
  } finally { release() }
}

if (import.meta.main) main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
