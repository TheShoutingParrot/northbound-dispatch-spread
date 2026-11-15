import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import type { Action, Advance, DeskEvent, DriverProfile, Gig, Order, PriceRequest, Score } from "./reference/typescript/types.ts"

const worldId = "fictional-level-one"
const start = 9 * 60
const deadline = 20 * 60
const endsAt = 9 * 1440 + 22 * 60
const requestCount = 53
const towns = ["helsinki", "espoo"]
const map = {
  places: [
    { id: towns[0], name: "Helsinki", lat: 60.17, lon: 24.94 },
    { id: towns[1], name: "Espoo", lat: 60.21, lon: 24.66 },
  ],
  roads: towns.flatMap(from => towns.map(to => ({ from, to, km: from === to ? 10 : 31, minutes: from === to ? 18 : 32 }))),
}
const drivers: DriverProfile[] = Array.from({ length: 500 }, (_, i) => ({
  id: `test-driver-${i}`, homePlaceId: towns[i % 2]!, rating: 4.95, completedGigs: 120, licence: "manual", drops: 0,
}))
const hours = { opens: 8 * 60, closes: 18 * 60, weekdays: [0, 1, 2, 3, 4], saturday: null }
const stop = (placeId: string) => ({ placeId, privateAddress: false, window: { from: start, to: deadline }, hours })
const requests: PriceRequest[] = Array.from({ length: requestCount }, (_, i) => ({
  id: `R${String(i).padStart(5, "0")}`, dealerId: "Fictional dealer", batchId: null,
  arrivedAt: start, respondBy: start + 15, referenceFeeCents: 3500, note: null,
  options: [{ kind: "same_day", listPriceCents: 16500, deadline }],
  legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: stop(towns[i % 2]!), delivery: stop(towns[(i + 1) % 2]!) }],
}))

// This deterministic fixture tests the policy-to-HTTP path. It does not model the official driver market.
test("practice CLI handles a burst in batches and recovers a lost reply after posting the cars", { timeout: 20000 }, async t => {
  let created = false
  let now = 0
  let callCount = 0
  let lostReply = false
  let historyReadsAfterLoss = 0
  let lastSeq = -1
  const history: DeskEvent[] = []
  const quotes = new Set<string>()
  const orders = new Map<string, Order>()
  const gigs = new Map<string, Gig>()
  const raised = new Set<string>()
  const batches: number[] = []
  const score = (): Score => {
    const delivered = [...orders.values()].filter(order => order.deliveredAt[0] !== null)
    const revenueCents = delivered.reduce((sum, order) => sum + order.priceCents, 0)
    const fees = [...gigs.values()].filter(gig => gig.status === "done").reduce((sum, gig) => sum + gig.feeCents, 0)
    const onTimeShare = orders.size ? delivered.length / orders.size : 0
    return { wonOrders: orders.size, onTimeShare, ranked: onTimeShare >= 0.9,
      undeliveredShare: orders.size ? 1 - onTimeShare : 0, revenueCents, marginCents: revenueCents - fees,
      marginShare: revenueCents ? (revenueCents - fees) / revenueCents : 0 }
  }
  type NewEvent = DeskEvent extends infer E ? E extends DeskEvent ? Omit<E, "at" | "seq"> : never : never
  const emit = (event: NewEvent) => history.push(structuredClone({ ...event, seq: history.length, at: now }) as DeskEvent)
  const milestones = new Map<number, () => void>([
    [start, () => requests.forEach(request => emit({ kind: "price_request", request }))],
    [start + 15, () => {
      for (const request of requests.filter(r => quotes.has(r.id))) {
        const order: Order = { id: request.id, dealerId: request.dealerId, legs: request.legs, option: "same_day",
          priceCents: request.options[0]!.listPriceCents, deadline, lastPickupAt: deadline - 180, deliveredAt: [null], status: "waiting" }
        orders.set(order.id, order)
        emit({ kind: "order_won", order })
      }
    }],
    [start + 16, () => {
      for (const gig of gigs.values()) {
        if (Number(gig.id.slice(1)) % 2 === 1) continue
        gig.status = "booked"
        gig.driverId = drivers[Number(gig.id.slice(1))]!.id
        orders.get(gig.stops[0]!.orderId)!.status = "booked"
        emit({ kind: "gig_booked", gigId: gig.id, driverId: gig.driverId, feeCents: gig.feeCents })
      }
    }],
    [start + 90, () => {
      for (const id of raised) {
        const gig = gigs.get(id)!
        assert.equal(gig.status, "open")
        gig.status = "booked"
        gig.driverId = drivers[Number(id.slice(1))]!.id
        orders.get(gig.stops[0]!.orderId)!.status = "booked"
        emit({ kind: "gig_booked", gigId: id, driverId: gig.driverId, feeCents: gig.feeCents })
      }
    }],
    [start + 105, () => {
      for (const gig of gigs.values()) {
        assert.equal(gig.status, "booked")
        const order = orders.get(gig.stops[0]!.orderId)!
        gig.status = "working"
        order.status = "moving"
        emit({ kind: "gig_started", gigId: gig.id, driverId: gig.driverId! })
        emit({ kind: "picked_up", gigId: gig.id, orderId: order.id, leg: 0, placeId: order.legs[0]!.pickup.placeId })
      }
    }],
    [start + 137, () => {
      for (const gig of gigs.values()) {
        assert.equal(gig.status, "working")
        const order = orders.get(gig.stops[0]!.orderId)!
        gig.status = "done"
        order.status = "delivered"
        order.deliveredAt[0] = now
        emit({ kind: "delivered", gigId: gig.id, orderId: order.id, leg: 0, placeId: order.legs[0]!.delivery.placeId })
      }
    }],
  ])
  const apply = (actions: Action[]) => {
    assert.ok(actions.length <= 50, `illegal batch of ${actions.length}`)
    if (actions.length) batches.push(actions.length)
    return actions.map(action => {
      if (action.type === "quote") {
        assert.ok(now >= start && now < start + 15, "quote after dealer decision")
        assert.ok(requests.some(request => request.id === action.requestId))
        assert.ok(!quotes.has(action.requestId), "duplicate quote")
        quotes.add(action.requestId)
        return { ok: true, id: action.requestId }
      }
      if (action.type === "reprice") {
        const gig = gigs.get(action.gigId)!
        assert.equal(gig.status, "open")
        assert.equal(action.schedule.length, 1)
        assert.ok(action.schedule[0]!.feeCents > gig.feeCents)
        gig.schedule = action.schedule
        gig.feeCents = action.schedule[0]!.feeCents
        raised.add(gig.id)
        return { ok: true, id: gig.id }
      }
      assert.equal(action.type, "post", "unexpected action")
      assert.equal(action.stops.length, 2)
      assert.equal(action.schedule.length, 1, "level 1 only supports a single fee")
      assert.ok(Number.isInteger(action.schedule[0]!.feeCents) && action.schedule[0]!.feeCents > 0)
      assert.deepEqual(action.stops.map(({ kind, leg }) => ({ kind, leg })), [{ kind: "pickup", leg: 0 }, { kind: "delivery", leg: 0 }])
      const orderId = action.stops[0]!.orderId
      assert.equal(action.stops[1]!.orderId, orderId)
      assert.ok(orders.has(orderId))
      assert.ok(![...gigs.values()].some(gig => gig.stops[0]!.orderId === orderId), "duplicate post")
      const id = `G${gigs.size}`
      gigs.set(id, { id, postedAt: now, status: "open", driverId: null, stops: action.stops, schedule: action.schedule,
        feeCents: action.schedule[0]!.feeCents, audience: action.audience })
      return { ok: true, id }
    })
  }

  const dir = await mkdtemp(join(tmpdir(), "spread-offline-test-"))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const failures: string[] = []
  const server = createServer(async (req, res) => {
    const reply = (status: number, data: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)) }
    try {
      assert.ok(++callCount < 2000, "runner stopped making progress")
      const url = new URL(req.url!, "http://127.0.0.1")
      let raw = ""
      for await (const chunk of req) raw += chunk
      const body = raw ? JSON.parse(raw) : undefined
      const path = url.pathname
      if (path === "/v1/map") return reply(200, map)
      assert.equal(req.headers.authorization, "Bearer offline-test")
      if (path === "/v1/worlds" && req.method === "GET") return reply(200, created ? [{ worldId, level: 1, ended: now === endsAt, kind: "practice", season: null, boardRun: null, parent: null }] : [])
      if (path === "/v1/worlds" && req.method === "POST") {
        assert.equal(created, false)
        assert.equal(body.level, 1)
        assert.equal(body.seed, "fictional")
        assert.ok(!body.board)
        created = true
        return reply(201, { worldId })
      }
      const prefix = `/v1/worlds/${worldId}`
      assert.ok(created && (path === prefix || path.startsWith(prefix + "/")))
      const route = path.slice(prefix.length)
      if (route === "") return reply(200, { worldId, now, endsAt, openRequests: now >= start && now < start + 15 ? requests : [],
        orders: [...orders.values()], gigs: [...gigs.values()], driverPositions: [], score: score() })
      if (route === "/events") {
        if (lostReply) historyReadsAfterLoss++
        return reply(200, history.filter(event => event.seq > Number(url.searchParams.get("after") ?? -1)))
      }
      if (route === "/drivers") return reply(200, drivers)
      if (route === "/score") return reply(200, score())
      if (route === "/actions") return reply(200, apply(body))
      assert.equal(route, "/advance")
      const step = body as Advance
      const results = apply(step.actions ?? [])
      const target = Math.min(endsAt, "to" in step ? step.to : "by" in step ? now + step.by : step.max)
      assert.ok(target >= now)
      let stopEarly = false
      for (const [at, transition] of milestones) {
        if (at <= now || at > target) continue
        const firstNew = history.length
        now = at
        transition()
        if ("untilEvent" in step && history.slice(firstNew).some(event => step.untilEvent.includes(event.kind))) { stopEarly = true; break }
      }
      if (!stopEarly) now = target
      const events = history.filter(event => event.seq > lastSeq)
      lastSeq = history.at(-1)?.seq ?? -1
      // The server committed the posts and moved the clock before its reply was lost.
      if (!lostReply && gigs.size === requestCount) {
        lostReply = true
        return reply(503, { error: "lost reply after accepting actions" })
      }
      return reply(200, { results, events, now })
    } catch (err) {
      failures.push(String(err))
      return reply(400, { error: String(err) })
    }
  })
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() }))
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const { stdout } = await promisify(execFile)(process.execPath, ["runner.ts", "practice", "--seed", "fictional", "--runs-dir", dir], {
    cwd: import.meta.dirname, env: { PATH: process.env.PATH, SPREAD_URL: `http://127.0.0.1:${address.port}`, SPREAD_KEY: "offline-test" }, timeout: 14000,
  }).catch(err => { throw new Error(`${err.message}\n${failures.join("\n")}`) })
  assert.deepEqual(failures, [])
  const result = JSON.parse(stdout.trim().split("\n").at(-1)!)
  assert.equal(result.worldId, worldId)
  assert.equal(now, endsAt)
  assert.equal(quotes.size, requestCount)
  assert.equal(gigs.size, requestCount)
  assert.equal(raised.size, Math.floor(requestCount / 2))
  assert.ok(lostReply && historyReadsAfterLoss > 0)
  assert.ok(batches.includes(50))
  assert.deepEqual(result.score, score())
  assert.equal(result.score.onTimeShare, 1)
  assert.ok(result.score.marginCents > 0)
})
