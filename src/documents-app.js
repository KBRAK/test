import { serverRequest,serverDownload,serverIsConnected,setServerKey } from './storage/server.js';
import { COST_CATEGORIES,PAYMENT_INTERVALS,euroToCents,formatMoney } from './domain/administration.js';
import { MAX_DOCUMENT_BYTES } from './domain/documents.js';
const root=document.querySelector('#documents-app');
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const input=(label,name,value='',type='text',required=false,max=200)=>`<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${required?'required':''} maxlength="${max}" ${type==='password'?'autocomplete="off"':''}></label>`;
const act=(action,label,id='',date='')=>`<button type="button" data-document-action="${action}" data-id="${e(id)}" data-date="${date}">${label}</button>`;
const options=(values,current)=>Object.entries(values).map(([value,label])=>`<option value="${value}" ${value===current?'selected':''}>${e(label)}</option>`).join('');
const dirtyForms=new Set();
const standalone=root.dataset.standalone==='true';
let view='all',search='',category='',sort='newest',detailTab='review',previewUrl='';
const icons={file:'M8 3h8l5 5v13H8V3Zm8 0v6h5M11 13h7m-7 4h7',upload:'M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5',shield:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6',bell:'M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 21h4',search:'m21 21-4.3-4.3M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',check:'m5 12 4 4L19 6',users:'M15 21v-3a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v3M8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m15 11v-3a4 4 0 0 0-3-4M16 2a4 4 0 0 1 0 8',arrow:'m9 5 7 7-7 7'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"> <path d="${icons[name]||icons.file}"/></svg>`;
const dateLabel=value=>value?value.split('-').reverse().join('.'):'Nicht angegeben';
const clearPreview=()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';};
const badge=d=>`<span class="document-badge ${d.state==='reviewed'?'is-reviewed':'is-draft'}">${d.state==='reviewed'?'Geprüft':'Zu prüfen'}</span>`;
const fileType=d=>d.mime==='application/pdf'?'PDF':d.mime.startsWith('image/')?'BILD':'TXT';
function filteredDocuments(){
  let docs=data.documents.filter(d=>(view!=='drafts'||d.state==='draft')&&(view!=='reviewed'||d.state==='reviewed')&&(view!=='shared'||d.ownerId!==me.id)&&(!category||(d.facts?.category||'unassigned')===category)&&`${d.facts?.title||''} ${d.filename} ${d.facts?.provider||''} ${d.facts?.reference||''}`.toLocaleLowerCase('de').includes(search.toLocaleLowerCase('de')));
  return [...docs].sort((a,b)=>sort==='title'?(a.facts?.title||a.filename).localeCompare(b.facts?.title||b.filename,'de'):sort==='due'?(a.facts?.dueDate||'9999').localeCompare(b.facts?.dueDate||'9999'):b.createdAt.localeCompare(a.createdAt));
}
function navigation(){
  const items=[['all','Alle Dokumente','file',data.documents.length],['drafts','Zu prüfen','search',data.documents.filter(d=>d.state==='draft').length],['reviewed','Geprüft','check',data.documents.filter(d=>d.state==='reviewed').length],['shared','Mit mir geteilt','users',data.documents.filter(d=>d.ownerId!==me.id).length],['reminders','Erinnerungen','bell',data.reminders.length],['account',me.role==='admin'?'Konto & Nutzer':'Mein Konto','shield',null]];
  return `<aside class="document-sidebar"><a class="document-brand" href="/dokumente">${icon('file')}<span>Dokumente<small>Deine persönliche Ablage</small></span></a><nav aria-label="Dokumentenbereiche">${items.map(([id,label,glyph,count])=>`<button type="button" data-document-view="${id}" ${view===id?'aria-current="page"':''}>${icon(glyph)}<span>${label}</span>${count!==null?`<small>${count}</small>`:''}</button>`).join('')}</nav><div class="document-sidebar-note">${icon('shield')}<p>Privat bleibt privat.<small>Du bestimmst, wer deine Dokumente lesen darf.</small></p></div><div class="document-person"><span class="document-avatar">${e(me.name.slice(0,1).toUpperCase())}</span><span>${e(me.name)}<small>Persönlich angemeldet</small></span></div></aside>`;
}
function reminderPanel(full=false){return `<section class="document-reminders"><div class="document-panel-heading"><div><span class="document-eyebrow">${full?'DEINE FÄLLIGKEITEN':'IM BLICK BEHALTEN'}</span><h3>Deine Zahlungserinnerungen <span>${data.reminders.length}</span></h3></div>${!full?'<button type="button" class="document-link-button" data-document-view="reminders">Alle ansehen →</button>':''}</div><ul>${data.reminders.slice(0,full?100:3).map(r=>`<li><span class="document-due-icon">${icon('bell')}</span><div><strong>${e(r.title)}</strong><p>${dateLabel(r.dueDate)} · ${r.amountCents===null?'Betrag nicht bekannt':formatMoney(r.amountCents)}${r.overdue?' · <span class="document-overdue">Überfällig</span>':''}</p></div><div class="document-reminder-actions">${act('open','Ansehen',r.documentId)}${act('acknowledge','Erledigen',r.documentId,r.dueDate)}</div></li>`).join('')||`<li class="document-quiet-state">${icon('check')}<p>Alles im Blick.<small>Zurzeit sind keine Erinnerungen für dich offen.</small></p></li>`}</ul>${full?'<p class="document-help">Du siehst nur dir zugeordnete Hinweise für freigegebene Dokumente. „Erledigen“ blendet deinen Hinweis aus und verbucht keine Zahlung. Erinnerungen erscheinen hier nach dem Aktualisieren; E-Mail und Push sind noch nicht eingerichtet.</p>':''}</section>`;}
function uploadPanel(){return `<form class="document-upload" data-document-form="upload"><label class="document-dropzone" data-document-dropzone><span class="document-upload-icon">${icon('upload')}</span><strong>Dein Dokument. Ein klarer Überblick.</strong><span>Datei hierher ziehen oder <b>Datei auswählen</b></span><small>PDF, PNG, JPEG oder TXT · bis 10 MB · PDF bis 20 Seiten</small><input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.txt" required aria-label="Dokument auswählen"></label><div class="document-upload-bottom"><span data-document-file-label>Noch keine Datei ausgewählt</span><button>Auslesen & analysieren ${icon('arrow')}</button></div><progress class="document-upload-progress" aria-label="Dokument wird ausgelesen" hidden></progress></form>`;}
function documentRows(){const docs=filteredDocuments();return docs.map(d=>`<button type="button" class="document-row ${selected?.id===d.id?'is-selected':''}" data-document-action="open" data-id="${e(d.id)}" aria-pressed="${selected?.id===d.id}"><span class="document-file-icon">${icon('file')}<small>${fileType(d)}</small></span><span class="document-row-title"><strong>${e(d.facts?.title||d.filename)}</strong><small>${e(d.facts?.provider||d.filename)} · ${d.ownerId===me.id?'Dein Dokument':'Mit dir geteilt'}</small></span><span class="document-row-amount">${d.facts?.amountCents!=null?formatMoney(d.facts.amountCents):'—'}<small>${d.facts?.dueDate?'Fällig '+dateLabel(d.facts.dueDate):'Kein bestätigter Termin'}</small></span>${badge(d)}<span class="document-row-arrow">${icon('arrow')}</span></button>`).join('')||`<div class="document-empty">${icon('file')}<h3>${search||category?'Keine passenden Dokumente':'Hier beginnt deine Übersicht'}</h3><p>${search||category?'Passe Suche oder Bereich an.':'Lade dein erstes Dokument hoch. Kosten und Zahlungstermine kannst du anschließend in Ruhe prüfen.'}</p></div>`;}
function library(){return `<section class="document-library"><div class="document-panel-heading"><div><span class="document-eyebrow">DEINE ABLAGE</span><h3>${{all:'Alle Dokumente',drafts:'Noch zu prüfen',reviewed:'Geprüfte Dokumente',shared:'Mit dir geteilt'}[view]||'Dokumente'} <span data-document-result-count>${filteredDocuments().length}</span></h3></div></div><div class="document-filters"><label class="document-search">${icon('search')}<input type="search" data-document-search value="${e(search)}" placeholder="Dokumente durchsuchen …" aria-label="Dokumente durchsuchen"></label><label><span class="document-sr-only">Bereich filtern</span><select data-document-category>${options({'':'Alle Bereiche',unassigned:'Noch nicht zugeordnet',...COST_CATEGORIES},category)}</select></label><label><span class="document-sr-only">Sortierung</span><select data-document-sort>${options({newest:'Neueste zuerst',title:'Name A–Z',due:'Nach Fälligkeit'},sort)}</select></label></div><div class="document-rows" data-document-rows>${documentRows()}</div></section>`;}
function updateRows(){const rows=root.querySelector('[data-document-rows]');if(rows)rows.innerHTML=documentRows();const count=root.querySelector('[data-document-result-count]');if(count)count.textContent=filteredDocuments().length;}

let token='',me=null,data={documents:[],users:[],reminders:[]},selected=null,busy=false,dirty=false,initialized=false;
const status=message=>{const element=root.querySelector('#document-status');if(element)element.textContent=message;};
const api=(path='',options={})=>serverRequest('documents'+path,{...options,headers:{'X-Document-Session':token,...options.headers}});
const discard=()=>!dirty||window.confirm('Ungespeicherte Dokumentangaben oder Freigaben verwerfen?');
const empty=()=>{clearPreview();view='all';search='';category='';me=null;token='';selected=null;data={documents:[],users:[],reminders:[]};dirty=false;initialized=false;root.innerHTML='<section><h2>Dokumente und persönliche Erinnerungen</h2><p id="document-status" role="status">Persönlich abgemeldet.</p><button type="button" data-document-action="entry">Persönliche Anmeldung anzeigen</button></section>';};
function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function entry(message='') {
  let config;
  try{config=await serverRequest('documents/status');}
  catch(error){if(error.status===401&&standalone){initialized=true;connectionEntry(message||'Verbinde dich zuerst mit deinem Familienserver.');return;}throw error;}
  initialized=true;
  const setup=config.setupRequired;
  root.innerHTML=`<section class="document-access"><div class="document-access-story"><span class="document-access-icon">${icon('shield')}</span><span class="document-eyebrow">DEIN DIGITALER ORDNUNGSHELFER</span><h2>Deine Unterlagen.<br>Dein guter Überblick.</h2><p>Dokumente ablegen, Kosten verstehen und wichtige Zahlungstermine im Blick behalten.</p><ol><li><span>01</span>Dokument hochladen</li><li><span>02</span>Erkannte Angaben prüfen</li><li><span>03</span>Rechtzeitig daran denken</li></ol><small>Deine Dokumente bleiben auf deinem Familienserver.</small></div><div class="document-access-form"><span class="document-eyebrow">${setup?'ERSTE SCHRITTE':'WILLKOMMEN ZURÜCK'}</span><h3>${setup?'Persönlichen Zugang einrichten':'Persönlich anmelden'}</h3><p>${setup?'Erstelle direkt am Familienserver (localhost) das erste Administratorkonto. Weitere Nutzer kannst du danach hinzufügen.':'Dein persönlicher Zugang schützt deine Dokumente. Freigaben vergibst du für jedes Dokument selbst.'}</p><p id="document-status" role="status" aria-live="polite">${e(message)}</p><form data-document-form="${setup?'setup':'login'}">${setup?input('Dein Name','name','','text',true,100):''}${input('Benutzername','username','','text',true,50)}${input(setup?'Persönliches Passwort · mindestens 12 Zeichen':'Persönliches Passwort','password','','password',true,256)}<button>${setup?'Persönlichen Zugang erstellen':'Anmelden'} ${icon('arrow')}</button></form><p class="document-help">${setup?'Benutzername: 3–50 Zeichen, a–z, Zahlen, Punkt, Bindestrich oder Unterstrich.':'Die Anmeldung gilt für diese geöffnete Seite. Dein Passwort wird nicht im Browser gespeichert.'}</p></div></section>`;
}
function connectionEntry(message=''){
  root.innerHTML=`<section class="document-access document-connection"><div class="document-access-story"><span class="document-access-icon">${icon('file')}</span><span class="document-eyebrow">ZUSAMMEN ZUHAUSE</span><h2>Ein sicherer Ort<br>für deine Dokumente.</h2><p>Verbinde dich mit dem Familienserver. Anschließend meldest du dich mit deinem persönlichen Dokumentkonto an.</p><small>Dokumente · Kosten · Zahlungserinnerungen</small></div><div class="document-access-form"><span class="document-eyebrow">VERBINDUNG HERSTELLEN</span><h3>Dein Familienserver</h3><p id="document-status" role="status" aria-live="polite">${e(message)}</p><form data-document-form="server">${input('Familienpasswort','key','','password',true,256)}<button>Verbinden ${icon('arrow')}</button></form><a class="document-back-link" href="/">Zur Haushaltsübersicht →</a></div></section>`;
}

async function refresh(message='',preserveForm='') {
  const draftForm=preserveForm&&dirtyForms.has(preserveForm)?root.querySelector(`[data-document-form="${preserveForm}"]`):null;
  const draft=draftForm?[...draftForm.elements].filter(v=>v.name&&v.type!=='file').map(v=>({name:v.name,value:v.value,type:v.type,checked:v.checked})):[];
  data=await api();me=data.user;
  if(selected){selected=data.documents.some(d=>d.id===selected.id)?await api('/'+selected.id):null;}
  render();
  if(draft.length){const form=root.querySelector(`[data-document-form="${preserveForm}"]`);if(form){for(const field of draft){const fields=[...form.elements].filter(v=>v.name===field.name);if(field.type==='checkbox'){const target=fields.find(v=>v.value===field.value);if(target)target.checked=field.checked;}else if(fields[0])fields[0].value=field.value;}dirty=true;dirtyForms.add(preserveForm);}}
  status(message);
}
function accountControls() {
  return `<details open><summary>Persönliches Passwort ändern${me.role==='admin'?' und Konten verwalten':''}</summary>
    <form data-document-form="password">${input('Bisheriges persönliches Passwort','currentPassword','','password',true,256)}${input('Neues persönliches Passwort (mindestens 12 Zeichen)','newPassword','','password',true,256)}<button>Passwort ändern und abmelden</button></form>
    ${me.role==='admin'?`<h3>Weiteres persönliches Dokumentkonto</h3><form data-document-form="user">${input('Anzeigename','name','','text',true,100)}${input('Benutzername','username','','text',true,50)}${input('Anfangspasswort (mindestens 12 Zeichen)','password','','password',true,256)}<label>Kontorolle<select name="role"><option value="user">Nutzer</option><option value="admin">Dokumentadministration</option></select></label><button>Dokumentkonto anlegen</button></form>
    <p>Administratorkonten verwalten Konten. Der Zugriff auf Dokumente benötigt auch für diese Konten eine Freigabe. Neue Nutzer können ihr Anfangspasswort nach der Anmeldung ändern.</p><ul>${data.users.filter(u=>u.id!==me.id).map(u=>`<li>${e(u.name)} (${e(u.username)}) ${act('deactivate','Konto deaktivieren',u.id)}</li>`).join('')||'<li>Noch keine weiteren Dokumentkonten.</li>'}</ul>`:''}</details>`;
}
function documentDetail() {
  if(!selected)return '';
  const owner=selected.ownerId===me.id,f=selected.facts||{...selected.analysis.fields,recipientIds:selected.analysis.fields.dueDate?[me.id]:[]};
  const permitted=data.users.filter(u=>u.id===selected.ownerId||selected.readerIds.includes(u.id));
  const labels={amountCents:'Betrag',dueDate:'Zahlungstermin',cancellationDate:'Kündigungstermin',provider:'Anbieter',reference:'Referenz',interval:'Zahlungsrhythmus'};
  const tabs=[['review',owner?'Angaben prüfen':'Angaben'],['evidence','Fundstellen'],['text','Dokumenttext'],['original','Vorschau'],...(owner?[['grants','Freigaben']]:[])];
  if(!tabs.some(([id])=>id===detailTab))detailTab='review';
  return `<section class="document-detail" aria-label="Ausgewähltes Dokument"><div class="document-detail-heading"><div><span class="document-eyebrow">${owner?'DEIN DOKUMENT':'MIT DIR GETEILT'}</span><h3 tabindex="-1">${e(f.title||selected.filename)}</h3><p>${e(selected.filename)} · ${fileType(selected)} ${badge(selected)}</p></div><button type="button" class="document-close" data-document-action="close" aria-label="Dokumentdetails schließen">×</button></div>
    <div class="document-detail-summary"><div><small>${selected.state==='reviewed'?'Bestätigter Zahlbetrag':'Erkannter Zahlbetrag · Vorschlag'}</small><strong>${f.amountCents==null?'Noch offen':formatMoney(f.amountCents)}</strong></div><div><small>${selected.state==='reviewed'?'Zahlungstermin':'Erkannter Termin · Vorschlag'}</small><strong>${dateLabel(f.dueDate)}</strong></div><div><small>Rhythmus</small><strong>${PAYMENT_INTERVALS[f.interval]||'Noch offen'}</strong></div></div>
    <div class="document-detail-actions">${act('original','Original herunterladen',selected.id)}${act('export','Daten exportieren',selected.id)}${owner?act('delete','Löschen',selected.id):''}</div>
    <div class="document-tabs" role="tablist" aria-label="Dokumentansichten">${tabs.map(([id,label])=>`<button type="button" role="tab" id="document-tab-${id}" aria-controls="document-panel-${id}" aria-selected="${detailTab===id}" tabindex="${detailTab===id?'0':'-1'}" data-document-tab="${id}">${label}</button>`).join('')}</div>
    <div id="document-panel-review" role="tabpanel" aria-labelledby="document-tab-review" ${detailTab!=='review'?'hidden':''}><div class="document-review-notice">${icon('search')}<p>${selected.state==='reviewed'?'Deine bestätigten Angaben. Änderungen kannst du erneut am Original prüfen.':'Ein kurzer Blick schafft Sicherheit. Vergleiche Betrag und Termin mit dem Original, bevor du Erinnerungen aktivierst.'}</p></div>
    ${owner?`<h4>Strukturierte Angaben prüfen</h4><form data-document-form="facts">${input('Dokumenttitel','title',f.title,'text',true)}
      <div class="row"><label>Bereich<select name="category">${options(COST_CATEGORIES,f.category)}</select></label>${input('Anbieter','provider',f.provider)}</div>
      ${input('Vertrags- / Rechnungsnummer','reference',f.reference)}
      <div class="row">${input('Zahlbetrag in EUR (leer = nicht bekannt)','amount',f.amountCents===null?'':(f.amountCents/100).toFixed(2))}${input('Erster hier geführter Zahlungstermin','dueDate',f.dueDate||'','date')}</div>
      <div class="row"><label>Zahlungsrhythmus<select name="interval">${options({unknown:'Nicht bekannt / nur genannten Termin merken',...PAYMENT_INTERVALS},f.interval)}</select></label>${input('Letzte Fälligkeit (optional)','endDate',f.endDate||'','date')}</div>
      ${input('Kündigungstermin (optional)','cancellationDate',f.cancellationDate||'','date')}
      <label>Ergänzende Notizen<textarea name="notes" maxlength="5000">${e(f.notes)}</textarea></label>
      ${input('Wie viele Tage vor Fälligkeit erinnern? (0–90)','leadDays',f.leadDays??7,'number',true)}
      <fieldset><legend>Erinnerungsempfänger mit aktuellem Leserecht</legend>${permitted.map(u=>`<label class="document-check"><input type="checkbox" name="recipientIds" value="${u.id}" ${f.recipientIds.includes(u.id)?'checked':''}>${e(u.name)}</label>`).join('')}</fieldset>
      <p>Für Erinnerungen muss ein Zahlungstermin eingetragen sein. Bei unbekanntem Rhythmus gilt ausschließlich dieser Termin. Erinnerungen erscheinen aktuell hier im Dokumentenbereich; E-Mail und Push sind noch nicht eingerichtet. Überfällige Hinweise werden bis zu einem Jahr angezeigt.</p>
      <label class="document-check"><input type="checkbox" name="reviewed" required>Ich habe Betrag, Währung EUR, Termine und übrige Angaben mit dem Original verglichen.</label><button>Geprüfte Angaben speichern</button></form>
`:`${selected.facts?`<dl class="document-readonly"><dt>Zahlbetrag</dt><dd>${f.amountCents===null?'Nicht bekannt':formatMoney(f.amountCents)}</dd><dt>Zahlungstermin</dt><dd>${dateLabel(f.dueDate)}</dd><dt>Anbieter</dt><dd>${e(f.provider||'Nicht angegeben')}</dd><dt>Referenz</dt><dd>${e(f.reference||'Nicht angegeben')}</dd><dt>Rhythmus</dt><dd>${PAYMENT_INTERVALS[f.interval]||'Unbekannt'}</dd></dl>`:'<p>Die Angaben wurden vom Eigentümer noch nicht bestätigt. Entwürfe erzeugen keine Erinnerungen.</p>'}`}</div>
    <div id="document-panel-evidence" role="tabpanel" aria-labelledby="document-tab-evidence" ${detailTab!=='evidence'?'hidden':''}><h4>So wurden die Angaben erkannt</h4><ul class="document-evidence">${Object.entries(selected.analysis.evidence).flatMap(([field,items])=>items.map(item=>`<li><span>${labels[field]||e(field)} · Seite ${item.page}</span><strong>${e(field==='amountCents'?formatMoney(item.value):item.value)}</strong><blockquote>${e(item.line)}</blockquote></li>`)).join('')||'<li>Keine eindeutigen Zahlungsangaben gefunden.</li>'}</ul><details open><summary>Hinweise zur Erkennung</summary><ul>${selected.analysis.warnings.map(w=>`<li>${e(w)}</li>`).join('')}</ul></details><p class="document-help">Die Erkennung arbeitet mit Textmustern. Prüfe wichtige Angaben immer am Original.</p></div>
    <div id="document-panel-text" role="tabpanel" aria-labelledby="document-tab-text" ${detailTab!=='text'?'hidden':''}><h4>Ausgelesener Dokumenttext</h4><pre class="document-text">${e(selected.text)}</pre></div>
    <div id="document-panel-original" role="tabpanel" aria-labelledby="document-tab-original" ${detailTab!=='original'?'hidden':''}><div data-document-preview class="document-preview"><p>Vorschau wird geladen …</p></div><p class="document-help">Du kannst das Original jederzeit herunterladen. Die Vorschau hängt von den unterstützten Formaten deines Browsers ab.</p></div>
    ${owner?`<div id="document-panel-grants" role="tabpanel" aria-labelledby="document-tab-grants" ${detailTab!=='grants'?'hidden':''}><h4>Wer darf dieses Dokument sehen?</h4><form data-document-form="grants"><p>Nur der Eigentümer darf Angaben ändern und Freigaben verwalten. Entzug des Leserechts entfernt auch die Zuordnung für künftige Erinnerungen.</p>${data.users.filter(u=>u.id!==me.id).map(u=>`<label class="document-check"><input type="checkbox" name="readerIds" value="${u.id}" ${selected.readerIds.includes(u.id)?'checked':''}>${e(u.name)} (${e(u.username)})</label>`).join('')||'<p>Noch keine anderen aktiven Dokumentkonten.</p>'}<button>Leserechte speichern</button></form></div>`:''}
    <p class="document-detail-footnote">${icon('shield')}Nur du und ausdrücklich berechtigte Personen können dieses Dokument sehen. Erinnerungen werden nur für bestätigte Angaben angezeigt.</p></section>`;
}
async function loadPreview(){
  const target=root.querySelector('[data-document-preview]');if(!target||!selected)return;
  const current={id:selected.id,token,mime:selected.mime};
  try{
    const blob=await serverDownload('documents/'+current.id+'/original',{headers:{'X-Document-Session':current.token}});
    if(token!==current.token||selected?.id!==current.id||!target.isConnected)return;
    clearPreview();
    if(current.mime==='text/plain'){target.innerHTML='<pre class="document-text"></pre>';target.firstElementChild.textContent=await blob.text();return;}
    previewUrl=URL.createObjectURL(blob);
    if(current.mime.startsWith('image/')){target.innerHTML='<img alt="Vorschau des ausgewählten Originaldokuments">';target.firstElementChild.src=previewUrl;}
    else{target.innerHTML='<iframe title="Vorschau des Originaldokuments" referrerpolicy="no-referrer"></iframe>';target.firstElementChild.src=previewUrl;}
  }catch(error){if(target.isConnected)target.textContent=error.message;}
}
function showDetailTab(id,focus=false){
  const tab=root.querySelector(`[data-document-tab="${id}"]`);if(!tab)return;
  detailTab=id;
  for(const item of root.querySelectorAll('[data-document-tab]')){const active=item.dataset.documentTab===id;item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;}
  for(const panel of root.querySelectorAll('[role="tabpanel"]'))panel.hidden=panel.id!=='document-panel-'+id;
  if(focus)tab.focus();
  if(id==='original')loadPreview();
}

function render() {
  clearPreview();dirty=false;dirtyForms.clear();
  const isLibrary=['all','drafts','reviewed','shared'].includes(view);
  root.innerHTML=`<section class="document-space">${navigation()}<div class="document-workspace"><header class="document-workspace-header"><div><span class="document-eyebrow">DEIN PERSÖNLICHER BEREICH</span><h2>${view==='reminders'?'Deine Termine im Blick.':view==='account'?'Dein Zugang. Deine Regeln.':'Alles geordnet. Gut im Blick.'}</h2><p>${view==='account'?'Verwalte deinen persönlichen Zugang und berechtigte Konten.':'Deine Unterlagen, Kosten und Zahlungstermine an einem Ort.'}</p></div><div class="document-header-actions">${act('refresh','Aktualisieren')}${act('logout','Abmelden')}</div></header><p id="document-status" role="status" aria-live="polite"></p>
    ${isLibrary?`<div class="document-stats"><div>${icon('file')}<span><strong>${data.documents.length}</strong><small>Dokumente in deiner Ablage</small></span></div><div>${icon('search')}<span><strong>${data.documents.filter(d=>d.state==='draft').length}</strong><small>Warten auf deine Prüfung</small></span></div><button type="button" data-document-view="reminders">${icon('bell')}<span><strong>${data.reminders.length}</strong><small>Offene Erinnerungen</small></span>${icon('arrow')}</button></div>${uploadPanel()}${data.reminders.length?reminderPanel():''}${library()}${documentDetail()}`:view==='reminders'?`${reminderPanel(true)}${documentDetail()}`:`<section class="document-settings"><h3>Persönliches Konto</h3><p>${e(me.name)} · ${e(me.username)} · ${me.role==='admin'?'Dokumentadministration':'Dokumentnutzer'}</p>${accountControls()}</section>`}
    <footer class="document-workspace-footer">${icon('shield')}Lokal auf deinem Familienserver verarbeitet. Du entscheidest über Freigaben.</footer></div></section>`;
  if(selected&&detailTab==='original')loadPreview();
}

async function operate(fn) {
  if(busy)return;busy=true;root.setAttribute('aria-busy','true');status('Wird verarbeitet …');
  try{await fn();}catch(error){if(error.status===401&&token){empty();await entry('Persönliche Anmeldung ungültig. Bitte erneut anmelden.').catch(()=>{});}else status(error.message);}finally{busy=false;root.setAttribute('aria-busy','false');root.querySelector('.document-upload-progress')?.setAttribute('hidden','');}
}
async function fileBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Datei konnte nicht gelesen werden.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});}
root.innerHTML='<section><h2>Dokumente und persönliche Erinnerungen</h2><p id="document-status" role="status">Bitte zuerst oben mit dem Familienserver verbinden.</p></section>';
root.addEventListener('input',event=>{if(event.target.matches('[data-document-search]')){search=event.target.value;updateRows();return;}const form=event.target.closest('[data-document-form="facts"], [data-document-form="grants"]');if(form){dirty=true;dirtyForms.add(form.dataset.documentForm);}});
root.addEventListener('submit',event=>{
  event.preventDefault();const form=event.target,values=new FormData(form),input=Object.fromEntries(values),kind=form.dataset.documentForm;
  operate(async()=>{
    const submit=form.querySelector('button:not([type])');submit.disabled=true;
    try{
      if(kind==='server'){setServerKey(input.key);await entry('Mit Familienserver verbunden.');}
      if(kind==='setup'){await serverRequest('documents/setup',{method:'POST',body:input});await entry('Persönliches Administratorkonto angelegt. Jetzt anmelden.');}
      if(kind==='login'){const result=await serverRequest('documents/login',{method:'POST',body:input});token=result.token;me=result.user;await refresh('Persönlich angemeldet.');}
      if(kind==='upload'){
        if(!discard())return;const file=form.elements.file.files[0];if(!file||!file.size||file.size>MAX_DOCUMENT_BYTES)throw new Error('Bitte eine nicht leere Datei mit höchstens 10 MB auswählen.');
        root.querySelector('.document-upload-progress')?.removeAttribute('hidden');status('Dokument wird lokal ausgelesen und analysiert. Bei Scans kann dies etwas dauern.');view='all';detailTab='review';selected=await api('/upload',{method:'POST',body:{filename:file.name,base64:await fileBase64(file)}});await refresh('Dokument als ungeprüfter Entwurf gespeichert. Bitte Original und erkannte Angaben prüfen.');
      }
      if(kind==='facts'){
        const facts={...input,currency:input.amount.trim()?'EUR':null,amountCents:input.amount.trim()?euroToCents(input.amount):null,leadDays:Number(input.leadDays),recipientIds:values.getAll('recipientIds')};
        selected=await api('/'+selected.id+'/confirm',{method:'POST',body:{version:selected.version,reviewed:input.reviewed==='on',facts}});await refresh('Geprüfte Dokumentdaten und Erinnerungsempfänger gespeichert.','grants');
      }
      if(kind==='grants'){selected=await api('/'+selected.id+'/grants',{method:'POST',body:{version:selected.version,readerIds:values.getAll('readerIds')}});await refresh('Leserechte aktualisiert. Erinnerungszuordnungen werden auf aktuelle Rechte begrenzt.','facts');}
      if(kind==='user'){if(!discard())return;await api('/users',{method:'POST',body:input});await refresh('Persönliches Dokumentkonto angelegt.');}
      if(kind==='password'){if(!discard())return;await api('/password',{method:'POST',body:input});empty();await entry('Passwort geändert. Alle persönlichen Sitzungen sind abgemeldet.');}
    }finally{submit.disabled=false;for(const field of form.querySelectorAll('input[type="password"]'))field.value='';}
  });
});
root.addEventListener('click',event=>{
  const nav=event.target.closest('[data-document-view]');
  if(nav){if(busy||!discard())return;view=nav.dataset.documentView;selected=null;detailTab='review';render();return;}
  const tab=event.target.closest('[data-document-tab]');if(tab){showDetailTab(tab.dataset.documentTab);return;}
  const target=event.target.closest('[data-document-action]');if(!target)return;
  const {documentAction:action,id,date}=target.dataset;
  operate(async()=>{
    if(['open','close','refresh','logout','acknowledge','deactivate'].includes(action)&&!discard())return;
    if(action==='entry')await entry();
    if(action==='open'){detailTab='review';selected=await api('/'+id);render();root.querySelector('.document-detail h3')?.focus({preventScroll:true});}
    if(action==='close'){selected=null;render();}
    if(action==='refresh')await refresh('Dokumente, Rechte und Erinnerungen aktualisiert.');
    if(action==='logout'){try{await api('/logout',{method:'POST'});}finally{empty();await entry('Persönlich abgemeldet.');}}
    if(action==='original'){const blob=await serverDownload('documents/'+id+'/original',{headers:{'X-Document-Session':token}});download(blob,selected.filename);status('Original-Download gestartet.');}
    if(action==='export'){const exported=await api('/'+id+'/export');download(new Blob([JSON.stringify(exported,null,2)],{type:'application/json'}),'dokument-'+id+'.json');status('Dokumentexport gestartet.');}
    if(action==='delete'&&window.confirm('Originaldatei, erkannte Angaben, Freigaben und Erinnerungen dieses Dokuments löschen?')){await api('/'+id,{method:'DELETE',version:selected.version});selected=null;await refresh('Dokument gelöscht.');}
    if(action==='deactivate'&&window.confirm('Dieses Konto deaktivieren und alle seine persönlichen Sitzungen beenden?')){await api('/users/'+id,{method:'DELETE'});await refresh('Dokumentkonto deaktiviert.');}
    if(action==='acknowledge'){await api('/'+id+'/acknowledge',{method:'POST',body:{dueDate:date}});await refresh('Deine Erinnerung ist erledigt. Es wurde keine Zahlung verbucht.');}
  });
});
function selectedFile(file){
  const form=root.querySelector('[data-document-form="upload"]');if(!form)return;
  const label=form.querySelector('[data-document-file-label]');
  if(!file){label.textContent='Noch keine Datei ausgewählt';return;}
  if(!file.size||file.size>MAX_DOCUMENT_BYTES||!/[.](pdf|png|jpe?g|txt)$/i.test(file.name)){form.elements.file.value='';label.textContent='Bitte PDF, PNG, JPEG oder TXT mit maximal 10 MB wählen.';status('Die Datei kann so nicht hochgeladen werden.');return;}
  label.textContent=file.name+' · '+(file.size<1024*1024?Math.max(1,Math.round(file.size/1024))+' KB':(file.size/1024/1024).toFixed(1)+' MB');
}
root.addEventListener('change',event=>{
  if(event.target.matches('[data-document-category]')){category=event.target.value;updateRows();}
  if(event.target.matches('[data-document-sort]')){sort=event.target.value;updateRows();}
  if(event.target.matches('[data-document-form="upload"] input[type="file"]'))selectedFile(event.target.files[0]);
});
root.addEventListener('dragover',event=>{const zone=event.target.closest('[data-document-dropzone]');if(zone){event.preventDefault();zone.classList.add('is-dragging');}});
root.addEventListener('dragleave',event=>{const zone=event.target.closest('[data-document-dropzone]');if(zone&&!zone.contains(event.relatedTarget))zone.classList.remove('is-dragging');});
root.addEventListener('drop',event=>{
  const zone=event.target.closest('[data-document-dropzone]');if(!zone)return;event.preventDefault();zone.classList.remove('is-dragging');if(busy)return;
  if(event.dataTransfer.files.length!==1){const field=zone.querySelector('input[type="file"]');field.value='';selectedFile(null);status('Bitte jeweils genau ein Dokument auswählen.');return;}
  const transfer=new DataTransfer();transfer.items.add(event.dataTransfer.files[0]);const field=zone.querySelector('input[type="file"]');field.files=transfer.files;selectedFile(field.files[0]);
});
root.addEventListener('keydown',event=>{
  const tab=event.target.closest('[data-document-tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
  const tabs=[...root.querySelectorAll('[data-document-tab]')],index=tabs.indexOf(tab);
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  showDetailTab(tabs[next].dataset.documentTab,true);
});
window.addEventListener('family-updated',()=>{if(!initialized&&!busy)operate(()=>entry());});
if(serverIsConnected||standalone)operate(()=>entry());
