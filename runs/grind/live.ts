// Live-clock runner: plays the final (or a test final) with a frozen build's policy.
//
//   hsec exec --only SPREAD_KEY -- node runs/grind/live.ts runs/grind/rank/l8-q1
//       waits until the organisers set a final, then plays it to the end.
//   hsec exec --only SPREAD_KEY -- node runs/grind/live.ts runs/grind/rank/l8-q1 --emulate --seed l8-rail [--tick-ms 150]
//       rehearsal: creates a practice world and moves its clock on a timer, the way the final's clock moves,
//       while the same live loop reads events and sends actions. No `advance` is used by the live loop itself.
//
// The final refuses `advance`. This loop polls the events, steps the policy when a wake event arrives or
// a timer is due (the same rule the practice runner uses), and sends actions with `act`, quotes first.
// If the process stops, start it again: it rebuilds its state from the snapshot and the event history.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { setTimeout as sleep } from 'node:timers/promises'
import { Client, SpreadError, Unreachable, type World } from '../../reference/typescript/spread.ts'
import type { Action, ActionResult, DeskEvent } from '../../reference/typescript/types.ts'

const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  emulate: { type: 'boolean' }, seed: { type: 'string' }, world: { type: 'string' }, 'tick-ms': { type: 'string', default: '150' }, 'poll-ms': { type: 'string' },
  // Rehearsal only: world minutes at which the loop is made to fail once, to exercise the rejoin path.
  'rejoin-at': { type: 'string' },
} })
const forced = (values['rejoin-at'] ?? '').split(',').filter(Boolean).map(Number)
if (forced.length && !values.emulate) throw Error('--rejoin-at is for rehearsals (--emulate) only')
if (positionals.length !== 1) throw Error('Usage: live.ts BUILD_DIR [--emulate --seed l8-NAME [--tick-ms 150]]')
const build = resolve(positionals[0]!)
const { Policy, wakeEventsFor } = await import(join(build, 'policy.ts'))
const endpoint = new URL(process.env.SPREAD_URL ?? 'https://spread.bahnexpress.com')
if (!(endpoint.origin === 'https://spread.bahnexpress.com' || ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))) throw Error('official URL or loopback only')
const client = new Client({ url: endpoint.origin })
const transient = (e: unknown) => e instanceof Unreachable || (e instanceof SpreadError && (e.status >= 500 || e.status === 0))
/** Reads never give up on a network or server fault: in a final the clock keeps running, so the only useful
 * thing to do is to try again. It says so once every 15 seconds of outage. */
/** A request that gets no answer: the kit waits 20 seconds for it, which is an hour of the final's day. Stop waiting
 * after `ms` and let the caller try again on a fresh request. The late answer, if one comes, is dropped. */
class Hung extends Error {}
let hangs = 0
/** Set when a send that had hit its deadline settles after all. The kit keeps such a send for up to 20 seconds; if
 * the server applied it after the rejoin read its snapshot, the rebuilt state predates it. The loop then rejoins
 * once more, so the state comes from a snapshot taken after the send. */
let lateSend = false
function deadline<T>(op: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((done, fail) => {
    const timer = setTimeout(() => { hangs++; fail(new Hung(`no answer in ${ms} ms`)) }, ms)
    op().then(value => { clearTimeout(timer); done(value) }, error => { clearTimeout(timer); fail(error) })
  })
}
const READ_MS = Number(process.env.LIVE_READ_MS ?? 2500), ACT_MS = Number(process.env.LIVE_ACT_MS ?? 5000)
// The larger reads of a rejoin (snapshot, roster, map) keep only the kit's own limit of 20 seconds.
const SLOW_MS = Number(process.env.LIVE_SLOW_MS ?? 20_000), PAGE = 2000
async function read<T>(op: () => Promise<T>, ms = READ_MS): Promise<T> {
  for (let i = 0, since = Date.now(), said = 0; ; i++) {
    try { return await deadline(op, ms) } catch (e) {
      if (!(e instanceof Hung) && !transient(e)) throw e
      if (e instanceof Hung) console.error(`${new Date().toISOString().slice(11, 19)} a read got no answer in ${ms} ms; trying again (${hangs} so far)`)
      if (Date.now() - since > 15_000 * (said + 1)) { said++; console.error(`server unreachable for ${Math.round((Date.now() - since) / 1000)} s; still retrying`) }
      if (!(e instanceof Hung)) await sleep(Math.min(2000, 100 * (i + 1)))
    }
  }
}
/** The whole event history, in pages. By Friday the history is 2 to 3 MB, which one read cannot always fetch in
 * 2.5 seconds; a page is small, and a retry repeats one page, not the week. */
async function wholeHistory(world: World): Promise<DeskEvent[]> {
  // The events this process has already read stay in memory: a rejoin then reads only what is newer, which is
  // a fraction of a second instead of the whole week.
  const history = histories.get(world.id) ?? []
  histories.set(world.id, history)
  for (let after = history.at(-1)?.seq ?? -1; ;) {
    const page = (await read(() => world.events(after, PAGE))).filter(event => event.seq > after)
    history.push(...page)
    if (page.length < PAGE) return history
    after = page.at(-1)!.seq
  }
}
const histories = new Map<string, DeskEvent[]>()
/** The map and the roster of a world do not change: read once, so a rejoin needs only the history and the snapshot. */
const fixed = new Map<string, Promise<[unknown, unknown]>>()
/** One policy object per world, kept across rejoins. A build whose restore() takes `keepLearned` then keeps what it
 * has learned about the market (win rates, the day's results, booking speed) instead of quoting from blank state.
 * An older build ignores the third argument and restores fully, as before. */
const policies = new Map<string, any>()
/** What restore() of a build without `restoreKeepsLearned` empties and cannot rebuild from the history. For such a
 * build the runner saves these fields before restore() and puts them back after it. */
const LEARNED = ['marketQuotes', 'marketResults', 'dayResults', 'localMarket', 'batchCounts', 'wins', 'winOrder',
  // Direct offers: what this process has sent (per driver and day, per gig, per order) and from when it may send.
  // restore() empties these and then waits for the next day, because a snapshot does not show offers; the same
  // process still knows them, so it goes on offering after a rejoin. A refused offer costs nothing.
  'offerCounts', 'offersByGig', 'endOfferAt', 'endOffered', 'offersFrom', 'recent']
const copyOf = (v: any) => v instanceof Map ? new Map(v) : v instanceof Set ? new Set(v) : Array.isArray(v) ? [...v]
  : v && Object.getPrototypeOf(v) === Object.prototype ? { ...v } : v
/** A policy object that joins a world already under way (a new process, or after a fault of the policy itself) has
 * no record of when each order was won and first booked; the policy's stress guard and long-haul throttle read it.
 * The snapshot lists every gig with its stops, so both are exact. A build whose restore() rebuilds this itself
 * (`restoreKeepsLearned`) is left alone. */
function rebuildWins(policy: any, snapshot: { gigs: { id: string; stops: { orderId: string }[] }[] }, history: DeskEvent[]) {
  if (policy.restoreKeepsLearned || !(policy.wins instanceof Map) || !Array.isArray(policy.winOrder)) return
  const ordersOf = new Map<string, string[]>()
  for (const gig of snapshot.gigs) ordersOf.set(gig.id, [...new Set(gig.stops.map(stop => stop.orderId))])
  const firstBooked = new Map<string, number>()
  for (const event of history) if (event.kind === 'gig_booked') for (const id of ordersOf.get(event.gigId) ?? []) if (!firstBooked.has(id)) firstBooked.set(id, event.at)
  policy.wins.clear(); policy.winOrder.length = 0
  for (const event of history) if (event.kind === 'order_won') {
    policy.wins.set(event.order.id, { wonAt: event.at, bookedAt: firstBooked.get(event.order.id) ?? null })
    policy.winOrder.push(event.order.id)
  }
  if ('bookable' in policy) policy.bookable = { at: -1, share: 1 }
}
const euro = (c: number) => (c / 100).toFixed(2)

/** The final that is set or running now. Waits while none is set or the last one has ended. */
async function nextFinal(): Promise<World> {
  // The last final stays the answer of GET /v1/final after it has ended, until the next one is set. Its snapshot
  // holds a whole week and is slow to read, so it is read once: after that only the small /v1/final answer is
  // polled. No read here retries in place: whatever fails, the loop looks for a new final again 10 seconds later.
  let ended: string | undefined
  for (let said = false; ; said = true) {
    const set = await deadline(() => client.final(), SLOW_MS).catch((e: unknown) => {
      if (e instanceof Hung || transient(e) || (e instanceof SpreadError && e.status === 404)) return null
      throw e
    })
    if (set && set.worldId !== ended) {
      const world = client.world(set.worldId)
      const s = await deadline(() => world.snapshot(), SLOW_MS).catch(() => null)
      if (s && s.now < s.endsAt) { console.log(`Final ${set.worldId} starts at ${set.startsAt}`); return world }
      if (s) ended = set.worldId
    }
    if (!said) console.log('No final is set. Waiting (test finals are set 15 minutes before their start, the final 30 minutes before).')
    await sleep(10_000)
  }
}

async function play(world: World, level: number, clock: () => Promise<number>, pollMs: number) {
  const dir = resolve('runs/live', world.id)
  mkdirSync(dir, { recursive: true })
  const log = (data: unknown) => appendFileSync(join(dir, 'steps.jsonl'), JSON.stringify(data) + '\n')
  const config = JSON.parse(readFileSync(join(build, `level${level}-practice.json`), 'utf8'))
  if (!fixed.has(world.id)) fixed.set(world.id, Promise.all([read(() => client.map(), SLOW_MS), read(() => world.roster(), SLOW_MS)]))
  const [map, drivers] = await fixed.get(world.id)!
  const history = await wholeHistory(world)
  const snapshot = await read(() => world.snapshot(), SLOW_MS)
  if (snapshot.now >= snapshot.endsAt) { console.log(JSON.stringify({ worldId: world.id, level, score: await read(() => world.score()), ended: true })); return }
  writeFileSync(join(dir, 'run.json'), JSON.stringify({ worldId: world.id, level, build, config, startedAt: new Date().toISOString(), joinedAtMinute: snapshot.now }, null, 2))
  const kept = policies.has(world.id)
  const policy = policies.get(world.id) ?? new Policy(map, drivers, config, level)
  policies.set(world.id, policy)
  const saved: [string, unknown][] = kept && !policy.restoreKeepsLearned ? LEARNED.filter(f => f in policy).map(f => [f, copyOf(policy[f])]) : []
  policy.restore(snapshot, history, kept)
  for (const [field, value] of saved) policy[field] = value
  // Rehearsal: the practice world was created by this process a moment ago, so no offer is pending, as at the start
  // of a final (where the runner joins at minute 0). Without this a rehearsal sends no offers on its first day.
  if (!kept && values.emulate && !values.world && 'offersFrom' in policy && !history.some(e => e.kind === 'offer_answered')) policy.offersFrom = 0
  // Exact from the server's record in every case, also for what happened while the runner was away.
  rebuildWins(policy, snapshot, history)
  // restore() may have cached a booking speed computed from the emptied state: make the policy compute it again.
  if (saved.length && 'bookable' in policy) policy.bookable = { at: -1, share: 1 }
  const wake = new Set<string>(wakeEventsFor(level, config))
  const endsAt = snapshot.endsAt
  let seq = history.at(-1)?.seq ?? -1, now = snapshot.now, due = now, buffer: DeskEvent[] = [], lateQuotes = 0, refused = 0, steps = 0
  const firstReview = level >= 3 ? Math.max(1, Math.min(30, policy.config.offerDelay)) : Math.min(30, policy.config.interval)
  const step = async () => {
    const produced: Action[] = policy.step(now, buffer); buffer = []; steps++
    // Quotes first: a price request allows 15 world minutes, 4.5 real seconds in the day.
    const actions = [...produced.filter(a => a.type === 'quote'), ...produced.filter(a => a.type !== 'quote')]
    if (actions.length) {
      // Not retried here: if a send fails midway the server may hold part of it. The caller rejoins from
      // the snapshot and the history instead, which shows exactly what was accepted.
      // One slice of 50 at a time, each under its own deadline: a slice that gets no answer stops the slices after it.
      const results: ActionResult[] = []
      for (let i = 0; i < actions.length; i += 50) {
        const sent = world.act(actions.slice(i, i + 50))
        try { results.push(...await deadline(() => sent, ACT_MS)) }
        catch (e) { if (e instanceof Hung) sent.then(() => { lateSend = true }, () => { lateSend = true }); throw e }
      }
      policy.record(actions, results)
      for (const [i, r] of results.entries()) if (!r.ok) { refused++; if (actions[i]!.type === 'quote') lateQuotes++ }
      log({ now, actions, results })
    }
    const postCheck = actions.some(a => a.type === 'post') ? now + firstReview : Infinity
    due = Math.max(now + 1, Math.ceil(Math.min(policy.nextWake(now), postCheck)))
  }
  await step()
  let day = Math.floor(now / 1440)
  while (now < endsAt) {
    const events = await read(() => world.events(seq))
    if (events.length) {
      seq = events.at(-1)!.seq; buffer.push(...events); now = Math.max(now, events.at(-1)!.at)
      // Keep the in-memory history complete, in order and without repeats.
      const kept = histories.get(world.id)
      if (kept) for (const event of events) if (event.seq > (kept.at(-1)?.seq ?? -1)) kept.push(event)
    }
    else now = Math.max(now, await clock())
    if (lateSend) { lateSend = false; throw new Hung('a send that had timed out has settled: rejoining to read the state after it') }
    // Rehearsal: fail once at the given minute, and act as if an abandoned send settled four seconds later.
    if (forced.length && now >= forced[0]!) { forced.shift(); setTimeout(() => { lateSend = true }, 4000); throw new Hung(`forced rejoin at minute ${now} (rehearsal)`) }
    if (buffer.some(e => wake.has(e.kind)) || now >= due) await step()
    if (Math.floor(now / 1440) > day) {
      day = Math.floor(now / 1440)
      const s = await read(() => world.score())
      console.log(`day ${day}: margin €${euro(s.marginCents)}, ${s.wonOrders} orders, ${(100 * s.onTimeShare).toFixed(1)}% on time, steps ${steps}, refused actions ${refused} (late quotes ${lateQuotes})`)
    }
    await sleep(pollMs)
  }
  const score = await read(() => world.score())
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ worldId: world.id, level, score, steps, refused, lateQuotes, hangs }, null, 2))
  console.log(JSON.stringify({ worldId: world.id, level, score, steps, refused, lateQuotes, hangs }))
}

/** Plays to the end of the world. Any failure rebuilds the policy from the snapshot and the event history and goes on. */
async function playToEnd(world: World, level: number, clock: () => Promise<number>, pollMs: number) {
  for (let failures = 0, last = 0; ;) {
    try { await play(world, level, clock, pollMs); return } catch (e) {
      // Interruptions more than a minute apart are separate incidents: only a quick series counts up.
      if (Date.now() - last > 60_000) failures = 0
      failures++; last = Date.now()
      const message = e instanceof Error ? e.message : String(e)
      console.error(`${new Date().toISOString().slice(11, 19)} live loop interrupted (${message.slice(0, 200)}); rejoining from the snapshot and history`)
      // Anything other than a network fault may have come from the policy itself: start it again from scratch.
      if (!transient(e) && !(e instanceof Hung)) policies.delete(world.id)
      if (!transient(e) && !(e instanceof Hung) && failures > 25) throw e
      // The reads in play() already wait while the server is away. A long pause here only lets open price requests expire.
      await sleep(Math.min(300, 100 * failures))
    }
  }
}

if (values.emulate) {
  if (!values.world && !/^l8-[a-z0-9-]+$/.test(values.seed ?? '')) throw Error('--emulate needs --seed l8-NAME (or --world ID to rejoin a rehearsal)')
  // All practice slots may be busy: wait for one instead of failing.
  let world: World | undefined
  if (values.world) {
    // Rejoin an unfinished rehearsal world: this exercises the restart path that the final would need.
    const summary = (await read(() => client.worlds())).find(w => w.worldId === values.world)
    if (!summary || summary.kind !== 'practice' || summary.boardRun !== null || summary.ended) throw Error('--world must be an unfinished practice world of this team')
    world = client.world(values.world)
  }
  for (let i = 0; !world; i++) {
    try { world = await client.create(8, { seed: values.seed }) }
    catch (e) { if (!(e instanceof SpreadError && e.status === 409) || i > 200) throw e; await sleep(5000) }
  }
  console.log(`Rehearsal on practice world ${world.id} (${values.seed ?? 'rejoined'})`)
  const first = await world.snapshot()
  const endsAt = first.endsAt
  const state = { now: first.now }
  const tick = Number(values['tick-ms'])
  // The clock driver is the only caller of `advance`: one world minute per tick by day, faster at night and on Sunday.
  const driver = client.world(world.id)
  const drive = (async () => {
    while (state.now < endsAt) {
      const minute = state.now % 1440, weekday = Math.floor(state.now / 1440) % 7
      const day = minute >= 360 && minute < 1320 && weekday !== 6 && state.now < 8 * 1440
      state.now = (await read(() => driver.advance({ by: day ? 1 : 10 }))).now
      await sleep(tick)
    }
  })()
  await Promise.all([drive, playToEnd(world, 8, async () => state.now, Number(values['poll-ms'] ?? Math.max(20, tick / 3)))])
} else {
  const world = await nextFinal()
  // The final is level 8. The list of all the team's worlds is long and is charged to the practice budget, which is
  // small while a final runs: one attempt, and level 8 if it does not answer.
  const level = await deadline(() => client.worlds(), 5000).then(list => list.find(w => w.worldId === world.id)?.level ?? 8, () => 8)
  await playToEnd(world, level, async () => (await read(() => client.final())).now, Number(values['poll-ms'] ?? 200))
}
