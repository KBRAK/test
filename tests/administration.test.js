import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFamilyStore } from '../backend/family-store.js';
import { createAppServer } from '../server.js';
import { euroToCents, normalizeObligation, normalizeVehicle, dueDates, costOverview, administrativeDates } from '../src/domain/administration.js';
const cost={title:'Haftpflicht',category:'insurance',amountCents:4990,interval:'monthly',firstDueDate:'2026-01-31',paymentMethod:'Lastschrift'};
const car={name:'Familienauto',plate:'B-AB 123',huDueMonth:'2028-02',mileage:50000,serviceDueKm:60000};
test('Eurobeträge werden exakt in Cent umgerechnet; ungenaue oder negative Eingaben abgelehnt',()=>{
  assert.equal(euroToCents('49,90'),4990);assert.equal(euroToCents('0.01'),1);assert.equal(euroToCents('123'),12300);
  for(const value of ['-1','1.001','1e3','1.000,00','','Infinity'])assert.throws(()=>euroToCents(value));
  assert.throws(()=>normalizeObligation({...cost,amountCents:49.9}));assert.throws(()=>normalizeVehicle({...car,mileage:-1}));
});
test('Fälligkeiten bleiben am ursprünglichen Monatstag, auch nach kurzen Monaten und Schaltjahren',()=>{
  const o=normalizeObligation(cost);
  assert.deepEqual(dueDates(o,'2026-01-01','2026-04-30'),['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);
  assert.deepEqual(dueDates({...o,interval:'yearly',firstDueDate:'2024-02-29'},'2025-01-01','2028-12-31'),['2025-02-28','2026-02-28','2027-02-28','2028-02-29']);
  assert.deepEqual(dueDates({...o,interval:'quarterly'},'2026-01-01','2026-12-31'),['2026-01-31','2026-04-30','2026-07-31','2026-10-31']);
  assert.deepEqual(dueDates({...o,endDate:'2026-02-28'},'2026-01-01','2026-12-31'),['2026-01-31','2026-02-28']);
});
test('Kostenübersicht trennt Monatsplanung, Teilzahlungen und Rückstände; TÜV endet am Monatsende',()=>{
  const o={id:'cost',...normalizeObligation(cost)};
  const summary=costOverview([o],[{obligationId:'cost',dueDate:'2026-01-31',amountCents:2000}],'2026-02-10');
  assert.equal(summary.plannedMonthCents,4990);assert.equal(summary.overdueCents,2990);
  assert.equal(summary.charges[0].remainingCents,2990);
  assert.equal(administrativeDates([], [{id:'car',...normalizeVehicle(car)}])[0].date,'2028-02-29');
});
test('Neue Tabellen werden einer vorhandenen Datenbank ohne Verlust der Familienprofile hinzugefügt',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'admin-migrate-'));const path=join(dir,'family.sqlite');let s;
  try{
    s=createFamilyStore(path);const m=s.addMember({firstName:'Mia'});s.close();s=null;
    const old=new DatabaseSync(path);old.exec('DROP TABLE payments; DROP TABLE obligations; DROP TABLE vehicles; PRAGMA user_version=1;');old.close();
    s=createFamilyStore(path);assert.equal(s.snapshot().members[0].id,m.id);
    const v=s.administration.addVehicle(car),o=s.administration.addObligation({...cost,vehicleId:v.id});
    s.close();s=createFamilyStore(path);assert.equal(s.administration.snapshot().obligations[0].id,o.id);
  }finally{s?.close();await rm(dir,{recursive:true,force:true});}
});
test('Zahlungen verhindern Doppelzahlung und veraltete Updates; Fahrzeugverknüpfungen bleiben konsistent',()=>{
  const s=createFamilyStore(':memory:');try{
    const a=s.administration,v=a.addVehicle(car),o=a.addObligation({...cost,vehicleId:v.id});
    const p=a.addPayment(o.id,{obligationVersion:o.version,dueDate:'2026-01-31',paidDate:'2026-02-01',amountCents:2000});
    assert.throws(()=>a.addPayment(o.id,{obligationVersion:o.version,dueDate:'2026-01-31',paidDate:'2026-02-01',amountCents:2000}),e=>e.status===409);
    let current=a.snapshot().obligations[0];
    assert.throws(()=>a.addPayment(o.id,{obligationVersion:current.version,dueDate:'2026-01-30',paidDate:'2026-02-01',amountCents:100}));
    assert.throws(()=>a.addPayment(o.id,{obligationVersion:current.version,dueDate:'2026-01-31',paidDate:'2026-02-01',amountCents:3000}));
    assert.throws(()=>a.updateObligation(o.id,{...current,amountCents:6000}),e=>e.status===409);
    assert.throws(()=>a.deleteVehicle(v.id,v.version),e=>e.status===409);
    a.deletePayment(p.id,p.version);current=a.snapshot().obligations[0];a.deleteObligation(o.id,current.version);a.deleteVehicle(v.id,v.version);
    assert.equal(a.snapshot().payments.length,0);assert.equal(a.snapshot().vehicles.length,0);
  }finally{s.close();}
});
test('Verwaltungsbackup ist atomar und unabhängig von Familienprofilen',()=>{
  const s=createFamilyStore(':memory:');try{
    s.addMember({firstName:'Mia'});const a=s.administration,v=a.addVehicle(car),o=a.addObligation({...cost,vehicleId:v.id});
    a.addPayment(o.id,{obligationVersion:o.version,dueDate:'2026-01-31',paidDate:'2026-02-01',amountCents:4990});
    const backup=a.backup();a.updateVehicle(v.id,{...v,name:'Geändert'});
    assert.throws(()=>a.restore(backup,backup.revision),e=>e.status===409);
    const revision=a.snapshot().revision;
    assert.throws(()=>a.restore({...backup,payments:[{...backup.payments[0],amountCents:99999}]},revision));
    assert.equal(a.snapshot().vehicles[0].name,'Geändert');
    a.restore(backup,revision);assert.equal(a.snapshot().vehicles[0].name,car.name);assert.equal(s.snapshot().members.length,1);
    assert.throws(()=>a.updateVehicle(v.id,{...v,name:'Alt'}),e=>e.status===409);
    const family=s.backup();s.restore(family,s.snapshot().revision);assert.equal(a.snapshot().payments.length,1);
  }finally{s.close();}
});
test('Verwaltungs-API nutzt den bestehenden Passwortschutz und vollständige CRUD-Endpunkte',async()=>{
  const s=createFamilyStore(':memory:'),server=createAppServer({store:s,accessKey:'test-admin-access-key'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api/administration';
  const call=(path='',options={})=>fetch(base+path,{...options,headers:{Authorization:'Bearer test-admin-access-key','Content-Type':'application/json',...options.headers}});
  try{
    assert.equal((await fetch(base)).status,401);
    const response=await call('/vehicles',{method:'POST',body:JSON.stringify(car)});assert.equal(response.status,201);const v=await response.json();
    const saved=await call('/obligations',{method:'POST',body:JSON.stringify({...cost,vehicleId:v.id})});assert.equal(saved.status,201);const o=await saved.json();
    assert.equal((await call('/obligations/'+o.id+'/payments',{method:'POST',body:JSON.stringify({obligationVersion:o.version,dueDate:'2026-01-31',paidDate:'2026-02-01',amountCents:4990})})).status,201);
    assert.equal((await (await call()).json()).payments.length,1);
    assert.equal((await call('/vehicles/'+v.id,{method:'DELETE',headers:{'If-Match':String(v.version)}})).status,409);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));s.close();}
});
