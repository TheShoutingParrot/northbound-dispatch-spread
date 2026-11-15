import type { PriceRequest } from './reference/typescript/types.ts'

/** Static terms of one level family, fitted offline by runs/grind/model-work/fit.ts (competitor-lanes.json).
 * All prices are log ratios x = log(price / (list price * dealer trust)), taken at the option with the lowest ratio.
 * A request is won with probability sigmoid((m - x) / s). */
export type LanesFamily = {
  s: number
  /** Share of the pricing rule's own deviation from its world average that carries over to the threshold. */
  gamma: number
  daySd: number
  kmSlope: number; kmRef: number
  feeSlope: number; feeRef: number
  origin: Record<string, number>; dest: Record<string, number>; offsets: Record<string, number>
  levels: Record<string, { mean: number; sd: number }>
}
export const sigmoid = (z: number) => z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z))

export function requestFlags(request: PriceRequest): Record<string, number> {
  const trade = request.legs.length > 1
  const priv = request.legs.some(leg => leg.pickup.privateAddress || leg.delivery.privateAddress)
  return {
    single: Number(request.options.length === 1 && !trade && !priv), trade: Number(trade), private: Number(priv && !trade),
    batch: Number(!!request.batchId), sameDay: Number(request.options.some(o => o.kind === 'same_day')),
  }
}
export const flagNames = ['single', 'trade', 'private', 'batch', 'sameDay'] as const
export const logKm = (km: number, ref = 100) => Math.log(Math.max(5, km) / ref)
/** Typical driver fee against the cheapest list price: how hard the lane is for drivers. */
export const logFee = (request: PriceRequest) =>
  Math.log(Math.max(1, request.referenceFeeCents) / Math.max(1, Math.min(...request.options.map(o => o.listPriceCents))))

/** The part of the threshold that is the same in every world of the family. */
export function staticTerm(f: LanesFamily, request: PriceRequest, km: number): number {
  const leg = request.legs[0]
  if (!leg) return 0
  let m = (f.origin[leg.pickup.placeId] ?? 0) + (f.dest[leg.delivery.placeId] ?? 0) + f.kmSlope * logKm(km, f.kmRef) + f.feeSlope * (logFee(request) - f.feeRef)
  const flags = requestFlags(request)
  for (const name of flagNames) if (flags[name]) m += f.offsets[name] ?? 0
  return m
}

type Observation = { day: number; lane: number; rule: number; quoted: number; won: boolean }
const DAY = 1440

/** Online estimate of this world's competitor level: one world intercept and one offset per day.
 * The day offset starts each morning at zero, which is the world intercept. */
export class CompetitorModel {
  private observations: Observation[] = []
  private world: number
  private days = new Map<number, number>()
  private ruleSum = 0
  private readonly prior: { mean: number; sd: number }
  private family: LanesFamily
  private km: (from: string, to: string) => number

  constructor(family: LanesFamily, level: number, km: (from: string, to: string) => number) {
    this.family = family; this.km = km
    const known = Object.keys(family.levels).map(Number).sort((a, b) => Math.abs(a - level) - Math.abs(b - level))[0]
    this.prior = family.levels[String(level)] ?? family.levels[String(known)] ?? { mean: 0, sd: 0.15 }
    this.world = this.prior.mean
  }
  get count() { return this.observations.length }
  get intercept() { return this.world }
  get priorMean() { return this.prior.mean }
  dayOffset(day: number) { return this.days.get(day) ?? 0 }
  private lane(request: PriceRequest) {
    const leg = request.legs[0]
    return staticTerm(this.family, request, leg ? this.km(leg.pickup.placeId, leg.delivery.placeId) : this.family.kmRef)
  }
  /** How far the rule's log ratio for a request is from the rule's average so far in this world. */
  relative(ruleRatioLog: number | undefined) {
    return ruleRatioLog == null || !this.observations.length ? 0 : ruleRatioLog - this.ruleSum / this.observations.length
  }
  /** Current estimate of m, the log ratio at which the request is won half of the time, and the scale s.
   * The model has one threshold per request: `optionKind` is accepted for callers that work per option. */
  threshold(request: PriceRequest, _optionKind?: string, ruleRatioLog?: number) {
    const z = this.relative(ruleRatioLog)
    const day = Math.floor(request.arrivedAt / DAY)
    return { m: this.world + this.dayOffset(day) + this.lane(request) + this.family.gamma * z, s: this.family.s, z }
  }
  /** `quotedRatioLog` is what we really quoted; `ruleRatioLog` what the pricing rule alone would have quoted (default: the same). */
  observe(request: PriceRequest, quotedRatioLog: number, won: boolean, ruleRatioLog = quotedRatioLog) {
    if (!Number.isFinite(quotedRatioLog) || !Number.isFinite(ruleRatioLog)) return
    const day = Math.floor(request.arrivedAt / DAY)
    this.observations.push({ day, lane: this.lane(request), rule: ruleRatioLog, quoted: quotedRatioLog, won })
    this.ruleSum += ruleRatioLog
    if (!this.days.has(day)) this.days.set(day, 0)
    this.update()
  }
  /** Threshold of a past request without the intercepts, minus what we quoted. The rule's deviation is taken
   * from the rule's average over all outcomes so far, as the offline fit takes it from the world's average. */
  private base(o: Observation) {
    return o.lane + this.family.gamma * (o.rule - this.ruleSum / this.observations.length) - o.quoted
  }
  /** Log posterior of a world intercept and day offsets (concave). */
  private posterior(world: number, days: Map<number, number>) {
    const s = this.family.s
    let value = -((world - this.prior.mean) ** 2) / (2 * this.prior.sd ** 2)
    for (const d of days.values()) value -= d * d / (2 * this.family.daySd ** 2)
    for (const o of this.observations) {
      const t = (world + days.get(o.day)! + this.base(o)) / s * (o.won ? 1 : -1)
      value += t >= 0 ? -Math.log1p(Math.exp(-t)) : t - Math.log1p(Math.exp(t))
    }
    return value
  }
  /** A few Newton steps, each with a line search, on the posterior of the world intercept and the day offsets. */
  private update(steps = 6) {
    const days = [...this.days.keys()], n = days.length + 1, s = this.family.s
    const at = new Map(days.map((d, i) => [d, i + 1]))
    let current = this.posterior(this.world, this.days)
    for (let step = 0; step < steps; step++) {
      const g = new Float64Array(n), H = new Float64Array(n * n)
      g[0] = -(this.world - this.prior.mean) / this.prior.sd ** 2; H[0] = 1 / this.prior.sd ** 2
      for (const [d, i] of at) { g[i] = -this.days.get(d)! / this.family.daySd ** 2; H[i * n + i] = 1 / this.family.daySd ** 2 }
      for (const o of this.observations) {
        const i = at.get(o.day)!
        const p = sigmoid((this.world + this.days.get(o.day)! + this.base(o)) / s)
        const r = (Number(o.won) - p) / s, w = p * (1 - p) / (s * s)
        g[0] += r; g[i] += r
        H[0] += w; H[i * n + i] += w; H[i] += w; H[i * n] += w
      }
      const delta = solve(H, g, n)
      const largest = Math.max(...delta.map(Math.abs))
      if (!(largest > 1e-6)) break
      let scale = largest > 0.3 ? 0.3 / largest : 1, moved = false
      for (let tries = 0; tries < 12; tries++, scale /= 2) {
        const world = this.world + scale * delta[0]!
        const next = new Map(days.map(d => [d, this.days.get(d)! + scale * delta[at.get(d)!]!]))
        const value = this.posterior(world, next)
        if (value >= current) { this.world = world; this.days = next; current = value; moved = true; break }
      }
      if (!moved) break
    }
  }
}

/** Gaussian elimination with partial pivoting for the small posterior system. */
function solve(A: Float64Array, b: Float64Array, n: number): number[] {
  const M = Array.from({ length: n }, (_, i) => [...A.slice(i * n, i * n + n), b[i]!])
  for (let c = 0; c < n; c++) {
    let pivot = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[pivot]![c]!)) pivot = r
    if (Math.abs(M[pivot]![c]!) < 1e-12) continue
    [M[c], M[pivot]] = [M[pivot]!, M[c]!]
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / M[c]![c]!
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let v = M[r]![n]!
    for (let k = r + 1; k < n; k++) v -= M[r]![k]! * x[k]!
    x[r] = Math.abs(M[r]![r]!) < 1e-12 ? 0 : v / M[r]![r]!
  }
  return x
}

export type PricedOption = {
  /** Price of the pricing rule, cents. */ p0: number
  /** The rule's cost floor, cents: never quote below it. */ floor: number
  /** Modelled cost of serving the order, cents (driver fee, capacity, hazards). */ unit: number
  /** List price times dealer trust, cents. */ list: number
}
/** Price of an option after the common multiplier, never below its floor. */
export const scaled = (o: PricedOption, c: number) => c === 1 ? o.p0 : Math.max(Math.ceil(o.floor), Math.round(o.p0 * c))

/** One multiplier for all options of a request, within exp(+-band), that maximises
 * (price - unit cost) * P(win) for the option with the highest expected margin. Returns 1 when nothing beats the rule. */
export function chooseMultiplier(options: PricedOption[], m: number, s: number, band: number, steps = 15): number {
  if (!options.length || !(band > 0) || !Number.isFinite(m) || !(s > 0)) return 1
  const value = (c: number) => {
    const prices = options.map(o => scaled(o, c))
    const x = Math.min(...options.map((o, k) => Math.log(prices[k]! / o.list)))
    return Math.max(...options.map((o, k) => prices[k]! - o.unit)) * sigmoid((m - x) / s)
  }
  let best = 1, bestValue = value(1)
  for (let g = -steps; g <= steps; g++) {
    if (!g) continue
    const c = Math.exp(band * g / steps), v = value(c)
    if (v > bestValue + 1e-9 + 1e-9 * Math.abs(bestValue)) { best = c; bestValue = v }
  }
  return best
}
