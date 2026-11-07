import test from 'node:test';
import assert from 'node:assert/strict';
import { createFamilyStore } from '../backend/family-store.js';
import { createAppServer } from '../server.js';
const password='synthetic-api-password';
async function withApi(fn,extractor) {
  const store=createFamilyStore(':memory:'),server=createAppServer({store,accessKey:'document-api-family-key',documentExtractor:extractor});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const call=(path='',{token='',method='GET',body,headers={}}={})=>fetch(base+'/api/documents'+path,{method,headers:{Authorization:'Bearer document-api-family-key',...(token?{'X-Document-Session':token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  try{await fn({store,server,base,call});}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}
}
test('Dokumenten-API erfordert persönliche Anmeldung und prüft Lese-/Schreibrechte auf jedem Endpunkt',()=>withApi(async({call,store,base})=>{
  assert.equal((await call()).status,401);assert.equal((await call('/status')).status,200);
  const setup=await call('/setup',{method:'POST',body:{username:'owner',name:'Owner',password}});assert.equal(setup.status,201);
  assert.equal((await call('/setup',{method:'POST',body:{username:'again',name:'Again',password}})).status,409);
  const login=await (await call('/login',{method:'POST',body:{username:'owner',password}})).json(),token=login.token;
  const created=await call('/users',{token,method:'POST',body:{username:'reader',name:'Reader',password,role:'user'}});const reader=await created.json();assert.equal(created.status,201);
  const readerToken=(await (await call('/login',{method:'POST',body:{username:'reader',password}})).json()).token;
  const text='Gesamtbetrag: 49,90 EUR\nZahlbar bis 10.11.2026';
  const upload=await call('/upload',{token,method:'POST',body:{filename:'rechnung.txt',base64:Buffer.from(text).toString('base64')}});assert.equal(upload.status,201);let document=await upload.json();
  assert.equal((await call('/'+document.id,{token:readerToken})).status,404);
  assert.equal((await call('/'+document.id+'/original',{token:readerToken})).status,404);
  assert.equal((await call('/'+document.id+'/export',{token:readerToken})).status,404);
  assert.equal((await call('/'+document.id+'/original')).status,401);
  assert.equal((await call('/'+document.id+'/grants',{token:readerToken,method:'POST',body:{version:1,readerIds:[reader.id]}})).status,404);
  const shared=await call('/'+document.id+'/grants',{token,method:'POST',body:{version:document.version,readerIds:[reader.id]}});document=await shared.json();
  assert.equal((await call('/'+document.id+'/original',{token:readerToken})).headers.get('cache-control'),'no-store');
  assert.equal((await (await call('/'+document.id+'/original',{token:readerToken})).text()),text);
  assert.equal((await call('/'+document.id+'/confirm',{token:readerToken,method:'POST',body:{version:document.version,reviewed:true,facts:{...document.analysis.fields,recipientIds:[]}}})).status,403);
  const confirmed=await call('/'+document.id+'/confirm',{token,method:'POST',body:{version:document.version,reviewed:true,facts:{...document.analysis.fields,recipientIds:[reader.id]}}});assert.equal(confirmed.status,200);document=await confirmed.json();
  assert.equal(store.administration.snapshot().obligations.length,0);
  const exported=await (await call('/'+document.id+'/export',{token:readerToken})).json();assert.equal(exported.document.facts.amountCents,4990);assert.ok(!JSON.stringify(exported).includes(password));
  assert.equal((await call('/users',{token:readerToken,method:'POST',body:{username:'evil',name:'Evil',password,role:'admin'}})).status,403);
  assert.equal((await call('/'+document.id+'/grants',{token,method:'POST',body:{version:document.version,readerIds:[]}})).status,200);
  assert.equal((await call('/'+document.id+'/export',{token:readerToken})).status,404);
  await call('/logout',{token,method:'POST'});assert.equal((await call('',{token})).status,401);
  assert.equal((await fetch(base+'/src/..%2fdata/family.sqlite')).status,404);
}));
test('Abmeldung während der Texterkennung verhindert die spätere Speicherung',()=>{
  let release,started;
  const began=new Promise(resolve=>{started=resolve;});
  return withApi(async({call,store})=>{
    await call('/setup',{method:'POST',body:{username:'owner',name:'Owner',password}});const token=(await (await call('/login',{method:'POST',body:{username:'owner',password}})).json()).token;
    const pending=call('/upload',{token,method:'POST',body:{}});await began;await call('/logout',{token,method:'POST'});release();assert.equal((await pending).status,401);assert.equal(store.documents.hasUsers(),true);
    const owner=store.documents.login({username:'owner',password}).user;assert.equal(store.documents.list(owner).length,0);
  },async()=>{started();await new Promise(resolve=>{release=resolve;});return {filename:'text.txt',mime:'text/plain',bytes:Buffer.from('Test'),text:'Test',method:'text',warnings:[]};});
});
