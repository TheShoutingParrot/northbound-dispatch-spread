import type { PriceRequest, WorldMap } from './reference/typescript/types.ts'

type Sample = { wins: number; total: number }
type Observation = { origin: string; at: number; won: boolean }

function record(samples: Map<string, Sample>, key: string, won: boolean) {
  const last = samples.get(key)
  samples.set(key, { wins: (last?.wins ?? 0) * 0.94 + Number(won), total: (last?.total ?? 0) * 0.94 + 1 })
}

function rate(sample: Sample | undefined, prior: number, weight: number) {
  return ((sample?.wins ?? 0) + weight * prior) / ((sample?.total ?? 0) + weight)
}

/** Infer regional pricing from this world's ordinary quotes and dealer decisions. */
export class LocalMarket {
  private lanes = new Map<string, Sample>()
  private destinations = new Map<string, Sample>()
  private overall = new Map<string, Sample>()
  private nearby = new Map<string, Set<string>>()
  private recent: Observation[] = []

  constructor(map: WorldMap) {
    for (const a of map.places) {
      const region = new Set<string>()
      for (const b of map.places) {
        const rad = Math.PI / 180
        const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 +
          Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2
        if (6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h))) <= 80) region.add(b.id)
      }
      this.nearby.set(a.id, region)
    }
  }

  record(request: PriceRequest, won: boolean) {
    const leg = request.legs[0]
    if (!leg) return
    const origin = leg.pickup.placeId
    const dest = leg.delivery.placeId
    record(this.lanes, origin + '/' + dest, won)
    record(this.destinations, dest, won)
    record(this.overall, '*', won)
    this.recent.push({ origin, at: request.respondBy, won })
    this.recent = this.recent.filter(s => s.at >= request.respondBy - 180)
  }

  adjustment(request: PriceRequest, level: number, laneAdapt: number, outagePremium: number) {
    const leg = request.legs[0]
    if (!leg || (!laneAdapt && !outagePremium)) return 0
    const origin = leg.pickup.placeId
    const dest = leg.delivery.placeId
    const base = rate(this.overall.get('*'), 0.45, 12)
    const destRate = rate(this.destinations.get(dest), base, 8)
    const laneRate = rate(this.lanes.get(origin + '/' + dest), destRate, 5)
    const laneChange = laneAdapt * (laneRate - base)
    const now = request.arrivedAt
    const hour = now % 1440
    if (level < 6 || !outagePremium || hour < 480 || hour >= 1080) return laneChange
    const region = this.nearby.get(origin)
    const from = Math.max(now - 180, now - hour + 480)
    const sample = this.recent.filter(s => s.at >= from && s.at <= now && region?.has(s.origin))
    if (sample.length < 5) return laneChange
    const local = rate({ total: sample.length, wins: sample.filter(s=>s.won).length }, base, 4)
    const confidence = Math.max(0, Math.min(1, (local - base - 0.12) / 0.27))
    return laneChange + outagePremium * confidence
  }
}
