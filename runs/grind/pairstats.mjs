// Pair gigs in a variant's practice weeks: how many, booked share by shape (round trip or not), fee against the singles. Offline.
import fs from 'node:fs'
const [variant] = process.argv.slice(2)
const rows=fs.readFileSync('runs/grind/results.jsonl','utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(x=>x.level===8&&x.clean&&x.variant===variant&&(!process.argv[3]||process.argv[3].split(',').includes(x.seed)))
const map=JSON.parse(fs.readFileSync('runs/l7-next/data/map.json'));const road=new Map(map.roads.map(r=>[r.from+'>'+r.to,r]))
const agg={}; let weeks=0, singles=0, orders=0
for(const r of rows){
  const f=`runs/l7-next/data/${r.worldId}.json`; if(!fs.existsSync(f))continue; weeks++
  const ev=JSON.parse(fs.readFileSync(f)).events
  const steps=fs.readFileSync(`runs/grind/runs/l8/${variant}/${r.seed}/${r.worldId}/steps.jsonl`,'utf8').trim().split('\n').map(l=>JSON.parse(l))
  const won=new Map(ev.filter(e=>e.kind==='order_won').map(e=>[e.order.id,e.order])); orders+=won.size
  const booked=new Map(ev.filter(e=>e.kind==='gig_booked').map(e=>[e.gigId,e])), dropped=new Set(ev.filter(e=>e.kind==='gig_dropped').map(e=>e.gigId)), started=new Set(ev.filter(e=>e.kind==='gig_started').map(e=>e.gigId))
  for(const s of steps)for(const [i,a] of (s.actions||[]).entries()){ if(a.type!=='post'||!s.results[i]?.ok)continue
    const os=[...new Set(a.stops.map(x=>x.orderId))]; if(os.length<2){singles++;continue}
    const A=won.get(os[0]).legs[0],B=won.get(os[1]).legs[0]
    const back=road.get(B.delivery.placeId+'>'+A.pickup.placeId)
    const shape=B.delivery.placeId===A.pickup.placeId?'round trip (B ends where A starts)':back&&back.minutes<=45?'near round trip (<=45 min from start)':'open chain'
    for(const k of ['all pairs',shape]){const x=agg[k]??={n:0,booked:0,started:0,dropped:0,fee:0,lag:0}
      x.n++; const b=booked.get(s.results[i].id); if(b){x.booked++;x.fee+=b.feeCents/a.schedule[0].feeCents;x.lag+=b.at-s.now}
      if(started.has(s.results[i].id))x.started++; if(dropped.has(s.results[i].id))x.dropped++ }
  }
}
console.log(variant,weeks,'weeks;',orders,'orders;',singles,'single posts')
for(const [k,x] of Object.entries(agg))console.log(k.padEnd(40),'posted',String(x.n).padStart(5),'booked',String(x.booked).padStart(5),(100*x.booked/x.n).toFixed(0)+'%','started',x.started,'dropped',x.dropped,'| booked at',(x.fee/Math.max(1,x.booked)).toFixed(2),'of pair opening fee, after',(x.lag/Math.max(1,x.booked)).toFixed(0),'min')
