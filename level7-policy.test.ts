import assert from 'node:assert/strict'
import test from 'node:test'
import {shortageAccept,shortageFee} from './level7-policy.ts'
import type {Leg} from './reference/typescript/types.ts'
const place = {placeId:'turku',privateAddress:false,window:{from:540,to:1200},hours:null}
const leg:Leg={pickup:place,delivery:{...place,placeId:'tampere'},car:{electric:false,premium:false,chargePercent:null}}
const road={from:'turku',to:'tampere',minutes:110,km:160}
test('a failed appointment still gets a finite shortage rescue quote',()=>{
  const fee=shortageFee(leg,road,540,1000,-Infinity,1.13,.5,35,.1)
  assert.ok(Number.isSafeInteger(fee)&&fee>0)
  assert.equal(fee,shortageFee(leg,road,540,1000,1000,1.13,.5,35,.1))
})
test('shortage-week admission requires local drivers, feasible lead and spare pickup capacity',()=>{
  assert.equal(shortageAccept(leg,road,420,30,15,0),true)
  assert.equal(shortageAccept(leg,road,420,2,15,0),false)
  assert.equal(shortageAccept(leg,road,60,30,15,0),false)
  assert.equal(shortageAccept(leg,road,420,30,15,5),false)
})
