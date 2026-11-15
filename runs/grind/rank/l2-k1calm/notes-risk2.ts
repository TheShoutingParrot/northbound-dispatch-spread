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

// Dealer notes carry one-letter typos (a dropped, doubled or swapped letter). A word of five letters
// or more that is not a known note word, and is one such edit away from exactly one known word,
// reads as that word. Known words are listed in their normalised form (no diacritics).
const VOCAB = new Set(`
  advance after aikaisintaan ajettu alkaen along apukaynnistyksen arkipaivisin arkisin arrival arrive asiakas asiakkaalle asiakkaan aukeaa aukioloajat
  automaatti automaattivaihteinen automat automatic auton autossa available avaimet avain avainboksissa avautuu avhamtning avoinna bagaget bakluckan
  batteri battery before betald betalning between bilen booking bring buckla bumper buyer cheers clears close closed closes collect collection comes
  correction customer dacken dacksats deliver delivery destination direkt driver earliest edessa efter eikun eleven ennen ensin erityista etukateen
  extra first foljer forhand forlat forsaljningen forst framat framme fredag friday gamla garden gearbox glovebox haettava haettavissa hakea hakemaan
  halsningar hamtar hamtas hamtning handover handskfacket hanskalokerossa heikko hejsan hello hemma hoger hours huollon huollosta huolto huoltokirja
  huomenna hyvaa ilman ilmoita imorgon innan irrotettu issues jalkeen jumittaa kahdelta kahdeltatoista kahden kahdentoista kahdesta kahdestatoista
  kahta kahtatoista kahteen kahteentoista kaksi kaksitoista kasivaihteinen kassan kauppa kauppakirja kello kesakumit kesarengasta kesarenkaat
  kesarenkailla kesken keskiviikko keskiviikkona ketaan kiinni kiire kiitos kiitti kilpia kilvet klockan koekilvet kohde kohteen kolhu kolme kolmea
  kolmeen kolmelta kolmen kolmesta kontissa koodi korjaus kotoa kotona kuljettajalla kuljettajalle kulkee kunden kundens kuski kuvaa kymmeneen
  kymmenelta kymmenen kymmenesta kymmenta kyydissa lahdet lahella lahtien lamnas later latest lauantai lauantaina leverans licence ligger liike
  liikkeelle liikkeen liikkeeseen lisaksi lisarenkaat liten lordag luovutuksia luovutus maanantai maanantaihin maanantaina maksaa maksettu maksun
  mandag manuaali manuaalia manuaalikortin manuaalivaihteet manuaalivaihteinen manual manuell maste meidan meilla meille mellan menee mennessa moikka
  monday morgon mottagaren mottagning mukaan mukana myyja myyjalta myynti naarmu needs nelja neljaa neljaan neljalta neljan neljasta nobody normaali
  nothing noudettavaksi noudettavissa noutaa noutaessa nouto noutoa nyckelbox nyckeln nycklar odottaa oikeus ollaan oltava omistaja ongelmia onnistuu
  onsdag opening opens oppet oppettider oppnar order ordernr ostaja overmorgon ovessa paikalla paivanjatkoa paljon paperit papers pappren payment
  perilla perille perjantai perjantaina pesematta photos picks pickup pieni pihalla pihasta pitaa plates plats poistettu provskyltar puoli puuttuu
  rahoitus ready receiving reception receptionen referens registration registreringsbevis rekisterikilvet rekisteriote rekisterista rekkareita release
  released removed rengassarja rengasta renkaat renkaita right ruudussa saakka saapumista saknar sales saljaren sarja sarjaa saturday scratch second
  seller senast service servicebok shift siirto siirtokilvet silloin sitten sitter skyltar small soita sommardack sommardacken sondag sopii sorry spare
  special standard stanger stangt start stick still suljetaan suljettu sulkee summer summers sunday sunnuntai sunnuntaina svagt taalla takaisin
  takakontissa takaluukku takapenkilla takapuskurissa talvet talvirenkaat talvirenkaita tanaan tankissa tarvii tarvita tarvitaan tassa tavallinen
  tavaratilassa terve terveisin thank thanks there three thursday tidigast tiistai tiistaina tilausnro tilausnumero tillbaka timme tisdag tiskilta
  today toimistosta toimitukset toimitus toimitusosoite toinen tomorrow torsdag torstai torstaina trade transfer transmission transport trunk tuesday
  tulee tulet tuntia twelve tyres unregistered until utlamnas utlamning vahan vahvistuu vaihdettu vaihtari vaihtoauto valilla valmiina valmis valmistuu
  vanha vanlig vanteilla vanteineen varaus vardagar vasta vastaanotetaan vastaanottaja vastaanottajalle vastaanottava vastaanotto viela viidelta viiden
  viidesta viimeistaan viisi viite viiteen viitenro viitta vinterdack vinterdacken waiting wednesday weekdays wheels winter winters workshop yhdeksaa
  yhdeksaan yhdeksalta yhdeksan yhdeksasta yhdelta yhdeltatoista yhden yhdentoista yhdesta yhdestatoista yhtatoista yhteen yhteentoista yksitoista
  ylihuomenna ylimaarainen
`.trim().split(/\s+/))
const repaired = new Map<string,string>()
function oneEditApart(a: string, b: string): boolean {
  const la=a.length, lb=b.length
  if (a===b || Math.abs(la-lb)>1) return false
  let i=0
  while (i<la && i<lb && a[i]===b[i]) i++
  if (la===lb) return a.slice(i+1)===b.slice(i+1) || (a[i]===b[i+1] && a[i+1]===b[i] && a.slice(i+2)===b.slice(i+2))
  return la<lb ? a.slice(i)===b.slice(i+1) : a.slice(i+1)===b.slice(i)
}
function repair(token: string): string {
  if (token.length<5 || VOCAB.has(token)) return token
  const known=repaired.get(token)
  if (known!==undefined) return known
  let found: string|undefined, several=false
  for (const word of VOCAB) if (oneEditApart(token,word)) {
    if (found!==undefined) {several=true;break}
    found=word
  }
  const result=found!==undefined && !several ? found : token
  if (repaired.size>20000) repaired.clear()
  repaired.set(token,result)
  return result
}

const weekdays = [
  /\b(?:maanantai\w*|maanant\w*|mandag\w*|monday|monay|mon|ma|man)\b/,
  /\b(?:tiistai\w*|tisdag\w*|tuesday|tues?|ti|tis)\b/,
  /\b(?:keskiviik\w*|onsdag\w*|wednesday|wed|ke|ons)\b/,
  /\b(?:torstai\w*|torsdag\w*|thursday|thurs?|thu|tors?|to(?=\s*\.|\s+(?:klo|kl)\b))\b/,
  /\b(?:perjantai\w*|fredag\w*|friday|fri|pe|fre)\b/,
  /\b(?:lauantai\w*|lordag\w*|saturday|sat|la|lor)\b/,
  /\b(?:sunnuntai\w*|sondag\w*|sunday|sun|su|son)\b/,
]
const dayWord='day after tomorrow|tomorrow|today|tmrw|tmr|ylihuomenna|huomenna|tanaan|i\\s*overmorgon|i\\s*morgon|i\\s*dag|'+
  'maanantai\\w*|tiistai\\w*|keskiviik\\w*|torstai\\w*|perjantai\\w*|lauantai\\w*|sunnuntai\\w*|mandag\\w*|tisdag\\w*|onsdag\\w*|torsdag\\w*|fredag\\w*|lordag\\w*|sondag\\w*|'+
  'monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thurs?|thu|fri|sat|sun|ma|ti|ke|to|pe|la|su|man|tis|ons|tors?|fre|lor|son'
function dayOf(clause: string, arrivalDay: number): number | undefined {
  if (/day after tomorrow|overmorgon|ylihuomen|ylihuom/.test(clause)) return arrivalDay+2
  if (/tomorrow|\btmrw\b|\btmr\b|\bhuomen(?:na)?\b|i\s*morgon/.test(clause)) return arrivalDay+1
  if (/today|tanaan|i\s*dag/.test(clause)) return arrivalDay
  for (let i=0; i<weekdays.length; i++) if (weekdays[i]!.test(clause)) {
    const delta=(i-arrivalDay%7+7)%7
    if (delta>=2) return arrivalDay+delta
  }
}
// An hour in words is the working hour with that number, 9 to 17, in any Finnish case form.
const hourWords: [string,number][] = [
  ['one|ett|en|ettan|yksi|yhdelt[ae]|yhden|yhta|yhdesta|yhteen',13],
  ['two|tva|tv[ao]an|kaksi|kahde[ln][alt]?a?|kahta|kahdesta|kahteen|kahdelta',14],
  ['three|tre|kolme|kolmelta|kolmen|kolmea|kolmesta|kolmeen',15],
  ['four|fyra|nelja|neljalta|neljan|neljaa|neljasta|neljaan',16],
  ['five|fem|viisi|viidelta|viiden|viitta|viidesta|viiteen',17],
  ['nine|nio|yhdeksan|yhdeksaa|yhdeksalta|yhdeksasta|yhdeksaan',9],
  ['ten|tio|kymmenen|kymmenta|kymmenelta|kymmenesta|kymmeneen',10],
  ['eleven|elva|yksitoista|yhdentoista|yhtatoista|yhdeltatoista|yhdestatoista|yhteentoista',11],
  ['twelve|tolv|kaksitoista|kahdentoista|kahtatoista|kahdeltatoista|kahdestatoista|kahteentoista|noon|keskipaiva\\w*',12],
]
const anyHourWord=hourWords.map(([w])=>w).join('|')
const clockWords: [RegExp,number][] = hourWords.map(([w,h])=>[new RegExp(`\\b(?:${w})\\b`,'g'),h])
const hourOf = (word: string) => hourWords.find(([w])=>new RegExp(`^(?:${w})$`).test(word))?.[1]
const halfHour = new RegExp(`\\b(half\\s+past|half|halv|puoli)\\s+(${anyHourWord})\\b`,'g')
const deniedTime = new RegExp(`\\(?\\s*\\b(?:not|ei|inte)\\s+(?!before|ennen|fore|efter|after|till|later|earlier|kun\\b)(?:(?:at|on|pa|klo|kl)\\s*)?`+
  `(?:\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?|${dayWord}|(?:(?:half\\s+past|half|halv|puoli)\\s+)?(?:${anyHourWord.replace('|ett|en|','|')}))(?![\\w:])\\s*\\)?`,'g')
const shortDay = new RegExp(`\\b(tors|tor|to|ke|pe|ma|ti|la|su|fre|ons|tis|man|lor|son|thurs|thur|thu|tues|tue|wed|mon|fri|sat|sun)\\.(?=\\s+(?:klo\\b|kl\\b|kello\\b|klockan\\b|at\\b|\\d|puoli\\b|half\\b|halv\\b|(?:${anyHourWord})\\b))`,'g')
function times(text: string): number[] {
  // "Half three", "halv tre", "puoli kolmelta" are half an hour before three. "Half past three" is after it.
  const s=text.replace(halfHour,(match,half:string,word:string) => {
    const hour=hourOf(word)
    if (hour===undefined) return match
    return (half.includes('past') ? hour : hour-1)+':30'
  })
  const found: {at:number; minutes:number}[]=[]
  for (const m of s.matchAll(/\b(\d{1,2})(?:[.:h](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?!\w)/g)) {
    const h=Number(m[1]), min=Number(m[2]??0)
    const ampm=m[3]?.[0]
    if (h>23 || min>59 || (ampm && (h===0 || h>12))) continue
    const rest=s.slice(m.index+m[0].length)
    if (/^\s*(?:minutes?|min\b|km\b|tkm\b|hours?\b|timmar\b)/.test(rest)) continue
    // Counts of tyres and sets, and numbers of bays, references and codes, are not clock times.
    if (/^\s*(?:sarjaa|rengasta|kesarengasta|talvirengasta|renkaita|rengas\b|kpl\b|st\b|sets?\b|wheels\b|tyres\b|tires\b|dack\b)/.test(rest)) continue
    if (/(?:\b(?:bay|ruudussa|ruutu|plats|paikalla|paikka|varaus|tilausnro|tilausnumero|viite|viitenro|ref|order no|ordernr|koodi|code|kod|referens)\s*:?\s*)$/.test(s.slice(0,m.index))) continue
    found.push({at:m.index,minutes:(ampm ? h%12+(ampm==='p'?12:0) : h)*60+min})
  }
  for (const [re,h] of clockWords) for (const m of s.matchAll(re)) {
    // Swedish "en" is an article unless attached to an explicit clock cue.
    if (m[0]==='en' && !/(?:kl\.?|klockan|vid)\s*$/.test(s.slice(0,m.index))) continue
    // "Tässä taas yksi siirto": one more transfer, not one o'clock.
    if (/^\s+(?:siirto|sarja|avain|set\b|key\b)/.test(s.slice(m.index+m[0].length))) continue
    found.push({at:m.index,minutes:h*60})
  }
  return found.sort((a,b)=>a.at-b.at).map(t=>t.minutes)
}
// Opening hours without a named place are those of the dealer who wrote the note: the pickup site.
const openCue=/\bopen\b|\bauki\b|\boppet\b|oppettid|opening hours|avoinna|aukioloaj/
const pickup=/\b(?:liike|we close|vi stanger|aukioloajat|auki arkisin|open weekdays|haku|nobody here)\b|nou[dt]a|nouata|haettav|pick.?up|collect|handover|release|nout|noudett|haetta|hakea|luovut|hamt|avhamt|utlamn|lamnas ut|utleverans|lahto|lastning|auton saa\b|ollaan taalla|taalla ollaan|taalla ei ketaan/
const delivery=/kohde|toimitusosoite|destination|deliver|drop.?off|arriv|at destination|receiv|recep|perill|peril|perille|toimit|vastaanot|maaranpaa|kohtee|leverans|leverer|framme|mottag|lamnas(?! ut)/
// The place at the far end is named: opening hours in the clause are the destination's.
const deliveryPlace=/kohde|kohtee|vastaanot|destination|receiving|perill|toimitusosoite|mottag/
const ready=/read(?:y|iness)|available|release|payment|paid|bank|valmi|valmii|vapau|maksu|maksun|maksaa|maksettu|tili|klar\b|redo\b|betal|betald|frigiv|huoll|service|rahoitus|financ/
const after=/not before|no earlier|earliest|only after|\bafter\b|\bfrom\b|\bopens\b|\bopen from|ei ennen|aikais|jalkeen|alkaen|lahtien|\bvasta\b|avautu|aukea|tidigast|inte for[er]?\b|forst|efter|fran|oppnar|framat|onwards/
// "Not ready before", "won't be ready until": a ready time although the cue word is a closing one.
const notReadyBefore=/not (?:be )?ready (?:before|until)|won't be ready|wont be ready|not (?:be )?released (?:before|until)|no pickup before|ei (?:ole )?valmis ennen|inte klar fore/
const before=/\bby\b|\bbefore\b|latest|no later|until|closes?|deadline|due|ennen|mennessa|viim|asti|saakka|sulj|sulke|kiinni|senast|fore\b|innan\b|stang|till\b/
// "Closed after 16", "nobody here after 4", "kiinni klo 16.30 jälkeen": the time is when the site closes.
const closedAfter=/(?:kiinni|closed|stangt|nobody|no one|ingen|ei ketaan|ei enaa|no more)\b.*\b(?:jalkeen|after|efter)\b|\b(?:jalkeen|after|efter)\b.*(?:ei enaa|no more|kiinni|closed|stangt)/
const recurring=/every\s*(?:week)?day|weekdays?|daily|biz days|opening hours|hours? (?:are|of)|reception|receiving|arkisin|arkipaiv|auki|aukea|sulje|sulke|kiinni|vastaanot|oppettid|vardag|oppet|mottag|stanger|oppnar|closes? at|opens? at|\bopen\b|avoinna|nobody|ei ketaan|ei enaa/
const targetDeadline=/by|deadline|due|must|arriv|destination|viim|mennessa|takara|perill|perille|senast|framme/
// "The customer collects it Monday at three, the car must be there then": a delivery deadline.
const thereByThen=/silloin perill|perill\w* silloin|there by then|there then|vara dar da|vara framme da/
const clauseBreak = /[;!\n]+|\.(?=\s+(?![0-9]))|\s+\/\s+|\s+(?:and|och|ja)\s+(?=(?:no plates|no registration|manual|summer|without plates|pickup|delivery|deliver|collection|reception|nouto|toimitus|vastaanotto|ei kil|kesaren|hamt|leverans|sommardack|manuell))/
// Who to call, where the keys and the papers are: no fact for the plan, but full of words like
// "before arrival", "service desk" and "reception" that read as cues next to a time.
const sideRemarks=/\b(?:soita|soittakaa|call|ring|ringa|phone|ilmoita|avaimet|avain|keys?|nyckeln|nycklar|nycklarna|nyckelbox\w*|avainboksi\w*|huoltokirja|service ?book|servicebok|paperit|papers|docs|pappren|kauppakirja|anna vastaanottajalle)\b[^,.;!\n]*/g
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
  let original=norm(request.note.text).replace(/[a-z]+/g,repair)
  // Reveals attach note facts to the outbound car, even when a trade-in reminder accompanies them.
  if (legIndex!==0) return risk
  const problem=(s:string)=>{risk.uncertain=true;if (!risk.reasons.includes(s)) risk.reasons.push(s)}
  // Short forms that end in a full stop, and clock cues, in one spelling.
  // A weekday short form keeps its full stop only at the end of a sentence: "ma. klo 14" but "ei kun ma. Avaimet...".
  original=original.replace(/\bviim\.(?=\s)/g,'viim ').replace(shortDay,(_,day:string)=>day==='to' ? 'torstaina' : day)
    .replace(/\bn\.\s*/g,'').replace(/\bkello\b/g,'klo').replace(/\bklockan\b/g,'kl').replace(/\bkl\.\s*/g,'kl ').replace(/\bklo\.\s*/g,'klo ')
    .replace(/\b(klo|kl|at|by|from|before|after|until)\s+([01]\d|2[0-3])([0-5]\d)\b(?![.:]\d)/g,'$1 $2:$3').replace(/\b(klo|kl)\s+(\d)([0-5]\d)\b(?![.:]\d)/g,'$1 $2:$3')
  // Remove unambiguous denials of a day or time, keeping "not before"/"ei ennen" intact.
  original=original.replace(deniedTime,' ')
  // The flags read the whole note. The times read it without the side remarks.
  const flagText=original
  original=original.replace(sideRemarks,' ')
  const corrected = original.split(/\b(?:correction|correct(?:ed)? time|actually|korjaus|korjaan|tarkennus|rat[t]?else|korrigering|ei\s*kun|eikun|eiku|rather|jag menar|sorry,?\s*i mean|i mean|nej,?\s*forlat|forlat)\b\s*[:,-]?\s*/g)
  const pieces = corrected.flatMap((part,j)=>part.split(clauseBreak).map((s,i)=>({s:s.trim(),correction:j>0 && i===0}))).filter(c=>c.s)
  const arrivalDay=Math.floor(request.arrivedAt/DAY)
  for (const s of flagText.split(clauseBreak)) {
    if (/manuaal|manuell|manual (?:gear|transmission|licen[cs]e)|stick shift|\bmanual\b|kasivaiht/.test(s) && !/not (?:a )?manual|ei manuaali|inte manuell/.test(s)) risk.manualLicence=true
    if (/ei rekkareita|koekilvet|kilvet (?:on )?(?:poistettu|irrotettu|irroitettu)|irrotettu|unregistered|needs trade plates|no (?:registration |number |license |licence |transfer )?plates|without (?:the |any )?(?:registration )?plates|plates? (?:are )?(?:missing|removed)|needs? (?:transfer |temporary )?plates|(?:trade|transfer) plates|plate[- ]?less|ei (?:ole )?(?:rekisteri)?kilpi|kilvettom|kilveton|ilman (?:rekisteri)?kilp|kilvet puutt|siirto(?:kil|tar)|poistettu rekisterista|rekisterista poistettu|utan (?:reg(?:istrerings)?\.?\s*)?skylt|saknar (?:reg(?:istrerings)?\.?\s*)?skylt|inga (?:reg(?:istrerings)?\.?\s*)?skylt|provskylt/.test(s)) risk.withPlates=true
    const spare=/spare|spare wheels?|in the (?:boot|trunk|car)|back ?seat|bakluck|foljer med|takakont|vanteineen|tavaratil|kontissa|takapenk|mukaan|lisaren|extra|bagage|ligger i bilen/.test(s)
    if (!spare && /summer (?:rubber|t[iy]res)|summers (?:still )?on|kesaren|kesakum|sommardack|sommargum|talvirenkaita ei|ei (?:viela )?talvirenk|talvet puuttu|no winters/.test(s) && !/no summer|inte sommardack|ei kesaren/.test(s)) risk.summerTyres=true
  }
  let pw={...leg.pickup.window}, dw={...leg.delivery.window}
  let previous: {target:'pickup'|'delivery';direction:'from'|'to';day:number;daily:boolean;clock:number[];range:boolean}|undefined
  let touchedPickup=false,touchedDelivery=false
  for (const {s,correction} of pieces) {
    const byThen=thereByThen.test(s)
    const isDelivery=delivery.test(s) || byThen, isPickup=pickup.test(s) || (!isDelivery && openCue.test(s)), isReady=ready.test(s)
    const target = isDelivery ? 'delivery' : isPickup || isReady ? 'pickup' : correction ? previous?.target : undefined
    if (!target) continue
    let clock=times(s)
    const explicitDay=dayOf(s,arrivalDay)
    // A correction that names only a day keeps the time it corrects: "valmis huomenna klo 11, ei kun perjantaina".
    const dayOnly=!clock.length && correction && explicitDay!==undefined && !!previous && previous.target===target && !previous.daily
    if (dayOnly) clock=previous!.clock
    // "service book is in the glovebox" and pickup/contact instructions are common harmless notes.
    if (!clock.length) {
      if ((/not ready|ready (?:on|at|after)|ei valmis|valmis vasta|klar forst|not before|ei ennen|inte fore/.test(s) || ((after.test(s)||before.test(s)) && /\b(?:klo|kl|o'clock)\b/.test(s)))) problem('unresolved time')
      continue
    }
    if (isPickup && isDelivery && !byThen && clock.length>1 && !deliveryPlace.test(s)) {problem('ambiguous stop times');continue}
    const day=explicitDay ?? (correction ? previous?.day : undefined) ?? arrivalDay
    const range=dayOnly ? previous!.range : clock.length>=2 && /\d\s*(?:a\.?m\.?|p\.?m\.?)?\s*(?:-|to\b|till\b)\s*(?:klo\s*|kl\s*)?\d|(?:\d|\d:sta|\d:aan|\d\.\d\d)\s*-\s*\d|\d+:\w+\s+\d+:\w+|between.{1,15}\band\b|mellan.{1,15}\boch\b/.test(s)
    const closing=closedAfter.test(s)
    const isBefore=before.test(s) || /viim\b/.test(s) || closing || byThen
    const isAfter=!closing && !byThen && (after.test(s.replace(/(?:the )?day after tomorrow/g,"tomorrow")) || notReadyBefore.test(s) || (isReady && !isDelivery && !isBefore))
    if (!range && !isAfter && !isBefore && !isReady && !correction) {if (/\b(?:klo|kl|at)\s*\d/.test(s)) problem('unknown stop timing');continue}
    const hasWeekdays=/ma\s*-\s*pe|mon\s*-\s*fri|man\s*-\s*fre|arkisin|arkipaiv|weekdays?|vardag/.test(s)
    const daily=(correction && previous?.daily) || (explicitDay===undefined || hasWeekdays) && !(isReady && isAfter && !range) && (recurring.test(s) || range || (target==='pickup' && !isAfter && isBefore)) && !/must|deadline|maaraai|takara/.test(s)
    const direction=(!isAfter && isBefore) ? 'to' : isAfter || isReady ? 'from' : previous?.direction
    if (!range && !direction) {problem('unknown time direction');continue}
    if (clock.length>1 && !range && !correction) {problem('conflicting times');continue}
    const v=clock.at(-1)!
    if (correction && previous?.target===target) {
      const bound=previous.direction
      const stop=target==='pickup'?leg.pickup:leg.delivery
      if (target==='pickup') {pw[bound]=stop.window[bound];if(previous.daily) delete risk.pickupHours;if(bound==='from') delete risk.readyAt}
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
      else {dw=constrain(dw,cap);touchedDelivery=true;if(direction==='to' && (targetDeadline.test(s) || correction || byThen)) risk.deadline=day*DAY+v}
    }
    previous={target,direction:direction??'to',day,daily,clock,range}
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
