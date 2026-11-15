import {supplyWeights as w} from './level4-supply-weights.ts'
import type {Leg,Road} from './reference/typescript/types.ts'

/** Invert the observed probability of finding a driver in the first hour, taking
 * road distance, the two towns, booking appointments and working hours into account.
 */
export function level4Fee(leg:Leg,road:Road,posted:number,at:number,latest:number,target:number,escalation:number):number {
  const origin=leg.pickup.placeId, dest=leg.delivery.placeId
  const slack = Math.max(0,latest-posted)
  const base=w.intercept! + w.km!*Math.log(Math.max(20,road.km)/160) + w.local!*Number(origin===dest)
    + (w['origin:'+origin]??0)+(w['dest:'+dest]??0)
    + w.privatePickup!*Number(leg.pickup.privateAddress)+w.privateDrop!*Number(leg.delivery.privateAddress)
    + w.morning!*Number(posted%1440<660)+w.late!*Number(posted%1440>960)
    + w.longWait!*Math.min(1,Math.max(0,(leg.pickup.window.from-posted)/720))
    + w.slack!*Math.log(Math.max(140,Math.min(slack,4320))/720)
    + w.remainingDays!*(Math.min(4,Math.floor(posted/1440))/5)
  const initial=Math.min(.9,Math.max(.19,target + 0.25*Math.max(0,1-slack/450)))
  const median=(1254+20.8*road.km)*Math.exp(-base/w.price!)
  const initialFee=median*Math.exp(Math.log(initial/(1-initial))/w.price!)
  const critical=Math.min(500,175+road.minutes*0.75)
  const pressure = Math.max(0,Math.min(1,(critical-(latest-at))/critical))
  const age = Math.max(0, at-posted)
  return Math.round(initialFee*(1+escalation*pressure+0.045*Math.min(2,age/180)))
}
