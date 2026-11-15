import {DealerTrust,unevenSupply} from './level8-policy.ts'
import {shortageAccept, shortageFee, feeRamp, rampTimes} from './level7-policy.ts'
import { Level4TradePricing } from './level4-trade-pricing.ts'
import { Level4Pricing } from './level4-pricing.ts'
import { level4Fee } from './level4-fee.ts'
import { LocalMarket } from './market.ts'
import { readFileSync } from 'node:fs'
import { CompetitorModel, chooseMultiplier, scaled, type PricedOption } from './competitor-model.ts'
import { readNote, type NoteRisk } from './notes-risk.ts'
import { readNote as readNote2 } from './notes-risk2.ts'
import type {
  Action, ActionResult, DeskEvent, DeskEventKind, DeskSnapshot, DriverProfile,
  FeeStep, Leg, Order, PriceRequest, QuoteAction, DeliveryOption, Road, StopPlace, StopRef, ForecastEvent, VisitFailedEvent, WorldMap,
  Gig, PostAction,
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
  shortQuote: number
  shortQuoteMinutes: number
  premiumQuote: number
  quoteAdaptUp: number
  quoteAdaptTarget: number
  shortageEscalation: number
  rampStart: number
  rampShare: number
  rampMinutes: number
  waitingAge: number
  minOriginSupply: number
  minDestSupply: number
  minKm: number
  unevenOrigin: number
  unevenDest: number
  unevenThin: number
  thinQuote: number
  thinSupply: number
  waitingHorizon: number
  longSameDayMinutes: number
  longHaulMinutes: number
  longHaulSlack: number
  dayAdapt: number
  dayTarget: number
  dayCutMax: number
  quoteTarget: number
  lateCalm: number
  stopBuffer: number
  offerHome: number
  notesV2: number
  guardTarget: number
  guardSlack: number
  stressBelow: number
  stressSlack: number
  stressFee: number
  stressSpan: number
  fridaySlack: number
  /** 1: price with the competitor model (levels 5-8). 0: today's rule only. */
  modelQuote: number
  modelShadow: number
  modelCost: number
  modelBand: number
  modelMin: number
  bookQuote: number
  bookTarget: number
  feeEase: number
  easeAbove: number
  thinSlack: number
  thinBook: number
  thinScale: number
  trustShare: number
  chainOffers: number
  chainFactor: number
  chainReach: number
  fridayLift: number
  l4Markup: number
  easeBook: number
  easeSlackScale: number
  /** 1: post two cars of different orders as one gig when the first ends where the second starts (levels 7-8). 0: never. */
  pairGigs: number
  pairFactor: number
  pairMinAge: number
  pairWait: number
  pairSafety: number
  pairMaxWait: number
  pairBoth: number
  pairAgain: number
  longStuckMax: number
  longStuckAge: number
  longStuckRoad: number
  staleAfter: number
  staleSlack: number
  staleRoad: number
  quoteJitter: number
  quoteScale: number
  chainBook: number
  chainBookFactor: number
  eveRaise: number
  eveAt: number
  trustInvest: number
  trustInvestShare: number
  trustInvestDays: number
  slotLead: number
  slotWindow: number
  pressureLead: number
}
export const defaults: Config = {
  networkFees: 0,
  level4Model: 0,
  opening: 0.65, minSpread: 0.12, minSlack: 60, rescue: 1.45, escalation: 0.10, interval: 35,
  offerCount: 2, offerDelay: 25, offerFactor: 0.95, bundleFactor: 0.87, quoteFactor: 1.04, sameDayPremium: 0, nextDayPremium: 0, quoteFloor: 0.94, quoteAdapt: 0.2,
  declineUncertain: 1, specialFee: 0.10, marketShock: 0.12, chargeReserveKm: 0, laneAdapt: 0, outagePremium: 0,
  scheduleRise: 0.14, scheduleDelay: 65, dropBump: 0.08, fixedFee: 0,
  minHorizon: 0, maxRoadMinutes: 0, longRoadMinutes: 0, longRoadMinSlack: 0, maxLegs: 2, minUsableSlack: 0, skipPrivatePickup: 0,
  // Shortage-level switches; these values reproduce the round 3 build exactly.
  shortQuote: 0, shortQuoteMinutes: 60, premiumQuote: 0, quoteAdaptUp: 0, quoteAdaptTarget: 0.45, shortageEscalation: 0.55,
  rampStart: 1, rampShare: 0.5, rampMinutes: 0, waitingAge: 0,
  minOriginSupply: 6, minDestSupply: 4, minKm: 18, unevenOrigin: 8, unevenDest: 6, unevenThin: 11, thinQuote: 0, thinSupply: 8,
  waitingHorizon: 0, longSameDayMinutes: 0, longHaulMinutes: 320, longHaulSlack: 0, dayAdapt: 0, dayTarget: 0.45, dayCutMax: 0.18,
  quoteTarget: 0.5, lateCalm: 0, stopBuffer: 0, offerHome: 0,
  notesV2: 0, guardTarget: 0, guardSlack: 1440,
  stressBelow: 0, stressSlack: 1440, stressFee: 0, stressSpan: 0.25, fridaySlack: 0,
  // Competitor model: off by default, which leaves every quote as the rule made it.
  modelQuote: 0, modelShadow: 0.10, modelCost: 1.0, modelBand: 0.15, modelMin: 8,
  // Capacity-aware switches driven by how quickly recent wins found a driver.
  bookQuote: 0, bookTarget: 0.7, feeEase: 0, easeAbove: 0.75,
  // Minutes of pickup slack from which thin-town supply rules no longer apply (0 = they always apply).
  thinSlack: 0, thinBook: 0, thinScale: 0,
  // Share of a dealer's trust headroom taken as a higher price (1 = all of it; less leaves room to win more orders).
  trustShare: 1,
  // Chain offers: when a driver delivers, offer them up to `chainOffers` unbooked pickups that can start now
  // within `chainReach` road minutes, at `chainFactor` of the fee then shown. 0 = off.
  chainOffers: 0, chainFactor: 0.9, chainReach: 30,
  // With fridaySlack set: 0 declines Friday-due orders that have less slack; above 0 quotes them this much dearer instead.
  fridayLift: 0,
  // Level 4 only: multiplies the pricing model's quotes (1 = the model's own price).
  l4Markup: 1,
  // Mirror of the stress guard: while recent wins book at least this fast, the slack demanded of long hauls
  // and thin-town orders is multiplied by easeSlackScale (0 = never relaxed).
  easeBook: 0, easeSlackScale: 0.5,
  // Pair gigs (levels 7-8): car A ends in the town where car B starts, so one driver can move both without the trip
  // home and out again. The pair opens at `pairFactor` of the two single fees. An already posted car joins a pair
  // only after `pairMinAge` minutes open. A pair is split into two single gigs after `pairWait` minutes without a
  // driver, or when either car's last pickup is nearer than `pairSafety` minutes; it is never formed that close.
  // `pairMaxWait` is the longest the driver may wait in the link town for car B. 0 = off: every gig carries one order.
  pairGigs: 0, pairFactor: 0.9, pairMinAge: 10, pairWait: 120, pairSafety: 360, pairMaxWait: 90,
  // 1 = a newly won car may also be the first car of a pair whose second car is an open single gig
  // (0 = a newly won car only joins as the second car, or pairs with another car of the same step).
  pairBoth: 0,
  // How many more times a car may join a pair after its pair timed out without a driver (never with the same
  // partner again). 0 = a car whose pair ended is never paired again.
  pairAgain: 0,
  // Long-haul throttle: while at least `longStuckMax` hauls of more than `longStuckRoad` road minutes, won at least
  // `longStuckAge` minutes ago, still have no driver, no further such haul is quoted. Long hauls that find no driver
  // for most of a day mark a week in which they run late. 0 = off.
  longStuckMax: 0, longStuckAge: 1200, longStuckRoad: 320,
  // Stale step: a gig still open `staleAfter` minutes after it was posted steps up to the fee it would show
  // `staleSlack` minutes before the last pickup, and after twice that long to the fee of half that slack. Only for
  // hauls of at least `staleRoad` road minutes. A gig that nobody takes for half a day does not pay at its fee, and
  // the deadline pressure of its last hours comes too late for a long drive. 0 = no such step.
  staleAfter: 0, staleSlack: 200, staleRoad: 0,
  // Measurement only: every other request (by a hash of its id) is quoted `quoteJitter` higher and the rest that
  // much lower, to measure how the win share reacts to the price. 0 = off.
  quoteJitter: 0,
  // Multiplies every market quote from level 7 up (1 = unchanged).
  quoteScale: 1,
  // Chain offers at booking: when a driver books a gig, offer that driver up to `chainBook` open single gigs that
  // start where the booked gig ends, or end where it starts, at `chainBookFactor` of the fee then shown. The driver
  // is in the app at that moment, and a second gig costs them only the extra time. 0 = off.
  chainBook: 0, chainBookFactor: 0.8,
  // Evening-before step: a gig still open at `eveAt` (minute of the day) on the day before its last pickup day
  // steps up to the fee it would show `eveRaise` minutes before the last pickup, so that drivers who plan the
  // next day that evening or early in the morning see a fee that pays. 0 = no such step.
  eveRaise: 0, eveAt: 1110,
  // Trust investment (level 8): a dealer that sends at least `trustInvestShare` of the requests and has fewer than
  // 25 orders delivered on time or on their way is quoted `trustInvest` lower (scaled by how far it is from 25),
  // through day `trustInvestDays` (0 = Monday). Each on-time order raises what that dealer accepts for the rest of
  // the week. 0 = off.
  trustInvest: 0, trustInvestShare: 0.04, trustInvestDays: 1,
  // Private seller's slot (a pickup at a private address in a short window). With `slotLead` above 0 such a car is
  // judged by the minutes left to find a driver before the slot ends, not by the length of the slot, and it needs
  // at least `slotWindow` usable minutes of the slot. 0 = the slot is judged like any other pickup window.
  slotLead: 0, slotWindow: 120,
  // Minutes by which the deadline pressure of a fee schedule is moved earlier, so that the top fee is reached while
  // a driver can still reach the pickup. 0 = the pressure ends at the last pickup minute.
  pressureLead: 0,
}
export const wakeEvents: DeskEventKind[] = ['price_request', 'order_won', 'order_changed', 'order_cancelled', 'deadline_close', 'gig_expired']
export type DispatchLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export const wakeEventsFor = (level: DispatchLevel, config?: Partial<Config>): DeskEventKind[] => {
  const base: DeskEventKind[] = level >= 5 ? [...wakeEvents, 'gig_dropped', 'no_show', 'forecast', 'release', 'visit_failed'] :
    level >= 2 ? [...wakeEvents, 'gig_dropped', 'no_show'] : wakeEvents
  // Chain offers must go out the moment a driver hands over a car, so a delivery wakes the runner.
  const more: DeskEventKind[] = [...(config?.chainOffers ? ['delivered' as const] : []), ...(config?.chainBook ? ['gig_booked' as const] : [])]
  return more.length ? [...base, ...more] : base
}
const DAY = 1440
const allDrivers = { experienced: false, manualLicence: false }
type Car = { orderId: string; leg: number }
type LiveGig = { orderId: string; leg: number; since: number; fee: number; open: boolean; schedule: FeeStep[]; legs: number[]; lastBooking?: number; bumpFloor?: number
  /** Pair gig: the second car, from another order. `orderId`, `leg` and `legs` describe the first car. */
  partner?: Car
  /** Once a pair gig, now one car. If it is open again it is withdrawn and the car is posted alone. */
  exPair?: boolean }
type PairPlan = { lastA: number; start: number; wait: number }
/** The road minutes of a pair gig stay this far under the 12-hour rule (720). */
const PAIR_ROAD_MINUTES = 700
/** A pair is formed only if the safety rule leaves it at least this long on the board. */
const PAIR_LIFE = 60
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

/** True when minute `t` is inside the stop's window and its stated opening hours (same calendar as lastOpen). */
function openAt(stop: StopPlace, t: number): boolean {
  if (t < stop.window.from || t > stop.window.to) return false
  if (!stop.hours) return true
  const day = Math.floor(t / DAY), weekday = day % 7
  const hours = weekday === 5 ? stop.hours.saturday : weekday < 5 && stop.hours.weekdays.includes(weekday) ? stop.hours : null
  return !!hours && t >= day * DAY + hours.opens && t <= day * DAY + hours.closes
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
  private dayResults = { day: -1, won: 0, count: 0 }
  private guard = { done: 0, late: 0, picked: new Set<string>(), at: -1, tripped: false }
  private wins = new Map<string, { wonAt: number; bookedAt: number | null }>()
  private freed: { driver: string; place: string; at: number }[] = []
  private justBooked: { driver: string; gigId: string; at: number }[] = []
  private chainSent = new Map<string, number[]>()
  private driverById?: Map<string, DriverProfile>
  private winOrder: string[] = []
  private bookable = { at: -1, share: 1 }
  private notes = new Map<string, { at: number; risk: NoteRisk }>()
  private forecasts: ForecastEvent[] = []
  private corrections = new Map<string, { manual?: boolean; plates?: boolean; from?: number; failures: number }>()
  private changed = new Set<string>()
  private splitOrders = new Set<string>()
  /** Pair gigs are formed only when the switch is on at levels 7-8. Existing pair gigs are always handled. */
  private pairOn = false
  /** Orders that left a pair, had a failed visit or whose pair post was refused: never paired (again). */
  private noPair = new Set<string>()
  /** With pairAgain: pairs already tried, and how many pairs each order has been in. */
  private pairTried = new Set<string>()
  private pairTries = new Map<string, number>()
  /** Pair gigs to withdraw at the next step: one of their cars is still held by another live gig. */
  private pairDue = new Set<string>()
  /** Cars of a pair gig withdrawn in the last step, until they are posted alone: they still count as waiting cars. */
  private pairLimbo = new Map<string, Car>()
  /** The minute by which the runner must step again after a pair post or a pair split. */
  private pairWake = -1
  /** Test hook: called for every pair gig formed. */
  pairTrace?: (info: { now: number; a: Car & { gigId?: string }; b: Car; singles: [FeeStep[], FeeStep[]]; schedule: FeeStep[]; start: number; wait: number }) => void
  private localMarket: LocalMarket
  private map: WorldMap
  private batchCounts = new Map<string, number>()
  private competitor?: CompetitorModel
  private modelQuotes = new Map<string, { x: number; rule: number }>()
  /** Test hook: called for every request the competitor model looks at. */
  modelTrace?: (info: { requestId: string; multiplier: number; m: number; s: number; outcomes: number; options: { kind: string; rule: number; floor: number; price: number }[] }) => void
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
    if (![0, 1].includes(this.config.modelQuote)) throw new Error('modelQuote must be 0 or 1')
    if (this.config.modelQuote && level >= 5) this.competitor = this.newCompetitor()
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
    if (![0, 1].includes(this.config.pairGigs) || this.config.pairFactor <= 0 || this.config.pairFactor > 1) throw new Error('Invalid pair gig settings')
    this.pairOn = this.config.pairGigs === 1 && level >= 7
    if (![0, 1].includes(this.config.pairBoth)) throw new Error('pairBoth must be 0 or 1')
    if (![0, 1, 2, 3].includes(this.config.pairAgain)) throw new Error('pairAgain must be 0 to 3')
    if (!(this.config.staleAfter >= 0) || !(this.config.staleSlack > 0) || !(this.config.staleRoad >= 0)) throw new Error('Invalid stale settings')
    if (!(this.config.longStuckMax >= 0) || !(this.config.longStuckAge >= 0) || !(this.config.longStuckRoad >= 0)) throw new Error('Invalid long-haul throttle settings')
    if (!(this.config.quoteJitter >= 0 && this.config.quoteJitter <= 0.3) || !(this.config.quoteScale > 0.5 && this.config.quoteScale < 2)) throw new Error('Invalid quote jitter or scale')
    if (![0, 1, 2, 3].includes(this.config.chainBook) || !(this.config.chainBookFactor > 0 && this.config.chainBookFactor <= 1.2)) throw new Error('Invalid chainBook settings')
    if (!(this.config.eveRaise >= 0) || !(this.config.eveAt >= 0 && this.config.eveAt < DAY) || !(this.config.trustInvest >= 0 && this.config.trustInvest <= 0.4) ||
        !(this.config.trustInvestShare >= 0) || !(this.config.trustInvestDays >= 0)) throw new Error('Invalid evening or trust settings')
    if (!(this.config.slotLead >= 0) || !(this.config.slotWindow >= 0) || !(this.config.pressureLead >= 0) || this.config.pressureLead > 300) throw new Error('Invalid slot or pressure settings')
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
    const risk = (this.config.notesV2 ? readNote2 : readNote)(request, i, notBefore)
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
      if (this.level >= 7 && this.config.stopBuffer > 0 && indices.length === 1) {
        // Drivers plan to arrive at the last allowed minute. End our own stop windows a little earlier.
        const buffer = this.config.stopBuffer, road = this.road(car)
        const dropBy = Math.min(car.delivery.window.to, order.deadline) - buffer
        if (road && !delivery.window && !car.delivery.privateAddress && dropBy > this.now + road.minutes + 60 && dropBy > car.delivery.window.from)
          delivery.window = { from: car.delivery.window.from, to: dropBy }
        const collectBy = Math.min(car.pickup.window.to, order.lastPickupAt - buffer)
        if (!pickup.window && !car.pickup.privateAddress && collectBy > this.now + 60 && collectBy > car.pickup.window.from)
          pickup.window = { from: car.pickup.window.from, to: collectBy }
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
    this.noPair.add(event.orderId)
    const gig = this.gigs.get(event.gigId)
    // Pair gig: the driver continues with the other car, which keeps the gig. The failed car is posted alone.
    if (gig?.partner) this.unpair(event.gigId, gig, event.orderId)
    else if (!gig || gig.legs.length === 1) this.forgetGig(event.gigId)
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
    if (this.config.longSameDayMinutes > 0 && first.kind === 'same_day' && request.legs.some(leg => (this.road(leg)?.minutes ?? 0) > this.config.longSameDayMinutes)) return false
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
    // A private seller's slot is short by nature. With slotLead, the time left to find a driver decides.
    const slot = (leg: Leg) => this.config.slotLead > 0 && this.level >= 7 && leg.pickup.privateAddress && leg.pickup.window.to - leg.pickup.window.from <= 240
    if (this.config.minUsableSlack > 0 && request.legs.some((leg, i) => {
      const usable = legLatest[i]! - Math.max(request.respondBy, plans[i]?.pickup.from ?? leg.pickup.window.from)
      return slot(leg) ? usable < this.config.slotWindow || legLatest[i]! - request.respondBy < this.config.slotLead : usable < this.config.minUsableSlack
    })) return false
    if (this.config.longRoadMinutes > 0 && this.config.longRoadMinSlack > 0 && request.legs.some((leg, i) =>
      (this.road(leg)?.minutes ?? Infinity) > this.config.longRoadMinutes && legLatest[i]! - request.respondBy < this.config.longRoadMinSlack)) return false
    if (this.config.longStuckMax > 0 && this.level >= 7 && request.legs.some(leg => (this.road(leg)?.minutes ?? 0) > this.config.longStuckRoad) &&
        this.longStuck() >= this.config.longStuckMax) return false
    const ease = this.config.easeBook > 0 && this.level >= 5 && this.bookability() >= this.config.easeBook ? this.config.easeSlackScale : 1
    if (this.config.longHaulSlack > 0 && request.legs.some((leg, i) => (this.road(leg)?.minutes ?? 0) > this.config.longHaulMinutes && legLatest[i]! - request.respondBy < this.config.longHaulSlack * ease)) return false
    const latest = Math.min(...legLatest)
    const slack = latest - request.respondBy
    if (slack < this.config.minSlack) return false
    if (this.config.guardTarget > 0 && this.level >= 5 && slack < this.config.guardSlack && this.guardTripped()) return false
    if (this.config.stressBelow > 0 && slack < this.config.stressSlack && this.bookability() < this.config.stressBelow) return false
    // Orders due on Friday evening that miss run into Monday: require more room for them.
    if (this.config.fridaySlack > 0 && !this.config.fridayLift && Math.floor(first.deadline / DAY) === 4 && slack < this.config.fridaySlack) return false
    if (this.level >= 7) {
      const leg=request.legs[0]!, road=this.road(leg)!
      const origin=leg.pickup.placeId, dest=leg.delivery.placeId
      // Open gigs at this pickup town signal scarce drivers. With a patient fee, count only those open for a while.
      const horizon=this.config.waitingHorizon
      const waiting=[...this.gigs.values()].filter(g=>{const o=this.orders.get(g.orderId);return g.open && this.now-g.since>=this.config.waitingAge && o?.legs[g.leg]?.pickup.placeId===origin && (!horizon || o.lastPickupAt-this.now<horizon)}).length
        + (this.pairOn ? this.pairWaiting(origin, horizon) : 0)
      // With enough days before the last pickup, a driver from another town has time to come: lift the supply floors.
      const roomy=this.config.thinSlack>0 && latest-request.respondBy>=this.config.thinSlack*ease && (!this.config.thinBook || this.bookability()>=this.config.thinBook)
      const floor=(value:number)=>roomy?value*this.config.thinScale:value
      if(this.level===8 && !unevenSupply(this.supply.get(origin)??0,this.supply.get(dest)??0,road.minutes,waiting,floor(this.config.unevenOrigin),floor(this.config.unevenDest),floor(this.config.unevenThin)))return false
      if(!shortageAccept(leg,road,latest-(slot(leg)?request.respondBy:Math.max(request.respondBy,leg.pickup.window.from)),this.supply.get(origin)??0,this.supply.get(dest)??0,waiting,
        floor(this.config.minOriginSupply),floor(this.config.minDestSupply),this.config.minKm))return false
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
      if (this.config.l4Markup !== 1) for (const kind of Object.keys(prices) as (keyof typeof prices)[]) prices[kind] = Math.round(prices[kind]! * this.config.l4Markup)
      if (!choices.length) prices[first.kind] = Math.ceil(Math.max(request.referenceFeeCents, first.listPriceCents) * 50)
      return { type: 'quote', requestId: request.id, prices }
    }
    const prices: QuoteAction['prices'] = {}
    const plan: (PricedOption & { kind: DeliveryOption['kind'] })[] = []
    const market = this.marketResults.get(request.dealerId)
    const global = this.marketResults.get('*')
    const winRate = ((market?.won ?? 0) + 8 * (((global?.won ?? 0) + 3) / ((global?.count ?? 0) + 6))) / ((market?.count ?? 0) + 8)
    const localAdjustment = this.level >= 5 ? this.localMarket.adjustment(request, this.level, this.config.laneAdapt, this.config.outagePremium) : 0
    const crowd = this.level >= 6 && request.batchId ? this.batchCounts.get(request.batchId) ?? 0 : 0
    const lift = this.level >= 7 ? this.quoteLift(request, global) : 0
    // One-sided cut inside a day whose win share collapses (a price war or a cheap competitor day).
    const today = this.dayResults.day === Math.floor(request.arrivedAt / DAY) ? this.dayResults : { won: 0, count: 0 }
    const dayShare = (today.won + 12 * this.config.dayTarget) / (today.count + 12)
    const bookAdj = this.config.bookQuote && this.level >= 5 ? this.config.bookQuote * clamp(this.config.bookTarget - this.bookability(), -0.15, 0.3) : 0
    const dayCut = this.config.dayAdapt ? -Math.min(this.config.dayCutMax, this.config.dayAdapt * Math.max(0, this.config.dayTarget - dayShare)) : 0
    const invest = this.trustInvestment(request)
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
      const factor = this.config.quoteFactor + bookAdj + dayCut + this.config.quoteAdapt * (winRate - this.config.quoteTarget) + 0.08 * urgency + premium + hazard / 2 + localAdjustment + this.config.marketShock * clamp((crowd - 5) / 15, 0, 1) - invest
      const cost = request.referenceFeeCents * (this.config.quoteFloor + scarcity + 0.16 * urgency + hazard)
      const quoted = Math.max(cost, option.listPriceCents * factor * (1 + this.config.trustShare * ((this.trust?.factor(request.dealerId)??1) - 1)), 1)
      const tightFriday = this.config.fridayLift > 0 && this.config.fridaySlack > 0 && Math.floor(option.deadline / DAY) === 4 && latest - request.respondBy < this.config.fridaySlack
      const up = lift + (tightFriday ? this.config.fridayLift : 0)
      prices[option.kind] = Math.round(up ? quoted * (1 + up) : quoted)
      if (this.level >= 7 && (this.config.quoteJitter > 0 || this.config.quoteScale !== 1)) {
        let h = 0; for (const ch of request.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
        const sign = this.config.quoteJitter > 0 ? ((h >>> 3) % 2 ? 1 : -1) : 0
        prices[option.kind] = Math.max(1, Math.round(prices[option.kind]! * this.config.quoteScale * (1 + sign * this.config.quoteJitter)))
      }
      if (this.competitor) plan.push({ kind: option.kind, p0: prices[option.kind]!, floor: cost,
        unit: request.referenceFeeCents * (this.config.modelCost + this.config.modelShadow + hazard + scarcity),
        list: option.listPriceCents * (this.trust?.factor(request.dealerId) ?? 1) })
    }
    if (!Object.keys(prices).length) {
      prices[first.kind] = Math.ceil(Math.max(request.referenceFeeCents, first.listPriceCents) * 50)
    } else {
      this.marketQuotes.add(request.id)
      if (this.competitor) this.modelPrices(request, prices, plan)
    }
    return { type: 'quote', requestId: request.id, prices }
  }

  private newCompetitor() {
    const lanes = JSON.parse(readFileSync(new URL('./competitor-lanes.json', import.meta.url), 'utf8'))
    return new CompetitorModel(lanes.families[this.level >= 7 ? '78' : '56'], this.level, (from, to) => this.roads.get(lane(from, to))?.km ?? 100)
  }

  /** Move the rule's prices of one request by a common factor chosen by the competitor model, and remember what was quoted. */
  private modelPrices(request: PriceRequest, prices: QuoteAction['prices'], plan: (PricedOption & { kind: DeliveryOption['kind'] })[]) {
    const model = this.competitor
    if (!model || !plan.length) return
    const rule = Math.min(...plan.map(o => Math.log(o.p0 / o.list)))
    const { m, s } = model.threshold(request, undefined, rule)
    const multiplier = model.count >= this.config.modelMin ? chooseMultiplier(plan, m, s, this.config.modelBand) : 1
    if (multiplier !== 1) {
      // Options come fastest first; keep a faster option at least as dear as a slower one where the rule had it so.
      const ordered = plan.every((o, i) => !i || plan[i - 1]!.p0 >= o.p0)
      let slower = 0
      for (let i = plan.length - 1; i >= 0; i--) {
        const price = ordered ? Math.max(scaled(plan[i]!, multiplier), slower) : scaled(plan[i]!, multiplier)
        prices[plan[i]!.kind] = slower = price
      }
    }
    const x = Math.min(...plan.map(o => Math.log(prices[o.kind]! / o.list)))
    this.modelQuotes.set(request.id, { x, rule })
    this.modelTrace?.({ requestId: request.id, multiplier, m, s, outcomes: model.count,
      options: plan.map(o => ({ kind: o.kind, rule: o.p0, floor: o.floor, price: prices[o.kind]! })) })
  }

  /** Long hauls won at least `longStuckAge` minutes ago that still have no driver and are not collected. */
  private longStuck() {
    let stuck = 0
    for (const order of this.orders.values()) {
      const won = this.wins.get(order.id)
      if (!won || this.now - won.wonAt < this.config.longStuckAge || this.guard.picked.has(order.id)) continue
      for (const [i, leg] of order.legs.entries()) {
        if (order.deliveredAt[i] != null || !((this.road(leg)?.minutes ?? 0) > this.config.longStuckRoad)) continue
        const gig = this.gigs.get(this.assigned.get(carKey(order.id, i)) ?? '')
        if (!gig || gig.open) { stuck++; break }
      }
    }
    return stuck
  }

  /** Quote cut for a large dealer that is still short of 25 on-time orders, counting its orders on their way. */
  private trustInvestment(request: PriceRequest) {
    const k = this.config.trustInvest
    if (!k || !this.trust || Math.floor(request.arrivedAt / DAY) > this.config.trustInvestDays) return 0
    let fromDealer = 0
    for (const r of this.requests.values()) if (r.dealerId === request.dealerId) fromDealer++
    if ((fromDealer + 1) / (this.requests.size + 25) < this.config.trustInvestShare) return 0
    let coming = 0
    for (const o of this.orders.values()) if (o.dealerId === request.dealerId && o.deliveredAt.some(at => at == null)) coming++
    const count = Math.round((this.trust.factor(request.dealerId) - 1) * 100) + coming
    return k * Math.max(0, 1 - count / 25)
  }

  /** Shortage-level quote switches. Each is zero by default, which leaves the quote unchanged. */
  /** Share of the last 40 matured wins that got a first driver within an hour: an early sign of scarce drivers. */
  private bookability() {
    if (this.bookable.at === this.now) return this.bookable.share
    let n = 0, fast = 0
    for (let i = this.winOrder.length - 1; i >= 0 && n < 40; i--) {
      const w = this.wins.get(this.winOrder[i]!)!
      if (this.now - w.wonAt < 60) continue
      n++
      if (w.bookedAt !== null && w.bookedAt - w.wonAt <= 60) fast++
    }
    this.bookable = { at: this.now, share: (fast + 7) / (n + 10) }
    return this.bookable.share
  }

  /** On-time guard: true while the week's projected late share is above 1 - guardTarget. It counts orders
   * already refunded as late and orders whose last pickup has passed with the car still at the pickup. */
  private guardTripped() {
    if (this.guard.at === this.now) return this.guard.tripped
    let doomed = 0
    for (const o of this.orders.values()) if (o.lastPickupAt < this.now && !this.guard.picked.has(o.id)) doomed++
    const share = (this.guard.late + doomed + 0.9) / (this.guard.done + this.orders.size + 30)
    this.guard.at = this.now
    return this.guard.tripped = share > 1 - this.config.guardTarget
  }

  private quoteLift(request: PriceRequest, global: {won: number; count: number} | undefined) {
    const {shortQuote, shortQuoteMinutes, premiumQuote, quoteAdaptUp, quoteAdaptTarget, thinQuote, thinSupply} = this.config
    let lift = 0
    if (thinQuote && thinSupply > 0) {
      // Towns with few drivers nearby cost more to serve and the competitor is dearer there too.
      const thinnest = Math.min(...request.legs.flatMap(leg => [this.supply.get(leg.pickup.placeId) ?? 0, this.supply.get(leg.delivery.placeId) ?? 0]))
      lift += thinQuote * clamp((thinSupply - thinnest) / thinSupply, 0, 1)
    }
    if (shortQuote && request.legs.every(leg => (this.road(leg)?.minutes ?? Infinity) < shortQuoteMinutes)) lift += shortQuote
    if (premiumQuote && request.legs.some(leg => leg.car.premium)) lift += premiumQuote
    if (quoteAdaptUp) {
      const share = ((global?.won ?? 0) + 3) / ((global?.count ?? 0) + 6)
      lift += quoteAdaptUp * Math.max(0, share - quoteAdaptTarget)
    }
    return lift
  }

  private result(id: string, won: boolean) {
    this.level4Pricing?.observe(id, won)
    if (this.level < 4 || !this.marketQuotes.delete(id)) return
    const request = this.requests.get(id)
    if (!request) return
    if (this.level >= 5) this.localMarket.record(request, won)
    const modelled = this.modelQuotes.get(id)
    if (modelled) {
      this.modelQuotes.delete(id)
      this.competitor?.observe(request, modelled.x, won, modelled.rule)
    }
    const day = Math.floor(request.respondBy / DAY)
    if (day !== this.dayResults.day) this.dayResults = { day, won: 0, count: 0 }
    this.dayResults.won += Number(won); this.dayResults.count++
    for (const key of [request.dealerId, '*']) {
      const prev = this.marketResults.get(key) ?? { won: 0, count: 0 }
      const decay = key === '*' ? 0.98 : 0.9
      this.marketResults.set(key, {won: prev.won * decay + Number(won), count: prev.count * decay + 1})
    }
  }

  private fee(order: Order, legIndex: number, since: number, at = this.now, slackOverride?: number): number {
    const leg = order.legs[legIndex]!
    const request = this.requests.get(order.id)
    const typical = request?.referenceFeeCents ?? order.priceCents
    const weights = order.legs.map(l => 30 + (this.road(l)?.minutes ?? 90))
    const share = weights[legIndex]! / weights.reduce((sum, value) => sum + value, 0)
    const slack = slackOverride ?? Math.min(this.operationalLatest(leg, request, legIndex, order.deadline, this.now), order.lastPickupAt) - at
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
      if (road) {
        const full = shortageFee(leg,road,since,at,slack+at,this.config.opening,this.config.escalation,this.supply.get(leg.pickup.placeId)??0,
          this.config.specialFee*(Number(handling.plates)+Number(handling.charge)+.7*Number(leg.car.premium)+.8*Number(handling.snowy)),
          this.config.shortageEscalation)
        const stressed = this.config.stressFee > 0 && this.config.stressBelow > 0
          ? Math.round(full * (1 + this.config.stressFee * clamp((this.config.stressBelow - this.bookability()) / this.config.stressSpan, 0, 1))) : full
        if (this.config.feeEase > 0) {
          const eased = Math.max(1, Math.round(stressed * (1 - this.config.feeEase * clamp((this.bookability() - this.config.easeAbove) / 0.2, 0, 1))))
          if (!(this.config.rampStart < 1)) return eased
          return Math.max(1, Math.round(eased * feeRamp(road, since, at, slack + at, this.config.rampStart, this.config.rampShare, this.config.rampMinutes)))
        }
        if (!(this.config.rampStart < 1)) return stressed
        return Math.max(1, Math.round(stressed * feeRamp(road, since, at, slack + at, this.config.rampStart, this.config.rampShare, this.config.rampMinutes)))
      }
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
    if (this.level >= 2 && this.config.lateCalm > 0 && last <= at) {
      // The car is already late. Open near a normal fee and climb to the rescue fee over `lateCalm` minutes,
      // instead of opening at the maximum, which drivers take within minutes.
      const calm = Math.max(floor, Math.min(first, this.fee(order, i, since, at, 300)))
      const late = [{ at, feeCents: calm }]
      for (let k = 1; k <= 4; k++) {
        const fee = Math.round(calm + (first - calm) * k / 4)
        if (fee > late.at(-1)!.feeCents) late.push({ at: at + Math.round(this.config.lateCalm * k / 4), feeCents: fee })
      }
      return late
    }
    const reviews = this.level4Pricing || this.level3Network || this.level >= 7 ? [420, 330, 255, 180, 120, 60, 0] : [180, 120, 60, 0]
    // With pressureLead the pressure steps are timed against an earlier minute, and so is the fee at each step.
    // From level 5 (was 7): the lower levels escalate in the last three hours only, where the last hour finds no driver.
    const lead = this.level >= 5 ? this.config.pressureLead : 0
    const times = [since + this.config.scheduleDelay, since + this.config.scheduleDelay * 2,
      ...reviews.map(minutes => last - lead - minutes)]
    const rampRoad = this.level >= 7 && this.config.rampStart < 1 ? this.road(order.legs[i]!) : undefined
    if (rampRoad) times.push(...rampTimes(rampRoad, since, last, this.config.rampStart, this.config.rampShare, this.config.rampMinutes))
    // Evening-before step: from `eve` on, the fee is at least the fee of `eveRaise` minutes before the last pickup.
    const eveRaise = this.level >= 7 ? this.config.eveRaise : 0
    const eve = eveRaise > 0 && Number.isFinite(last) ? (Math.floor(last / DAY) - 1) * DAY + this.config.eveAt : Infinity
    const eveFee = (t: number) => eveRaise > 0 && t >= eve && last - t > eveRaise ? this.fee(order, i, since, t, eveRaise) : 0
    if (eve > at && eve < last) times.push(eve)
    // Stale steps: at `staleAfter` and twice `staleAfter` minutes of age.
    const staleAfter = this.level >= 7 && this.config.staleAfter > 0 && (this.road(order.legs[i]!)?.minutes ?? 0) >= this.config.staleRoad ? this.config.staleAfter : 0
    const staleFee = (t: number) => !staleAfter || t - since < staleAfter ? 0
      : this.fee(order, i, since, t, Math.min(Math.max(0, last - t), t - since < 2 * staleAfter ? this.config.staleSlack : this.config.staleSlack / 2))
    if (staleAfter) for (const t of [since + staleAfter, since + 2 * staleAfter]) if (t > at && t < last) times.push(t)
    const steps = [{ at, feeCents: Math.max(lead ? Math.max(first, this.fee(order, i, since, at, Math.max(0, last - lead - at))) : first, eveFee(at), staleFee(at)) }]
    for (const t of [...new Set(times)].filter(t => Number.isFinite(t) && t > at && t <= last).sort((a, b) => a - b)) {
      const fee = Math.max(lead ? this.fee(order, i, since, t, Math.max(0, last - lead - t)) : this.fee(order, i, since, t), eveFee(t), staleFee(t))
      if (fee > steps.at(-1)!.feeCents) steps.push({ at: t, feeCents: fee })
    }
    return steps
  }

  private registerDrop(gig: LiveGig) {
    // A pair gig gets no bump: it is never repriced, and its timeout splits it.
    if (this.level < 2 || !gig.lastBooking || gig.partner || gig.exPair) return
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
    if (gig.partner) {
      const key = carKey(gig.partner.orderId, gig.partner.leg)
      if (this.assigned.get(key) === id) this.assigned.delete(key)
    }
    this.pairDue.delete(id)
    this.gigs.delete(id)
  }

  /** One car leaves a pair gig: delivered, cancelled or failed. The gig lives on as a plain single gig for the
   * other car while that car still needs it. Otherwise it is forgotten. Neither order is paired again. */
  private unpair(id: string, gig: LiveGig, orderId: string) {
    const partner = gig.partner!
    const first: Car = { orderId: gig.orderId, leg: gig.leg }
    const [gone, kept] = partner.orderId === orderId ? [partner, first] : [first, partner]
    this.noPair.add(first.orderId); this.noPair.add(partner.orderId)
    const order = this.orders.get(kept.orderId)
    if (gone.orderId !== orderId || !order || order.deliveredAt[kept.leg] != null) { this.forgetGig(id); return }
    const key = carKey(gone.orderId, gone.leg)
    if (this.assigned.get(key) === id) this.assigned.delete(key)
    gig.orderId = kept.orderId; gig.leg = kept.leg; gig.legs = [kept.leg]
    delete gig.partner; delete gig.bumpFloor
    gig.exPair = true
  }

  private lastPickup(order: Order, i: number) {
    return Math.min(this.operationalLatest(order.legs[i]!, this.requests.get(order.id), i, order.deadline, this.now), order.lastPickupAt)
  }

  /** Second cars of open pair gigs, and cars between a pair split and their single post, that wait at `origin`. */
  private pairWaiting(origin: string, horizon: number) {
    const waits = (car: Car) => {
      const o = this.orders.get(car.orderId)
      return !!o && o.legs[car.leg]?.pickup.placeId === origin && (!horizon || o.lastPickupAt - this.now < horizon)
    }
    let count = 0
    for (const g of this.gigs.values()) if (g.partner && g.open && this.now - g.since >= this.config.waitingAge && waits(g.partner)) count++
    for (const [key, car] of this.pairLimbo) if (!this.gigs.has(this.assigned.get(key) ?? '') && waits(car)) count++
    return count
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
        if (event.kind === 'order_won') { this.result(event.order.id, true); this.wins.set(event.order.id, { wonAt: event.at, bookedAt: null }); this.winOrder.push(event.order.id) }
        this.orders.set(event.order.id, structuredClone(event.order))
        break
      case 'order_cancelled':
        this.orders.delete(event.orderId)
        for (const gig of event.gigs) {
          const live = this.gigs.get(gig.gigId)
          // Pair gig. withdrawn/released: the gig is gone and the other car is posted alone.
          // shortened/continues: a driver holds the gig and goes on with the other car, which keeps it.
          if (live?.partner && (gig.outcome === 'shortened' || gig.outcome === 'continues')) { this.unpair(gig.gigId, live, event.orderId); continue }
          if (live?.partner) { this.noPair.add(live.orderId); this.noPair.add(live.partner.orderId) }
          this.forgetGig(gig.gigId)
        }
        break
      case 'gig_booked': case 'gig_started': case 'no_show': case 'gig_dropped': {
        const gig = this.gigs.get(event.gigId)
        if (gig) {
          gig.open = event.kind === 'no_show' || event.kind === 'gig_dropped'
          if (event.kind === 'gig_booked' && this.config.chainBook > 0) this.justBooked.push({ driver: event.driverId, gigId: event.gigId, at: event.at })
          if (event.kind === 'gig_booked') {
            gig.lastBooking = event.feeCents
            if (this.level >= 3) this.gigDriver.set(event.gigId, event.driverId)
            const win = this.wins.get(gig.orderId)
            if (win && win.bookedAt === null) win.bookedAt = event.at
            const second = gig.partner && this.wins.get(gig.partner.orderId)
            if (second && second.bookedAt === null) second.bookedAt = event.at
          }
          if (gig.open) this.registerDrop(gig)
        }
        break
      }
      case 'visit_failed':
        if (this.level >= 5) this.failed(event)
        else this.forgetGig(event.gigId)
        break
      case 'gig_expired': {
        const gig = this.gigs.get(event.gigId)
        // An expired pair is not formed again: both cars are posted alone.
        if (gig?.partner) { this.noPair.add(gig.orderId); this.noPair.add(gig.partner.orderId) }
        this.forgetGig(event.gigId)
        break
      }
      case 'picked_up': this.guard.picked.add(event.orderId); break
      case 'ledger':
        if (event.line.kind === 'revenue' && event.line.orderId) { this.guard.done++; this.guard.picked.delete(event.line.orderId) }
        if (event.line.kind === 'late_refund') this.guard.late++
        break
      case 'delivered': {
        const driver = this.gigDriver.get(event.gigId)
        if (driver) this.recent.set(driver, {at: event.at, place: event.placeId})
        if (driver && this.config.chainOffers > 0) this.freed.push({ driver, place: event.placeId, at: event.at })
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
          // Pair gig: the other car keeps the gig until it is delivered too.
          if (gig?.partner) this.unpair(event.gigId, gig, order.id)
          else if (!gig || gig.legs.every(i => order.deliveredAt[i] !== null)) this.forgetGig(event.gigId)
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
    this.noPair.clear(); this.pairTried.clear(); this.pairTries.clear(); this.pairDue.clear(); this.pairLimbo.clear(); this.pairWake = -1
    const failedVisits = new Map<string, Set<string>>()
    for (const event of history) if (event.kind === 'visit_failed')
      failedVisits.set(event.gigId, (failedVisits.get(event.gigId) ?? new Set<string>()).add(carKey(event.orderId, event.leg)))
    this.localMarket = new LocalMarket(this.map); this.batchCounts.clear()
    // The competitor model starts again: quoted ratios are not in the history, so it cannot be rebuilt exactly.
    this.modelQuotes.clear(); if (this.competitor) this.competitor = this.newCompetitor()
    this.recent.clear(); this.gigDriver.clear(); this.marketQuotes.clear(); this.marketResults.clear(); this.dayResults = { day: -1, won: 0, count: 0 }
    this.wins.clear(); this.winOrder = []; this.bookable = { at: -1, share: 1 }
    this.freed = []; this.justBooked = []; this.chainSent.clear()
    this.guard = { done: 0, late: 0, picked: new Set<string>(), at: -1, tripped: false }
    for (const event of history) {
      if (event.kind === 'picked_up') this.guard.picked.add(event.orderId)
      if (event.kind === 'ledger' && event.line.kind === 'revenue' && event.line.orderId) this.guard.done++
      if (event.kind === 'ledger' && event.line.kind === 'late_refund') this.guard.late++
    }
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
      if (new Set(gig.stops.map(s => s.orderId)).size > 1) { this.restorePair(gig, failedVisits.get(gig.id)); continue }
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

  /** A snapshot gig whose stops name two orders. It keeps every car that still needs it, so none is posted twice. */
  private restorePair(gig: Gig, failed?: Set<string>) {
    const cars: Car[] = []
    for (const stop of gig.stops) {
      if (!cars.some(c => c.orderId === stop.orderId && c.leg === stop.leg)) cars.push({ orderId: stop.orderId, leg: stop.leg })
    }
    const ended = ['withdrawn', 'done'].includes(gig.status)
    // A car is still with the gig unless it is delivered, cancelled or had a failed visit on this gig.
    const live = ended ? [] : cars.filter(car => {
      const order = this.orders.get(car.orderId)
      return !!order && order.deliveredAt[car.leg] == null && !failed?.has(carKey(car.orderId, car.leg))
    })
    // Orders of a pair that ended or lost a car are not paired again.
    if (live.length < cars.length) for (const car of cars) this.noPair.add(car.orderId)
    const [first, second] = live
    if (!first) return
    this.gigs.set(gig.id, { orderId: first.orderId, leg: first.leg, legs: [first.leg], since: gig.postedAt, fee: gig.feeCents, open: gig.status === 'open', schedule: gig.schedule,
      ...(second ? { partner: second } : { exPair: true }) })
    for (const car of live.slice(0, 2)) this.assigned.set(carKey(car.orderId, car.leg), gig.id)
    if (gig.driverId) this.gigDriver.set(gig.id, gig.driverId)
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
    this.splitPairs(actions)
    this.changed.clear()
    for (const order of this.orders.values()) for (const [i, leg] of order.legs.entries()) {
      if (order.deliveredAt[i] != null) continue
      const key = carKey(order.id, i)
      const gigId = this.assigned.get(key)
      const gig = gigId ? this.gigs.get(gigId) : undefined
      if (gig && !gig.open || (this.retryAt.get(key) ?? 0) > now) continue
      const bundle = !this.splitOrders.has(order.id) && this.canBundle(order.legs) && order.deliveredAt.every(at => at == null)
      if (bundle && i > 0 || gig && gig.leg !== i) continue
      // A pair gig is handled once, at its first car.
      if (gig?.partner && gig.orderId !== order.id) continue
      if (this.level >= 2 && gig && gigId) {
        if (actions.some(a => a.type === 'withdraw' && a.gigId === gigId)) continue
        if (this.level >= 3 && this.config.offerCount) this.directOffers(actions, gigId, gig, order)
        // A pair gig keeps its pair schedule: no single-car reprice. Its timeout answers pressure.
        if (this.config.fixedFee || gig.legs.length > 1 || gig.partner) continue
        const listed = gig.schedule.findLast(step => step.at <= now)?.feeCents ?? gig.fee
        const floor = gig.bumpFloor ?? 0
        // The native schedule already handles changing urgency. Only reprice after a
        // drop, or if a changed deadline makes the current schedule materially too low.
        const last = Math.min(this.operationalLatest(leg, this.requests.get(order.id), i, order.deadline, this.now), order.lastPickupAt)
        const nextPlanned = gig.schedule.find(step => step.at > now)
        const lateRaise = last - now <= 180 && (!nextPlanned || nextPlanned.at > last || nextPlanned.at - now > 60)
        const climbing = this.level >= 2 && this.config.lateCalm > 0 && last <= now && gig.schedule.at(-1)!.feeCents >= this.fee(order, i, gig.since) * 0.99
        if (floor > listed || (lateRaise && !climbing && this.fee(order, i, gig.since) > listed * 1.08)) {
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
    if (this.config.chainOffers > 0 && this.level >= 3) { for (const free of this.freed) this.chainOffers(actions, free); this.freed = [] }
    if (this.config.chainBook > 0 && this.level >= 3) { for (const booked of this.justBooked) this.chainBookOffers(actions, booked); this.justBooked = [] }
    if (this.pairOn) this.formPairs(actions)
    return actions
  }

  /** End pair gigs that waited too long, are getting tight, changed, lost their geometry or collide with another
   * gig, and one-car gigs left over from a pair that are open again. Each gets one withdraw. Once the withdraw is
   * recorded the cars have no gig, and the next step, at most a minute later, posts each alone. */
  private splitPairs(actions: Action[]) {
    this.pairLimbo.clear()
    const now = this.now
    // With the switch off (a restart on other settings), open pair gigs end at once.
    const wait = this.pairOn ? this.config.pairWait : 0
    for (const [id, gig] of this.gigs) {
      if (!gig.open || !(gig.partner || gig.exPair)) continue
      const cars: Car[] = [{ orderId: gig.orderId, leg: gig.leg }, ...(gig.partner ? [gig.partner] : [])]
      const withdrawn = actions.some(a => a.type === 'withdraw' && a.gigId === id)
      let split = withdrawn || !gig.partner || this.pairDue.has(id) || now - gig.since >= wait
      // Only a plain timeout leaves the cars free to pair again, each with another partner.
      const timedOut = !withdrawn && !!gig.partner && !this.pairDue.has(id) && this.pairOn && this.config.pairAgain > 0
      if (!split) {
        const [a, b] = cars.map(car => this.orders.get(car.orderId)), [ia, ib] = cars.map(car => car.leg) as [number, number]
        split = !a || !b || !a.legs[ia] || !b.legs[ib] || a.deliveredAt[ia] != null || b.deliveredAt[ib] != null ||
          this.changed.has(a.id) || this.changed.has(b.id) || a.legs[ia]!.delivery.placeId !== b.legs[ib]!.pickup.placeId ||
          !(this.lastPickup(a, ia) - now >= this.config.pairSafety) || !(this.lastPickup(b, ib) - now >= this.config.pairSafety)
      }
      if (!split) continue
      if (!withdrawn) actions.push({ type: 'withdraw', gigId: id })
      const again = timedOut && now - gig.since >= wait && cars.length === 2 && cars.every(car => {
        const order = this.orders.get(car.orderId)
        return !!order && order.deliveredAt[car.leg] == null && !this.changed.has(order.id) && (this.pairTries.get(car.orderId) ?? 0) <= this.config.pairAgain &&
          this.lastPickup(order, car.leg) - now >= this.config.pairSafety + PAIR_LIFE
      })
      if (again) this.pairTried.add(cars.map(car => car.orderId).sort().join('|'))
      for (const car of cars) { if (!again) this.noPair.add(car.orderId); this.pairLimbo.set(carKey(car.orderId, car.leg), car) }
      this.pairWake = now + 1
    }
  }

  /** A conservative plan for one driver: car A to the link town, then car B from there. Every visit falls inside
   * its planned window and the site's stated hours. Null when no such plan exists. */
  private pairPlan(oa: Order, ia: number, ob: Order, ib: number): PairPlan | null {
    const la = oa.legs[ia]!, lb = ob.legs[ib]!
    if (oa.id === ob.id || la.delivery.placeId !== lb.pickup.placeId) return null
    const ra = this.road(la), rb = this.road(lb)
    // The link is one place, so the drive between the two cars is zero minutes.
    if (!ra || !rb || ra.minutes + rb.minutes > PAIR_ROAD_MINUTES) return null
    const now = this.now, { pairSafety, pairMaxWait } = this.config
    const lastA = this.lastPickup(oa, ia), lastB = this.lastPickup(ob, ib)
    if (!(lastA - now >= pairSafety + PAIR_LIFE) || !(lastB - now >= pairSafety + PAIR_LIFE)) return null
    const pa = this.planLeg(la, this.requests.get(oa.id), ia, oa.deadline, now), pb = this.planLeg(lb, this.requests.get(ob.id), ib, ob.deadline, now)
    if (pa.uncertain || pb.uncertain) return null
    // Minutes from A's pickup to the handover in the link town, and from B's pickup to its delivery.
    const driveA = Math.ceil(ra.minutes * (pa.snowy ? 1.18 : 1)) + pa.extra + 20
    const driveB = Math.ceil(rb.minutes * (pb.snowy ? 1.18 : 1)) + pb.extra
    const endA = Math.min(pa.delivery.to, oa.deadline), endB = Math.min(pb.delivery.to, ob.deadline)
    const stops: StopPlace[] = [{ ...la.pickup, window: pa.pickup }, { ...la.delivery, window: { from: pa.delivery.from, to: endA } },
      { ...lb.pickup, window: pb.pickup }, { ...lb.delivery, window: { from: pb.delivery.from, to: endB } }]
    const earliest = Math.max(now + 60, pa.pickup.from)
    // Candidate minutes for A's pickup: as early as possible, or timed so that one of the four visits falls on
    // the start of its window or on its site's opening minute.
    const offsets = [0, driveA, driveA, driveA + driveB]
    const starts = new Set([earliest])
    for (const [k, stop] of stops.entries()) {
      starts.add(stop.window.from - offsets[k]!)
      if (stop.hours) for (let day = Math.floor(earliest / DAY), n = 0; n < 4; n++, day++) {
        starts.add(day * DAY + stop.hours.opens - offsets[k]!)
        if (stop.hours.saturday) starts.add(day * DAY + stop.hours.saturday.opens - offsets[k]!)
      }
    }
    for (const start of [...starts].filter(t => t >= earliest).sort((x, y) => x - y)) {
      if (start > lastA - pairSafety) break
      const arrive = start + driveA
      if (!openAt(stops[0]!, start) || !openAt(stops[1]!, arrive) || arrive > endA - 60) continue
      const collect = Math.max(arrive, pb.pickup.from)
      if (collect - arrive > pairMaxWait || collect > lastB - 30 || !openAt(stops[2]!, collect)) continue
      const done = collect + driveB
      if (!openAt(stops[3]!, done) || done > endB - 60) continue
      return { lastA, start, wait: collect - arrive }
    }
    return null
  }

  /** Where a single car is about to be posted (car B), look for a car A that ends in B's pickup town: an open
   * single gig or another single post of this step. Replace the single post(s) by one pair post, and withdraw
   * A's open gig in the same batch. Cars that fit no partner keep their single post. */
  private formPairs(actions: Action[]) {
    const now = this.now
    type Candidate = Car & { order: Order; gigId?: string; post?: PostAction }
    const single = (orderId: string, leg: number) => {
      const order = this.orders.get(orderId), car = order?.legs[leg]
      return order && car && order.legs.length === 1 && order.deliveredAt[leg] == null && !this.noPair.has(orderId) &&
        !car.pickup.privateAddress && !car.delivery.privateAddress ? order : undefined
    }
    const fresh: Candidate[] = []
    const busy = new Set<string>()
    for (const action of actions) {
      if ('gigId' in action) busy.add(action.gigId)
      if (action.type !== 'post' || action.stops.length !== 2 || action.stops[0]!.orderId !== action.stops[1]!.orderId) continue
      const { orderId, leg } = action.stops[0]!
      const order = single(orderId, leg)
      if (order) fresh.push({ orderId, leg, order, post: action })
    }
    if (!fresh.length) return
    const open: Candidate[] = []
    for (const [gigId, gig] of this.gigs) {
      // An open gig joins a pair only if it is a plain single gig that no driver has held, old enough, and
      // untouched by this step (no offer, reprice or withdraw).
      if (!gig.open || gig.partner || gig.exPair || gig.legs.length !== 1 || gig.lastBooking !== undefined || busy.has(gigId) ||
          now - gig.since < this.config.pairMinAge || this.assigned.get(carKey(gig.orderId, gig.leg)) !== gigId) continue
      const order = single(gig.orderId, gig.leg)
      if (order) open.push({ orderId: gig.orderId, leg: gig.leg, order, gigId })
    }
    const taken = new Set<Candidate>()
    const replaced = new Map<Action, Action[]>()
    for (const f of fresh) {
      if (taken.has(f)) continue
      // `key` is the partner's own last pickup: prefer the partner for whom time is shortest.
      let best: { a: Candidate; b: Candidate; plan: PairPlan; key: number } | undefined
      for (const other of [...open, ...fresh]) {
        if (other === f || taken.has(other)) continue
        if (this.config.pairAgain > 0 && (this.pairTried.has([f.orderId, other.orderId].sort().join('|')) ||
            (this.pairTries.get(f.orderId) ?? 0) > this.config.pairAgain || (this.pairTries.get(other.orderId) ?? 0) > this.config.pairAgain)) continue
        // The new car as the second car.
        const plan = this.pairPlan(other.order, other.leg, f.order, f.leg)
        if (plan && (!best || plan.lastA < best.key)) best = { a: other, b: f, plan, key: plan.lastA }
        // With pairBoth: the new car first, and an open single gig as the second car.
        if (this.config.pairBoth && other.gigId) {
          const reverse = this.pairPlan(f.order, f.leg, other.order, other.leg)
          const lastB = reverse ? this.lastPickup(other.order, other.leg) : Infinity
          if (reverse && (!best || lastB < best.key)) best = { a: f, b: other, plan: reverse, key: lastB }
        }
      }
      if (!best) continue
      const { a, b, plan } = best
      taken.add(a); taken.add(b)
      const posted = (c: Candidate) => c.post ?? { ...this.postStops(c.order, [c.leg]), schedule: this.schedule(c.order, c.leg, now) }
      const first = posted(a), second = posted(b)
      const pair: PostAction = { type: 'post', stops: [...first.stops, ...second.stops],
        audience: { experienced: first.audience.experienced || second.audience.experienced, manualLicence: first.audience.manualLicence || second.audience.manualLicence },
        schedule: this.pairSchedule([first.schedule, second.schedule]) }
      // The pair takes the place of the new car's single post. The partner's open gig is withdrawn just before it.
      const partner = a === f ? b : a
      replaced.set(f.post!, partner.gigId ? [{ type: 'withdraw', gigId: partner.gigId }, pair] : [pair])
      if (partner.post) replaced.set(partner.post, [])
      this.pairWake = now + 1
      this.pairTrace?.({ now, a: { orderId: a.orderId, leg: a.leg, ...(a.gigId ? { gigId: a.gigId } : {}) }, b: { orderId: b.orderId, leg: b.leg },
        singles: [first.schedule, second.schedule], schedule: pair.schedule, start: plan.start, wait: plan.wait })
    }
    if (replaced.size) actions.splice(0, actions.length, ...actions.flatMap(action => replaced.get(action) ?? [action]))
  }

  /** Fee of a pair gig: `pairFactor` of the two single fees at every minute either single schedule steps.
   * Never falls, at most 48 steps. */
  private pairSchedule(parts: FeeStep[][]): FeeStep[] {
    const times = [...new Set(parts.flat().map(s => s.at))].sort((a, b) => a - b)
    const steps: FeeStep[] = []
    for (const at of times) {
      const feeCents = Math.max(1, Math.round(this.config.pairFactor *
        parts.reduce((sum, schedule) => sum + (schedule.findLast(step => step.at <= at) ?? schedule[0]!).feeCents, 0)))
      if (!steps.length || feeCents > steps.at(-1)!.feeCents) steps.push({ at, feeCents })
    }
    if (steps.length <= 48) return steps
    // Keep the opening fee, the final fee and an even selection of the steps between them.
    return Array.from({ length: 48 }, (_, k) => steps[Math.round(k * (steps.length - 1) / 47)]!)
  }

  /** A driver who has just handed over a car is standing next to our other pickups. Offer them the most
   * pressing ones that can start now: for that driver the gig costs only its drive and a trip home they owe anyway. */
  /** A driver has just booked a gig. Offer that driver open single gigs that chain with it: one that starts in the
   * town where the booked gig ends, or one that ends in the town where it starts. */
  private chainBookOffers(actions: Action[], booked: { driver: string; gigId: string; at: number }) {
    const clock = this.now % DAY
    if (this.now - booked.at > 5 || clock < 420 || clock >= 1380) return
    const held = this.gigs.get(booked.gigId)
    const first = held && this.orders.get(held.orderId)
    if (!held || !first || held.open) return
    const lastCar = held.partner ?? { orderId: held.orderId, leg: held.legs.at(-1)! }
    const lastOrder = this.orders.get(lastCar.orderId)
    const start = first.legs[held.leg], end = lastOrder?.legs[lastCar.leg]
    if (!start || !end) return
    const day = Math.floor(this.now / DAY), key = day + '/' + booked.driver
    let sent = this.offerCounts.get(key) ?? 0
    if (sent >= 3) return
    this.driverById ??= new Map(this.drivers.map(d => [d.id, d]))
    const profile = this.driverById.get(booked.driver)
    const minutes = (a: string, b: string) => a === b ? 0 : this.roads.get(lane(a, b))?.minutes ?? Infinity
    const heldRoad = (this.road(start)?.minutes ?? 90) + (held.partner ? this.road(end)?.minutes ?? 90 : 0)
    const heldLast = this.lastPickup(first, held.leg)
    const busy = new Set(actions.flatMap(a => 'gigId' in a ? [a.gigId] : []))
    const choices: { gigId: string; gig: LiveGig; score: number }[] = []
    for (const [gigId, gig] of this.gigs) {
      if (gigId === booked.gigId || !gig.open || gig.legs.length !== 1 || gig.partner || busy.has(gigId)) continue
      const order = this.orders.get(gig.orderId), leg = order?.legs[gig.leg]
      if (!order || !leg || leg.pickup.privateAddress || leg.delivery.privateAddress) continue
      const road = this.road(leg)?.minutes ?? Infinity
      const request = this.requests.get(order.id)
      const ready = this.level >= 5 ? this.planLeg(leg, request, gig.leg, order.deadline, this.now).pickup.from : leg.pickup.window.from
      const last = Math.min(this.operationalLatest(leg, request, gig.leg, order.deadline, this.now), order.lastPickupAt)
      // After the held gig: this car starts where the held gig ends, and can still be collected once that is driven.
      const after = leg.pickup.placeId === end.delivery.placeId && this.now + 45 + heldRoad <= last - 20 && ready <= heldLast + heldRoad + 120
      // Before the held gig: this car ends where the held gig starts, and can be driven before the held gig's last pickup.
      const before = leg.delivery.placeId === start.pickup.placeId && Math.max(this.now + 45, ready) + road <= heldLast - 20
      if (!after && !before) continue
      const audience = this.level >= 5 ? this.postStops(order, gig.legs).audience : allDrivers
      if (audience.manualLicence && profile?.licence !== 'manual') continue
      if (audience.experienced && !(profile && profile.completedGigs >= 50 && profile.rating >= 4.8)) continue
      const open = (this.chainSent.get(gigId) ?? []).filter(t => this.now - t < 10).length +
        (this.now - (gig.since + this.config.offerDelay) < 10 ? this.offersByGig.get(gigId)?.size ?? 0 : 0)
      if (open >= 3) continue
      const home = profile ? minutes(after ? leg.delivery.placeId : end.delivery.placeId, profile.homePlaceId) : 0
      choices.push({ gigId, gig, score: (last - this.now) / 120 + (Number.isFinite(home) ? home : 600) / 30 })
    }
    choices.sort((a, b) => a.score - b.score)
    for (const { gigId, gig } of choices.slice(0, Math.min(this.config.chainBook, 3 - sent))) {
      const displayed = gig.schedule.findLast(step => step.at <= this.now)?.feeCents ?? gig.fee
      actions.push({ type: 'offer', gigId, driverId: booked.driver, feeCents: Math.max(1, Math.round(displayed * this.config.chainBookFactor)) })
      this.offerCounts.set(key, ++sent)
      this.chainSent.set(gigId, [...(this.chainSent.get(gigId) ?? []).filter(t => this.now - t < 10), this.now])
    }
  }

  private chainOffers(actions: Action[], free: { driver: string; place: string; at: number }) {
    const clock = this.now % DAY
    if (this.now - free.at > 20 || clock < 420 || clock >= 1380) return
    const day = Math.floor(this.now / DAY)
    const key = day + '/' + free.driver
    let sent = this.offerCounts.get(key) ?? 0
    if (sent >= 3) return
    this.driverById ??= new Map(this.drivers.map(d => [d.id, d]))
    const profile = this.driverById.get(free.driver)
    const minutes = (a: string, b: string) => a === b ? 0 : this.roads.get(lane(a, b))?.minutes ?? Infinity
    const choices: { gigId: string; gig: LiveGig; score: number }[] = []
    for (const [gigId, gig] of this.gigs) {
      // Pair gigs get no chain offer: the offer test below judges one car only.
      if (!gig.open || gig.legs.length !== 1 || gig.partner) continue
      const order = this.orders.get(gig.orderId)
      const leg = order?.legs[gig.leg]
      if (!order || !leg || leg.pickup.privateAddress) continue
      const reach = minutes(free.place, leg.pickup.placeId)
      if (reach > this.config.chainReach) continue
      const request = this.requests.get(order.id)
      const ready = this.level >= 5 ? this.planLeg(leg, request, gig.leg, order.deadline, this.now).pickup.from : leg.pickup.window.from
      const last = Math.min(this.operationalLatest(leg, request, gig.leg, order.deadline, this.now), order.lastPickupAt)
      if (ready > this.now + reach + 45 || last < this.now + reach + 10) continue
      const audience = this.level >= 5 ? this.postStops(order, gig.legs).audience : allDrivers
      if (audience.manualLicence && profile?.licence !== 'manual') continue
      if (audience.experienced && !(profile && profile.completedGigs >= 50 && profile.rating >= 4.8)) continue
      const open = (this.chainSent.get(gigId) ?? []).filter(t => this.now - t < 10).length +
        (this.now - (gig.since + this.config.offerDelay) < 10 ? this.offersByGig.get(gigId)?.size ?? 0 : 0)
      if (open >= 3) continue
      const home = profile ? minutes(leg.delivery.placeId, profile.homePlaceId) : 0
      choices.push({ gigId, gig, score: (last - this.now) / 60 + (Number.isFinite(home) ? home : 600) / 30 + reach / 10 })
    }
    choices.sort((a, b) => a.score - b.score)
    for (const { gigId, gig } of choices.slice(0, Math.min(this.config.chainOffers, 3 - sent))) {
      const displayed = gig.schedule.findLast(step => step.at <= this.now)?.feeCents ?? gig.fee
      actions.push({ type: 'offer', gigId, driverId: free.driver, feeCents: Math.max(1, Math.round(displayed * this.config.chainFactor)) })
      this.offerCounts.set(key, ++sent)
      this.chainSent.set(gigId, [...(this.chainSent.get(gigId) ?? []).filter(t => this.now - t < 10), this.now])
    }
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
    // A pair gig starts at its first car's pickup and ends at its second car's delivery, and needs a driver fit for both.
    const second = gig.partner && this.orders.get(gig.partner.orderId)
    const destination = (second ? second.legs[gig.partner!.leg] : undefined)?.delivery.placeId ?? order.legs[gig.legs.at(-1)!]!.delivery.placeId
    const day = Math.floor(this.now / DAY)
    const audience = this.level >= 5 ? this.postStops(order, gig.legs).audience : allDrivers
    if (second && this.level >= 5) {
      const more = this.postStops(second, [gig.partner!.leg]).audience
      audience.experienced ||= more.experienced
      audience.manualLicence ||= more.manualLicence
    }
    const choices = this.drivers.filter(d => (!audience.manualLicence || d.licence === 'manual') &&
      (!audience.experienced || (d.completedGigs >= 50 && d.rating >= 4.8)) && !tried.has(d.id) && (this.offerCounts.get(day + '/' + d.id) ?? 0) < 3).map(d => {
      const activity = this.recent.get(d.id)
      const active = !!activity && this.now - activity.at < 240
      const start = active && activity?.place || d.homePlaceId
      const distance = (a: string, b: string) => a === b ? 0 : this.roads.get(lane(a, b))?.minutes ?? 999
      const reach = distance(start, pickup)
      const back = distance(destination, d.homePlaceId)
      // Drivers who live where the car is going take it most readily: the gig brings them home.
      const score = this.config.offerHome ? back + 0.3 * reach : reach + 0.3 * back
      return { driver: d.id, reach, back, score: score - (active ? 30 : 0) + d.drops / Math.max(1, d.completedGigs) * 100 }
    }).filter(d => d.reach <= 120 || (this.config.offerHome > 0 && d.back <= 30)).sort((a, b) => a.score - b.score)
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
        const other = action.stops.find(s => s.orderId !== stop.orderId)
        if (other) { this.recordPair(action, result, stop, other); continue }
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

  /** A post whose stops name two orders. A withdraw of the first car's own gig, sent in the same batch, was recorded just before. */
  private recordPair(action: PostAction, result: ActionResult, first: StopRef, second: StopRef) {
    const cars: Car[] = [{ orderId: first.orderId, leg: first.leg }, { orderId: second.orderId, leg: second.leg }]
    // A refused pair is not tried again. Neither car has a gig now, so the next step posts each alone.
    if (!result.ok) { for (const car of cars) this.noPair.add(car.orderId); return }
    if (this.config.pairAgain > 0) for (const car of cars) this.pairTries.set(car.orderId, (this.pairTries.get(car.orderId) ?? 0) + 1)
    this.gigs.set(result.id, { orderId: first.orderId, leg: first.leg, legs: [first.leg], partner: cars[1]!, since: this.now,
      fee: action.schedule[0]!.feeCents, open: true, schedule: action.schedule })
    for (const car of cars) {
      const key = carKey(car.orderId, car.leg), held = this.assigned.get(key)
      if (held !== undefined && held !== result.id && this.gigs.has(held)) {
        // The withdraw of this car's own gig was refused, for example because a driver booked it first.
        // That gig keeps the car, and the pair is withdrawn at the next step.
        this.pairDue.add(result.id)
        for (const each of cars) this.noPair.add(each.orderId)
      } else this.assigned.set(key, result.id)
      this.retryAt.delete(key)
    }
  }

  nextWake(now: number): number {
    let next = Infinity
    for (const t of this.retryAt.values()) if (t > now) next = Math.min(next, t)
    if (this.pairWake > now) next = Math.min(next, this.pairWake)
    for (const gig of this.gigs.values()) {
      if (!gig.partner || !gig.open) continue
      // Step when the pair's time is up, or when either car's last pickup comes inside the safety margin.
      let at = gig.since + this.config.pairWait
      for (const car of [{ orderId: gig.orderId, leg: gig.leg }, gig.partner]) {
        const order = this.orders.get(car.orderId)
        if (order?.legs[car.leg]) at = Math.min(at, this.lastPickup(order, car.leg) - this.config.pairSafety + 1)
      }
      if (at > now) next = Math.min(next, at)
    }
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
