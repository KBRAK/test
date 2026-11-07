import { COST_CATEGORIES, PAYMENT_INTERVALS, euroToCents, formatMoney, costOverview, administrativeDates, paymentSummary } from './domain/administration.js';
import { localDate } from './domain/family.js';
import { serverRequest, serverIsConnected } from './storage/server.js';
const root=document.querySelector('#administration-app');
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>formatMoney(value);
const input=(label,name,value='',type='text',required=false,max=200)=>`<label>${label}<input name="${name}" value="${e(value)}" type="${type}" ${required?'required':''} ${type==='text'?`maxlength="${max}"`:''}></label>`;
const area=(label,name,value='',max=2000)=>`<label>${label}<textarea name="${name}" maxlength="${max}">${e(value)}</textarea></label>`;
const options=(values,current)=>Object.entries(values).map(([id,label])=>`<option value="${e(id)}" ${id===current?'selected':''}>${e(label)}</option>`).join('');
const action=(name,label,id='',date='')=>`<button type="button" data-admin-action="${name}" data-id="${e(id)}" data-date="${date}">${label}</button>`;
const dirtyForms=new Set();
let data={vehicles:[],obligations:[],payments:[],revision:0},vehicleId='',obligationId='',paymentTarget=null,busy=false,dirty=false,loaded=false,filter='';
const api=(path='',options={})=>serverRequest('administration'+path,options);
const status=message=>{root.querySelector('#admin-status').textContent=message;};
const discard=()=>!dirty||window.confirm('Ungespeicherte Eingaben in der Verwaltung verwerfen?');
async function refresh(message='',submittedForm='') {
  const drafts=submittedForm?[...root.querySelectorAll('form[data-admin-form]')].filter(f=>f.dataset.adminForm!==submittedForm&&dirtyForms.has(f.dataset.adminForm)).map(f=>({type:f.dataset.adminForm,fields:[...f.elements].filter(v=>v.name&&v.type!=='file').map(v=>({name:v.name,value:v.value}))})):[];
  data=await api();loaded=true;
  if(!data.vehicles.some(v=>v.id===vehicleId))vehicleId='';
  if(!data.obligations.some(v=>v.id===obligationId))obligationId='';
  render();
  for(const draft of drafts){const form=root.querySelector(`[data-admin-form="${draft.type}"]`);if(form){for(const field of draft.fields){const target=form.elements.namedItem(field.name);if(target)target.value=field.value;}dirty=true;dirtyForms.add(draft.type);}}
  status(message);
}
function vehicleForm() {
  const v=data.vehicles.find(v=>v.id===vehicleId)||{};
  return `<section class="family-editor"><h3>${v.id?'Fahrzeug bearbeiten':'Fahrzeug anlegen'}</h3><form data-admin-form="vehicle">
    ${input('Fahrzeugbezeichnung','name',v.name,'text',true)}<div class="row">${input('Kennzeichen','plate',v.plate)}${input('Hersteller','make',v.make)}</div>
    <div class="row">${input('Modell','model',v.model)}${input('Fahrgestellnummer (optional)','vin',v.vin)}</div>
    <div class="row">${input('Erstzulassung','registrationDate',v.registrationDate,'date')}${input('HU/TÜV fällig im Monat','huDueMonth',v.huDueMonth,'month')}</div>
    <div class="row">${input('Kilometerstand','mileage',v.mileage??'','number')}${input('Wartung bei Kilometerstand','serviceDueKm',v.serviceDueKm??'','number')}</div>
    ${input('Nächste Wartung am','serviceDueDate',v.serviceDueDate,'date')}${area('Fahrzeughinweise','notes',v.notes,5000)}
    <button>Fahrzeug speichern</button>${v.id?action('new-vehicle','Neues Fahrzeug'):''}</form></section>`;
}
function obligationForm() {
  const o=data.obligations.find(v=>v.id===obligationId)||{};
  const vehicleOptions={'':'Kein Fahrzeug',...Object.fromEntries(data.vehicles.map(v=>[v.id,v.name+(v.plate?' · '+v.plate:'')]))};
  return `<section class="family-editor"><h3>${o.id?'Kostenposten bearbeiten':'Vertrag / Kostenposten anlegen'}</h3><form data-admin-form="obligation">
    ${input('Bezeichnung (z. B. Haftpflicht, Strom, Müllgebühren)','title',o.title,'text',true)}
    <div class="row"><label>Bereich<select name="category">${options(COST_CATEGORIES,o.category||'insurance')}</select></label>${input('Anbieter / Versicherung / Behörde','provider',o.provider)}</div>
    <div class="row">${input('Vertrags- / Kundennummer','reference',o.reference)}${input('Versicherungsnehmer / Vertragspartner','holder',o.holder)}</div>
    <div class="row">${input('Betrag je Fälligkeit in EUR (z. B. 49,90)','amount',o.amountCents!==undefined?(o.amountCents/100).toFixed(2):'','text',true)}<label>Zahlungsrhythmus<select name="interval">${options(PAYMENT_INTERVALS,o.interval||'monthly')}</select></label></div>
    <div class="row">${input('Erste hier geführte Fälligkeit','firstDueDate',o.firstDueDate||localDate(),'date',true)}${input('Letzte Fälligkeit (optional)','endDate',o.endDate,'date')}</div>
    <p>Bei bestehenden Verträgen die nächste noch offene Fälligkeit als Beginn wählen. Frühere Fälligkeiten gelten sonst ebenfalls als offen. Der Betrag gilt je Zahlung, nicht als Monatsdurchschnitt.</p>
    ${input('Wie wird bezahlt? (z. B. Lastschrift, Überweisung)','paymentMethod',o.paymentMethod)}
    <label>Verknüpftes Fahrzeug<select name="vehicleId">${options(vehicleOptions,o.vehicleId||'')}</select></label>
    <details><summary>Weitere Vertrags- und Versorgungsdaten</summary>
      ${input('Kontakt zum Anbieter','contact',o.contact,'text',false,500)}${area('Leistungsumfang / Tarif / versicherte Risiken','coverage',o.coverage)}
      ${input('Zähler- / Behälternummer','meterNumber',o.meterNumber)}${input('Kündigungsfrist / Kündigungstermin','cancellationDate',o.cancellationDate,'date')}
      ${input('Nächster Sachtermin (z. B. Müllabfuhr / Zählerablesung)','nextActionDate',o.nextActionDate,'date')}${input('Bezeichnung dieses Sachtermins','nextActionTitle',o.nextActionTitle)}
      ${area('Weitere Hinweise','notes',o.notes,5000)}
    </details><button>Kostenposten speichern</button>${o.id?action('new-obligation','Neuer Kostenposten'):''}</form>
    <p>Bei bereits erfassten Zahlungen bleiben Betrag, Rhythmus und erste Fälligkeit unverändert. Für neue Konditionen einen neuen Kostenposten anlegen und den bisherigen beenden.</p></section>`;
}
function paymentForm() {
  if(!paymentTarget)return '';
  const o=data.obligations.find(v=>v.id===paymentTarget.obligationId);if(!o)return '';
  const remaining=paymentSummary(o,paymentTarget.dueDate,data.payments).remainingCents;
  return `<section class="payment-editor"><h3>Zahlung erfassen · ${e(o.title)}</h3><p>Zugehörige Fälligkeit: ${paymentTarget.dueDate} · Noch offen: ${money(remaining)}</p>
    <form data-admin-form="payment">${input('Tatsächlich gezahlter Betrag in EUR','amount',(remaining/100).toFixed(2),'text',true)}${input('Tatsächliches Zahlungsdatum','paidDate',localDate(),'date',true)}${input('Zahlungshinweis (optional)','note')}
    <button>Zahlung verbuchen</button>${action('cancel-payment','Abbrechen')}</form><p>Dies dokumentiert eine Zahlung. Es wird keine Überweisung oder Lastschrift ausgelöst.</p></section>`;
}
function render() {
  dirty=false;dirtyForms.clear();
  const today=localDate(),overview=costOverview(data.obligations,data.payments,today),dates=administrativeDates(data.obligations,data.vehicles);
  const obligations=data.obligations.filter(v=>!filter||v.category===filter);
  root.innerHTML=`<section class="administration-space"><h2>Verträge, Kosten und Fahrzeuge</h2><p>Gemeinsame Verwaltung von Versicherungen, PKW, Wohnkosten, Energie, Müll und Wasser. Alle Beträge in EUR.</p><p id="admin-status" role="status" aria-live="polite"></p>
    <div class="family-toolbar">${action('refresh','Verwaltung aktualisieren')}${action('new-obligation','+ Kostenposten')}${action('new-vehicle','+ Fahrzeug')}</div>
    <div class="cost-summary"><p>Geplante Fälligkeiten im laufenden Monat<strong>${money(overview.plannedMonthCents)}</strong></p><p>Überfällig und nicht als bezahlt erfasst<strong>${money(overview.overdueCents)}</strong></p></div>
    <section class="admin-overview"><h3>Offene Zahlungen bis ${overview.horizon} (nächster Monat und Rückstände)</h3><p>„Offen“ bedeutet: noch nicht in dieser Anwendung als bezahlt dokumentiert. Keine Bankanbindung oder automatische Zahlungserkennung.</p>
    <ul>${overview.charges.slice(0,100).map(c=>`<li><strong>${e(c.title)}</strong> · <time>${c.dueDate}</time> · Noch offen: ${money(c.remainingCents)} ${c.overdue?'<span class="calendar-conflict">Überfällig</span>':''} ${action('pay','Zahlung erfassen',c.obligationId,c.dueDate)}</li>`).join('')||'<li>Keine offenen Fälligkeiten im angezeigten Zeitraum.</li>'}</ul>${overview.charges.length>100?'<p>Es werden die ältesten 100 Fälligkeiten gezeigt.</p>':''}</section>
    ${paymentForm()}
    <details open><summary>Sachtermine: HU/TÜV, Wartung, Kündigung und Versorgung</summary><ul>${dates.map(d=>`<li><strong>${e(d.title)}</strong> · ${d.date} ${d.date<today?'<span class="calendar-conflict">Datum überschritten – bitte prüfen</span>':''} ${action(d.type==='vehicle'?'edit-vehicle':'edit-obligation','Bearbeiten',d.id)}</li>`).join('')||'<li>Keine Sachtermine hinterlegt.</li>'}</ul><p>HU/TÜV wird als Frist bis zum Ende des eingetragenen Monats angezeigt. Sachtermine werden nach Erledigung manuell aktualisiert; keine automatische Erinnerung.</p></details>
    <div class="family-editors">${obligationForm()}${vehicleForm()}</div>
    <section class="admin-overview"><h3>Gespeicherte Kostenposten (${obligations.length})</h3><label>Bereich filtern<select data-admin-filter>${options({'':'Alle Bereiche',...COST_CATEGORIES},filter)}</select></label><ul>${obligations.map(o=>`<li><strong>${e(o.title)}</strong> · ${COST_CATEGORIES[o.category]} · ${money(o.amountCents)} ${PAYMENT_INTERVALS[o.interval]}<p>${e(o.provider)} · Fälligkeiten ab ${o.firstDueDate}${o.endDate?' bis '+o.endDate:''} · ${e(o.paymentMethod||'Zahlungsweise nicht angegeben')}</p>${action('edit-obligation','Bearbeiten',o.id)} ${action('delete-obligation','Kostenposten und Zahlungshistorie löschen',o.id)}</li>`).join('')||'<li>Noch keine Kostenposten in diesem Bereich.</li>'}</ul></section>
    <details open><summary>Fahrzeuge (${data.vehicles.length})</summary><ul>${data.vehicles.map(v=>`<li><strong>${e(v.name)}</strong> · ${e(v.plate)}<p>${e(v.make)} ${e(v.model)} · Kilometerstand ${v.mileage??'nicht angegeben'}${v.serviceDueKm!==null?` · Wartung bei ${v.serviceDueKm} km`:''}</p>${v.mileage!==null&&v.serviceDueKm!==null&&v.mileage>=v.serviceDueKm?'<p class="calendar-conflict">Wartungskilometerstand erreicht</p>':''}${action('edit-vehicle','Bearbeiten',v.id)} ${action('delete-vehicle','Fahrzeug löschen',v.id)}</li>`).join('')||'<li>Noch keine Fahrzeuge.</li>'}</ul></details>
    <details><summary>Zahlungshistorie (${data.payments.length})</summary><ul>${[...data.payments].reverse().map(p=>`<li><strong>${e(data.obligations.find(o=>o.id===p.obligationId)?.title)}</strong> · ${money(p.amountCents)} · bezahlt am ${p.paidDate} · Fälligkeit ${p.dueDate}<p>${e(p.note)}</p>${action('delete-payment','Zahlungseintrag entfernen',p.id)}</li>`).join('')||'<li>Keine Zahlungen dokumentiert.</li>'}</ul></details>
    <details><summary>Verwaltungsbackup</summary><p>Enthält alle Fahrzeuge, Verträge und Zahlungseinträge. Getrennt von Familienkalendern und lokalen Haushaltsbackups. Die Datei ist unverschlüsselt.</p>${action('backup','Verwaltungsbackup herunterladen')}<form data-admin-form="restore"><label>Verwaltungsbackup (JSON, maximal 5 MB)<input type="file" name="file" accept=".json,application/json" required></label><button>Verwaltungsbackup wiederherstellen</button></form></details></section>`;
}
async function operate(fn) {
  if(busy)return;busy=true;status('Wird verarbeitet …');
  try{await fn();}catch(error){status(error.status===401?'Bitte oben erneut mit dem Familienpasswort verbinden.':error.message);}finally{busy=false;}
}
root.innerHTML='<section><h2>Verträge, Kosten und Fahrzeuge</h2><p id="admin-status" role="status">Bitte zuerst die Verbindung zum Familienserver herstellen.</p></section>';
root.addEventListener('input',event=>{const form=event.target.closest('form');if(form){dirty=true;dirtyForms.add(form.dataset.adminForm);}});
root.addEventListener('change',event=>{if(event.target.matches('[data-admin-filter]')){if(discard()){filter=event.target.value;render();}else event.target.value=filter;}});
root.addEventListener('submit',event=>{
  event.preventDefault();const form=event.target,input=Object.fromEntries(new FormData(form));
  operate(async()=>{
    const submit=form.querySelector('button:not([type])');submit.disabled=true;
    try{
      if(form.dataset.adminForm==='vehicle') {
        const current=data.vehicles.find(v=>v.id===vehicleId);
        await api('/vehicles'+(current?'/'+current.id:''),{method:current?'PUT':'POST',body:{...input,version:current?.version}});
        vehicleId='';await refresh('Fahrzeug gespeichert.','vehicle');
      }
      if(form.dataset.adminForm==='obligation') {
        const current=data.obligations.find(v=>v.id===obligationId);
        await api('/obligations'+(current?'/'+current.id:''),{method:current?'PUT':'POST',body:{...input,amountCents:euroToCents(input.amount),version:current?.version}});
        obligationId='';await refresh('Kostenposten gespeichert.','obligation');
      }
      if(form.dataset.adminForm==='payment') {
        const obligation=data.obligations.find(o=>o.id===paymentTarget.obligationId);
        await api('/obligations/'+obligation.id+'/payments',{method:'POST',body:{...input,amountCents:euroToCents(input.amount),dueDate:paymentTarget.dueDate,obligationVersion:obligation.version}});
        paymentTarget=null;await refresh('Zahlung dokumentiert. Es wurde keine Bankzahlung ausgelöst.','payment');
      }
      if(form.dataset.adminForm==='restore') {
        const file=form.elements.file.files[0];if(!file||file.size>5*1024*1024)throw new Error('Bitte eine JSON-Datei mit höchstens 5 MB auswählen.');
        let backup;try{backup=JSON.parse(await file.text());}catch{throw new Error('Ungültige JSON-Datei.');}
        if(backup.format!=='zuhause-administration'||backup.version!==1)throw new Error('Bitte ein Verwaltungsbackup auswählen.');
        if(!window.confirm('Alle Fahrzeuge, Verträge, Zahlungseinträge und ungespeicherten Verwaltungseingaben ersetzen? Familienprofile bleiben erhalten.')){status('Wiederherstellung abgebrochen.');return;}
        await api('/restore',{method:'POST',body:{backup,revision:data.revision}});vehicleId='';obligationId='';paymentTarget=null;await refresh('Verwaltungsbackup wiederhergestellt.');
      }
    }finally{submit.disabled=false;}
  });
});
root.addEventListener('click',event=>{
  const target=event.target.closest('[data-admin-action]');if(!target)return;
  const {adminAction:name,id,date}=target.dataset;
  operate(async()=>{
    if(!['backup','delete-obligation','delete-vehicle','delete-payment'].includes(name)&&!discard())return;
    if(name==='refresh')await refresh('Verwaltung aktualisiert.');
    if(name==='new-vehicle'){vehicleId='';render();}
    if(name==='new-obligation'){obligationId='';render();}
    if(name==='edit-vehicle'){vehicleId=id;render();}
    if(name==='edit-obligation'){obligationId=id;render();}
    if(name==='pay'){paymentTarget={obligationId:id,dueDate:date};render();}
    if(name==='cancel-payment'){paymentTarget=null;render();}
    if(name.startsWith('delete-')&&window.confirm('Diesen Eintrag löschen? Beim Löschen eines Kostenpostens werden auch seine Zahlungen gelöscht. Ungespeicherte Verwaltungseingaben werden verworfen.')) {
      const [plural,items]=name==='delete-vehicle'?['vehicles',data.vehicles]:name==='delete-payment'?['payments',data.payments]:['obligations',data.obligations];
      const item=items.find(v=>v.id===id);await api('/'+plural+'/'+id,{method:'DELETE',version:item.version});paymentTarget=null;await refresh('Eintrag gelöscht.');
    }
    if(name==='backup') {
      const backup=await api('/backup'),text=JSON.stringify(backup);
      if(new Blob([JSON.stringify({backup,revision:data.revision})]).size>5*1024*1024)throw new Error('Daten für JSON-Wiederherstellung zu groß. Bitte die SQLite-Datei auf dem Server sichern.');
      const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='zuhause-verwaltung-'+localDate()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Verwaltungsbackup-Download gestartet.');
    }
  });
});
window.addEventListener('family-updated',()=>{if(!loaded&&!busy)operate(()=>refresh());else if(loaded)status('Familienserver aktualisiert. Bei Bedarf auch die Verwaltung aktualisieren.');});
if(serverIsConnected)operate(()=>refresh());
