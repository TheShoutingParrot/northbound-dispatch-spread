import type { DeliveryOption, PriceRequest, QuoteAction } from './reference/typescript/types.ts'
import { priceWeights } from './level4-price-weights.ts'

type Candidate = { option: DeliveryOption; costCents: number }
type Pending = { probability: number; dealer: string }
const limit = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const weight = (key: string) => priceWeights[key] ?? 0
/** Demand from named practice weeks, recalibrated against this week's public wins and losses. */
export class Level4Pricing {
  private pending = new Map<string, Pending>()
  private dealer = new Map<string, number>()
  private global = 0
  private observations = 0

  quote(request: PriceRequest, options: Candidate[], minutes: number): QuoteAction['prices'] {
    if (!options.length) return {}
    const leg = request.legs[0]!
    const origin = leg.pickup.placeId
    const destination = leg.delivery.placeId
    const common = weight('base') + this.global + (this.dealer.get(request.dealerId) ?? 0)
      + weight('first:' + request.options[0]!.kind) + weight('options:' + request.options.length)
      + weight('road') * Math.log(Math.max(15, minutes) / 90)
      + weight('batch') * Number(request.batchId !== null) + weight('trade') * (request.legs.length - 1) + weight('privateP') * Number(leg.pickup.privateAddress)
      + weight('privateD') * Number(leg.delivery.privateAddress)
      + 0.96 * weight('in:' + destination) + 0.75 * weight('out:' + origin)
      + 0.35 * weight('dealer:' + request.dealerId) + 0.46 * weight('lane:' + origin + '/' + destination)
    const choices = options.map(({option, costCents}) => ({
      option, cost: costCents, price: 0,
      utility: common + weight('opt:' + option.kind) + 0.8 * weight('dealeropt:' + request.dealerId + '/' + option.kind) + weight('rank:' + request.options.indexOf(option)),
      sensitivity: (weight('slope') + weight('slope:' + option.kind) + weight('slope:logprice') * Math.log(option.listPriceCents / 6000)) / option.listPriceCents
    }))
    const scale = weight('choiceScale')
    const setPrice = (choice: typeof choices[number], cents: number) => {
      const list = choice.option.listPriceCents
      choice.price = Math.round(limit(cents, 0.68 * list, Math.max(1.36 * list, choice.cost + 1)))
    }
    // Dealers can pick a different delivery speed or switch suppliers. Fit these
    // two decisions separately, then maximize expected margin across the whole menu.
    const evaluate = () => {
      let mass = 0
      let profit = 0
      for (const c of choices) {
        const odds = Math.exp(limit(c.utility + c.sensitivity * (c.option.listPriceCents - c.price), -25, 25))
        mass += odds
        profit += odds * (c.price - c.cost)
      }
      const probability = 1 / (1 + Math.pow(mass, -scale))
      return { margin: probability * profit / mass, probability }
    }
    let best = -Infinity
    for (const c of choices) setPrice(c, c.option.listPriceCents)
    // A simultaneous move searches the main price level before refining option spreads.
    let bestQuotes = choices.map(c => c.price)
    for (let f = 0.76; f < 1.27; f += 0.025) {
      for (const c of choices) setPrice(c, f * c.option.listPriceCents)
      const value = evaluate().margin
      if (value > best) {
        best = value
        bestQuotes = choices.map(c => c.price)
      }
    }
    choices.forEach((c, i) => { c.price = bestQuotes[i]! })
    for (const step of [0.05, 0.025, 0.0125, 0.00625]) {
      for (const c of choices) {
        const old = c.price
        let selected = old
        for (const offset of [-2, -1, 1, 2]) {
          setPrice(c, old + offset * step * c.option.listPriceCents)
          const value = evaluate().margin
          if (value > best) {
            best = value
            selected = c.price
          }
        }
        c.price = selected
      }
    }
    const result = evaluate()
    this.pending.set(request.id, { probability: result.probability, dealer: request.dealerId })
    return Object.fromEntries(choices.map(c => [c.option.kind, c.price]))
  }
  observe(requestId: string, won: boolean) {
    const offer = this.pending.get(requestId)
    if (!offer) return
    this.pending.delete(requestId)
    const error = Number(won) - offer.probability
    const scale = weight('choiceScale')
    this.global = limit(this.global + error * (this.observations++ < 55 ? 0.19 / scale : 0.095 / scale), -3.5, 3.5)
    this.dealer.set(offer.dealer, limit((this.dealer.get(offer.dealer) ?? 0) * 0.99 + 0.09 * error / scale, -1.7, 1.7))
  }
}
