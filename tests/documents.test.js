import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createFamilyStore } from '../backend/family-store.js';
import { analyzeDocument,normalizeDocumentFacts } from '../src/domain/documents.js';
const password='synthetic-test-password';
const bill='Anbieter: Beispiel Versicherung\nVertragsnummer: V-12345\nMonatlicher Beitrag\nGesamtbetrag: 49,90 EUR\nRechnungsdatum: 01.11.2026\nZahlbar bis zum 10.11.2026';
function upload(s,actor,text=bill,name='beitrag.txt') {return s.documents.add(actor,{filename:name,mime:'text/plain',bytes:Buffer.from(text),text,method:'text'},analyzeDocument(text,name));}
function fixtures() {const s=createFamilyStore(':memory:');const owner=s.documents.setup({username:'owner',name:'Eigentümer',password});const reader=s.documents.createUser(owner,{username:'reader',name:'Leser',password,role:'user'});const otherAdmin=s.documents.createUser(owner,{username:'other-admin',name:'Zweite Administration',password,role:'admin'});return {s,owner,reader,otherAdmin};}
function confirm(s,owner,id,recipients=[owner.id]) {const d=s.documents.details(owner,id);s.documents.confirm(owner,id,{version:d.version,reviewed:true,facts:{...d.analysis.fields,recipientIds:recipients}});return s.documents.details(owner,id);}
test('Analyse erkennt belegte EUR-Kosten, Fälligkeit und Rhythmus mit Fundstellen',()=>{
  const a=analyzeDocument(bill,'beitrag.txt');assert.equal(a.fields.amountCents,4990);assert.equal(a.fields.dueDate,'2026-11-10');assert.equal(a.fields.interval,'monthly');assert.equal(a.fields.provider,'Beispiel Versicherung');assert.equal(a.fields.reference,'V-12345');assert.match(a.evidence.amountCents[0].line,/49,90/);
  assert.equal(analyzeDocument('Gesamtbetrag: 1.234,56 EUR').fields.amountCents,123456);
});
test('Mehrdeutige, fehlende, negative und fremdwährungsbezogene Angaben werden nicht zu Zahlungsaufträgen erfunden',()=>{
  const a=analyzeDocument('Gesamtbetrag: 10,00 EUR\nGesamtbetrag: 20,00 EUR\nRechnungsdatum: 01.11.2026\nZahlung innerhalb 14 Tagen');
  assert.equal(a.fields.amountCents,null);assert.equal(a.fields.dueDate,null);assert.equal(a.fields.interval,'unknown');assert.ok(a.warnings.some(v=>v.includes('Relative')));
  assert.equal(analyzeDocument('Gutschrift: -49,90 EUR').fields.amountCents,null);
  assert.equal(analyzeDocument('Ihre Gutschrift: 49,90 EUR').fields.amountCents,null);
  assert.equal(analyzeDocument('Gesamtbetrag: 100.00 USD').fields.amountCents,null);
  assert.equal(analyzeDocument('Zahlbar bis 31.02.2026').fields.dueDate,null);
});
test('Bestätigte Angaben validieren Datum, Währung, Betrag und Empfänger',()=>{
  const fields={...analyzeDocument(bill).fields,recipientIds:['owner']};assert.equal(normalizeDocumentFacts(fields).amountCents,4990);
  for(const change of [{currency:'USD'},{amountCents:49.9},{dueDate:'2026-02-30'},{leadDays:91},{endDate:'2020-01-01'},{dueDate:null}])assert.throws(()=>normalizeDocumentFacts({...fields,...change}));
});
test('Private Dokumente sind ohne Freigabe auch für andere Administratoren unsichtbar',()=>{
  const {s,owner,reader,otherAdmin}=fixtures();try{const id=upload(s,owner);assert.equal(s.documents.list(reader).length,0);assert.equal(s.documents.list(otherAdmin).length,0);
    for(const person of [reader,otherAdmin]){assert.throws(()=>s.documents.details(person,id),e=>e.status===404);assert.throws(()=>s.documents.original(person,id),e=>e.status===404);}
    assert.equal(s.documents.reminders(owner,'2026-11-06').length,0);assert.equal(s.administration.snapshot().obligations.length,0);
    assert.throws(()=>s.documents.add(owner,{filename:'same.txt',mime:'text/plain',bytes:Buffer.from(bill),text:bill,method:'text'},analyzeDocument(bill)),e=>e.status===409);
  }finally{s.close();}
});
test('Freigaben und bestätigte Empfänger steuern Erinnerungen; Entzug beendet Zugriff und Hinweise',()=>{
  const {s,owner,reader}=fixtures();try{
    const id=upload(s,owner),draft=s.documents.details(owner,id);
    assert.throws(()=>s.documents.confirm(owner,id,{version:draft.version,reviewed:true,facts:{...draft.analysis.fields,recipientIds:[reader.id]}}),e=>e.status===403);
    assert.equal(s.documents.details(owner,id).state,'draft');
    s.documents.share(owner,id,{version:draft.version,readerIds:[reader.id]});let d=s.documents.details(owner,id);
    assert.throws(()=>s.documents.confirm(owner,id,{version:d.version,reviewed:false,facts:{...d.analysis.fields,recipientIds:[]}}));
    d=confirm(s,owner,id,[owner.id,reader.id]);assert.equal(s.documents.reminders(reader,'2026-11-06').length,1);
    assert.throws(()=>s.documents.confirm(reader,id,{version:d.version,reviewed:true,facts:d.facts}),e=>e.status===403);
    assert.throws(()=>s.documents.share(reader,id,{version:d.version,readerIds:[]}),e=>e.status===403);
    assert.throws(()=>s.documents.remove(reader,id,d.version),e=>e.status===403);
    s.documents.acknowledge(reader,id,'2026-11-10');assert.equal(s.documents.reminders(reader,'2026-11-06').length,0);assert.equal(s.documents.reminders(owner,'2026-11-06').length,1);
    s.documents.confirm(owner,id,{version:d.version,reviewed:true,facts:{...d.facts,notes:'Nur eine Notizänderung'}});d=s.documents.details(owner,id);assert.equal(s.documents.reminders(reader,'2026-11-06').length,0);
    s.documents.share(owner,id,{version:d.version,readerIds:[]});assert.throws(()=>s.documents.details(reader,id),e=>e.status===404);assert.equal(s.documents.reminders(reader,'2026-11-06').length,0);
    assert.deepEqual(s.documents.details(owner,id).facts.recipientIds,[owner.id]);
  }finally{s.close();}
});
test('Persönliche Sitzungen werden bei Passwortwechsel und Kontodeaktivierung widerrufen',()=>{
  const {s,owner,reader}=fixtures();try{
    const first=s.documents.login({username:reader.username,password}),second=s.documents.login({username:reader.username,password});assert.equal(s.documents.actor(first.token).id,reader.id);
    s.documents.changePassword(reader,{currentPassword:password,newPassword:'new-synthetic-test-password'});
    assert.throws(()=>s.documents.actor(first.token),e=>e.status===401);assert.throws(()=>s.documents.actor(second.token),e=>e.status===401);
    assert.throws(()=>s.documents.login({username:reader.username,password}),e=>e.status===401);
    const newLogin=s.documents.login({username:reader.username,password:'new-synthetic-test-password'});s.documents.deactivateUser(owner,reader.id);assert.throws(()=>s.documents.actor(newLogin.token),e=>e.status===401);
    assert.throws(()=>s.documents.setup({username:'again',name:'Again',password}),e=>e.status===409);
    assert.throws(()=>s.documents.createUser(reader,{username:'intruder',name:'Intruder',password,role:'admin'}));
  }finally{s.close();}
});
test('Original, strukturierte Fakten, ACL und Sitzungen bleiben nach Neustart erhalten; andere Backups enthalten keine Dokumente',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'doc-db-'));let s;
  try{const path=join(dir,'family.sqlite');s=createFamilyStore(path);const owner=s.documents.setup({username:'owner',name:'Owner',password});const token=s.documents.login({username:'owner',password}).token;const id=upload(s,owner);confirm(s,owner,id);
    assert.ok(!JSON.stringify(s.backup()).includes(bill));assert.ok(!JSON.stringify(s.administration.backup()).includes(bill));
    s.close();s=createFamilyStore(path);const person=s.documents.actor(token);assert.equal(s.documents.details(person,id).facts.amountCents,4990);assert.equal(Buffer.from(s.documents.original(person,id).bytes).toString(),bill);
    s.documents.logout(token);assert.throws(()=>s.documents.actor(token),e=>e.status===401);
  }finally{s?.close();await rm(dir,{recursive:true,force:true});}
});

test('Migration von Schema 2 erhält Familienprofile und bestehende Kostenposten',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'doc-schema-'));let s;
  try{const path=join(dir,'family.sqlite');s=createFamilyStore(path);const m=s.addMember({firstName:'Mia'});const o=s.administration.addObligation({title:'Wasser',category:'water',amountCents:2500,interval:'monthly',firstDueDate:'2026-11-01'});s.close();s=null;
    const old=new DatabaseSync(path);old.exec('PRAGMA foreign_keys=ON; DROP TABLE document_reminder_ack; DROP TABLE document_facts; DROP TABLE document_grants; DROP TABLE document_sessions; DROP TABLE documents; DROP TABLE document_users; DROP TABLE document_audit; PRAGMA user_version=2;');old.close();
    s=createFamilyStore(path);assert.equal(s.snapshot().members[0].id,m.id);assert.equal(s.administration.snapshot().obligations[0].id,o.id);assert.equal(s.documents.hasUsers(),false);
  }finally{s?.close();await rm(dir,{recursive:true,force:true});}
});
