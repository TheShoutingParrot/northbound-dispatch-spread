import type { PriceRequest, StopPlace, TimeWindow } from './reference/typescript/types.ts'

/** Stop windows use absolute world minutes. Hours use minutes since midnight. */
export interface NoteRisk {
  pickupWindow?: TimeWindow
  deliveryWindow?: TimeWindow
  pickupHours?: TimeWindow
  deliveryHours?: TimeWindow
  deadline?: number
  readyAt?: number
  manualLicence: boolean
  withPlates: boolean
  summerTyres: boolean
  uncertain: boolean
  reasons: string[]
}
const DAY = 1440
const fullDay = (): TimeWindow => ({from:0, to:DAY-1})
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/[’']/g,"'").replace(/[‐‑–—]/g,'-')
const weekdays = [
  /\b(?:maanantai\w*|maanant\w*|mandag\w*|monday|monay|mon|ma|man)\b/,
  /\b(?:tiistai\w*|tisdag\w*|tuesday|tues?|ti|tis)\b/,
  /\b(?:keskiviik\w*|onsdag\w*|wednesday|wed|ke|ons)\b/,
  /\b(?:torstai\w*|torsdag\w*|thursday|thurs?|thu|tor|to(?=\s*\.|\s+(?:klo|kl)\b))\b/,
  /\b(?:perjantai\w*|fredag\w*|friday|fri|pe|fre)\b/,
  /\b(?:lauantai\w*|lordag\w*|saturday|sat|la|lor)\b/,
  /\b(?:sunnuntai\w*|sondag\w*|sunday|sun|su|son)\b/,
]
function dayOf(clause: string, arrivalDay: number): number | undefined {
  if (/day after tomorrow|overmorgon|ylihuomen|ylihuom/.test(clause)) return arrivalDay+2
  if (/tomorrow|\btmrw\b|\btmr\b|\bhuomen(?:na)?\b|i\s*morgon/.test(clause)) return arrivalDay+1
  if (/today|tanaan|i\s*dag/.test(clause)) return arrivalDay
  for (let i=0; i<weekdays.length; i++) if (weekdays[i]!.test(clause)) {
    const delta=(i-arrivalDay%7+7)%7
    if (delta>=2) return arrivalDay+delta
  }
}
const clockWords: [RegExp,number][] = [
  [/\b(?:one|ett|en|ettan|yksi|yhdelt[ae]|yhden|yhteen)\b/g,13],
  [/\b(?:two|tva|tv[ao]an|kaksi|kahde[ln][alt]?a?|kahteen|kahdelta)\b/g,14],
  [/\b(?:three|tre|kolme|kolmelta|kolmen|kolmeen)\b/g,15],
  [/\b(?:four|fyra|nelja|neljalta|neljan|neljaan)\b/g,16],
  [/\b(?:five|fem|viisi|viidelta|viiden|viiteen)\b/g,17],
  [/\b(?:nine|nio|yhdeksan|yhdeksalta|yhdeksaan)\b/g,9],
  [/\b(?:ten|tio|kymmenen|kymmenelta|kymmeneen)\b/g,10],
  [/\b(?:eleven|elva|yksitoista|yhdeltatoista|yhdestatoista|yhteentoista)\b/g,11],
  [/\b(?:twelve|tolv|kaksitoista|kahdeltatoista|kahdestatoista|kahteentoista|noon|keskipaiva\w*)\b/g,12],
]
function times(text: string): number[] {
  const finnishHalf: Record<string,string>={yhteen:'one',yhdesta:'one',kahteen:'two',kahdesta:'two',kolmeen:'three',kolmesta:'three',neljaan:'four',neljasta:'four',viiteen:'five',viidesta:'five'}
  const s=text.replace(/puoli\s+(yhteen|yhdesta|kahteen|kahdesta|kolmeen|kolmesta|neljaan|neljasta|viiteen|viidesta)\b/g,(_,w:string)=> 'half '+finnishHalf[w]).replace(/\b(?:half(?:\s+past)?|halv|puoli)\s*(one|two|three|four|five|nine|ten|eleven|twelve|ett|tva|tre|fyra|fem|nio|tio|elva|tolv|yksi|kaksi|kolme|nelja|viisi|yhdeksan|kymmenen)\b/g,(match,word:string) => {
    const entry=clockWords.find(([re])=>new RegExp(re.source).test(word))
    if (!entry) return match
    return (match.startsWith('half past') ? entry[1] : entry[1]-1)+':30'
  })
  const found: {at:number; minutes:number}[]=[]
  for (const m of s.matchAll(/\b(\d{1,2})(?:[.:h](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?!\w)/g)) {
    const h=Number(m[1]), min=Number(m[2]??0)
    const ampm=m[3]?.[0]
    if (h>23 || min>59 || (ampm && (h===0 || h>12))) continue
    if (/^\s*(?:minutes?|min\b|km\b|hours?\b|timmar\b)/.test(s.slice(m.index+m[0].length))) continue
    found.push({at:m.index,minutes:(ampm ? h%12+(ampm==='p'?12:0) : h)*60+min})
  }
  for (const [re,h] of clockWords) for (const m of s.matchAll(re)) {
    // Swedish "en" is an article unless attached to an explicit clock cue.
    if (m[0]==='en' && !/(?:kl\.?|klockan|vid)\s*$/.test(s.slice(0,m.index))) continue
    found.push({at:m.index,minutes:h*60})
  }
  return found.sort((a,b)=>a.at-b.at).map(t=>t.minutes)
}
const pickup=/\b(?:liike|we close|aukioloajat|auki arkisin|open weekdays)\b|nou[dt]a|nouata|haettav|pick.?up|collect|handover|release|nout|noudett|haetta|hakea|luovut|hamt|avhamt|utlamn|utleverans|lahto|lastning/
const delivery=/kohde|toimitusosoite|destination|deliver|drop.?off|arriv|at destination|receiv|recep|perill|peril|perille|toimit|vastaanot|maaranpaa|kohtee|leverans|leverer|framme|mottag|lamnas/
const ready=/read(?:y|iness)|available|release|payment|paid|bank|valmi|valmii|vapau|maksu|maksun|maksaa|maksettu|tili|klar\b|redo\b|betal|betald|frigiv|huoll|service/
const after=/not before|no earlier|earliest|only after|\bafter\b|\bfrom\b|\bopens?\b|\bopen from|ei ennen|aikais|jalkeen|alkaen|lahtien|vasta|avautu|aukea|tidigast|inte for[er]?\b|forst|efter|fran|oppnar/
const before=/\bby\b|\bbefore\b|latest|no later|until|closes?|deadline|due|ennen|mennessa|viim|asti|saakka|sulj|sulke|kiinni|senast|fore\b|stang|till\b/
const recurring=/every\s*(?:week)?day|weekdays?|daily|biz days|opening hours|hours? (?:are|of)|reception|receiving|arkisin|arkipaiv|auki|aukea|sulje|sulke|kiinni|vastaanot|oppettid|vardag|oppet|mottag|stanger|oppnar|closes? at|opens? at/
const targetDeadline=/by|deadline|due|must|arriv|destination|viim|mennessa|takara|perill|perille|senast|framme/
const clauseBreak = /[;!\n]+|\.(?=\s+(?![0-9]))|\s+\/\s+|\s+(?:and|och|ja)\s+(?=(?:no plates|no registration|manual|summer|without plates|pickup|delivery|deliver|collection|reception|nouto|toimitus|vastaanotto|ei kil|kesaren|hamt|leverans|sommardack|manuell))/
function constrain(base: TimeWindow, requested: TimeWindow): TimeWindow {
  return {from:Math.max(base.from,requested.from), to:Math.min(base.to,requested.to)}
}
function dayWindow(stop: StopPlace, window: TimeWindow, daily: TimeWindow, notBefore: number) {
  const start=Math.max(notBefore,window.from)
  for (let day=Math.floor(start/DAY); day<=Math.floor(window.to/DAY); day++) {
    const weekday=day%7, h=stop.hours
    const open=!h ? fullDay() : weekday===5 && h.saturday ? {from:h.saturday.opens,to:h.saturday.closes} :
      weekday<5 && h.weekdays.includes(weekday) ? {from:h.opens,to:h.closes} : undefined
    if (!open) continue
    const result=constrain({from:start,to:window.to},{from:day*DAY+Math.max(open.from,daily.from),to:day*DAY+Math.min(open.to,daily.to)})
    if (result.from<=result.to) return result
  }
}
export function readNote(request: PriceRequest, legIndex: number, notBefore=request.respondBy): NoteRisk {
  const risk: NoteRisk={manualLicence:false,withPlates:false,summerTyres:false,uncertain:false,reasons:[]}
  const leg=request.legs[legIndex]
  if (!leg || !request.note?.text) return risk
  let original=norm(request.note.text)
  // Reveals attach note facts to the outbound car, even when a trade-in reminder accompanies them.
  if (legIndex!==0) return risk
  const problem=(s:string)=>{risk.uncertain=true;if (!risk.reasons.includes(s)) risk.reasons.push(s)}
  // Remove unambiguous denials of a date or time, keeping "not before"/"ei ennen" intact.
  original=original.replace(/\b(?:not|ei|inte)\s+(?!before|ennen|fore|efter|after|till|later|earlier)(?:at\s+|klo\s*|kl\.?\s*)?(?:\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?|tomorrow|today|tmrw|huomenna|tanaan|i\s*morgon|i\s*dag)\b/g,' ')
  original=original.replace(/\b(viim|tor|ke|pe|ma|ti|to|fre|ons|thu|fri)\.(?=\s)/g,'$1 ').replace(/\bkl\.\s*/g,'kl ').replace(/\bklo\.\s*/g,'klo ')
  const corrected = original.split(/\b(?:correction|correct(?:ed)? time|actually|korjaus|korjaan|tarkennus|rat[t]?else|korrigering|ei\s*kun|eiku|rather|jag menar)\s*[:,-]?\s*/g)
  const pieces = corrected.flatMap((part,j)=>part.split(clauseBreak).map((s,i)=>({s:s.trim(),correction:j>0 && i===0}))).filter(c=>c.s)
  const arrivalDay=Math.floor(request.arrivedAt/DAY)
  let pw={...leg.pickup.window}, dw={...leg.delivery.window}
  let previous: {target:'pickup'|'delivery';direction:'from'|'to';day:number;daily:boolean}|undefined
  let touchedPickup=false,touchedDelivery=false
  for (const {s,correction} of pieces) {
    if (/manuaal|manuell|manual (?:gear|transmission|licen[cs]e)|stick shift|\bmanual\b|kasivaiht/.test(s) && !/not (?:a )?manual|ei manuaali|inte manuell/.test(s)) risk.manualLicence=true
    if (/ei rekkareita|koekilvet|kilvet poistettu|unregistered|needs trade plates|no (?:registration |number |license |licence |transfer )?plates|without (?:the |any )?(?:registration )?plates|plates? (?:are )?(?:missing|removed)|needs? (?:transfer |temporary )?plates|plate[- ]?less|ei (?:ole )?(?:rekisteri)?kilpi|kilvettom|kilveton|ilman (?:rekisteri)?kilp|kilvet puutt|siirto(?:kil|tar)|utan (?:reg(?:istrerings)?\.?\s*)?skylt|saknar (?:reg(?:istrerings)?\.?\s*)?skylt|inga (?:reg(?:istrerings)?\.?\s*)?skylt|provskylt/.test(s)) risk.withPlates=true
    const spare=/spare|spare wheels?|in the (?:boot|trunk|car)|back ?seat|bakluck|foljer med|takakont|vanteineen|tavaratil|kontissa|takapenk|mukaan|lisaren|extra|bagage|ligger i bilen/.test(s)
    if (!spare && /summer (?:rubber|t[iy]res)|kesaren|kesakum|sommardack|sommargum/.test(s) && !/no summer|inte sommardack|ei kesaren/.test(s)) risk.summerTyres=true
    const isDelivery=delivery.test(s), isPickup=pickup.test(s), isReady=ready.test(s)
    const target = isDelivery ? 'delivery' : isPickup || isReady ? 'pickup' : correction ? previous?.target : undefined
    if (!target) continue
    const clock=times(s)
    // "service book is in the glovebox" and pickup/contact instructions are common harmless notes.
    if (!clock.length) {
      if ((/not ready|ready (?:on|at|after)|ei valmis|valmis vasta|klar forst|not before|ei ennen|inte fore/.test(s) || ((after.test(s)||before.test(s)) && /\b(?:klo|kl|o'clock)\b/.test(s)))) problem('unresolved time')
      continue
    }
    if (isPickup && isDelivery && clock.length>1 && !/kohde|vastaanott|destination|receiving/.test(s)) {problem('ambiguous stop times');continue}
    const explicitDay=dayOf(s,arrivalDay)
    const day=explicitDay ?? (correction ? previous?.day : undefined) ?? arrivalDay
    const range=clock.length>=2 && /\d\s*(?:-|to\b|till\b)\s*(?:klo\s*|kl\s*)?\d|(?:\d|\d:sta|\d:aan|\d\.\d\d)\s*-\s*\d|\d+:sta\s+\d+:aan|between.{1,15}\band\b|mellan.{1,15}\boch\b/.test(s)
    const isAfter=after.test(s.replace(/(?:the )?day after tomorrow/g,"tomorrow")) || (isReady && !isDelivery)
    const isBefore=before.test(s) || /viim\b/.test(s)
    if (!range && !isAfter && !isBefore && !isReady && !correction) {if (/\b(?:klo|kl|at)\s*\d/.test(s)) problem('unknown stop timing');continue}
    const hasWeekdays=/ma\s*-\s*pe|mon\s*-\s*fri|man\s*-\s*fre|arkisin|weekdays?|vardag/.test(s)
    const daily=(correction && previous?.daily) || (explicitDay===undefined || hasWeekdays) && !isReady && (recurring.test(s) || range || (target==='pickup' && !isAfter && isBefore)) && !/must|deadline|maaraai|takara/.test(s)
    const direction=(!isAfter && isBefore) ? 'to' : isAfter || isReady ? 'from' : previous?.direction
    if (!range && !direction) {problem('unknown time direction');continue}
    if (clock.length>1 && !range && !correction) {problem('conflicting times');continue}
    const v=clock.at(-1)!
    if (correction && previous?.target===target) {
      const bound=previous.direction
      const stop=target==='pickup'?leg.pickup:leg.delivery
      if (target==='pickup') {pw[bound]=stop.window[bound];if(previous.daily) delete risk.pickupHours}
      else {dw[bound]=stop.window[bound];if(previous.daily)delete risk.deliveryHours;delete risk.deadline}
    }
    const bounds=range ? {from:clock[0]!,to:clock[1]!} : direction==='from' ? {from:v,to:DAY-1} : {from:0,to:v}
    if (bounds.from>bounds.to) {problem('invalid time range');continue}
    if (daily) {
      if(target==='pickup') risk.pickupHours=constrain(risk.pickupHours??fullDay(),bounds)
      else risk.deliveryHours=constrain(risk.deliveryHours??fullDay(),bounds)
    } else {
      const cap={from:direction==='to' && !range ? -Infinity : day*DAY+bounds.from,to:direction==='from' && !range ? Infinity : day*DAY+bounds.to}
      if (target==='pickup') {pw=constrain(pw,cap);touchedPickup=true;if(direction==='from' && !range) risk.readyAt=day*DAY+v}
      else {dw=constrain(dw,cap);touchedDelivery=true;if(direction==='to' && (targetDeadline.test(s) || correction)) risk.deadline=day*DAY+v}
    }
    previous={target,direction:direction??'to',day,daily}
  }
  for (const [target,base,window,touched,daily] of [
    ['pickup',leg.pickup,pw,touchedPickup,risk.pickupHours],['delivery',leg.delivery,dw,touchedDelivery,risk.deliveryHours],
  ] as const) {
    if (!daily && !touched) continue
    const chosen=daily ? dayWindow(base,window,daily,notBefore) : window
    if (!chosen || chosen.from>chosen.to) {problem('stated window does not fit note');continue}
    if(chosen.from!==base.window.from || chosen.to!==base.window.to) risk[target==='pickup'?'pickupWindow':'deliveryWindow']=chosen
  }
  if (risk.manualLicence) risk.reasons.push('manual licence')
  if (risk.withPlates) risk.reasons.push('transfer plates')
  if (risk.summerTyres) risk.reasons.push('summer tyres in snow')
  return risk
}
