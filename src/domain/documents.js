import { validDate } from './family.js';
import { COST_CATEGORIES, PAYMENT_INTERVALS, euroToCents } from './administration.js';
export const MAX_DOCUMENT_BYTES=10*1024*1024;
export const MAX_DOCUMENT_TEXT=200000;
export function normalizeDocumentFacts(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Ungültige Dokumentdaten.');
  const text=(v,label,max=2000)=>{if(v===undefined||v===null)return '';if(typeof v!=='string'||v.length>max)throw new Error(`${label}: maximal ${max} Zeichen erlaubt.`);return v.trim();};
  const title=text(input.title,'Titel',200);if(!title)throw new Error('Bitte einen Dokumenttitel eingeben.');
  if(!Object.hasOwn(COST_CATEGORIES,input.category))throw new Error('Bitte einen gültigen Bereich wählen.');
  const amountCents=input.amountCents??null;
  if(amountCents!==null&&(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>99999999999))throw new Error('Bitte einen positiven Betrag in EUR-Cent eingeben oder leer lassen.');
  if(amountCents!==null&&input.currency!=='EUR')throw new Error('Ein Zahlungsbetrag benötigt die bestätigte Währung EUR.');
  const date=(value,label)=>{const v=text(value,label,10);if(v&&!validDate(v))throw new Error(`${label}: ungültiges Datum.`);return v||null;};
  const interval=input.interval??'unknown';if(interval!=='unknown'&&!Object.hasOwn(PAYMENT_INTERVALS,interval))throw new Error('Ungültiger Zahlungsrhythmus.');
  const dueDate=date(input.dueDate,'Zahlungstermin'),endDate=date(input.endDate,'Letzte Fälligkeit');
  if(endDate&&(!dueDate||endDate<dueDate))throw new Error('Die letzte Fälligkeit muss am oder nach dem Zahlungstermin liegen.');
  const leadDays=input.leadDays??7;if(!Number.isInteger(leadDays)||leadDays<0||leadDays>90)throw new Error('Erinnerungsvorlauf muss zwischen 0 und 90 Tagen liegen.');
  if(!Array.isArray(input.recipientIds)||input.recipientIds.length>100||input.recipientIds.some(v=>typeof v!=='string'))throw new Error('Ungültige Erinnerungsempfänger.');
  if(input.recipientIds.length&&!dueDate)throw new Error('Für Erinnerungen bitte zuerst einen Zahlungstermin bestätigen.');
  return {title,category:input.category,provider:text(input.provider,'Anbieter',200),reference:text(input.reference,'Vertrags-/Rechnungsnummer',200),amountCents,
    currency:amountCents===null?null:'EUR',dueDate,endDate,interval,cancellationDate:date(input.cancellationDate,'Kündigungstermin'),notes:text(input.notes,'Notizen',5000),leadDays,recipientIds:[...new Set(input.recipientIds)]};
}
const isoDate=source=>{
  const match=source.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const value=match?`${match[3]}-${match[2]}-${match[1]}`:source;
  return validDate(value)?value:null;
};
export function analyzeDocument(text,filename='Dokument') {
  if(typeof text!=='string'||text.length>MAX_DOCUMENT_TEXT)throw new Error('Der Dokumenttext ist zu groß.');
  const evidence={amountCents:[],dueDate:[],cancellationDate:[],provider:[],reference:[],interval:[]};
  const warnings=['Automatische Vorschläge sind ungeprüft. Original und Fundstellen vor dem Bestätigen vergleichen.'];
  const truncated=new Set();
  const add=(field,value,line,page,score=1)=>{if(value===null)return;if(evidence[field].length>=100){truncated.add(field);return;}evidence[field].push({value,line:line.slice(0,500),page,score});};
  const pages=text.replace(/\r/g,'').split('\f');
  pages.forEach((page,pageIndex)=>page.split('\n').forEach(raw=>{
    const line=raw.trim();if(!line)return;
    const creditLine=/gutschrift|erstattung|guthaben|(?:EUR|€)\s*[-−]/i.test(line);
    if(creditLine)warnings.push('Mögliche Gutschrift / Erstattung erkannt. Solche Zeilen werden nicht als positive Zahlungsforderung übernommen.');
    const amountScore=/gesamtbetrag|rechnungsbetrag|zahlbetrag|zu zahlen|bruttobetrag|fälliger betrag/i.test(line)?5:/beitrag|abschlag|rate\b/i.test(line)?3:1;
    for(const m of line.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{2})?)\s*(?:EUR\b|€)/gi)){
      if(creditLine||/[-−]\s*$/.test(line.slice(Math.max(0,m.index-8),m.index))){warnings.push('Negativer Betrag / mögliche Gutschrift erkannt; keinen Zahlungsbetrag daraus übernommen.');continue;}
      try{const amount=euroToCents(m[1].replace(/\.(?=\d{3}(?:\.|,))/g,''));if(amount>0)add('amountCents',amount,line,pageIndex+1,amountScore);}catch{}
    }
    for(const m of line.matchAll(/(?:EUR\b|€)\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{2})?)/gi)){
      if(creditLine||/[-−]\s*$/.test(line.slice(Math.max(0,m.index-8),m.index))){warnings.push('Negativer Betrag / mögliche Gutschrift erkannt; keinen Zahlungsbetrag daraus übernommen.');continue;}
      try{const amount=euroToCents(m[1].replace(/\.(?=\d{3}(?:\.|,))/g,''));if(amount>0)add('amountCents',amount,line,pageIndex+1,amountScore);}catch{}
    }
    for(const m of line.matchAll(/\b(?:\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})\b/g)){
      const value=isoDate(m[0]);
      if(/kündig|kuendig/i.test(line))add('cancellationDate',value,line,pageIndex+1);
      else if(/fällig|faellig|zahlbar|zahlen bis|zahlungsziel|zahlung.{0,25}(?:bis|am)|abbuchung|einzug.{0,20}(?:am|zum)/i.test(line))add('dueDate',value,line,pageIndex+1);
    }
    const provider=line.match(/^(?:Anbieter|Versicherung|Gläubiger|Lieferant|Absender|Firma)\s*:\s*(.{1,200})$/i);if(provider)add('provider',provider[1],line,pageIndex+1);
    const reference=line.match(/(?:Vertrags(?:nummer|-?nr\.?)|Policen(?:nummer|-?nr\.?)|Rechnungs(?:nummer|-?nr\.?)|Kunden(?:nummer|-?nr\.?))\s*:?\s*([A-Z0-9][A-Z0-9./_-]{1,99})/i);if(reference)add('reference',reference[1],line,pageIndex+1);
    for(const [pattern,value]of [[/\bmonatlich(?:e|er|en|em|es)?\b/i,'monthly'],[/\bvierteljährlich(?:e|er|en|em|es)?\b/i,'quarterly'],[/\bhalbjährlich(?:e|er|en|em|es)?\b/i,'semiannual'],[/\bjährlich(?:e|er|en|em|es)?\b/i,'yearly'],[/\beinmalig(?:e|er|en|em|es)?\b/i,'once']])if(pattern.test(line))add('interval',value,line,pageIndex+1);
  }));
  const choose=field=>{
    if(truncated.has(field)){warnings.push(`Zu viele Fundstellen zu ${field}; bitte manuell prüfen.`);return null;}
    const entries=evidence[field];if(!entries.length)return null;
    const score=Math.max(...entries.map(v=>v.score)),values=[...new Set(entries.filter(v=>v.score===score).map(v=>v.value))];
    if(values.length!==1){warnings.push(`Mehrdeutige Angaben zu ${field}: bitte manuell auswählen.`);return null;}
    return values[0];
  };
  const matches=[[/versicherung|haftpflicht|police/i,'insurance'],[/strom|energie|gasvertrag/i,'energy'],[/wasser|abwasser/i,'water'],[/müll|abfall/i,'waste'],[/\bkfz\b|\bpkw\b|fahrzeug|tüv/i,'vehicle'],[/miete|hausgeld/i,'housing']].filter(([pattern])=>pattern.test(text)).map(([,category])=>category);
  const category=matches.length===1?matches[0]:'other';
  if(matches.length>1)warnings.push('Mehrere Themen erkannt; Bereich bitte selbst zuordnen.');
  if(/innerhalb\s+\d+\s+(?:tagen|tage)|\d+\s+tage\s+nach/i.test(text))warnings.push('Relative Zahlungsfrist erkannt. Es wird kein Zahlungstermin aus einem unbekannten Bezugsdatum berechnet.');
  if(/\b(?:USD|CHF|GBP)\b|\$|£/.test(text))warnings.push('Andere Währung erkannt. Beträge ausschließlich als EUR bestätigen, wenn das Original dies belegt.');
  const amountCents=choose('amountCents'),dueDate=choose('dueDate');
  if(amountCents===null)warnings.push('Kein eindeutiger EUR-Zahlbetrag erkannt.');
  if(!dueDate)warnings.push('Kein eindeutiger Zahlungstermin erkannt; Rechnungsdaten werden nicht automatisch als Fälligkeit verwendet.');
  return {fields:{title:filename.replace(/\.[^.]+$/,'').slice(0,200)||'Dokument',category,provider:choose('provider')||'',reference:choose('reference')||'',amountCents,currency:amountCents===null?null:'EUR',dueDate,endDate:null,interval:choose('interval')||'unknown',cancellationDate:choose('cancellationDate'),notes:'',leadDays:7},evidence,warnings:[...new Set(warnings)]};
}
