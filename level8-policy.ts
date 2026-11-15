import type {DeskEvent} from './reference/typescript/types.ts'

/** Dealer trust counts completed orders. Revenue and any late refund arrive
 * together, after the last car, and a cancellation never contributes revenue.
 */
export class DealerTrust {
  private dealers = new Map<string,string>()
  private counts = new Map<string,number>()
  observe(events:DeskEvent[]) {
    const completed=new Map<string,boolean>()
    for(const event of events){
      if(event.kind==='order_won')this.dealers.set(event.order.id,event.order.dealerId)
      if(event.kind!=='ledger'||!event.line.orderId)continue
      const id=event.line.orderId
      if(event.line.kind==='revenue'&&!completed.has(id))completed.set(id,true)
      if(event.line.kind==='late_refund')completed.set(id,false)
    }
    for(const [id,onTime] of completed){
      const dealer=this.dealers.get(id)
      if(!dealer)continue
      const n=this.counts.get(dealer)??0
      this.counts.set(dealer,onTime?Math.min(25,n+1):Math.floor(n/2))
      this.dealers.delete(id)
    }
  }
  factor(dealer:string){return 1+(this.counts.get(dealer)??0)*.01}
}

/** Prevent a thin home market or a wave of departures from concentrating the
 * week's late-refund exposure in one part of the map.
 */
export function unevenSupply(origin:number,dest:number,minutes:number,waiting:number) {
  if(origin<8||dest<6||waiting>=Math.max(3,Math.ceil(origin*.09)))return false
  if(minutes>180 && Math.min(origin,dest)<11)return false
  return true
}
