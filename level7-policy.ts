import type {Leg,Road} from './reference/typescript/types.ts'
import {level4Fee} from './level4-fee.ts'

/** Estimate the work of a shortage-week gig using practice booking costs, the
 * current week's available drivers, and known special handling on this car. */
export function shortageFee(leg:Leg,road:Road,posted:number,at:number,latest:number,opening:number,escalation:number,
  localDrivers:number,handling:number) {
  latest = Number.isFinite(latest) ? latest : at
  const sparse = Math.max(0,Math.min(.18, .18 - .04*Math.log1p(localDrivers)))
  const normal = level4Fee(leg,road,posted,at,latest,.69,.55)
  return Math.max(1,Math.round(normal*(opening + sparse + handling) +
    500*Math.max(0,1-road.km/75) + 1200*escalation*Math.max(0,1-(latest-at)/300)))
}

/** Reserve capacity for the elevated cost of a late booking or long recovery. */
export function shortageAccept(leg:Leg,road:Road,slack:number,originDrivers:number,destDrivers:number,waiting:number) {
  if(road.km<18||destDrivers<4||originDrivers<6)return false
  const near = Math.min(originDrivers,destDrivers)
  const required = 100 + .36*road.minutes + Math.min(140,700/(near+1)) +
    (leg.pickup.privateAddress||leg.delivery.privateAddress?65:0) + Math.min(200,waiting*35)
  return slack>=required && waiting < Math.max(4,originDrivers*.15)
}
