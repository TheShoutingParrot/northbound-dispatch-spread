import type {Leg,Road} from './reference/typescript/types.ts'
import {level4Fee} from './level4-fee.ts'

/** Estimate the work of a shortage-week gig using practice booking costs, the
 * current week's available drivers, and known special handling on this car. */
export function shortageFee(leg:Leg,road:Road,posted:number,at:number,latest:number,opening:number,escalation:number,
  localDrivers:number,handling:number,pressure=.55) {
  latest = Number.isFinite(latest) ? latest : at
  const sparse = Math.max(0,Math.min(.18, .18 - .04*Math.log1p(localDrivers)))
  // `pressure` is how far the modelled fee rises as the last pickup approaches (v1: .55).
  const normal = level4Fee(leg,road,posted,at,latest,.69,pressure)
  return Math.max(1,Math.round(normal*(opening + sparse + handling) +
    500*Math.max(0,1-road.km/75) + 1200*escalation*Math.max(0,1-(latest-at)/300)))
}

/** Reserve capacity for the elevated cost of a late booking or long recovery. */
export function shortageAccept(leg:Leg,road:Road,slack:number,originDrivers:number,destDrivers:number,waiting:number,minOrigin=6,minDest=4,minKm=18) {
  if(road.km<minKm||destDrivers<minDest||originDrivers<minOrigin)return false
  const near = Math.min(originDrivers,destDrivers)
  const required = 100 + .36*road.minutes + Math.min(140,700/(near+1)) +
    (leg.pickup.privateAddress||leg.delivery.privateAddress?65:0) + Math.min(200,waiting*35)
  return slack>=required && waiting < Math.max(4,originDrivers*.15)
}

/** Minutes over which a patient fee rises to the full fee: a share of the time before the
 * deadline-pressure window, optionally capped. Zero means no ramp. */
export function rampSpan(road:Road,posted:number,latest:number,start:number,share:number,cap=0) {
  if(!(start<1)||!Number.isFinite(latest)||share<=0)return 0
  const room=latest-Math.min(500,175+road.minutes*.75)-posted
  if(room<=0)return 0
  return cap>0?Math.min(cap,share*room):share*room
}
/** Patient fee: the share of the full shortage fee shown `at`, rising in a straight line from `start` to 1. */
export function feeRamp(road:Road,posted:number,at:number,latest:number,start:number,share:number,cap=0) {
  const span=rampSpan(road,posted,latest,start,share,cap)
  return span<=0?1:start+(1-start)*Math.max(0,Math.min(1,(at-posted)/span))
}
/** Minutes at which a ramped fee steps up. */
export function rampTimes(road:Road,posted:number,latest:number,start:number,share:number,cap=0,steps=6) {
  const span=rampSpan(road,posted,latest,start,share,cap)
  return span<=0?[]:Array.from({length:steps},(_,k)=>Math.ceil(posted+span*(k+1)/steps))
}
