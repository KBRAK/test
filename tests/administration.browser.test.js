import test from 'node:test';
import assert from 'node:assert/strict';
import { browserEnabled,withBrowser } from './helpers/browser.js';
import { createFamilyStore } from '../backend/family-store.js';
import { createAppServer } from '../server.js';
import { localDate } from '../src/domain/family.js';
test('Browser: Versicherung, Fahrzeug, TÜV, Teilzahlung, Zahlungskorrektur und Verwaltungsbackup', {skip:!browserEnabled,timeout:45000},async()=>{
  const store=createFamilyStore(':memory:'),server=createAppServer({store,accessKey:'test-administration-key'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await withBrowser('http://127.0.0.1:'+server.address().port,async({evaluate,waitFor,command})=>{
    await waitFor(`document.querySelector('[data-family-form="connect"]')`);
    await evaluate(`window.confirm=()=>true;const form=document.querySelector('[data-family-form="connect"]');form.elements.key.value='test-administration-key';form.requestSubmit();`);
    await waitFor(`document.querySelector('[data-admin-form="vehicle"]')`);
    await evaluate(`window.fillAdmin=(type,values)=>{const f=document.querySelector('[data-admin-form="'+type+'"]');for(const [key,value]of Object.entries(values)){f.elements.namedItem(key).value=value;f.elements.namedItem(key).dispatchEvent(new Event('input',{bubbles:true}));}};
      window.submitAdmin=type=>document.querySelector('[data-admin-form="'+type+'"]').requestSubmit();
      fillAdmin('obligation',{title:'Haftpflicht'});fillAdmin('vehicle',{name:'Familienauto',plate:'B-AB 123',huDueMonth:'2028-02',mileage:'50000',serviceDueKm:'60000'});submitAdmin('vehicle');`);
    await waitFor(`document.querySelector('#admin-status')?.textContent==='Fahrzeug gespeichert.'`);
    assert.equal(await evaluate(`document.querySelector('[data-admin-form="obligation"]').elements.title.value`),'Haftpflicht');
    const vehicle=store.administration.snapshot().vehicles[0];
    assert.equal(await evaluate(`document.querySelector('#administration-app').textContent.includes('2028-02-29')`),true);
    await evaluate(`fillAdmin('obligation',{title:'Haftpflicht',provider:'Versicherung',category:'insurance',amount:'49,90',interval:'monthly',firstDueDate:${JSON.stringify(localDate())},paymentMethod:'Lastschrift',vehicleId:${JSON.stringify(vehicle.id)}});submitAdmin('obligation');`);
    await waitFor(`document.querySelector('#admin-status')?.textContent==='Kostenposten gespeichert.'`);
    const obligation=store.administration.snapshot().obligations[0];assert.equal(obligation.amountCents,4990);assert.equal(obligation.vehicleId,vehicle.id);
    await evaluate(`document.querySelector('[data-admin-action="pay"]').click();`);
    await waitFor(`document.querySelector('[data-admin-form="payment"]')`);
    await evaluate(`fillAdmin('payment',{amount:'20,00'});submitAdmin('payment');`);
    await waitFor(`document.querySelector('#admin-status')?.textContent.startsWith('Zahlung dokumentiert.')`);
    assert.equal(store.administration.snapshot().payments[0].amountCents,2000);
    assert.equal(await evaluate(`document.querySelector('.admin-overview ul').textContent.includes('29,90')`),true);
    await evaluate(`document.querySelector('[data-admin-action="delete-payment"]').click();`);
    await waitFor(`document.querySelector('#admin-status')?.textContent==='Eintrag gelöscht.'`);
    assert.equal(store.administration.snapshot().payments.length,0);
    // A linked vehicle cannot be deleted accidentally.
    await evaluate(`document.querySelector('[data-admin-action="delete-vehicle"]').click();`);
    await waitFor(`document.querySelector('#admin-status')?.textContent.includes('verknüpften Kostenposten')`);
    assert.equal(store.administration.snapshot().vehicles.length,1);
    await evaluate(`window.downloadedAdmin=null;window.originalCreate=URL.createObjectURL;window.originalClick=HTMLAnchorElement.prototype.click;URL.createObjectURL=blob=>{downloadedAdmin=blob;return originalCreate(blob);};HTMLAnchorElement.prototype.click=function(){};document.querySelector('[data-admin-action="backup"]').click();`);
    await waitFor('window.downloadedAdmin !== null');
    const backup=await evaluate('(async()=>JSON.parse(await downloadedAdmin.text()))()');assert.equal(backup.format,'zuhause-administration');assert.equal(backup.obligations.length,1);
    await evaluate(`URL.createObjectURL=originalCreate;HTMLAnchorElement.prototype.click=originalClick;window.adminBackup=${JSON.stringify(backup)};
      window.selectAdminBackup=text=>{const f=document.querySelector('[data-admin-form="restore"]'),transfer=new DataTransfer();transfer.items.add(new File([text],'backup.json',{type:'application/json'}));f.elements.file.files=transfer.files;f.requestSubmit();};
      selectAdminBackup(JSON.stringify({...adminBackup,format:'wrong'}));`);
    await waitFor(`document.querySelector('#admin-status')?.textContent==='Bitte ein Verwaltungsbackup auswählen.'`);
    await evaluate(`window.confirm=()=>false;selectAdminBackup(JSON.stringify(adminBackup));`);
    await waitFor(`document.querySelector('#admin-status')?.textContent==='Wiederherstellung abgebrochen.'`);
    await evaluate(`window.confirm=()=>true;selectAdminBackup(JSON.stringify(adminBackup));`);
    await waitFor(`document.querySelector('#admin-status')?.textContent==='Verwaltungsbackup wiederhergestellt.'`);
    assert.equal(store.administration.snapshot().obligations[0].amountCents,4990);
    // All requested utility categories persist with provider, meter and due-date details.
    for(const category of ['energy','waste','water','housing']){
      await evaluate(`fillAdmin('obligation',{title:${JSON.stringify(category)},category:${JSON.stringify(category)},amount:'10,01',meterNumber:'Z-123',firstDueDate:${JSON.stringify(localDate())}});submitAdmin('obligation');`);
      await waitFor(`document.querySelector('#admin-status')?.textContent==='Kostenposten gespeichert.'`);
    }
    assert.equal(store.administration.snapshot().obligations.length,5);
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),true);
  });}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}
});
