import assert from 'node:assert/strict'
import test from 'node:test'
import {DealerTrust,unevenSupply} from './level8-policy.ts'
import type {DeskEvent} from './reference/typescript/types.ts'
function outcome(id:string,late:boolean,seq:number): DeskEvent[] {
  const at=seq*60
  const w={kind:'order_won',seq,at,order:{id,dealerId:'dealer'}} as DeskEvent
  const rev={kind:'ledger',seq:seq+1,at:at+30,line:{kind:'revenue',orderId:id}} as DeskEvent
  const refund={kind:'ledger',seq:seq+2,at:at+30,line:{kind:'late_refund',orderId:id}} as DeskEvent
  return late?[w,rev,refund]:[w,rev]
}
test('dealer trust caps at 25, halves on late delivery, and can rebuild from event history',()=>{
 const tx=new DealerTrust(), history:DeskEvent[]=[]
 for(let i=0;i<28;i++){
   const e=outcome('r'+i,false,3*i);tx.observe(e);history.push(...e)
 }
 assert.equal(tx.factor('dealer'),1.25)
 const late=outcome('late',true,90)
 tx.observe(late);history.push(...late)
 assert.equal(tx.factor('dealer'),1.12)
 assert.equal(tx.factor('other'),1)
 const recovered=new DealerTrust();recovered.observe(history);assert.equal(recovered.factor('dealer'),1.12)
})
test('thin long-haul and saturated pickup regions can decline separately',()=>{
 assert.equal(unevenSupply(9,8,100,0),true)
 assert.equal(unevenSupply(9,8,200,0),false)
 assert.equal(unevenSupply(95,70,200,10),false)
 assert.equal(unevenSupply(95,70,200,0),true)
})
