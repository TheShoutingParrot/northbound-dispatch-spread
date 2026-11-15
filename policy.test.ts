import test from 'node:test'
import assert from 'node:assert/strict'
import { Policy } from './policy.ts'
import type { DeskEvent, DeskSnapshot, DriverProfile, Order, PostAction, PriceRequest, WorldMap } from './reference/typescript/types.ts'

const map: WorldMap = {
  places: [{ id: 'a', name: 'A', lat: 60, lon: 24 }, { id: 'b', name: 'B', lat: 60.4, lon: 24.5 }],
  roads: [{ from: 'a', to: 'b', minutes: 60, km: 70 }, { from: 'b', to: 'a', minutes: 60, km: 70 }],
}
const drivers: DriverProfile[] = Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, homePlaceId: 'a', rating: 4.9, completedGigs: 60, drops: 1, licence: 'manual' }))
const hours = { opens: 480, closes: 1080, weekdays: [0, 1, 2, 3, 4], saturday: null }
function request(): PriceRequest {
  return { id: 'r1', arrivedAt: 510, respondBy: 525, dealerId: 'd', batchId: null, note: null, referenceFeeCents: 9000,
    options: [{ kind: 'same_day', listPriceCents: 16000, deadline: 1200 }], legs: [{ car: { premium: true, electric: false, chargePercent: null }, pickup: { privateAddress: false, placeId: 'a', window: { from: 530, to: 1200 }, hours }, delivery: { privateAddress: false, placeId: 'b', window: { from: 530, to: 1200 }, hours } }] }
}
const won = (r: PriceRequest): Order => ({ id: r.id, dealerId: 'd', priceCents: r.options[0]!.listPriceCents, deadline: 1200, option: 'same_day', legs: r.legs, deliveredAt: r.legs.map(() => null), lastPickupAt: 1010, status: 'waiting' })
const requestEvent = (r: PriceRequest): DeskEvent => ({ seq: 1, at: 510, kind: 'price_request', request: r })
const orderEvent = (order: Order): DeskEvent => ({ seq: 2, at: 525, kind: 'order_won', order })
const newDesk = () => new Policy(map, drivers)

test('declines an uneconomic or infeasible quote; profitable first option is answered once and before respondBy', () => {
  for (const change of ['expensive', 'tooLate', 'closed', 'normal'] as const) {
    const r = request()
    if (change === 'expensive') r.referenceFeeCents = 30000
    if (change === 'closed') r.legs[0]!.pickup.hours = { ...hours, weekdays: [1] }
    const desk = newDesk()
    const event = requestEvent(r)
    const now = change === 'tooLate' ? r.respondBy : r.arrivedAt
    const actions = desk.step(now, [event])
    assert.deepEqual(actions, change === 'normal' ? [{ type: 'quote', requestId: 'r1', prices: { same_day: 16000 } }] : [])
    assert.deepEqual(desk.step(now, [event]), [])
  }
})

test('level 1 posts each leg separately and emits exactly one fee per gig', () => {
  const r = request()
  r.legs.push({ ...r.legs[0]!, pickup: r.legs[0]!.delivery, delivery: r.legs[0]!.pickup })
  const desk = newDesk()
  desk.step(510, [requestEvent(r)])
  const posts = desk.step(525, [orderEvent(won(r))]) as PostAction[]
  assert.equal(posts.length, 2)
  assert.deepEqual(posts.map(p => p.stops.map(s => s.leg)), [[0,0], [1,1]])
  for (const post of posts) {
    assert.equal(post.schedule.length, 1)
    assert.ok(post.schedule[0]!.feeCents > 0)
  }
})

test('selective repricing applies to open gigs; a cancelled or already booked gig receives no action', () => {
  const r = request(), desk = newDesk()
  desk.step(510, [requestEvent(r)])
  const posts = desk.step(525, [orderEvent(won(r))]) as PostAction[]
  desk.record(posts, [{ ok: true, id: 'g1' }])
  assert.equal(desk.nextWake(525), 560)
  const raises = desk.step(560, [])
  assert.equal(raises[0]?.type, 'reprice')
  if (raises[0]?.type === 'reprice') assert.ok(raises[0].schedule[0]!.feeCents > posts[0]!.schedule[0]!.feeCents)
  desk.record(raises, [{ ok: true, id: 'g1' }])
  assert.deepEqual(desk.step(900, [{ kind: 'gig_booked', seq: 3, at: 700, driverId: 'd1', gigId: 'g1', feeCents: 7000 }, { kind: 'deadline_close', seq: 4, at: 900, orderId: 'r1', lastPickupAt: 965 }]), [])
  assert.deepEqual(desk.step(935, [{ kind: 'order_cancelled', seq: 5, at: 935, orderId: 'r1', gigs: [{ gigId: 'g1', outcome: 'released' }] }]), [])
  assert.equal(desk.nextWake(935), Infinity)
})

test('recovery leaves a booked leg alone and dispatches only the outstanding leg', () => {
  const r = request(), desk = newDesk()
  r.legs.push(r.legs[0]!)
  const order = won(r)
  const snapshot: DeskSnapshot = { worldId: 'w', now: 540, endsAt: 14520, driverPositions: [], openRequests: [], orders: [order], gigs: [{ id: 'g1', stops: [{ kind: 'pickup', orderId: 'r1', leg: 0 }, { kind: 'delivery', orderId: 'r1', leg: 0 }], audience: { experienced: false, manualLicence: false }, status: 'booked', feeCents: 3000, driverId: 'd1', postedAt: 525, schedule: [{ at: 525, feeCents: 3000 }] }], score: { marginCents: 0, revenueCents: 0, marginShare: 0, wonOrders: 1, onTimeShare: 0, undeliveredShare: 0, ranked: false } }
  desk.restore(snapshot, [requestEvent(r), orderEvent(order)])
  const actions = desk.step(540, [orderEvent(order)]) as PostAction[]
  assert.equal(actions.length, 1)
  assert.equal(actions[0]?.stops[0]?.leg, 1)
})

test('admission cutoffs apply to the first option and each leg, including equality at the boundary', () => {
  const r = request()
  const first = r.options[0]!
  const horizon = first.deadline - r.respondBy
  r.options.push({ kind: 'next_day', deadline: first.deadline + 1440, listPriceCents: 20000 })
  const quote = (config: ConstructorParameters<typeof Policy>[2]) =>
    new Policy(map, drivers, config).step(510, [requestEvent(r)])
  assert.equal(quote({ minHorizon: horizon + 1 }).length, 0)
  assert.equal(quote({ minHorizon: horizon, maxRoadMinutes: 60 }).length, 1)
  assert.equal(quote({ maxRoadMinutes: 59 }).length, 0)
  r.legs.push({ ...r.legs[0]!, pickup: r.legs[0]!.delivery, delivery: r.legs[0]!.pickup })
  assert.equal(quote({}).length, 1)
  assert.equal(quote({ maxLegs: 1 }).length, 0)
})

test('extra pickup slack applies only when the road exceeds the configured length', () => {
  const r = request()
  // Last pickup for a 60-minute route at these sites is 1010; respondBy is 525.
  const dispatch = (road: number, slack: number) => new Policy(map, drivers, { longRoadMinutes: road, longRoadMinSlack: slack }).step(510, [requestEvent(r)])
  assert.equal(dispatch(60, 486).length, 1)
  assert.equal(dispatch(59, 486).length, 0)
  assert.equal(dispatch(59, 485).length, 1)
})

test('usable slack starts when the car is ready; private delivery alone does not trigger the private pickup filter', () => {
  const r = request()
  const leg = r.legs[0]!
  leg.pickup.window.from = 1000
  leg.delivery.privateAddress = true
  const quote = (config: ConstructorParameters<typeof Policy>[2]) => new Policy(map, drivers, config).step(510, [requestEvent(r)])
  assert.equal(quote({ minUsableSlack: 11 }).length, 0)
  assert.equal(quote({ minUsableSlack: 10, skipPrivatePickup: 1 }).length, 1)
  leg.pickup.privateAddress = true
  assert.equal(quote({ skipPrivatePickup: 1 }).length, 0)
  assert.equal(quote({}).length, 1)
})

test('level 2 sends future fee steps once; flat rates still protect imminent pickups', () => {
  const r = request(), order = won(r)
  const start = (scheduleRise: number) => {
    const desk = new Policy(map, drivers, { scheduleRise, scheduleDelay: 65 }, 2)
    desk.step(510, [requestEvent(r)])
    const [post] = desk.step(525, [orderEvent(order)]) as PostAction[]
    desk.record([post!], [{ ok: true, id: 'g1' }])
    return { desk, schedule: post!.schedule }
  }
  const { desk, schedule } = start(0.14)
  assert.deepEqual(schedule.slice(0, 3).map(s => s.at), [525, 590, 655])
  assert.equal(schedule[2]!.feeCents - schedule[0]!.feeCents, 1260)
  assert.ok(schedule.every((step, i) => !i || step.feeCents > schedule[i-1]!.feeCents && step.at > schedule[i-1]!.at))
  assert.deepEqual(desk.step(590, []), [])
  assert.deepEqual(desk.step(830, []), [])
  assert.equal(desk.nextWake(525), Infinity)
  const flat = start(0).schedule
  assert.ok(flat[1]!.at >= order.lastPickupAt - 180)
  assert.ok(flat.at(-1)!.feeCents > flat[0]!.feeCents)
})

test('level 2 responds to driver drops on the existing gig without compounding repeated events', () => {
  const r = request(), order = won(r)
  const desk = new Policy(map, drivers, { scheduleRise: 0, dropBump: 0.1 }, 2)
  desk.step(510, [requestEvent(r)])
  const posts = desk.step(525, [orderEvent(order)]) as PostAction[]
  desk.record(posts, [{ ok: true, id: 'g1' }])
  const booked = posts[0]!.schedule[0]!.feeCents
  const events: DeskEvent[] = [{ kind: 'gig_booked', seq: 3, at: 530, gigId: 'g1', driverId: 'd7', feeCents: booked }, {kind: 'gig_dropped', seq: 4, at: 538, gigId: 'g1', driverId: 'd7'}]
  const actions = desk.step(538, events)
  assert.equal(actions.length, 1)
  const raise = actions[0]
  assert.ok(raise?.type === 'reprice' && raise.gigId === 'g1')
  assert.equal(raise.schedule[0]!.feeCents, Math.round(booked * 1.1))
  desk.record(actions, [{ ok: true, id: 'g1' }])
  assert.deepEqual(desk.step(539, events), [])
  assert.deepEqual(desk.step(540, [{kind: 'no_show', seq: 5, at: 540, gigId: 'g1', driverId: 'd7'}]), [])
})

test('fixed fee comparator leaves the initially posted fee unchanged through drops and deadline warnings', () => {
  const r = request(), order = won(r), desk = new Policy(map, drivers, { fixedFee: 1 }, 2)
  desk.step(510, [requestEvent(r)])
  const posts = desk.step(525, [orderEvent(order)]) as PostAction[]
  assert.equal(posts[0]!.schedule.length, 1)
  desk.record(posts, [{ok: true, id: 'g1'}])
  assert.deepEqual(desk.step(840, [{ kind: 'gig_booked', seq: 3, at: 550, gigId: 'g1', driverId: 'd2', feeCents: 8000 },
    {kind: 'gig_dropped', seq: 4, at: 839, gigId: 'g1', driverId: 'd2'}, {kind: 'deadline_close', seq: 5, at: 840, orderId: 'r1', lastPickupAt: 1020}]), [])
})

test('level 3 keeps a trade-in in a single gig, including after the driver delivers the outbound car', () => {
  const r = request()
  r.legs.push({ ...r.legs[0]!, pickup: { ...r.legs[0]!.delivery, privateAddress: true, hours: null }, delivery: r.legs[0]!.pickup })
  const desk = new Policy(map, drivers, { offerCount: 0 }, 3)
  assert.equal(desk.step(510, [requestEvent(r)])[0]?.type, 'quote')
  const posts = desk.step(525, [orderEvent(won(r))]) as PostAction[]
  assert.equal(posts.length, 1)
  assert.deepEqual(posts[0]!.stops.map(s => [s.leg, s.kind]), [[0,'pickup'],[0,'delivery'],[1,'pickup'],[1,'delivery']])
  desk.record(posts, [{ok:true,id:'g1'}])
  assert.deepEqual(desk.step(730, [
    {kind:'gig_booked',seq:3,at:600,gigId:'g1',driverId:'d5',feeCents:9000},
    {kind:'delivered',seq:4,at:730,gigId:'g1',orderId:'r1',leg:0,placeId:'b'},
  ]), [])
  const longMap: WorldMap = {...map, roads:map.roads.map(r => ({...r,minutes:370}))}
  assert.deepEqual(new Policy(longMap, drivers, {}, 3).step(510,[requestEvent(r)]), [])
})

test('level 3 learned fees preserve list-price quotes and scale a two-car gig by each leg’s share', () => {
  const desk = new Policy(map, drivers, { networkFees: 1, opening: 0.55, offerCount: 0, bundleFactor: 1.2 }, 3)
  const r = request()
  r.legs.push({ ...r.legs[0]!, pickup: r.legs[0]!.delivery, delivery: r.legs[0]!.pickup })
  r.options[0]!.listPriceCents = 32000
  const quote = desk.step(510, [requestEvent(r)])
  assert.deepEqual(quote, [{ type: 'quote', requestId: r.id, prices: { same_day: 32000 } }])
  const actions = desk.step(525, [{ kind: 'order_won', seq: 2, at: 525, order: won(r) }])
  const post = actions.find(a => a.type === 'post')!
  assert.equal(post.stops.length, 4)
  assert.ok(post.schedule[0]!.feeCents > 0)
  for (let n = 1; n < post.schedule.length; n++) {
    assert.ok(post.schedule[n]!.feeCents >= post.schedule[n - 1]!.feeCents)
    assert.ok(post.schedule[n]!.at > post.schedule[n - 1]!.at)
  }
})

test('level 3 limits direct offers to three per driver per day and at most three per gig', () => {
  const desk = new Policy(map, drivers.slice(0,2), {offerCount:3,offerDelay:5}, 3)
  const requests = Array.from({length:7}, (_,i) => ({...request(),id:'r'+i}))
  desk.step(510,requests.map((r,i) => ({...requestEvent(r),seq:i})))
  const posts = desk.step(525,requests.map((r,i) => ({...orderEvent(won(r)),seq:i+7})))
  desk.record(posts,posts.map((_,i) => ({ok:true,id:'g'+i})))
  const offers=desk.step(530,[]).filter(a=>a.type==='offer')
  assert.equal(offers.length,6)
  for(const driver of drivers.slice(0,2))assert.equal(offers.filter(o=>o.driverId===driver.id).length,3)
  assert.ok(offers.every(o=>offers.filter(other=>other.gigId===o.gigId).length<=3))
  assert.deepEqual(desk.step(531,[]),[])
})

test('level 4 prices feasible options, sends an expensive decline, and responds to won or lost offers', () => {
  const desk = new Policy(map,drivers,{minUsableSlack:60,quoteFactor:1.08},4)
  const r=request()
  r.options[0]!.deadline=580 // insufficient usable pickup time at the faster deadline
  r.options.push({kind:'next_day',deadline:2640,listPriceCents:15000})
  const first=desk.step(510,[requestEvent(r)])[0]
  assert.ok(first?.type==='quote')
  assert.deepEqual(Object.keys(first.prices),['next_day'])
  assert.equal(first.prices.next_day,16200)
  const again={...r,id:'r2',arrivedAt:565,respondBy:580}
  const loss=desk.step(565,[{kind:'order_lost',requestId:r.id,seq:2,at:525},{kind:'price_request',request:again,seq:3,at:565}])[0]
  assert.ok(loss?.type==='quote' && loss.prices.next_day!<first.prices.next_day!)
  const risky={...again,id:'r3',options:[r.options[0]!]}
  const decline=desk.step(565,[{kind:'price_request',request:risky,seq:4,at:565}])[0]
  assert.ok(decline?.type==='quote' && decline.prices.same_day!>r.options[0]!.listPriceCents*10)
})

test('level 4 reconnect restores outstanding predictions and groups same-minute outcomes before new quotes', () => {
  const config = { level4Model: 1, maxLegs: 1, opening: 0.59 }
  const live = new Policy(map, drivers, config, 4)
  const recovered = new Policy(map, drivers, config, 4)
  const r = request()
  const first = requestEvent(r)
  live.step(510, [first])
  const at = (id: string, minute: number) => ({ ...r, id, arrivedAt: minute, respondBy: minute + 15 })
  const next = at('next', 525)
  const outcome: DeskEvent = { kind: 'order_lost', seq: 3, at: 525, requestId: r.id }
  const arrival: DeskEvent = { ...requestEvent(next), seq: 2, at: 525 }
  const second = live.step(525, [arrival, outcome])
  const before: DeskSnapshot = { worldId: 'w', now: 525, endsAt: 14280, openRequests: [next], orders: [], gigs: [],
    driverPositions: [], score: { ranked: false, wonOrders: 0, revenueCents: 0, marginCents: 0, marginShare: 0, onTimeShare: 0, undeliveredShare: 0 } }
  const history = [first, arrival, outcome]
  recovered.restore(before, history)
  assert.deepEqual(recovered.step(525, []), second)
  recovered.restore(before, history)
  assert.deepEqual(recovered.step(525, []), second)
  const third = at('third', 540)
  const events: DeskEvent[] = [
    { kind: 'order_won', seq: 4, at: 540, order: won(next) },
    { ...requestEvent(third), seq: 5, at: 540 },
  ]
  assert.deepEqual(recovered.step(540, events), live.step(540, events))
})

test('level 4 learned fees ignore per-request reference noise and quote only feasible options', () => {
  function decide(referenceFeeCents: number) {
    const r = request()
    r.referenceFeeCents = referenceFeeCents
    r.options[0]!.deadline = 580
    r.options.push({ kind: 'next_day', deadline: 2640, listPriceCents: 15000 })
    const desk = new Policy(map, drivers, { level4Model: 1, maxLegs: 1, minUsableSlack: 60, opening: 0.59 }, 4)
    const quote = desk.step(510, [requestEvent(r)])[0]
    assert.ok(quote?.type === 'quote')
    assert.deepEqual(Object.keys(quote.prices), ['next_day'])
    const post = desk.step(525, [orderEvent(won(r))])[0]
    assert.ok(post?.type === 'post')
    assert.ok(post.schedule.length > 1)
    for (const [i, step] of post.schedule.entries()) {
      assert.ok(Number.isSafeInteger(step.feeCents) && step.feeCents > 0)
      if (i) assert.ok(step.at > post.schedule[i - 1]!.at && step.feeCents >= post.schedule[i - 1]!.feeCents)
    }
    return { prices: quote.prices, schedule: post.schedule }
  }
  assert.deepEqual(decide(7000), decide(10500))
})

test('level 4 adds each deadline premium to its own list price multiplier', () => {
  const r = request()
  r.options.push({kind:'next_day', deadline:2400, listPriceCents:15000}, {kind:'within_3_days',deadline:5200,listPriceCents:14500})
  const quotes = (config: ConstructorParameters<typeof Policy>[2]) => {
    const q = new Policy(map,drivers,config,4).step(510,[requestEvent(r)])[0]
    assert.ok(q?.type==='quote')
    return q.prices
  }
  const baseline=quotes({}), adjusted=quotes({sameDayPremium:0.15,nextDayPremium:0.04})
  assert.equal(adjusted.same_day!,baseline.same_day!+2400)
  assert.equal(adjusted.next_day!,baseline.next_day!+600)
  assert.equal(adjusted.within_3_days,baseline.within_3_days)
})

test('level 5 plans the actual route, paperwork and qualified driver before booking', () => {
  const r=request()
  r.note={language:'en',text:'Manual gearbox. No plates. Pickup after 11:00.'}
  r.legs[0]!.car={premium:true,electric:true,chargePercent:18}
  const extraDrivers: DriverProfile[]=[
    {...drivers[0]!,id:'eligible'}, {...drivers[0]!,id:'automatic',licence:'automatic_only'},
    {...drivers[0]!,id:'inexperienced',completedGigs:3},
  ]
  const desk=new Policy({...map,roads:map.roads.map(road=>({...road,km:235}))},extraDrivers,{offerDelay:0,offerCount:3},5)
  desk.step(510,[requestEvent(r)])
  const posts=desk.step(525,[orderEvent(won(r))]) as PostAction[]
  const p=posts[0]!
  assert.deepEqual(p.audience,{manualLicence:true,experienced:true})
  assert.equal(p.stops[0]!.withPlates,true)
  assert.equal(p.stops[0]!.withCharging,true)
  assert.equal(p.stops[0]!.window?.from,660)
  desk.record(posts,[{ok:true,id:'g'}])
  const offered=desk.step(526,[]).filter(a=>a.type==='offer')
  assert.deepEqual(offered.map(a=>a.driverId),['eligible'])
})

test('level 5 carries newly discovered requirements across repeated failed pickups', () => {
  const r=request(),desk=new Policy(map,drivers,{offerCount:0},5)
  desk.step(510,[requestEvent(r)])
  desk.record(desk.step(525,[orderEvent(won(r))]),[{ok:true,id:'g1'}])
  const manual=desk.step(600,[{kind:'visit_failed',seq:3,at:600,gigId:'g1',orderId:r.id,leg:0,reason:'licence'}]) as PostAction[]
  assert.equal(manual[0]!.audience.manualLicence,true)
  desk.record(manual,[{ok:true,id:'g2'}])
  const plates=desk.step(650,[{kind:'visit_failed',seq:4,at:650,gigId:'g2',orderId:r.id,leg:0,reason:'no_plates'}]) as PostAction[]
  assert.equal(plates[0]!.audience.manualLicence,true)
  assert.equal(plates[0]!.stops[0]!.withPlates,true)
  desk.record(plates,[{ok:true,id:'g3'}])
  const later=desk.step(700,[{kind:'visit_failed',seq:5,at:700,gigId:'g3',orderId:r.id,leg:0,reason:'not_ready'}]) as PostAction[]
  assert.ok(later[0]!.stops[0]!.window!.from>700)
})

test('level 5 moves an open summer-tyre pickup beyond snow at its destination', () => {
  const r=request(),desk=new Policy(map,drivers,{offerCount:0},5)
  r.note={language:'en',text:'Summer tyres.'}
  desk.step(510,[requestEvent(r)])
  desk.record(desk.step(525,[orderEvent(won(r))]),[{ok:true,id:'g1'}])
  const response=desk.step(535,[{kind:'forecast',at:535,seq:3,text:'Snow',from:545,to:700,placeIds:['b']}])
  assert.deepEqual(response,[{type:'withdraw',gigId:'g1'}])
  desk.record(response,[{ok:true,id:'g1'}])
  const fresh=desk.step(536,[]) as PostAction[]
  assert.equal(fresh[0]!.stops[0]!.window?.from,701)
})

test('level 6 prices the exceptional concentration of requests at a shared yard', () => {
  const make=(level:5|6)=>{
    const desk=new Policy(map,drivers,{marketShock:0.25},level)
    const events=Array.from({length:30},(_,i)=>({...requestEvent({...request(),id:'bulk'+i,batchId:'yard'}),seq:i+1}))
    return desk.step(510,events).filter(a=>a.type==='quote')[0]!.prices.same_day!
  }
  assert.ok(make(6)>make(5))
})

test('contingency charging remains optional; required charging uses distance and battery thresholds', () => {
  const charges=(km:number, percent:number, reserve=0)=>{
    const r=request(); r.legs[0]!.car={premium:false,electric:true,chargePercent:percent}
    const desk=new Policy({...map, roads:map.roads.map(road=>({...road,km}))},drivers,{chargeReserveKm:reserve},5)
    desk.step(510,[requestEvent(r)])
    return !!(desk.step(525,[orderEvent(won(r))])[0] as PostAction).stops[0]!.withCharging
  }
  assert.equal(charges(172.4,27),false)
  assert.equal(charges(172.4,27,40),true)
  assert.equal(charges(160,27,40),false)
  assert.equal(charges(200,29),false)
  assert.equal(charges(200.1,29),true)
  assert.equal(charges(270.5,30,40),false)
})

test('a recurring pickup restriction is recomputed on the next day after expiry', () => {
  const r=request(),leg=r.legs[0]!
  leg.pickup.window.to=leg.delivery.window.to=3000
  r.note={language:'en',text:'Pickup hours: 10:00-14:00.'}
  const order=won(r);order.deadline=2640;order.lastPickupAt=2500
  const desk=new Policy(map,drivers,{offerCount:0},5)
  desk.step(510,[requestEvent(r)])
  const first=desk.step(525,[orderEvent(order)]) as PostAction[]
  assert.deepEqual(first[0]!.stops[0]!.window,{from:600,to:840})
  desk.record(first,[{ok:true,id:'g1'}])
  const second=desk.step(845,[{kind:'gig_expired',seq:3,at:841,gigId:'g1'}]) as PostAction[]
  assert.deepEqual(second[0]!.stops[0]!.window,{from:2040,to:2280})
})

test('a level 4 trade-in resumes its price history and preserves a booked handover', () => {
  const config = { level4Model: 2, maxLegs: 2, offerCount: 0, opening: 0.59 }
  const live = new Policy(map, drivers, config, 4)
  const recovered = new Policy(map, drivers, config, 4)
  const r = request()
  const out = r.legs[0]!
  out.delivery = { ...out.delivery, privateAddress: true, hours: null, window: { from: 840, to: 900 } }
  r.legs.push({ ...out, pickup: out.delivery, delivery: { ...out.pickup, window: { from: 840, to: 1200 } } })
  const history = [requestEvent(r), orderEvent(won(r))]
  const prior = live.step(510, [history[0]!])[0]!
  assert.ok(prior.type === 'quote' && prior.prices.same_day! < r.options[0]!.listPriceCents * 2)
  const [post] = live.step(525, [history[1]!]) as PostAction[]
  assert.ok(post)
  assert.deepEqual(post.stops.map(s => s.leg), [0, 0, 1, 1])
  assert.deepEqual(post.stops[0]!.window, { from: 530, to: 772 })
  live.record([post], [{ ok: true, id: 'trade-gig' }])
  const booked: DeskEvent = { kind: 'gig_booked', at: 540, seq: 3, gigId: 'trade-gig', driverId: 'd0', feeCents: post.schedule[0]!.feeCents }
  history.push(booked)
  assert.deepEqual(live.step(540, [booked]), [])
  const snapshot: DeskSnapshot = { worldId: 'w', now: 540, endsAt: 14520, driverPositions: [],
    openRequests: [], orders: [{ ...won(r), status: 'booked' }], gigs: [{ id: 'trade-gig', stops: post.stops,
      audience: post.audience, status: 'booked', feeCents: post.schedule[0]!.feeCents, driverId: 'd0',
      postedAt: 525, schedule: post.schedule }], score: { marginCents: 0, revenueCents: 0, marginShare: 0,
      wonOrders: 1, onTimeShare: 0, undeliveredShare: 0, ranked: false } }
  recovered.restore(snapshot, history)
  assert.deepEqual(recovered.step(540, []), [])
  const next = { ...r, id: 'next', arrivedAt: 550, respondBy: 565 }
  const events: DeskEvent[] = [
    { ...requestEvent(next), at: 550, seq: 4 },
    { kind: 'gig_dropped', gigId: 'trade-gig', driverId: 'd0', at: 550, seq: 5 },
  ]
  assert.deepEqual(recovered.step(550, events), live.step(550, events))
})
