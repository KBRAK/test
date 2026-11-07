import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { normalizeMember, normalizeEvent, calendarOccurrences, weekStart } from '../src/domain/family.js';
import { createFamilyStore } from '../backend/family-store.js';
import { createAppServer } from '../server.js';
const profile = {firstName:'Mia',lastName:'Müller',birthDate:'2020-02-29',foodLikes:'Nudeln, Äpfel',intolerances:'Milch',institutionType:'school',institutionName:'Grundschule'};
const schedule = {title:'Schule',kind:'school',repeat:'weekly',weekdays:[1,2,3,4,5],startDate:'2026-11-02',endDate:'2027-06-30',startTime:'08:00',endTime:'13:00',departureTime:'07:30',location:'Grundschule'};
test('Familienprofil validiert Geburtsdatum und erhält Essens- und Einrichtungsdetails', () => {
  const p=normalizeMember({...profile,foodNotes:'Kein scharfes Essen',institutionContact:'Sekretariat'});
  assert.deepEqual(p.foodLikes,['Nudeln','Äpfel']); assert.equal(p.foodNotes,'Kein scharfes Essen');
  assert.equal(p.institutionContact,'Sekretariat'); assert.throws(()=>normalizeMember({...profile,birthDate:'2021-02-29'}));
  assert.throws(()=>normalizeMember({...profile,birthDate:'2999-01-01'})); assert.throws(()=>normalizeMember({...profile,firstName:''}));
  assert.throws(()=>normalizeMember({...profile,intolerances:[42]}));
});
test('Kalender erzeugt Wochenserien und Einzeltermine innerhalb des Gültigkeitszeitraums', () => {
  const weekly=normalizeEvent(schedule), single=normalizeEvent({...schedule,repeat:'once',startDate:'2026-11-07',kind:'sport',title:'Turnier'});
  const result=calendarOccurrences([{id:'school',...weekly},{id:'sport',...single}],'2026-11-02','2026-11-08');
  assert.equal(result.length,6); assert.equal(result[0].departureTime,'07:30'); assert.equal(result.at(-1).date,'2026-11-07');
  assert.equal(weekStart('2026-11-08'),'2026-11-02');
  assert.equal(calendarOccurrences([weekly],'2026-10-26','2026-11-01').length,0);
  assert.equal(calendarOccurrences([weekly],'2027-07-01','2027-07-07').length,0);
  // Civil dates stay stable across daylight-saving transitions.
  assert.equal(calendarOccurrences([{...weekly,startDate:'2026-03-01',endDate:'',weekdays:[7]}],'2026-03-23','2026-03-29')[0].date,'2026-03-29');
});
test('Ungültige Zeiten und Serien werden abgelehnt', () => {
  for (const fields of [{weekdays:[]},{weekdays:[8]},{startDate:'2026-02-30'},{endTime:'07:00'},{departureTime:'09:00'},{startTime:'25:00'},{endDate:'2025-01-01'}]) assert.throws(()=>normalizeEvent({...schedule,...fields}));
});
test('SQLite persistiert Profile und Termine, verhindert verlorene Änderungen und löscht zugehörige Termine', async () => {
  const dir=await mkdtemp(join(tmpdir(),'family-db-')); let store;
  try {
    const path=join(dir,'family.sqlite'); store=createFamilyStore(path);
    let m=store.addMember(profile); const ev=store.addEvent(m.id,schedule);
    const stale=m;
    m=store.updateMember(m.id,{...m,foodNotes:'Nur mild'});
    assert.throws(()=>store.updateMember(stale.id,{...stale,foodNotes:'Scharf'}),e=>e.status===409);
    assert.throws(()=>store.deleteMember(stale.id,stale.version),e=>e.status===409);
    store.close(); store=createFamilyStore(path);
    assert.equal(store.snapshot().members[0].foodNotes,'Nur mild'); assert.equal(store.snapshot().events[0].id,ev.id);
    store.deleteMember(m.id,m.version); assert.equal(store.snapshot().events.length,0);
  } finally {store?.close();await rm(dir,{recursive:true,force:true});}
});
test('Bewohnerübernahme ist wiederholbar und fehlerhafte Übernahme wird vollständig zurückgerollt', () => {
  const s=createFamilyStore(':memory:');
  try {
    const old=[{id:'old-1',name:'Alex',intolerances:['Milch']}];
    assert.equal(s.migrateResidents(old).imported,1); assert.equal(s.migrateResidents(old).imported,0);
    assert.throws(()=>s.migrateResidents([{id:'old-2',name:'Tom'},{}])); assert.equal(s.snapshot().members.length,1);
  } finally {s.close();}
});
test('Familienbackup stellt atomar wieder her und schützt Änderungen anderer Geräte', () => {
  const s=createFamilyStore(':memory:');
  try {
    const m=s.addMember(profile); const event=s.addEvent(m.id,schedule), backup=s.backup();
    s.updateMember(m.id,{...m,firstName:'Neu'});
    assert.throws(()=>s.restore(backup,backup.revision),e=>e.status===409);
    const revision=s.snapshot().revision;
    assert.throws(()=>s.restore({...backup,events:[{...event,memberId:'unknown'}]},revision));
    assert.equal(s.snapshot().members[0].firstName,'Neu');
    s.restore(backup,revision); assert.equal(s.snapshot().members[0].firstName,'Mia');
    assert.throws(()=>s.updateEvent(event.id,{...event,title:'Veraltet'}),e=>e.status===409);
    const current=s.snapshot().members[0]; s.deleteMember(current.id,current.version);
    s.restore(backup,s.snapshot().revision);
    assert.throws(()=>s.updateMember(m.id,{...m,firstName:'Veraltet'}),e=>e.status===409);
  } finally {s.close();}
});
test('HTTP API: gemeinsamer Zugriff, Passwort, Origin-Prüfung, CRUD und Konflikte', async () => {
  const store=createFamilyStore(':memory:'); const accessKey='test-family-access-key';
  const server=createAppServer({store,accessKey});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const call=(path='',options={})=>fetch(base+'/api/family'+path,{...options,headers:{Authorization:'Bearer '+accessKey,'Content-Type':'application/json',...options.headers}});
  try {
    assert.equal((await fetch(base+'/api/family')).status,401);
    assert.equal((await call('',{headers:{Origin:'https://evil.example'}})).status,403);
    const response=await call('/members',{method:'POST',body:JSON.stringify(profile)}); assert.equal(response.status,201);
    const m=await response.json();
    assert.equal((await call()).headers.get('cache-control'),'no-store');
    assert.equal((await (await call()).json()).members[0].id,m.id);
    const created=await call('/members/'+m.id+'/events',{method:'POST',body:JSON.stringify(schedule)}); assert.equal(created.status,201);
    const ev=await created.json();
    assert.equal((await call('/events/'+ev.id,{method:'PUT',body:JSON.stringify({...ev,title:'Unterricht'})})).status,200);
    assert.equal((await call('/events/'+ev.id,{method:'PUT',body:JSON.stringify(ev)})).status,409);
    assert.equal((await call('/members/'+m.id,{method:'DELETE',headers:{'If-Match':String(m.version)}})).status,200);
    assert.equal((await (await call()).json()).events.length,0);
    assert.equal((await fetch(base+'/backend/family-store.js')).status,404);
    assert.equal((await fetch(base+'/data/family.sqlite')).status,404);
    assert.equal((await fetch(base+'/src/..%2fbackend/family-store.js')).status,404);
    assert.equal((await fetch(base+'/src/..%2fpackage.json')).status,404);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}
});

test('Ohne Passwort sind nur lokale Hostnamen zugelassen; Anmeldeversuche werden begrenzt', async () => {
  const store=createFamilyStore(':memory:');
  const local=createAppServer({store});
  await new Promise(resolve=>local.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+local.address().port;
  try {
    assert.equal((await fetch(base+'/api/family')).status,200);
    const remoteHostStatus = await new Promise((resolve,reject)=>{
      const req=request(base+'/api/family',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});
      req.on('error',reject);req.end();
    });
    assert.equal(remoteHostStatus,403);
  } finally {local.closeAllConnections();await new Promise(resolve=>local.close(resolve));}
  const secured=createAppServer({store,accessKey:'test-secured-family-key'});
  await new Promise(resolve=>secured.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+secured.address().port+'/api/family';
  try {
    for(let i=0;i<10;i++) assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url)).status,429);
  } finally {secured.closeAllConnections();await new Promise(resolve=>secured.close(resolve));store.close();}
});
