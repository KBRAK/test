import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {browserEnabled,withBrowser} from './helpers/browser.js';
import {createFamilyStore} from '../backend/family-store.js';
import {createAppServer} from '../server.js';
import {analyzeDocument} from '../src/domain/documents.js';
import {berlinDate} from '../backend/document-store.js';
import {addDays} from '../src/domain/family.js';
const password='synthetic-ui-test-password';
test('Browser: eigenständige Dokumentseite, Suche, Filter, Tastaturtabs, Vorschau und Drag-and-drop',{skip:!browserEnabled,timeout:60000},async()=>{
  const store=createFamilyStore(':memory:'),owner=store.documents.setup({username:'owner',name:'Alex Sommer',password});
  const reader=store.documents.createUser(owner,{username:'reader',name:'Sam Sommer',password,role:'user'});
  const due=addDays(berlinDate(),3);
  function add(person,filename,title,category,reviewed=true,shared=false){
    const text=`Anbieter: Beispiel Anbieter\nGesamtbetrag: 49,90 EUR\nZahlbar bis ${due.split('-').reverse().join('.')}\nmonatlich\n<script>window.documentTextExecuted=true</script>`;
    const analysis=analyzeDocument(text,filename),id=store.documents.add(person,{filename,mime:'text/plain',bytes:Buffer.from(text+'\n'+filename),text,method:'text'},analysis);
    let doc=store.documents.details(person,id);
    if(shared){store.documents.share(person,id,{version:doc.version,readerIds:[owner.id]});doc=store.documents.details(person,id);}
    if(reviewed)store.documents.confirm(person,id,{version:doc.version,reviewed:true,facts:{...analysis.fields,title,category,recipientIds:[person.id]}});
    return id;
  }
  const electricity=add(owner,'stromrechnung.txt','Stromrechnung November','energy');
  add(owner,'versicherung-entwurf.txt','Versicherung','insurance',false);
  add(reader,'wasserrechnung.txt','Wasserabrechnung','water',true,true);
  add(reader,'privat.txt','Streng privat','insurance');
  const server=createAppServer({store,accessKey:'documents-ui-family-key'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    for(const path of ['/dokumente','/dokumente/']){const response=await fetch(base+path);assert.equal(response.status,200);assert.match(await response.text(),/data-standalone="true"/);}
    assert.equal((await fetch(base+'/documents.html')).status,404);
    await withBrowser(base+'/dokumente',async({evaluate,waitFor,command})=>{
      await waitFor(`document.querySelector('[data-document-form="server"]')`);
      await evaluate(`window.confirm=()=>true;document.querySelector('[data-document-form="server"]').elements.key.value='documents-ui-family-key';document.querySelector('[data-document-form="server"]').requestSubmit();`);
      await waitFor(`document.querySelector('[data-document-form="login"]')`);
      await evaluate(`var form=document.querySelector('[data-document-form="login"]');form.elements.username.value='owner';form.elements.password.value=${JSON.stringify(password)};form.requestSubmit();`);
      await waitFor(`document.querySelector('[data-document-search]')`);
      assert.equal(await evaluate(`document.querySelectorAll('.document-row').length`),3);
      assert.equal(await evaluate(`document.querySelector('#documents-app').textContent.includes('Streng privat')`),false);
      if(process.env.DOCUMENT_UI_SCREENSHOTS){await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(process.env.DOCUMENT_UI_SCREENSHOTS+'-desktop.png',Buffer.from(shot.data,'base64'));}
      await evaluate(`var field=document.querySelector('[data-document-search]');field.value='STROM';field.dispatchEvent(new Event('input',{bubbles:true}));`);
      assert.equal(await evaluate(`document.querySelectorAll('.document-row').length`),1);
      await evaluate(`document.querySelector('.document-row').click();`);
      await waitFor(`document.querySelector('[data-document-form="facts"]')`);
      await evaluate(`var notes=document.querySelector('[data-document-form="facts"]').elements.notes;notes.value='Nicht verlieren';notes.dispatchEvent(new Event('input',{bubbles:true}));var field=document.querySelector('[data-document-search]');field.value='kein-treffer';field.dispatchEvent(new Event('input',{bubbles:true}));`);
      assert.equal(await evaluate(`document.querySelector('[data-document-rows]').textContent.includes('Keine passenden Dokumente')`),true);
      assert.equal(await evaluate(`document.querySelector('[data-document-form="facts"]').elements.notes.value`),'Nicht verlieren');
      await evaluate(`window.confirm=()=>false;document.querySelector('[data-document-view="drafts"]').click();`);
      assert.equal(await evaluate(`document.querySelector('[data-document-view="all"]').getAttribute('aria-current')`),'page');
      await evaluate(`document.querySelector('[data-document-tab="text"]').click();`);
      assert.equal(await evaluate(`document.querySelector('#document-panel-text').hidden`),false);
      assert.equal(await evaluate('window.documentTextExecuted===true'),false);
      await evaluate(`var tab=document.querySelector('[data-document-tab="text"]');tab.focus();tab.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));`);
      await waitFor(`document.querySelector('[data-document-preview] .document-text')`);
      assert.equal(await evaluate(`document.querySelector('[data-document-tab="original"]').getAttribute('aria-selected')`),'true');
      assert.equal(await evaluate(`document.querySelector('[data-document-preview]').textContent.includes('49,90 EUR')`),true);
      await evaluate(`window.confirm=()=>true;var field=document.querySelector('[data-document-search]');field.value='';field.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-document-view="drafts"]').click();`);
      assert.equal(await evaluate(`document.querySelectorAll('.document-row').length`),1);
      await evaluate(`document.querySelector('[data-document-view="shared"]').click();`);
      assert.equal(await evaluate(`document.querySelectorAll('.document-row').length`),1);
      assert.equal(await evaluate(`document.querySelector('.document-row').textContent.includes('Wasserabrechnung')`),true);
      await evaluate(`document.querySelector('[data-document-view="all"]').click();var category=document.querySelector('[data-document-category]');category.value='energy';category.dispatchEvent(new Event('change',{bubbles:true}));`);
      assert.equal(await evaluate(`document.querySelectorAll('.document-row').length`),1);
      await evaluate(`var category=document.querySelector('[data-document-category]');category.value='';category.dispatchEvent(new Event('change',{bubbles:true}));var sort=document.querySelector('[data-document-sort]');sort.value='title';sort.dispatchEvent(new Event('change',{bubbles:true}));`);
      assert.equal(await evaluate(`document.querySelector('.document-row').textContent.includes('Stromrechnung November')`),true);
      // Dropping a file selects it; only the explicit submit triggers processing.
      await evaluate(`var transfer=new DataTransfer();transfer.items.add(new File(['Gesamtbetrag: 12,00 EUR'],'neuer-beleg.txt',{type:'text/plain'}));document.querySelector('[data-document-dropzone]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));`);
      assert.equal(await evaluate(`document.querySelector('[data-document-file-label]').textContent.includes('neuer-beleg.txt')`),true);
      assert.equal(store.documents.list(owner).length,3);
      await evaluate(`document.querySelector('[data-document-form="upload"]').requestSubmit();`);
      await waitFor(`document.querySelector('#document-status')?.textContent.startsWith('Dokument als ungeprüfter Entwurf')`);
      assert.equal(store.documents.list(owner).length,4);
      // A real PDF previews through the authenticated original endpoint.
      const pdf=(await readFile(new URL('./fixtures/document-text.pdf',import.meta.url))).toString('base64');
      await evaluate(`var bytes=Uint8Array.from(atob(${JSON.stringify(pdf)}),character=>character.charCodeAt(0)),transfer=new DataTransfer();transfer.items.add(new File([bytes],'beispiel.pdf',{type:'application/pdf'}));var form=document.querySelector('[data-document-form="upload"]');form.elements.file.files=transfer.files;form.requestSubmit();`);
      await waitFor(`document.querySelector('.document-detail-heading p')?.textContent.includes('beispiel.pdf')`);
      await evaluate(`document.querySelector('[data-document-tab="original"]').click();`);
      await waitFor(`document.querySelector('[data-document-preview] iframe')?.src.startsWith('blob:')`);
      if(process.env.DOCUMENT_UI_SCREENSHOTS){await evaluate(`document.querySelector('#document-panel-original').scrollIntoView({block:'start'});`);await new Promise(resolve=>setTimeout(resolve,500));const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(process.env.DOCUMENT_UI_SCREENSHOTS+'-preview.png',Buffer.from(shot.data,'base64'));await evaluate('window.scrollTo(0,0)');}
      await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),true);
      if(process.env.DOCUMENT_UI_SCREENSHOTS){const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(process.env.DOCUMENT_UI_SCREENSHOTS+'-mobile.png',Buffer.from(shot.data,'base64'));}
      await evaluate(`document.querySelector('[data-document-action="logout"]').click();`);
      await waitFor(`document.querySelector('[data-document-form="login"]')`);
      assert.equal(await evaluate(`document.querySelector('.document-detail')===null`),true);
    });
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}
});
