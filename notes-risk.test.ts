import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readNote } from './notes-risk.ts'
import type { PriceRequest } from './reference/typescript/types.ts'

const day=1440, hours={opens:480,closes:1200,weekdays:[0,1,2,3,4],saturday:null}
function parse(text:string, arrivedAt=540, notBefore=arrivedAt+15) {
  const place={placeId:'a',privateAddress:false,window:{from:arrivedAt,to:arrivedAt+6*day},hours}
  const request:PriceRequest={id:'R',batchId:null,dealerId:'D',arrivedAt,respondBy:arrivedAt+15,referenceFeeCents:5000,
    legs:[{pickup:place,delivery:{...place,placeId:'b'},car:{premium:false,electric:false,chargePercent:null}}],
    options:[{kind:'next_day',deadline:arrivedAt+3*day,listPriceCents:8000}],note:{text,language:'fi'}}
  return readNote(request,0,notBefore)
}
test('one-time handover and tightened delivery deadline use arrival-relative days',()=>{
  assert.equal(parse('Handover once paid, tmrw 2pm at the earliest.').pickupWindow?.from,day+14*60)
  assert.equal(parse('Luovutus maksun jälkeen, huomenna puoli kahdesta alkaen.').pickupWindow?.from,day+13*60+30)
  assert.equal(parse('Perillä torstaina 18 mennessä.').deadline,3*day+18*60)
  assert.equal(parse('At destination the day after tomorrow by half three').deadline,2*day+14*60+30)
  assert.equal(parse('Must be at destination by tomorrow 5 pm, not 3pm.').deadline,day+17*60)
  assert.equal(parse('Toimitus perille viim. perjantaina klo 15.').deadline,4*day+15*60)
})
test('window constraints preserve corrections, weekday site hours and valid later retry days',()=>{
  const note='Kohde sulkee klo 18. Korjaus: klo 17. Lisäksi 4 kesärengasta tavaratilassa.'
  const result=parse(note)
  assert.equal(result.deliveryHours?.to,17*60)
  assert.equal(result.deliveryWindow?.to,17*60)
  assert.equal(result.summerTyres,false)
  assert.equal(parse('Open weekdays 9:00 - 15:30.',540,2*day+810).pickupWindow?.to,2*day+15*60+30)
  assert.equal(parse('Perillä ke klo 14 mennessä. Nouto ennen klo 19.').pickupHours?.to,19*60)
})
test('equipment requirements distinguish fitted tyres from spare cargo',()=>{
  assert.equal(parse('Manuell växellåda. Inga skyltar på bilen.').manualLicence,true)
  assert.equal(parse('Manuell växellåda. Inga skyltar på bilen.').withPlates,true)
  assert.equal(parse('Ei rekkareita, koekilvet tarvitaan!').withPlates,true)
  assert.equal(parse('Huom vielä kesärenkaat alla, asiakkaan vanha auto takaisin meille.').summerTyres,true)
  assert.equal(parse('Summer tyres in the boot. Keys in the office.').summerTyres,false)
  assert.equal(parse('Key box 431049. Please call before you arrive.').uncertain,false)
})

test('pickup readiness and real shop hours can occur together',()=>{
  const late=parse('Voi noutaa huomenna kahdestatoista alkaen. Liike menee kiinni 18.00.')
  assert.equal(late.pickupWindow?.from,day+12*60)
  assert.equal(late.pickupWindow?.to,day+18*60)
  assert.equal(parse('Noudettavissa aikaisintaan ke klo 12.').pickupWindow?.from,2*day+12*60)
  const shop=parse('Terve. Huom aukioloajat klo 10.00-17.00. Oltava perillä viimeistään klo 20.00.')
  assert.deepEqual(shop.pickupHours,{from:600,to:1020})
  assert.equal(shop.deadline,1200)
})
