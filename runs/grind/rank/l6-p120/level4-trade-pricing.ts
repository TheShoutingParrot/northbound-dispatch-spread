import type { DeliveryOption, PriceRequest, QuoteAction } from './reference/typescript/types.ts'
import { priceWeights } from './level4-trade-price-weights.ts'

type Candidate = { option: DeliveryOption; costCents: number }
type Pending = { probability: number; dealer: string }
const limit = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const weight = (key: string) => priceWeights[key] ?? 0
/** Demand from named practice weeks, recalibrated against this week's public wins and losses. */
export class Level4TradePricing {
  private pending = new Map<string, Pending>()
  private dealer = new Map<string, number>()
  private global = 0
  private observations = 0

  quote(request: PriceRequest, options: Candidate[], minutes: number): QuoteAction['prices'] {
    if (!options.length) return {}
    const leg = request.legs[0]!
    const origin = leg.pickup.placeId, dest = leg.delivery.placeId
    const common = weight('base') + this.global + (this.dealer.get(request.dealerId) ?? 0)
      + weight('first:' + request.options[0]!.kind) + weight('options:' + request.options.length)
      + weight('road') * Math.log(Math.max(15, minutes) / 90)
      + weight('batch') * Number(request.batchId !== null) + weight('trade') * (request.legs.length - 1) + weight('privateP') * Number(leg.pickup.privateAddress)
      + weight('privateD') * Number(leg.delivery.privateAddress)
      + 0.96 * weight('in:' + dest) + 0.75 * weight('out:' + origin)
      + 0.35 * weight('dealer:' + request.dealerId) + 0.46 * weight('lane:' + origin + '/' + dest)
    const choices = options.map(({option, costCents}) => ({
      option, cost: costCents, price: 0,
      utility: common + weight('opt:' + option.kind) + 0.8 * weight('dealeropt:' + request.dealerId + '/' + option.kind) + weight('rank:' + request.options.indexOf(option)),
      sensitivity: (weight('slope') + weight('slope:' + option.kind) + weight('slope:logprice') * Math.log(option.listPriceCents / 6000)) / option.listPriceCents
    }))
    // In the logit choice model, each quote covers its cost, inverse price sensitivity,
    // and the expected margin of all alternatives the dealer could choose instead.
    const evaluate = (margin: number) => {
      let mass = 0, euros = 0
      for (const c of choices) {
        const list = c.option.listPriceCents
        c.price = Math.round(limit(c.cost + 1 / c.sensitivity + margin, 0.66 * list, Math.max(1.38 * list, c.cost + 1)))
        const odds = Math.exp(limit(c.utility + c.sensitivity * (list - c.price), -30, 30))
        mass += odds; euros += odds * (c.price - c.cost)
      }
      return { margin: euros / (1 + mass), probability: mass / (1 + mass) }
    }
    let margin = 0
    for (let i = 0; i < 10; i++) {
      const next = evaluate(margin).margin
      if (Math.abs(next - margin) < 0.5) break
      margin = next
    }
    const result = evaluate(margin)
    this.pending.set(request.id, { probability: result.probability, dealer: request.dealerId })
    return Object.fromEntries(choices.map(c => [c.option.kind, c.price]))
  }
  observe(requestId: string, won: boolean) {
    const offer = this.pending.get(requestId)
    if (!offer) return
    this.pending.delete(requestId)
    const error = Number(won) - offer.probability
    this.global = limit(this.global + error * (this.observations++ < 55 ? 0.19 : 0.095), -3.5, 3.5)
    this.dealer.set(offer.dealer, limit((this.dealer.get(offer.dealer) ?? 0) * 0.99 + 0.09 * error, -1.7, 1.7))
  }
}
