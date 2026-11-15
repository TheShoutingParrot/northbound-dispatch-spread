import {DealerTrust,unevenSupply} from './level8-policy.ts'
import {shortageAccept, shortageFee} from './level7-policy.ts'
import { Level4TradePricing } from './level4-trade-pricing.ts'
import { Level4Pricing } from './level4-pricing.ts'
import { level4Fee } from './level4-fee.ts'
import { LocalMarket } from './market.ts'
import { readNote, type NoteRisk } from './notes-risk.ts'
import type {
  Action, ActionResult, DeskEvent, DeskEventKind, DeskSnapshot, DriverProfile,
  FeeStep, Leg, Order, PriceRequest, QuoteAction, DeliveryOption, Road, StopPlace, StopRef, ForecastEvent, VisitFailedEvent, WorldMap,
} from './reference/typescript/types.ts'

/** All fees and spreads are fractions of the kit's reference fee, times are world minutes. */
export interface Config {
  networkFees: number
  opening: number
  minSpread: number
  minSlack: number
  rescue: number
  escalation: number
  interval: number
  minHorizon: number
  maxRoadMinutes: number
  longRoadMinutes: number
  longRoadMinSlack: number
  maxLegs: number
  minUsableSlack: number
  skipPrivatePickup: number
  scheduleRise: number
  scheduleDelay: number
  dropBump: number
  offerCount: number
  offerDelay: number
  offerFactor: number
  bundleFactor: number
  quoteFactor: number
  sameDayPremium: number
  nextDayPremium: number
  quoteFloor: number
  quoteAdapt: number
  declineUncertain: number
  specialFee: number
  chargeReserveKm: number
  laneAdapt: number
  outagePremium: number
  marketShock: number
  level4Model: number
  fixedFee: number
}
export const defaults: Config = {
  networkFees: 0,
  level4Model: 0,
  opening: 0.65, minSpread: 0.12, minSlack: 60, rescue: 1.45, escalation: 0.10, interval: 35,
  offerCount: 2, offerDelay: 25, offerFactor: 0.95, bundleFactor: 0.87, quoteFactor: 1.04, sameDayPremium: 0, nextDayPremium: 0, quoteFloor: 0.94, quoteAdapt: 0.2,
  declineUncertain: 1, specialFee: 0.10, marketShock: 0.12, chargeReserveKm: 0, laneAdapt: 0, outagePremium: 0,
  scheduleRise: 0.14, scheduleDelay: 65, dropBump: 0.08, fixedFee: 0,
  minHorizon: 0, maxRoadMinutes: 0, longRoadMinutes: 0, longRoadMinSlack: 0, maxLegs: 2, minUsableSlack: 0, skipPrivatePickup: 0,
}
export const wakeEvents: DeskEventKind[] = ['price_request', 'order_won', 'order_changed', 'order_cancelled', 'deadline_close', 'gig_expired']
export type DispatchLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export const wakeEventsFor = (level: DispatchLevel): DeskEventKind[] =>
  level >= 5 ? [...wakeEvents, 'gig_dropped', 'no_show', 'forecast', 'release', 'visit_failed'] :
  level >= 2 ? [...wakeEvents, 'gig_dropped', 'no_show'] : wakeEvents
const DAY = 1440
const allDrivers = { experienced: false, manualLicence: false }
type LiveGig = { orderId: string; leg: number; since: number; fee: number; open: boolean; schedule: FeeStep[]; legs: number[]; lastBooking?: number; bumpFloor?: number }
const lane = (from: string, to: string) => `${from}/${to}`
const carKey = (id: string, leg: number) => `${id}/${leg}`
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** Last handover time within published opening hours, including the last Monday. */
function lastOpen(stop: StopPlace, deadline: number): number {
  const end = Math.min(deadline, stop.window.to)
  if (!stop.hours) return end >= stop.window.from ? end : -Infinity
  for (let day = Math.floor(end / DAY); day * DAY + DAY > stop.window.from; day--) {
    const weekday = day % 7
    const hours = weekday === 5 ? stop.hours.saturday : weekday < 5 && stop.hours.weekdays.includes(weekday) ? stop.hours : null
    if (!hours) continue
    const latest = Math.min(end, day * DAY + hours.closes)
    if (latest >= Math.max(stop.window.from, day * DAY + hours.opens)) return latest
  }
  return -Infinity
}

export class Policy {
  private level3Network = false
  readonly config: Config
  readonly level: DispatchLevel
  private completedDeliveries = 0
  private lateDeliveries = 0
  private unbookedPressure = 0
  private roads = new Map<string, Road>()
  private supply = new Map<string, number>()
  private requests = new Map<string, PriceRequest>()
  private orders = new Map<string, Order>()
  private gigs = new Map<string, LiveGig>()
  private assigned = new Map<string, string>()
  private retryAt = new Map<string, number>()
  private newRequests = new Set<string>()
  private drivers: DriverProfile[]
  private recent = new Map<string, {at: number; place?: string}>()
  private gigDriver = new Map<string, string>()
  private offerCounts = new Map<string, number>()
  private offersByGig = new Map<string, Set<string>>()
  private offersFrom = 0
  private level4Pricing?: Level4Pricing | Level4TradePricing
  private trust?: DealerTrust
  private marketQuotes = new Set<string>()
  private marketResults = new Map<string, {won: number; count: number}>()
  private notes = new Map<string, { at: number; risk: NoteRisk }>()
  private forecasts: ForecastEvent[] = []
  private corrections = new Map<string, { manual?: boolean; plates?: boolean; from?: number; failures: number }>()
  private changed = new Set<string>()
  private splitOrders = new Set<string>()
  private localMarket: LocalMarket
  private map: WorldMap
  private batchCounts = new Map<string, number>()
  private lastSeq = -1
  private now = 0

  constructor(map: WorldMap, drivers: DriverProfile[], config: Partial<Config> = {}, level: DispatchLevel = 1) {
    if (![1, 2, 3, 4, 5, 6, 7, 8].includes(level)) throw new Error('Supported dispatch levels are 1–8')
    this.drivers = drivers
    this.map = map
    this.localMarket = new LocalMarket(map)
    this.level = level
    if(level===8)this.trust=new DealerTrust()
    for (const [name, value] of Object.entries(config)) {
      if (!(name in defaults) || !Number.isFinite(value) || value < 0) throw new Error(`Invalid policy setting ${name}`)
    }
    this.config = { ...defaults, ...config }
    if (![0, 1].includes(this.config.networkFees)) throw new Error('networkFees must be 0 or 1')
    if (level === 3 && this.config.networkFees) {
      if (this.config.opening >= 1) throw new Error('The level 3 booking probability must be below 1')
      this.level3Network = true
    }
    if (this.config.interval < 1 || this.config.opening <= 0 || this.config.rescue < this.config.opening) throw new Error('Invalid fee or interval')
    if (![1, 2].includes(this.config.maxLegs)) throw new Error('maxLegs must be 1 or 2')
    if (![0, 1].includes(this.config.skipPrivatePickup)) throw new Error('skipPrivatePickup must be 0 or 1')
    if (this.config.scheduleRise > 0.6 || !Number.isInteger(this.config.scheduleDelay) || this.config.scheduleDelay < 1 ||
        this.config.dropBump > 0.5 || ![0, 1].includes(this.config.fixedFee)) throw new Error('Invalid level 2 schedule settings')
    if (!Number.isInteger(this.config.offerCount) || this.config.offerCount > 3 || !Number.isInteger(this.config.offerDelay) ||
        this.config.offerFactor <= 0 || this.config.bundleFactor <= 0 || this.config.quoteFactor <= 0) throw new Error('Invalid market settings')
    if (![0, 1, 2].includes(this.config.level4Model)) throw Error('level4Model must be 0, 1 or 2')
    if (level === 4 && this.config.level4Model) {
      if (this.config.opening >= 1 || (this.config.level4Model === 1 && this.config.maxLegs !== 1)) {
        throw Error('The level 4 model needs a booking probability below 1. Model 1 supports single-car gigs.')
      }
      this.level4Pricing = this.config.level4Model === 2 ? new Level4TradePricing() : new Level4Pricing()
    }
    if (this.config.chargeReserveKm > 200) throw new Error('chargeReserveKm must be between 0 and 200')
    if (![0, 1].includes(this.config.declineUncertain) || this.config.specialFee > 1 || this.config.marketShock > 1) throw new Error('Invalid operations settings')
    for (const road of map.roads) this.roads.set(lane(road.from, road.to), road)
    const homes = new Map<string, number>()
    for (const driver of drivers) homes.set(driver.homePlaceId, (homes.get(driver.homePlaceId) ?? 0) + 1)
    for (const place of map.places) {
      let count = 0
      for (const [home, residents] of homes) {
        const km = home === place.id ? 0 : this.roads.get(lane(home, place.id))?.km ?? Infinity
        count += residents * Math.exp(-km / 38)
      }
      this.supply.set(place.id, count)
    }
  }

  private road(leg: Leg) { return this.roads.get(lane(leg.pickup.placeId, leg.delivery.placeId)) }

  private latest(leg: Leg, deadline: number) {
    const road = this.road(leg)
    if (!road) return -Infinity
    return lastOpen(leg.pickup, lastOpen(leg.delivery, deadline) - road.minutes - 10)
  }

  private premium(leg: Leg): number {
    const count = this.supply.get(leg.pickup.placeId) ?? 0
    return clamp(0.12 - Math.log1p(count) * 0.032, -0.07, 0.12) + (leg.pickup.privateAddress || leg.delivery.privateAddress ? 0.05 : 0)
  }

  private note(request: PriceRequest | undefined, i: number, notBefore = request?.respondBy ?? 0) {
    if (this.level < 5 || !request) return undefined
    const key = carKey(request.id, i)
    const saved = this.notes.get(key)
    if (saved && (saved.at === notBefore || (!saved.risk.pickupHours && !saved.risk.deliveryHours))) return saved.risk
    // Only recurring hours change their chosen appointment with notBefore. Keep
    // one entry per car even when an unbooked car is revisited every minute.
    const risk = readNote(request, i, notBefore)
    this.notes.set(key, { at: notBefore, risk })
    return risk
  }

  private charging(leg: Leg) {
    return leg.car.electric && leg.car.chargePercent !== null && leg.car.chargePercent < 30 && (this.road(leg)?.km ?? 0) > 200 - this.config.chargeReserveKm
  }

  private planLeg(leg: Leg, request: PriceRequest | undefined, i: number, deadline: number, now: number) {
    const note = this.note(request, i, Math.max(request?.respondBy ?? 0, now))
    const correction = request && this.corrections.get(carKey(request.id, i))
    const manual = !!(note?.manualLicence || correction?.manual)
    const plates = !!(note?.withPlates || correction?.plates)
    const charge = this.charging(leg)
    const pickup = { ...leg.pickup.window }, delivery = { ...leg.delivery.window }
    if (note?.pickupWindow) {
      pickup.from = Math.max(pickup.from, note.pickupWindow.from)
      pickup.to = Math.min(pickup.to, note.pickupWindow.to)
    }
    if (note?.deliveryWindow) {
      delivery.from = Math.max(delivery.from, note.deliveryWindow.from)
      delivery.to = Math.min(delivery.to, note.deliveryWindow.to)
    }
    if (note?.deadline != null) delivery.to = Math.min(delivery.to, note.deadline)
    if (correction?.from) pickup.from = Math.max(pickup.from, correction.from)
    const travel = this.road(leg)?.minutes ?? 0
    const extra = 30 * Number(plates) + 40 * Number(charge)
    let snowy = false
    for (const f of this.forecasts) {
      if (f.to < Math.max(now, pickup.from) || f.from > Math.min(pickup.to, deadline) + travel ||
          !(f.placeIds.includes(leg.pickup.placeId) || f.placeIds.includes(leg.delivery.placeId))) continue
      snowy = true
      if (!note?.summerTyres) continue
      // Allow a trip wholly before the snow when it fits. Otherwise push pickup past the forecast.
      if (Math.max(now, pickup.from) + travel + extra + 60 <= f.from) pickup.to = Math.min(pickup.to, f.from - travel - extra - 5)
      else pickup.from = Math.max(pickup.from, f.to + 1)
    }
    return { pickup, delivery, manual, plates, charge, snowy, extra, uncertain: !!note?.uncertain }
  }

  private operationalLatest(leg: Leg, r: PriceRequest | undefined, i: number, deadline: number, now: number) {
    if (this.level < 5) return this.latest(leg, deadline)
    const plan = this.planLeg(leg, r, i, deadline, now)
    const road = this.road(leg)
    if (!road || plan.pickup.from > plan.pickup.to || plan.delivery.from > plan.delivery.to) return -Infinity
    const drive = Math.ceil(road.minutes * (plan.snowy ? 1.18 : 1)) + plan.extra + 10
    return lastOpen({ ...leg.pickup, window: plan.pickup }, lastOpen({ ...leg.delivery, window: plan.delivery }, deadline) - drive)
  }

  private postStops(order: Order, indices: number[]): { stops: StopRef[]; audience: typeof allDrivers } {
    const stops: StopRef[] = []
    const audience = { ...allDrivers }
    const request = this.requests.get(order.id)
    for (const i of indices) {
      const car = order.legs[i]!
      const pickup: StopRef = { orderId: order.id, leg: i, kind: 'pickup' }
      const delivery: StopRef = { orderId: order.id, leg: i, kind: 'delivery' }
      if (this.level >= 5) {
        const p = this.planLeg(car, request, i, order.deadline, this.now)
        audience.experienced ||= car.car.premium
        audience.manualLicence ||= p.manual
        if (p.plates) pickup.withPlates = true
        if (p.charge) pickup.withCharging = true
        for (const [target, place, planned] of [[pickup, car.pickup, p.pickup], [delivery, car.delivery, p.delivery]] as const) {
          if (planned.from <= planned.to && planned.to >= this.now &&
              (planned.from > place.window.from || planned.to < place.window.to)) target.window = planned
          // Preserve a known future ready time even after the original dealer's window ends.
          else if (!place.privateAddress && target.kind === 'pickup' && planned.from > this.now && planned.from > place.window.from)
            target.window = { from: planned.from, to: Math.max(planned.from + DAY, place.window.to) }
        }
      }
      if (this.level === 4 && this.config.level4Model === 2 && indices.length === 2 && i === 0) {
        const plan = this.tradePlan(order.legs, order.deadline)
        if (plan && this.now + 90 < plan.lastPickup && plan.lastPickup >= car.pickup.window.from) {
          pickup.window = { from: car.pickup.window.from, to: plan.lastPickup }
        }
      }
      stops.push(pickup, delivery)
    }
    return { stops, audience }
  }

  private failed(event: VisitFailedEvent) {
    const key = carKey(event.orderId, event.leg)
    const existing = this.corrections.get(key) ?? { failures: 0 }
    existing.failures++
    if (event.reason === 'licence') existing.manual = true
    if (event.reason === 'no_plates') existing.plates = true
    if (event.reason === 'closed' || event.reason === 'not_ready')
      existing.from = event.at + Math.min(8 * 60, (event.reason === 'closed' ? 180 : 90) * existing.failures)
    this.corrections.set(key, existing)
    this.splitOrders.add(event.orderId)
    const gig = this.gigs.get(event.gigId)
    if (!gig || gig.legs.length === 1) this.forgetGig(event.gigId)
    else {
      // The driver continues with the other car after a failed pickup.
      this.assigned.delete(key)
      gig.legs = gig.legs.filter(i => i !== event.leg)
      gig.leg = gig.legs[0]!
    }
  }

  private canBundle(legs: Leg[]) {
    if (this.level < 3 || legs.length !== 2) return false
    const [out, back] = legs as [Leg, Leg]
    if (out.delivery.placeId !== back.pickup.placeId) return false
    const drive = (this.road(out)?.minutes ?? Infinity) + (this.road(back)?.minutes ?? Infinity)
    const handover = this.roads.get(lane(out.delivery.placeId, back.pickup.placeId))?.minutes ?? 0
    return drive + handover <= 720
  }

  private tradePlan(legs: Leg[], deadline: number) {
    const [out, back] = legs
    if (!out || !back || !this.canBundle(legs)) return null
    const outward = this.road(out)!.minutes
    const returning = this.road(back)!.minutes
    const slot = out.delivery.window.from
    const dealerClose = lastOpen(back.delivery, deadline)
    const lastPickup = lastOpen(out.pickup, Math.min(
      slot - Math.ceil(outward * 1.12),
      dealerClose - Math.ceil((outward + returning) * 1.12) - 45,
    ))
    return { lastPickup, outward, returnRoom: dealerClose - slot - Math.ceil(returning * 1.12) - 20 }
  }

  private tradeFee(legs: Leg[], reference: number, deadline: number, at: number) {
    const plan = this.tradePlan(legs, deadline)
    if (!plan) return reference
    const km = this.road(legs[0]!)!.km
    const laneFee = 100 * (9.6 + 0.397 * km - 0.110 * Math.max(0, km - 30) - 0.046 * Math.max(0, km - 160))
    const fee = 0.38 * reference + 0.62 * laneFee
    const urgent = clamp((330 - (plan.lastPickup - at)) / 330, 0, 1)
    return Math.round(Math.max(2500, fee) * (1.05 + 0.34 * urgent + 0.09 * Number(plan.outward > 200)))
  }

  private tradeSchedule(order: Order, now: number): FeeStep[] {
    const plan = this.tradePlan(order.legs, order.deadline)!
    const reference = this.requests.get(order.id)?.referenceFeeCents ?? order.priceCents / 1.8
    const times = [now, ...[330, 210, 100, 0].map(before => plan.lastPickup - before)]
    return [...new Set(times.filter(t => t >= now))].sort((a, b) => a - b).map(at => ({
      at, feeCents: this.tradeFee(order.legs, reference, order.deadline, at),
    }))
  }

  private deliveryRisk() {
    // Smooth the early-week rate until enough deliveries have settled.
    const ratio = (this.lateDeliveries + 2.25) / (this.completedDeliveries + 52)
    return clamp((ratio - 0.043) / 0.035 + this.unbookedPressure * 0.65, 0, 1.65)
  }

  private shouldQuote(request: PriceRequest, first: DeliveryOption | undefined = request.options[0]): boolean {
    if (!first || request.referenceFeeCents <= 0 || !request.legs.length) return false
    if (request.legs.length > this.config.maxLegs || first.deadline - request.respondBy < this.config.minHorizon) return false
    if (this.config.maxRoadMinutes > 0 && request.legs.some(leg => (this.road(leg)?.minutes ?? Infinity) > this.config.maxRoadMinutes)) return false
    if (this.config.skipPrivatePickup && request.legs.some(leg => leg.pickup.privateAddress)) return false
    const bundle = this.canBundle(request.legs)
    if (this.level >= 3 && request.legs.length === 2 && !bundle) return false
    if (this.level === 4 && this.config.level4Model === 2 && bundle) {
      const plan = this.tradePlan(request.legs, first.deadline)
      return !!plan && plan.lastPickup >= Math.max(request.respondBy + 100, request.legs[0]!.pickup.window.from) &&
        plan.returnRoom >= 35
    }
    const plans = this.level >= 5 ? request.legs.map((leg, i) => this.planLeg(leg, request, i, first.deadline, request.respondBy)) : []
    if (this.config.declineUncertain && plans.some(p => p.uncertain)) return false
    const legLatest = request.legs.map((leg, i) => this.operationalLatest(leg, request, i, first.deadline, request.respondBy))
    if (plans.some((p,i) => p.pickup.from > legLatest[i]! && !(bundle && i === 1))) return false
    if (bundle) {
      // The return pickup shares the private delivery visit. Its independent appointment
      // window does not apply, but the driver must still get the trade-in back on time.
      const [out, back] = request.legs as [Leg, Leg]
      const finalReturn = lastOpen(back.delivery, first.deadline) - this.road(back)!.minutes - 20
      if (finalReturn < out.delivery.window.from) return false
      legLatest[0] = Math.min(legLatest[0]!, lastOpen(out.pickup, finalReturn - this.road(out)!.minutes - 10))
      legLatest[1] = Infinity
    }
    if (this.level3Network) {
      const leg = request.legs[0]!
      const usable = legLatest[0]! - Math.max(request.respondBy, leg.pickup.window.from)
      const lead = legLatest[0]! - request.respondBy
      const road = this.road(leg)
      if (!road) return false
      const expected = level4Fee(leg, road, request.respondBy, request.respondBy, legLatest[0]!, this.config.opening, this.config.escalation)
      const travelRisk = clamp((road.minutes - 335) / 150, 0, 1) * clamp((7.0 - Math.log1p(this.supply.get(leg.delivery.placeId) ?? 1)) / 3.5, 0, 1)
      const risk = this.deliveryRisk()
      const projected = expected * (1 + Math.max(0, risk - 0.4) * 0.024)
      if (risk > 0.3) {
        if (request.legs.length > 1 && (risk > 1 || lead < 420)) return false
        if (road.minutes > 290 + (1.65 - risk) * 85 && lead < 1800) return false
        if (request.legs.length === 1 && (usable < 100 + 92 * risk || (road.minutes > 115 && lead < 190 + 112 * risk))) return false
      }
      const floor = 1 + 0.065 * risk + 0.16 * travelRisk + 0.16 * clamp((240 - lead) / 160, 0, 1)
      if (request.legs.length === 1 && (first.listPriceCents < projected * floor || usable < 0)) return false
      if (request.legs.length === 2 && lead < 180) return false
    }
    if (this.config.minUsableSlack > 0 && request.legs.some((leg, i) =>
      legLatest[i]! - Math.max(request.respondBy, plans[i]?.pickup.from ?? leg.pickup.window.from) < this.config.minUsableSlack)) return false
    if (this.config.longRoadMinutes > 0 && this.config.longRoadMinSlack > 0 && request.legs.some((leg, i) =>
      (this.road(leg)?.minutes ?? Infinity) > this.config.longRoadMinutes && legLatest[i]! - request.respondBy < this.config.longRoadMinSlack)) return false
    const latest = Math.min(...legLatest)
    const slack = latest - request.respondBy
    if (slack < this.config.minSlack) return false
    if (this.level >= 7) {
      const leg=request.legs[0]!, road=this.road(leg)!
      const origin=leg.pickup.placeId, dest=leg.delivery.placeId
      const waiting=[...this.gigs.values()].filter(g=>g.open && this.orders.get(g.orderId)?.legs[g.leg]?.pickup.placeId===origin).length
      if(this.level===8 && !unevenSupply(this.supply.get(origin)??0,this.supply.get(dest)??0,road.minutes,waiting))return false
      if(!shortageAccept(leg,road,latest-Math.max(request.respondBy,leg.pickup.window.from),this.supply.get(origin)??0,this.supply.get(dest)??0,waiting))return false
    }
    if (this.level3Network) return true
    const pickup = request.legs[0]!.pickup.placeId
    let competing = 0
    for (const gig of this.gigs.values()) {
      if (!gig.open) continue
      const order = this.orders.get(gig.orderId)
      if (order?.legs[gig.leg]?.pickup.placeId === pickup && Math.abs(order.lastPickupAt - latest) <= 240) competing++
    }
    const load = clamp((competing - 1) / Math.max(8, (this.supply.get(pickup) ?? 0) * 0.45), 0, 1)
    const scarcity = Math.max(...request.legs.map(leg => this.premium(leg)))
    const tight = 0.20 * clamp((240 - slack) / 180, 0, 1)
    const estimate = this.config.opening + this.config.minSpread + scarcity + tight + load * 0.25 + (request.legs.length - 1) * 0.16
    return this.level >= 4 || first.listPriceCents >= request.referenceFeeCents * estimate
  }

  private quote(request: PriceRequest): QuoteAction | undefined {
    const first = request.options[0]
    if (!first) return
    if (this.level < 4) return this.shouldQuote(request) ? { type: 'quote', requestId: request.id, prices: { [first.kind]: first.listPriceCents } } : undefined
    if (this.level4Pricing) {
      const leg = request.legs[0]!
      const road = this.road(leg)
      const choices = request.options.flatMap(option => {
        if (!road || !this.shouldQuote(request, option)) return []
        const latest = this.latest(leg, option.deadline)
        const slack = latest - request.respondBy
        const extended = this.config.level4Model === 2
        if (extended && request.legs.length === 2) {
          return [{ option, costCents: this.tradeFee(request.legs, request.referenceFeeCents, option.deadline, request.respondBy) * 1.12 + 330 }]
        }
        if (extended && road.minutes > 410 && slack < 440 + 0.5 * road.minutes) return []
        const opening = level4Fee(leg, road, request.respondBy, request.respondBy, latest,
          this.config.opening, this.config.escalation)
        const refundRisk = 0.025 + 0.075 * clamp(1 - slack / 600, 0, 1) +
          0.085 * clamp((road.minutes - 230) / 140, 0, 1)
        const longHaulRisk = extended ? Math.max(0, road.minutes - 410) * 0.00035 : 0
        return [{ option, costCents: opening * 1.06 + (refundRisk + longHaulRisk) * option.listPriceCents + 110 }]
      })
      const prices = this.level4Pricing.quote(request, choices, road?.minutes ?? 90)
      if (!choices.length) prices[first.kind] = Math.ceil(Math.max(request.referenceFeeCents, first.listPriceCents) * 50)
      return { type: 'quote', requestId: request.id, prices }
    }
    const prices: QuoteAction['prices'] = {}
    const market = this.marketResults.get(request.dealerId)
    const global = this.marketResults.get('*')
    const winRate = ((market?.won ?? 0) + 8 * (((global?.won ?? 0) + 3) / ((global?.count ?? 0) + 6))) / ((market?.count ?? 0) + 8)
    const localAdjustment = this.level >= 5 ? this.localMarket.adjustment(request, this.level, this.config.laneAdapt, this.config.outagePremium) : 0
    const crowd = this.level >= 6 && request.batchId ? this.batchCounts.get(request.batchId) ?? 0 : 0
    for (const option of request.options) {
      if (!this.shouldQuote(request, option)) continue
      const latest = Math.min(...request.legs.map((leg, i) => this.operationalLatest(leg, request, i, option.deadline, request.respondBy)))
      const hazard = this.level < 5 ? 0 : Math.max(...request.legs.map((leg,i) => {
        const p = this.planLeg(leg, request, i, option.deadline, request.respondBy)
        return this.config.specialFee * (Number(p.plates) + 0.8 * Number(p.charge) + 0.6 * Number(leg.car.premium) +
          0.4 * Number(p.manual) + 0.6 * Number(p.snowy) + Number(p.uncertain))
      }))
      const urgency = clamp((360 - (latest - request.respondBy)) / 360, 0, 1)
      const scarcity = Math.max(...request.legs.map(leg => this.premium(leg)))
      const premium = option.kind === 'same_day' ? this.config.sameDayPremium : option.kind === 'next_day' ? this.config.nextDayPremium : 0
      const factor = this.config.quoteFactor + this.config.quoteAdapt * (winRate - 0.50) + 0.08 * urgency + premium + hazard / 2 + localAdjustment + this.config.marketShock * clamp((crowd - 5) / 15, 0, 1)
      const cost = request.referenceFeeCents * (this.config.quoteFloor + scarcity + 0.16 * urgency + hazard)
      prices[option.kind] = Math.round(Math.max(cost, option.listPriceCents * factor * (this.trust?.factor(request.dealerId)??1), 1))
    }
    if (!Object.keys(prices).length) {
      prices[first.kind] = Math.ceil(Math.max(request.referenceFeeCents, first.listPriceCents) * 50)
    } else this.marketQuotes.add(request.id)
    return { type: 'quote', requestId: request.id, prices }
  }

  private result(id: string, won: boolean) {
    this.level4Pricing?.observe(id, won)
    if (this.level < 4 || !this.marketQuotes.delete(id)) return
    const request = this.requests.get(id)
    if (!request) return
    if (this.level >= 5) this.localMarket.record(request, won)
    for (const key of [request.dealerId, '*']) {
      const prev = this.marketResults.get(key) ?? { won: 0, count: 0 }
      const decay = key === '*' ? 0.98 : 0.9
      this.marketResults.set(key, {won: prev.won * decay + Number(won), count: prev.count * decay + 1})
    }
  }

  private fee(order: Order, legIndex: number, since: number, at = this.now): number {
    const leg = order.legs[legIndex]!
    const request = this.requests.get(order.id)
    const typical = request?.referenceFeeCents ?? order.priceCents
    const weights = order.legs.map(l => 30 + (this.road(l)?.minutes ?? 90))
    const share = weights[legIndex]! / weights.reduce((sum, value) => sum + value, 0)
    const slack = Math.min(this.operationalLatest(leg, request, legIndex, order.deadline, this.now), order.lastPickupAt) - at
    if (this.level4Pricing || this.level3Network) {
      const road = this.road(leg)
      if (road) {
        const extended = this.level === 4 && this.config.level4Model === 2 && road.minutes > 410
        const target = this.level3Network
          ? Math.min(0.87, this.config.opening + 0.01 + 0.105 * this.deliveryRisk())
          : this.config.opening + (extended ? 0.075 : 0)
        const modeled = level4Fee(leg, road, since, at, slack + at, target, this.config.escalation)
        return Math.max(1, Math.round(modeled * (this.level3Network ? share : 1)))
      }
    }
    const age = Math.max(0, at - since)
    const increments = Math.floor(age / this.config.interval)
    const handling = this.level >= 5 ? this.planLeg(leg, request, legIndex, order.deadline, this.now) : null
    if (this.level >= 7 && handling) {
      const road=this.road(leg)
      if (road) return shortageFee(leg,road,since,at,slack+at,this.config.opening,this.config.escalation,this.supply.get(leg.pickup.placeId)??0,
        this.config.specialFee*(Number(handling.plates)+Number(handling.charge)+.7*Number(leg.car.premium)+.8*Number(handling.snowy)))
    }
    const base = this.config.opening + this.premium(leg) + (handling ? this.config.specialFee *
      (Number(handling.plates) + Number(handling.charge) + 0.6 * Number(leg.car.premium) + 0.6 * Number(handling.snowy)) : 0)
    // Flexible orders can wait through the first few views. After a warning, the time
    // remaining to reach pickup matters more than the number of views or the gig's age.
    // At level 2 every booking teaches its viewers about waiting. Limit ordinary raises
    // to two modest steps, while pricing urgency separately when a pickup is at risk.
    const normal = base + (this.level === 1 ? Math.min(0.30, increments * this.config.escalation)
      : Math.min(2, Math.floor(age / this.config.scheduleDelay)) * this.config.scheduleRise / 2)
    const rescue = base + (this.config.rescue - base) * clamp((240 - slack) / 240, 0, 1)
    const fraction = Math.max(base, normal, rescue)
    return Math.max(1, Math.round(typical * share * fraction))
  }

  private schedule(order: Order, i: number, since: number, floor = 0): FeeStep[] {
    const at = this.now
    const first = Math.max(floor, this.fee(order, i, since))
    if (this.level === 1 || this.config.fixedFee) return [{ at, feeCents: first }]
    const last = Math.min(this.operationalLatest(order.legs[i]!, this.requests.get(order.id), i, order.deadline, this.now), order.lastPickupAt)
    const reviews = this.level4Pricing || this.level3Network || this.level >= 7 ? [420, 330, 255, 180, 120, 60, 0] : [180, 120, 60, 0]
    const times = [since + this.config.scheduleDelay, since + this.config.scheduleDelay * 2,
      ...reviews.map(minutes => last - minutes)]
    const steps = [{ at, feeCents: first }]
    for (const t of [...new Set(times)].filter(t => Number.isFinite(t) && t > at && t <= last).sort((a, b) => a - b)) {
      const fee = this.fee(order, i, since, t)
      if (fee > steps.at(-1)!.feeCents) steps.push({ at: t, feeCents: fee })
    }
    return steps
  }

  private registerDrop(gig: LiveGig) {
    if (this.level < 2 || !gig.lastBooking) return
    // A driver who released the gig will only reconsider for more. The cap avoids
    // compounding the bump every time another driver returns the same car.
    const order = this.orders.get(gig.orderId)
    if (!order) return
    const cap = this.fee(order, gig.leg, gig.since, order.lastPickupAt)
    gig.bumpFloor = Math.max(gig.bumpFloor ?? 0, Math.min(cap, Math.round(gig.lastBooking * (1 + this.config.dropBump))))
  }

  private forgetGig(id: string) {
    const gig = this.gigs.get(id)
    if (!gig) return
    for (const index of gig.legs) {
      const key = carKey(gig.orderId, index)
      if (this.assigned.get(key) === id) this.assigned.delete(key)
    }
    this.gigs.delete(id)
  }

  private observe(event: DeskEvent) {
    switch (event.kind) {
      case 'price_request':
        this.requests.set(event.request.id, event.request)
        if (this.level >= 6 && event.request.batchId)
          this.batchCounts.set(event.request.batchId, (this.batchCounts.get(event.request.batchId) ?? 0) + 1)
        this.newRequests.add(event.request.id)
        break
      case 'gig_viewed':
        if (this.level >= 3) this.recent.set(event.driverId, { ...this.recent.get(event.driverId), at: event.at })
        break
      case 'order_lost': this.result(event.requestId, false); break
      case 'forecast':
        if (this.level >= 5) {
          this.forecasts.push(event)
          for (const order of this.orders.values())
            if (order.legs.some((leg,i) => this.note(this.requests.get(order.id),i)?.summerTyres &&
                (event.placeIds.includes(leg.pickup.placeId) || event.placeIds.includes(leg.delivery.placeId)))) this.changed.add(order.id)
        }
        break
      case 'release': {
        const correction = this.corrections.get(carKey(event.orderId, event.leg))
        if (correction) { correction.from = event.at; this.changed.add(event.orderId) }
        break
      }
      case 'order_won': case 'order_changed':
        if (event.kind === 'order_changed' && this.level >= 5) this.changed.add(event.order.id)
        if (event.kind === 'order_won') this.result(event.order.id, true)
        this.orders.set(event.order.id, structuredClone(event.order))
        break
      case 'order_cancelled':
        this.orders.delete(event.orderId)
        for (const gig of event.gigs) this.forgetGig(gig.gigId)
        break
      case 'gig_booked': case 'gig_started': case 'no_show': case 'gig_dropped': {
        const gig = this.gigs.get(event.gigId)
        if (gig) {
          gig.open = event.kind === 'no_show' || event.kind === 'gig_dropped'
          if (event.kind === 'gig_booked') {
            gig.lastBooking = event.feeCents
            if (this.level >= 3) this.gigDriver.set(event.gigId, event.driverId)
          }
          if (gig.open) this.registerDrop(gig)
        }
        break
      }
      case 'visit_failed':
        if (this.level >= 5) this.failed(event)
        else this.forgetGig(event.gigId)
        break
      case 'gig_expired': this.forgetGig(event.gigId); break
      case 'delivered': {
        const driver = this.gigDriver.get(event.gigId)
        if (driver) this.recent.set(driver, {at: event.at, place: event.placeId})
        const order = this.orders.get(event.orderId)
        if (order) {
          order.deliveredAt[event.leg] = event.at
          if (order.deliveredAt.every(t => t !== null)) {
            if (this.level3Network) {
              this.completedDeliveries++
              if (event.at > order.deadline) this.lateDeliveries++
            }
            this.orders.delete(order.id)
          }
          const gig = this.gigs.get(event.gigId)
          if (!gig || gig.legs.every(i => order.deliveredAt[i] !== null)) this.forgetGig(event.gigId)
        }
        break
      }
      case 'deadline_close': {
        const order = this.orders.get(event.orderId)
        if (order) order.lastPickupAt = event.lastPickupAt
        break
      }
    }
  }

  private restoreLevel4Pricing(history: DeskEvent[]) {
    if (!this.level4Pricing) return
    this.level4Pricing = this.config.level4Model === 2 ? new Level4TradePricing() : new Level4Pricing()
    // A request wakes the runner in its arrival minute. Each advance delivers every
    // outcome observed up to that minute before step computes any new quotes.
    let minute = -1
    const arrivals: PriceRequest[] = []
    const quoteArrivals = () => {
      for (const request of arrivals) this.quote(request)
      arrivals.length = 0
    }
    for (const event of history) {
      if (event.kind !== 'price_request' && event.kind !== 'order_won' && event.kind !== 'order_lost') continue
      if (event.at !== minute) {
        quoteArrivals()
        minute = event.at
      }
      if (event.kind === 'price_request') arrivals.push(event.request)
      else if (event.kind === 'order_won') this.level4Pricing.observe(event.order.id, true)
      else this.level4Pricing.observe(event.requestId, false)
    }
    quoteArrivals()
  }

  /** Call for a new world or when reconnecting to a world that already exists. */
  restore(snapshot: DeskSnapshot, history: DeskEvent[]) {
    this.now = snapshot.now
    this.lastSeq = -1
    this.notes.clear(); this.forecasts = []; this.corrections.clear(); this.changed.clear(); this.splitOrders.clear()
    this.localMarket = new LocalMarket(this.map); this.batchCounts.clear()
    this.recent.clear(); this.gigDriver.clear(); this.marketQuotes.clear(); this.marketResults.clear()
    this.offerCounts.clear(); this.offersByGig.clear()
    // Snapshot histories do not expose pending offers. A fresh local day replenishes all
    // driver quotas, and every offer from before recovery has expired ten minutes later.
    this.offersFrom = snapshot.now === 0 ? 0 : Math.max(snapshot.now + 10, (Math.floor(snapshot.now / DAY) + 1) * DAY)
    this.requests.clear(); this.orders.clear(); this.gigs.clear(); this.assigned.clear(); this.newRequests.clear(); this.retryAt.clear()
    if (this.level3Network) {
      const completed = new Set<string>()
      const late = new Set<string>()
      for (const event of history) {
        if (event.kind !== 'ledger' || !event.line.orderId) continue
        if (event.line.kind === 'revenue') completed.add(event.line.orderId)
        if (event.line.kind === 'late_refund') late.add(event.line.orderId)
      }
      this.completedDeliveries = completed.size
      this.lateDeliveries = late.size
      this.unbookedPressure = 0
    }
    if(this.trust){this.trust=new DealerTrust();this.trust.observe(history)}
    this.restoreLevel4Pricing(history)
    for (const event of history) {
      this.lastSeq = Math.max(this.lastSeq, event.seq)
      if (event.kind === 'price_request') this.requests.set(event.request.id, event.request)
      if (this.level >= 5 && event.kind === 'forecast' && event.to >= snapshot.now) this.forecasts.push(event)
      if (this.level >= 5 && event.kind === 'visit_failed') this.failed(event)
      if (this.level >= 5 && event.kind === 'release') {
        const correction = this.corrections.get(carKey(event.orderId,event.leg))
        if (correction) correction.from = event.at
      }
    }
    for (const request of snapshot.openRequests) {
      this.requests.set(request.id, request)
      this.newRequests.add(request.id)
    }
    for (const order of snapshot.orders) {
      if (order.status !== 'delivered' && order.status !== 'cancelled') this.orders.set(order.id, structuredClone(order))
    }
    for (const gig of snapshot.gigs) {
      const car = gig.stops[0]
      if (!car || !this.orders.has(car.orderId) || ['withdrawn', 'done'].includes(gig.status)) continue
      const legs = gig.stops.filter(s => s.kind === 'pickup').map(s => s.leg)
      this.gigs.set(gig.id, { orderId: car.orderId, leg: car.leg, legs, since: gig.postedAt, fee: gig.feeCents, open: gig.status === 'open', schedule: gig.schedule })
      for (const leg of legs) this.assigned.set(carKey(car.orderId, leg), gig.id)
      if (gig.driverId) this.gigDriver.set(gig.id, gig.driverId)
    }
    if (this.level >= 2) for (const event of history) {
      if (!('gigId' in event) || !event.gigId) continue
      const gig = this.gigs.get(event.gigId)
      if (!gig) continue
      if (event.kind === 'gig_booked') gig.lastBooking = event.feeCents
      if (event.kind === 'gig_dropped' || event.kind === 'no_show') this.registerDrop(gig)
    }
  }

  /** Observe all events first so a cancellation or booking in this batch wins over stale work. */
  step(now: number, events: DeskEvent[]): Action[] {
    this.trust?.observe(events.filter(e=>e.seq>this.lastSeq))
    this.now = now
    for (const event of events) {
      if (event.seq <= this.lastSeq) continue
      this.lastSeq = event.seq
      this.observe(event)
    }
    if (this.level3Network) {
      let waiting = 0
      let urgent = 0
      for (const gig of this.gigs.values()) {
        if (!gig.open || now - gig.since < 45) continue
        const order = this.orders.get(gig.orderId)
        if (!order || now < order.legs[0]!.pickup.window.from - 360) continue
        waiting++
        if (order.lastPickupAt < now + 240) urgent++
      }
      this.unbookedPressure = clamp((waiting + urgent * 2 - 4) / 15, 0, 1.5)
    }
    const actions: Action[] = []
    for (const id of this.newRequests) {
      const request = this.requests.get(id)!
      if (request.respondBy <= now) continue
      const quote = this.quote(request)
      if (quote) actions.push(quote)
    }
    this.newRequests.clear()
    if (this.level >= 5) for (const [id,gig] of this.gigs) {
      if (gig.open && this.changed.has(gig.orderId)) actions.push({type:'withdraw',gigId:id})
    }
    this.changed.clear()
    for (const order of this.orders.values()) for (const [i, leg] of order.legs.entries()) {
      if (order.deliveredAt[i] != null) continue
      const key = carKey(order.id, i)
      const gigId = this.assigned.get(key)
      const gig = gigId ? this.gigs.get(gigId) : undefined
      if (gig && !gig.open || (this.retryAt.get(key) ?? 0) > now) continue
      const bundle = !this.splitOrders.has(order.id) && this.canBundle(order.legs) && order.deliveredAt.every(at => at == null)
      if (bundle && i > 0 || gig && gig.leg !== i) continue
      if (this.level >= 2 && gig && gigId) {
        if (actions.some(a => a.type === 'withdraw' && a.gigId === gigId)) continue
        if (this.level >= 3 && this.config.offerCount) this.directOffers(actions, gigId, gig, order)
        if (this.config.fixedFee || gig.legs.length > 1) continue
        const listed = gig.schedule.findLast(step => step.at <= now)?.feeCents ?? gig.fee
        const floor = gig.bumpFloor ?? 0
        // The native schedule already handles changing urgency. Only reprice after a
        // drop, or if a changed deadline makes the current schedule materially too low.
        const last = Math.min(this.operationalLatest(leg, this.requests.get(order.id), i, order.deadline, this.now), order.lastPickupAt)
        const nextPlanned = gig.schedule.find(step => step.at > now)
        const lateRaise = last - now <= 180 && (!nextPlanned || nextPlanned.at > last || nextPlanned.at - now > 60)
        if (floor > listed || (lateRaise && this.fee(order, i, gig.since) > listed * 1.08)) {
          actions.push({ type: 'reprice', gigId, schedule: this.schedule(order, i, gig.since, Math.max(listed, floor)) })
        }
        continue
      }
      const fee = this.fee(order, i, gig?.since ?? now)
      if (gig && gigId) {
        // Avoid one-cent updates on every simulated minute. Drivers reread the fee in the app.
        if (fee > gig.fee * 1.035) actions.push({ type: 'reprice', gigId, schedule: [{ at: now, feeCents: fee }] })
      } else if (!leg.pickup.privateAddress || leg.pickup.window.to >= now) {
        const legs = bundle ? [0, 1] : [i]
        const schedules = legs.map(leg => this.schedule(order, leg, now))
        const schedule = this.level === 4 && this.config.level4Model === 2 && bundle
          ? this.tradeSchedule(order, now)
          : schedules.length === 1 ? schedules[0]! : this.bundleSchedule(schedules)
        actions.push({ type: 'post', ...this.postStops(order, legs), schedule })
      }
    }
    return actions
  }

  private bundleSchedule(parts: FeeStep[][]): FeeStep[] {
    const times = [...new Set(parts.flat().map(s => s.at))].sort((a, b) => a - b)
    return times.map(at => ({ at, feeCents: Math.max(1, Math.round(this.config.bundleFactor *
      parts.reduce((sum, schedule) => sum + schedule.findLast(step => step.at <= at)!.feeCents, 0))) }))
  }

  private directOffers(actions: Action[], gigId: string, gig: LiveGig, order: Order) {
    const clock = this.now % DAY
    if (this.now < this.offersFrom || clock < 420 || clock >= 1380 || this.now < gig.since + this.config.offerDelay) return
    const tried = this.offersByGig.get(gigId) ?? new Set<string>()
    if (tried.size >= this.config.offerCount) return
    const pickup = order.legs[gig.leg]!.pickup.placeId
    const destination = order.legs[gig.legs.at(-1)!]!.delivery.placeId
    const day = Math.floor(this.now / DAY)
    const audience = this.level >= 5 ? this.postStops(order, gig.legs).audience : allDrivers
    const choices = this.drivers.filter(d => (!audience.manualLicence || d.licence === 'manual') &&
      (!audience.experienced || (d.completedGigs >= 50 && d.rating >= 4.8)) && !tried.has(d.id) && (this.offerCounts.get(day + '/' + d.id) ?? 0) < 3).map(d => {
      const activity = this.recent.get(d.id)
      const active = !!activity && this.now - activity.at < 240
      const start = active && activity?.place || d.homePlaceId
      const distance = (a: string, b: string) => a === b ? 0 : this.roads.get(lane(a, b))?.minutes ?? 999
      const reach = distance(start, pickup)
      return { driver: d.id, reach, score: reach + 0.3 * distance(destination, d.homePlaceId) - (active ? 30 : 0) + d.drops / Math.max(1, d.completedGigs) * 100 }
    }).filter(d => d.reach <= 120).sort((a, b) => a.score - b.score)
    const displayed = gig.schedule.findLast(step => step.at <= this.now)?.feeCents ?? gig.fee
    for (const { driver } of choices.slice(0, this.config.offerCount - tried.size)) {
      const key = day + '/' + driver
      this.offerCounts.set(key, (this.offerCounts.get(key) ?? 0) + 1)
      tried.add(driver)
      actions.push({ type: 'offer', gigId, driverId: driver, feeCents: Math.max(1, Math.round(displayed * this.config.offerFactor)) })
    }
    this.offersByGig.set(gigId, tried)
  }

  /** The result supplies a post's gig ID. Record before delivering advance's events. */
  record(actions: Action[], results: ActionResult[]) {
    for (const [i, action] of actions.entries()) {
      const result = results[i]
      if (!result) throw new Error('Spread omitted an action result')
      if (action.type === 'post') {
        const stop = action.stops[0]!
        const key = carKey(stop.orderId, stop.leg)
        if (!result.ok) { this.retryAt.set(key, this.now + 30); continue }
        const legs = action.stops.filter(s => s.kind === 'pickup').map(s => s.leg)
        for (const leg of legs) this.assigned.set(carKey(stop.orderId, leg), result.id)
        this.gigs.set(result.id, { orderId: stop.orderId, leg: stop.leg, legs, since: this.now, fee: action.schedule[0]!.feeCents, open: true, schedule: action.schedule })
        this.retryAt.delete(key)
      } else if (action.type === 'withdraw' && result.ok) {
        this.forgetGig(action.gigId)
      } else if (action.type === 'reprice' && result.ok) {
        const gig = this.gigs.get(action.gigId)
        if (gig) {
          gig.fee = action.schedule[0]!.feeCents
          gig.schedule = action.schedule
        }
      }
    }
  }

  nextWake(now: number): number {
    let next = Infinity
    for (const t of this.retryAt.values()) if (t > now) next = Math.min(next, t)
    if (this.level >= 3 && this.config.offerCount) for (const [id, gig] of this.gigs) {
      const offerAt = gig.since + this.config.offerDelay
      if (gig.open && offerAt > now && !this.offersByGig.has(id)) next = Math.min(next, offerAt)
    }
    if (this.level >= 2) return next
    for (const gig of this.gigs.values()) {
      if (!gig.open) continue
      const order = this.orders.get(gig.orderId)
      if (!order) continue
      const interval = this.config.interval
      const age = Math.max(0, now - gig.since)
      const n = Math.floor(age / interval) + 1
      if ((n - 1) * this.config.escalation < 0.30 && this.config.escalation > 0) next = Math.min(next, gig.since + Math.ceil(n * interval))
      const last = Math.min(this.latest(order.legs[gig.leg]!, order.deadline), order.lastPickupAt)
      for (const before of [240, 205, 170, 135, 100, 65, 30, 0]) if (last - before > now) next = Math.min(next, last - before)
    }
    return next
  }
}
