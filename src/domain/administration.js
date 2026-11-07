import { validDate, localDate } from './family.js';
export const COST_CATEGORIES = {insurance:'Versicherung',vehicle:'PKW',housing:'Wohnen',energy:'Energie',waste:'Müll',water:'Wasser',other:'Sonstiges'};
export const PAYMENT_INTERVALS = {once:'Einmalig',monthly:'Monatlich',quarterly:'Vierteljährlich',semiannual:'Halbjährlich',yearly:'Jährlich'};
const MONTHS = {monthly:1,quarterly:3,semiannual:6,yearly:12};
const fail = message => {throw new Error(message);};
const text = (v,label,max=2000) => {
  if(v===undefined||v===null)return '';
  if(typeof v!=='string'||v.length>max)fail(`${label}: maximal ${max} Zeichen erlaubt.`);
  return v.trim();
};
const date = (v,label,required=false) => {
  const result=text(v,label,10);if((required&&!result)||(result&&!validDate(result)))fail(`${label}: bitte ein gültiges Datum eingeben.`);return result;
};
export function euroToCents(value) {
  if(typeof value!=='string'||!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(value.trim()))fail('Bitte einen Eurobetrag mit höchstens zwei Nachkommastellen eingeben (z. B. 49,90).');
  const [whole,fraction='']=value.trim().replace(',','.').split('.');
  return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
function cents(value) {if(!Number.isSafeInteger(value)||value<=0||value>99999999999)fail('Der Betrag muss positiv sein und in ganzen Cent angegeben werden.');return value;}
export const formatMoney = value => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(value/100);
export function normalizeObligation(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Ungültiger Vertrag / Kostenposten.');
  const title=text(input.title,'Bezeichnung',200);if(!title)fail('Bitte eine Bezeichnung eingeben.');
  if(!Object.hasOwn(COST_CATEGORIES,input.category))fail('Ungültige Kostenart.');
  if(!Object.hasOwn(PAYMENT_INTERVALS,input.interval))fail('Ungültiger Zahlungsrhythmus.');
  const firstDueDate=date(input.firstDueDate,'Erste Fälligkeit',true),endDate=date(input.endDate,'Letzte Fälligkeit');
  if(endDate&&endDate<firstDueDate)fail('Die letzte Fälligkeit darf nicht vor der ersten liegen.');
  const amountCents=cents(input.amountCents);
  return {title,category:input.category,provider:text(input.provider,'Anbieter',200),reference:text(input.reference,'Vertrags-/Kundennummer',200),
    holder:text(input.holder,'Versicherungsnehmer / Vertragspartner',200),contact:text(input.contact,'Kontakt',500),amountCents,interval:input.interval,firstDueDate,endDate,
    paymentMethod:text(input.paymentMethod,'Zahlungsweise',200),vehicleId:text(input.vehicleId,'Fahrzeugkennung',100),
    coverage:text(input.coverage,'Leistungsumfang / Tarif'),meterNumber:text(input.meterNumber,'Zähler- / Behälternummer',200),
    cancellationDate:date(input.cancellationDate,'Kündigungsfrist / Kündigungstermin'),nextActionDate:date(input.nextActionDate,'Nächster Sachtermin'),
    nextActionTitle:text(input.nextActionTitle,'Bezeichnung des Sachtermins',200),notes:text(input.notes,'Weitere Informationen',5000)};
}
export function normalizeVehicle(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Ungültiges Fahrzeug.');
  const name=text(input.name,'Fahrzeugname',200);if(!name)fail('Bitte eine Fahrzeugbezeichnung eingeben.');
  const huDueMonth=text(input.huDueMonth,'HU/TÜV-Monat',7);
  if(huDueMonth&&!validDate(huDueMonth+'-01'))fail('Bitte einen gültigen HU/TÜV-Monat eingeben.');
  const number=(v,label)=>{if(v===undefined||v===null||v==='')return null;const n=typeof v==='string'&&/^\d+$/.test(v)?Number(v):v;if(!Number.isSafeInteger(n)||n<0||n>9999999)fail(`${label}: bitte eine ganze, nicht negative Zahl eingeben.`);return n;};
  return {name,plate:text(input.plate,'Kennzeichen',50),make:text(input.make,'Hersteller',100),model:text(input.model,'Modell',100),vin:text(input.vin,'Fahrgestellnummer',50),
    registrationDate:date(input.registrationDate,'Erstzulassung'),huDueMonth,serviceDueDate:date(input.serviceDueDate,'Nächste Wartung'),
    mileage:number(input.mileage,'Kilometerstand'),serviceDueKm:number(input.serviceDueKm,'Wartung bei Kilometerstand'),notes:text(input.notes,'Fahrzeughinweise',5000)};
}
export function monthDate(anchor, offset) {
  const [year,month,day]=anchor.split('-').map(Number);
  const index=year*12+month-1+offset,y=Math.floor(index/12),m=index%12;
  const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
  return `${String(y).padStart(4,'0')}-${String(m+1).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;
}
export function dueDates(obligation, from, to) {
  if(!validDate(from)||!validDate(to)||to<from)fail('Ungültiger Zahlungszeitraum.');
  if(obligation.interval==='once')return obligation.firstDueDate>=from&&obligation.firstDueDate<=to&&(!obligation.endDate||obligation.firstDueDate<=obligation.endDate)?[obligation.firstDueDate]:[];
  const step=MONTHS[obligation.interval];if(!step)fail('Ungültiger Zahlungsrhythmus.');
  const [fy,fm]=from.split('-').map(Number),[ay,am]=obligation.firstDueDate.split('-').map(Number);
  const start=Math.max(0,Math.floor(((fy-ay)*12+fm-am)/step));
  const result=[];
  for(let index=start;;index++) {
    const current=monthDate(obligation.firstDueDate,index*step);
    if(current>to||(obligation.endDate&&current>obligation.endDate))break;
    if(current>=from)result.push(current);
  }
  return result;
}
export function isDueDate(obligation,value) {return validDate(value)&&dueDates(obligation,value,value).includes(value);}
export function paymentSummary(obligation, dueDate, payments) {
  const paidCents=payments.filter(p=>p.obligationId===obligation.id&&p.dueDate===dueDate).reduce((sum,p)=>sum+p.amountCents,0);
  return {paidCents,remainingCents:Math.max(0,obligation.amountCents-paidCents)};
}
export function costOverview(obligations,payments,today=localDate()) {
  const horizon=monthDate(today,1),monthStart=today.slice(0,7)+'-01',monthEnd=monthDate(monthStart,1);
  const charges=[];
  for(const obligation of obligations) {
    for(const dueDate of dueDates(obligation,obligation.firstDueDate,horizon)) {
      const summary=paymentSummary(obligation,dueDate,payments);
      if(summary.remainingCents)charges.push({obligationId:obligation.id,title:obligation.title,category:obligation.category,dueDate,amountCents:obligation.amountCents,...summary,overdue:dueDate<today});
    }
  }
  charges.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.title.localeCompare(b.title));
  const plannedMonthCents=obligations.reduce((sum,o)=>sum+dueDates(o,monthStart,monthEnd).filter(d=>d<monthEnd).length*o.amountCents,0);
  return {charges,horizon,plannedMonthCents,overdueCents:charges.filter(c=>c.overdue).reduce((s,c)=>s+c.remainingCents,0)};
}
export function administrativeDates(obligations,vehicles) {
  const dates=[];
  for(const item of obligations) {
    if(item.cancellationDate)dates.push({id:item.id,type:'obligation',date:item.cancellationDate,title:'Kündigung: '+item.title});
    if(item.nextActionDate)dates.push({id:item.id,type:'obligation',date:item.nextActionDate,title:(item.nextActionTitle||'Sachtermin')+': '+item.title});
  }
  for(const item of vehicles) {
    if(item.huDueMonth) {
      const [year,month]=item.huDueMonth.split('-').map(Number),last=new Date(Date.UTC(year,month,0));
      dates.push({id:item.id,type:'vehicle',date:last.toISOString().slice(0,10),title:'HU/TÜV: '+item.name});
    }
    if(item.serviceDueDate)dates.push({id:item.id,type:'vehicle',date:item.serviceDueDate,title:'Wartung: '+item.name});
  }
  return dates.sort((a,b)=>a.date.localeCompare(b.date));
}
export function normalizePayment(input,obligation,existingPayments) {
  if(!input||typeof input!=='object')fail('Ungültige Zahlung.');
  const dueDate=date(input.dueDate,'Zugehörige Fälligkeit',true);
  if(!isDueDate(obligation,dueDate))fail('Diese Fälligkeit gehört nicht zum Zahlungsplan.');
  const paidDate=date(input.paidDate,'Zahlungsdatum',true);if(paidDate>localDate())fail('Zahlungen können erst am tatsächlichen Zahlungstag erfasst werden.');
  const amountCents=cents(input.amountCents);
  if(amountCents>paymentSummary(obligation,dueDate,existingPayments).remainingCents)fail('Die Zahlung überschreitet den noch offenen Betrag.');
  return {dueDate,paidDate,amountCents,note:text(input.note,'Zahlungshinweis',1000)};
}
