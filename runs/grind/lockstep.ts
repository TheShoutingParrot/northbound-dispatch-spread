// Generic lockstep replay: two policies receive the same recorded events at the same minutes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Action, ActionResult, DeskEvent } from '../../reference/typescript/types.ts'
export const root = new URL('../../', import.meta.url)
export const json = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'))
export const map = json('runs/l7-next/data/map.json')
export type Pair = { now: number; a: Action[]; b: Action[]; A?: any; B?: any }
export function lockstep(A: any, B: any, cfgA: any, cfgB: any, level: number, worldId: string, visit: (p: Pair) => void, strict = true) {
  const world = json(`runs/l7-next/data/${worldId}.json`)
  const events: DeskEvent[] = world.events
  const a = new A(map, world.drivers, cfgA, level), b = new B(map, world.drivers, cfgB, level)
  const counters = [{ gigs: 0, offers: 0 }, { gigs: 0, offers: 0 }]
  let i = 0, now = 0
  const results = (acts: Action[], c: { gigs: number; offers: number }): ActionResult[] => acts.map(act =>
    act.type === 'post' ? { ok: true, id: 'g' + ++c.gigs } : act.type === 'offer' ? { ok: true, id: 'o' + ++c.offers }
      : { ok: true, id: 'requestId' in act ? act.requestId : 'gigId' in act ? act.gigId : 'x' })
  const run = (batch: DeskEvent[]) => {
    const pa = a.step(now, batch), pb = b.step(now, batch)
    visit({ now, a: pa, b: pb, A: a, B: b })
    if (strict) {
      assert.equal(pb.length, pa.length, `action count differs at minute ${now}`)
      pb.forEach((act: Action, k: number) => assert.equal(act.type, pa[k]!.type, `action type differs at minute ${now}`))
    }
    a.record(pa, results(pa, counters[0]!)); b.record(pb, results(pb, counters[1]!))
  }
  run([])
  while (i < events.length) {
    const nextEvent = events[i]!.at
    const wake = Math.min(a.nextWake(now), b.nextWake(now))
    if (wake > now && wake < nextEvent) { now = Math.ceil(wake); run([]); continue }
    now = nextEvent
    const batch: DeskEvent[] = []
    while (i < events.length && events[i]!.at === now) batch.push(events[i++]!)
    run(batch)
  }
}
