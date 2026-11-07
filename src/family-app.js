import { EVENT_KINDS, WEEKDAYS, memberName, localDate, weekStart, addDays, calendarOccurrences } from './domain/family.js';
import { serverRequest, setServerKey } from './storage/server.js';
import { load } from './storage/local.js';
const root = document.querySelector('#family-app');
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data = {members: [], events: [], revision: 0}, selected = '', editingEvent = '', calendarMember = '', week = weekStart(localDate());
let busy = false, dirty = false;
const dirtyForms = new Set();
const member = () => data.members.find(m => m.id === selected);
const input = (label, name, value = '', type = 'text', required = false, max = 200) => `<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${required ? 'required' : ''} ${type === 'text' ? `maxlength="${max}"` : ''}></label>`;
const area = (label, name, value = '', max = 2000) => `<label>${label}<textarea name="${name}" maxlength="${max}">${e(Array.isArray(value) ? value.join(', ') : value)}</textarea></label>`;
const options = (items, current) => Object.entries(items).map(([value,label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${e(label)}</option>`).join('');
const act = (action, label, id = '') => `<button type="button" data-family-action="${action}" data-id="${e(id)}">${label}</button>`;
const status = message => { const target = root.querySelector('#family-status'); if (target) target.textContent = message; };
const mayDiscard = () => !dirty || window.confirm('Ungespeicherte Änderungen in Familienprofil oder Termin verwerfen?');
const api = (path='', options={}) => serverRequest('family'+path, options);
function announce() { window.dispatchEvent(new CustomEvent('family-updated', {detail: data.members})); }
async function refresh(message = '', preserveForm = '') {
  const draftForm = preserveForm && dirtyForms.has(preserveForm) ? root.querySelector(`[data-family-form="${preserveForm}"]`) : null;
  const draft = draftForm ? [...draftForm.elements].filter(v => v.name).map(v => ({name:v.name,value:v.value,checked:v.checked,type:v.type})) : [];
  data = await api();
  if (!member()) selected = data.members[0]?.id || '';
  if (calendarMember && !data.members.some(m => m.id === calendarMember)) calendarMember = selected;
  announce(); render();
  if (draft.length) {
    const form = root.querySelector(`[data-family-form="${preserveForm}"]`);
    if (form) {
      for (const item of draft) {
        const fields = [...form.elements].filter(v=>v.name===item.name);
        if (item.type==='checkbox') { const field=fields.find(v=>v.value===item.value); if (field) field.checked=item.checked; }
        else if (fields[0]) fields[0].value=item.value;
      }
      dirty=true; dirtyForms.add(preserveForm);
    }
  }
  status(message);
}
function connection(message) {
  root.innerHTML = `<section><h2>Familie und Kalender</h2><p id="family-status" role="status">${e(message)}</p><form data-family-form="connect">${input('Familienpasswort', 'key', '', 'password', true)}<button>Mit Familienserver verbinden</button></form><p>Das Passwort wird nur für diese geöffnete Seite verwendet. Für gemeinsamen Zugriff den Familienserver verwenden.</p></section>`;
}
function profileForm() {
  const m = member() || {};
  return `<section class="family-editor"><h3>${m.id ? 'Familienprofil bearbeiten' : 'Familienmitglied anlegen'}</h3><form data-family-form="member">
    <div class="row">${input('Vorname', 'firstName', m.firstName, 'text', true)}${input('Nachname', 'lastName', m.lastName)}</div>
    <div class="row">${input('Rufname / Anzeigename (optional)', 'nickname', m.nickname)}${input('Geburtsdatum (optional)', 'birthDate', m.birthDate, 'date')}</div>
    ${input('Familienrolle (z. B. Kind, Mutter, Vater)', 'role', m.role)}
    <details open><summary>Essen und Unverträglichkeiten</summary>
      ${area('Lieblingsgerichte und Zutaten (mit Komma trennen)', 'foodLikes', m.foodLikes)}
      ${area('Mag ich nicht (mit Komma trennen)', 'foodDislikes', m.foodDislikes)}
      ${area('Bevorzugte Küchen (mit Komma trennen)', 'cuisines', m.cuisines)}
      ${input('Ernährungsweise (z. B. vegetarisch)', 'diet', m.diet)}
      ${area('Vorlieben im Detail (Zubereitung, Konsistenz, Gewürze usw.)', 'foodNotes', m.foodNotes)}
      ${area('Unverträglichkeiten / Allergien (mit Komma trennen)', 'intolerances', m.intolerances)}
      ${area('Weitere Hinweise zu Unverträglichkeiten', 'healthNotes', m.healthNotes)}
    </details>
    <details><summary>Kindergarten / Schule</summary>
      <label>Einrichtung<select name="institutionType">${options({none:'Keine / nicht angegeben',kindergarten:'Kindergarten',school:'Schule'},m.institutionType||'none')}</select></label>
      ${input('Name der Einrichtung', 'institutionName', m.institutionName)}
      ${input('Adresse', 'institutionAddress', m.institutionAddress, 'text', false, 500)}
      ${input('Kontakt (Telefon / E-Mail / Ansprechperson)', 'institutionContact', m.institutionContact, 'text', false, 500)}
      ${area('Gruppe / Klasse / weitere Hinweise', 'institutionNotes', m.institutionNotes)}
      <p>Betreuungs- und Schulzeiten sowie Losgehzeiten unten im persönlichen Kalender eintragen.</p>
    </details>
    ${area('Weitere persönliche Informationen', 'notes', m.notes, 5000)}
    <button>Familienprofil speichern</button>
  </form>${m.id ? act('delete-member','Familienmitglied und alle Termine löschen',m.id) : ''}</section>`;
}
function eventForm() {
  if (!member()) return '<p>Bitte zuerst ein Familienprofil speichern, um Termine einzutragen.</p>';
  const event = data.events.find(v => v.id === editingEvent) || {};
  const day = localDate();
  return `<section class="family-editor"><h3>${event.id ? 'Terminserie / Termin bearbeiten' : 'Termin eintragen'} · ${e(memberName(member()))}</h3>
    <form data-family-form="event">${input('Titel (z. B. Schule, Kindergarten, Fußball)', 'title', event.title, 'text', true)}
    <div class="row"><label>Art<select name="kind">${options(EVENT_KINDS,event.kind||'school')}</select></label><label>Wiederholung<select name="repeat">${options({once:'Einmalig',weekly:'Wöchentlich'},event.repeat||'weekly')}</select></label></div>
    <div class="row">${input('Datum / Gültig ab','startDate',event.startDate||day,'date',true)}${input('Gültig bis (optional, nur wöchentlich)','endDate',event.endDate||'','date')}</div>
    <fieldset><legend>Wochentage (nur wöchentlich)</legend><div class="weekday-options">${WEEKDAYS.map((label,i)=>`<label><input type="checkbox" name="weekdays" value="${i+1}" ${(event.weekdays || [1,2,3,4,5]).includes(i+1) ? 'checked' : ''}>${label}</label>`).join('')}</div></fieldset>
    <div class="row">${input('Beginn','startTime',event.startTime||'08:00','time',true)}${input('Ende','endTime',event.endTime||'13:00','time',true)}</div>
    ${input('Losgehen / Abfahrt um (optional)','departureTime',event.departureTime||'','time')}
    ${input('Ort / Sportverein', 'location', event.location, 'text', false, 500)}
    ${input('Kontakt / Trainer', 'contact', event.contact, 'text', false, 500)}
    ${area('Hinweise, Ausrüstung und Bring-/Abholorganisation', 'notes', event.notes)}
    <p>Alle Uhrzeiten gelten am jeweiligen Kalendertag in Ortszeit. Ferien und Ausfälle werden nicht automatisch berücksichtigt. Änderungen an einer Serie gelten für alle ihre Termine.</p>
    <button>Termin speichern</button>
    ${event.id ? act('new-event','Bearbeiten abbrechen') : ''}
    </form></section>`;
}
function calendar() {
  const events = data.events.filter(v => !calendarMember || v.memberId === calendarMember);
  const occurrences = calendarOccurrences(events, week, addDays(week,6));
  return `<section class="family-calendar"><h3>Persönliche Kalender · Wochenübersicht</h3>
    <div class="calendar-toolbar">${act('previous-week','← Vorherige Woche')}${act('today','Diese Woche')}${act('next-week','Nächste Woche →')}
      <label>Woche mit Datum<input type="date" data-family-week value="${week}" required></label>
      <label>Kalender anzeigen<select data-family-calendar><option value="" ${!calendarMember ? 'selected' : ''}>Alle Familienmitglieder</option>${data.members.map(m=>`<option value="${e(m.id)}" ${calendarMember===m.id ? 'selected' : ''}>${e(memberName(m))}</option>`).join('')}</select></label>
    </div><div class="calendar-week">${WEEKDAYS.map((label,i)=>{
      const date = addDays(week,i), items=occurrences.filter(v=>v.date===date);
      return `<article class="calendar-day ${date===localDate() ? 'is-today' : ''}"><h4>${label} <time datetime="${date}">${date.split('-').reverse().join('.')}</time></h4>${items.length ? '<ul>'+items.map(v=>{
        const overlap = items.some(other=>other.id!==v.id && other.memberId===v.memberId && other.startTime < v.endTime && other.endTime > v.startTime);
        return `<li><span class="event-kind">${EVENT_KINDS[v.kind]}</span><strong>${e(v.title)}</strong><p>${e(memberName(data.members.find(m=>m.id===v.memberId)||{}))}</p><p>${v.startTime}–${v.endTime}${v.departureTime ? ` · Losgehen ${v.departureTime}` : ''}</p>${v.location ? `<p>${e(v.location)}</p>` : ''}${v.notes ? `<p>${e(v.notes)}</p>` : ''}${overlap ? '<p class="calendar-conflict">Zeitüberschneidung für dieses Familienmitglied</p>' : ''}${act('edit-event',v.repeat==='weekly'?'Serie bearbeiten':'Termin bearbeiten',v.id)} ${act('delete-event',v.repeat==='weekly'?'Serie löschen':'Termin löschen',v.id)}</li>`;
      }).join('')+'</ul>' : '<p class="empty">Keine Termine</p>'}</article>`;
    }).join('')}</div>
    <details><summary>Alle gespeicherten Termine und Serien (${events.length})</summary><ul>${events.map(v=>`<li><strong>${e(v.title)}</strong> · ${e(memberName(data.members.find(m=>m.id===v.memberId)||{}))} · ab ${v.startDate} · ${v.startTime}–${v.endTime} · ${v.repeat==='weekly' ? v.weekdays.map(d=>WEEKDAYS[d-1]).join(', ') : 'Einmalig'} ${act('edit-event','Bearbeiten',v.id)} ${act('delete-event','Löschen',v.id)}</li>`).join('') || '<li>Keine Termine gespeichert.</li>'}</ul></details></section>`;
}
function render() {
  dirty = false; dirtyForms.clear();
  root.innerHTML = `<section class="family-space"><h2>Familie und persönliche Kalender</h2><p>Gemeinsame Familienprofile, Essensvorlieben, Schule, Kindergarten und Sport. Profile und Termine werden auf dem Familienserver gespeichert.</p><p id="family-status" role="status" aria-live="polite"></p>
    <nav class="family-toolbar" aria-label="Familienmitglieder">${data.members.map(m=>`<button type="button" data-family-action="select-member" data-id="${e(m.id)}" aria-pressed="${selected===m.id}">${e(memberName(m))}</button>`).join('')}${act('new-member','+ Familienmitglied')}${act('refresh','Aktualisieren')}</nav>
    <div class="family-editors">${profileForm()}${eventForm()}</div>${calendar()}
    <details><summary>Übernahme und Sicherung</summary><p>Vorhandene lokale Bewohner können einmalig übernommen werden. Der bisherige Name wird als Vorname übernommen; Nachnamen und weitere Angaben bitte anschließend ergänzen. Lokale Bewohner werden dabei nicht gelöscht oder weiter synchronisiert.</p>${act('migrate','Bisherige lokale Bewohner übernehmen')}
    <p>Das Familienbackup enthält alle Serverprofile und Kalender. Es ist getrennt vom lokalen Haushaltsbackup für Vorräte und Einkauf. Backups sind unverschlüsselt.</p>${act('backup','Familienbackup herunterladen')}
    <form data-family-form="restore"><label>Familienbackup (JSON, maximal 5 MB)<input name="file" type="file" accept=".json,application/json" required></label><button>Familienbackup wiederherstellen</button></form></details></section>`;
}
async function operate(action) {
  if (busy) return;
  busy = true;
  try { await action(); }
  catch (error) { if (error.status === 401) connection(error.message); else status(error.message); }
  finally { busy = false; }
}
root.addEventListener('input', event => {
  const form = event.target.closest('[data-family-form="member"], [data-family-form="event"]');
  if (form) { dirty = true; dirtyForms.add(form.dataset.familyForm); }
});
root.addEventListener('change', event => {
  if (event.target.matches('[data-family-week]')) {
    if (!event.target.value) return;
    if (mayDiscard()) { week=weekStart(event.target.value); render(); }
    else event.target.value=week;
  }
  if (event.target.matches('[data-family-calendar]')) {
    if (mayDiscard()) { calendarMember=event.target.value; render(); }
    else event.target.value=calendarMember;
  }
});
root.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target, values = new FormData(form), input = Object.fromEntries(values);
  operate(async () => {
    const submit = form.querySelector('button[type="submit"], button:not([type])');
    if (submit) submit.disabled=true;
    try {
      if (form.dataset.familyForm === 'connect') { setServerKey(input.key); await refresh('Mit Familienserver verbunden.'); return; }
      if (form.dataset.familyForm === 'member') {
        const current = member();
        const result = await api(current ? '/members/'+current.id : '/members', {method: current ? 'PUT' : 'POST', body: {...input, version: current?.version}});
        selected=result.id; calendarMember=selected; await refresh('Familienprofil gespeichert.', 'event');
      }
      if (form.dataset.familyForm === 'event') {
        const current = data.events.find(v=>v.id===editingEvent);
        await api(current ? '/events/'+current.id : '/members/'+selected+'/events', {method:current ? 'PUT':'POST',body:{...input,weekdays:values.getAll('weekdays').map(Number),version:current?.version}});
        editingEvent=''; await refresh('Termin gespeichert.', 'member');
      }
      if (form.dataset.familyForm === 'restore') {
        const file = values.get('file');
        if (!file || file.size > 5*1024*1024) throw new Error('Bitte ein Familienbackup mit höchstens 5 MB auswählen.');
        let backup;
        try { backup=JSON.parse(await file.text()); } catch { throw new Error('Ungültige JSON-Datei.'); }
        if (backup.format!=='zuhause-family' || backup.version!==1) throw new Error('Bitte ein Familienbackup auswählen. Haushaltsbackups werden im Bereich Backup importiert.');
        if (!window.confirm('Alle Familienprofile, Kalender und ungespeicherten Eingaben durch dieses Familienbackup ersetzen?')) { status('Wiederherstellung abgebrochen.'); return; }
        await api('/restore',{method:'POST',body:{backup,revision:data.revision}}); editingEvent=''; await refresh('Familienbackup wiederhergestellt.');
      }
    } finally { if (submit) submit.disabled=false; }
  });
});
root.addEventListener('click', event => {
  const button=event.target.closest('[data-family-action]'); if (!button) return;
  const {familyAction: action,id}=button.dataset;
  operate(async () => {
    if (['select-member','new-member','edit-event','new-event','refresh','previous-week','next-week','today','migrate'].includes(action) && !mayDiscard()) return;
    if (action==='select-member') { selected=id; calendarMember=id; editingEvent=''; render(); }
    if (action==='new-member') { selected=''; editingEvent=''; render(); }
    if (action==='edit-event') { const item=data.events.find(v=>v.id===id); selected=item.memberId; editingEvent=id; render(); }
    if (action==='new-event') { editingEvent=''; render(); }
    if (action==='refresh') { editingEvent=''; await refresh('Aktuelle Serverdaten geladen.'); }
    if (action==='previous-week' || action==='next-week') { week=addDays(week,action==='previous-week'?-7:7); render(); }
    if (action==='today') { week=weekStart(localDate()); render(); }
    if (action==='delete-member' && window.confirm('Dieses Familienmitglied und alle zugehörigen Termine sowie ungespeicherten Eingaben löschen?')) {
      const current=member(); await api('/members/'+id,{method:'DELETE',version:current.version}); selected=''; editingEvent=''; await refresh('Familienmitglied und Termine gelöscht.');
    }
    if (action==='delete-event' && window.confirm('Diesen Termin bzw. die gesamte wiederkehrende Serie löschen? Ungespeicherte Eingaben werden verworfen.')) {
      const item=data.events.find(v=>v.id===id); await api('/events/'+id,{method:'DELETE',version:item.version}); editingEvent=''; await refresh('Termin gelöscht.');
    }
    if (action==='migrate') { const residents=load(localStorage).residents; const result=await api('/migrate',{method:'POST',body:{residents}}); await refresh(`${result.imported} lokale Bewohner übernommen. Bereits übernommene Einträge werden nicht erneut angelegt.`); }
    if (action==='backup') {
      const backup=await api('/backup');
      if (new Blob([JSON.stringify({backup,revision:data.revision})]).size > 5*1024*1024) throw new Error('Die Familiendaten sind für einen JSON-Import zu groß. Bitte die SQLite-Datenbank auf dem Server sichern.');
      const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
      const link=document.createElement('a'); link.href=url; link.download=`zuhause-familie-${localDate()}.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); status('Familienbackup-Download gestartet.');
    }
  });
});
operate(async () => { await refresh(); });
