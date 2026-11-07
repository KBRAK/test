import { randomUUID } from 'node:crypto';
import { normalizeObligation, normalizeVehicle, normalizePayment, isDueDate } from '../src/domain/administration.js';
export function attachAdministration(db,transaction,ApiError) {
  const row=(table,id)=>{
    const item=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
    if(!item)throw new ApiError(404,'Eintrag nicht gefunden.');
    return {id:item.id,version:item.version,...JSON.parse(item.details)};
  };
  const all=table=>db.prepare(`SELECT id FROM ${table} ORDER BY rowid`).all().map(v=>row(table,v.id));
  const version=(current,value)=>{if(current.version!==value)throw new ApiError(409,'Dieser Eintrag wurde inzwischen geändert. Bitte die Verwaltung aktualisieren.');};
  const snapshot=()=>({revision:db.prepare("SELECT value FROM metadata WHERE key='revision'").get().value,vehicles:all('vehicles'),obligations:all('obligations'),payments:all('payments')});
  const linkedVehicle=id=>{if(id&&!db.prepare('SELECT id FROM vehicles WHERE id=?').get(id))throw new ApiError(400,'Das ausgewählte Fahrzeug existiert nicht mehr.');};
  return {
    snapshot,
    addVehicle:input=>transaction(()=>{const details=normalizeVehicle(input),id=randomUUID();db.prepare('INSERT INTO vehicles VALUES (?,1,?)').run(id,JSON.stringify(details));return row('vehicles',id);}),
    updateVehicle:(id,input)=>transaction(()=>{version(row('vehicles',id),input.version);db.prepare('UPDATE vehicles SET details=?,version=version+1 WHERE id=?').run(JSON.stringify(normalizeVehicle(input)),id);return row('vehicles',id);}),
    deleteVehicle:(id,value)=>transaction(()=>{version(row('vehicles',id),value);if(db.prepare('SELECT id FROM obligations WHERE vehicle_id=?').get(id))throw new ApiError(409,'Bitte das Fahrzeug zuerst aus den verknüpften Kostenposten lösen.');db.prepare('DELETE FROM vehicles WHERE id=?').run(id);}),
    addObligation:input=>transaction(()=>{const details=normalizeObligation(input);linkedVehicle(details.vehicleId);const id=randomUUID();db.prepare('INSERT INTO obligations VALUES (?,1,?,?)').run(id,details.vehicleId||null,JSON.stringify(details));return row('obligations',id);}),
    updateObligation:(id,input)=>transaction(()=>{
      const old=row('obligations',id);version(old,input.version);const details=normalizeObligation(input);linkedVehicle(details.vehicleId);
      const payments=all('payments').filter(p=>p.obligationId===id);
      if(payments.length&&['amountCents','interval','firstDueDate'].some(field=>old[field]!==details[field]))throw new ApiError(409,'Mit vorhandenen Zahlungen können Betrag, Rhythmus und erste Fälligkeit nicht geändert werden. Für neue Konditionen bitte einen neuen Kostenposten anlegen.');
      if(payments.some(p=>!isDueDate(details,p.dueDate)))throw new ApiError(409,'Die letzte Fälligkeit würde bereits verbuchte Zahlungen ausschließen.');
      db.prepare('UPDATE obligations SET details=?,vehicle_id=?,version=version+1 WHERE id=?').run(JSON.stringify(details),details.vehicleId||null,id);return row('obligations',id);
    }),
    deleteObligation:(id,value)=>transaction(()=>{version(row('obligations',id),value);db.prepare('DELETE FROM obligations WHERE id=?').run(id);}),
    addPayment:(id,input)=>transaction(()=>{
      const obligation=row('obligations',id);version(obligation,input.obligationVersion);
      const details={...normalizePayment(input,obligation,all('payments')),obligationId:id},paymentId=randomUUID();
      db.prepare('INSERT INTO payments VALUES (?,?,1,?)').run(paymentId,id,JSON.stringify(details));
      db.prepare('UPDATE obligations SET version=version+1 WHERE id=?').run(id);return row('payments',paymentId);
    }),
    deletePayment:(id,value)=>transaction(()=>{const payment=row('payments',id);version(payment,value);db.prepare('DELETE FROM payments WHERE id=?').run(id);db.prepare('UPDATE obligations SET version=version+1 WHERE id=?').run(payment.obligationId);}),
    backup:()=>({format:'zuhause-administration',version:1,...snapshot()}),
    restore:(backup,revision)=>transaction(()=>{
      if(snapshot().revision!==revision)throw new ApiError(409,'Serverdaten wurden inzwischen geändert. Bitte vor der Wiederherstellung aktualisieren.');
      if(!backup||backup.format!=='zuhause-administration'||backup.version!==1||!Array.isArray(backup.vehicles)||!Array.isArray(backup.obligations)||!Array.isArray(backup.payments)||backup.vehicles.length>1000||backup.obligations.length>5000||backup.payments.length>50000)throw new ApiError(400,'Ungültiges Verwaltungsbackup.');
      const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
      for(const entries of [backup.vehicles,backup.obligations,backup.payments])if(entries.some(v=>!v||!validId(v.id))||new Set(entries.map(v=>v.id)).size!==entries.length)throw new ApiError(400,'Ungültige oder doppelte Kennungen im Verwaltungsbackup.');
      const vehicles=backup.vehicles.map(v=>({id:v.id,...normalizeVehicle(v)}));
      const ids=new Set(vehicles.map(v=>v.id));
      const obligations=backup.obligations.map(v=>({id:v.id,...normalizeObligation(v)}));
      if(obligations.some(v=>v.vehicleId&&!ids.has(v.vehicleId)))throw new ApiError(400,'Im Backup fehlt ein verknüpftes Fahrzeug.');
      const payments=[];
      for(const p of backup.payments){const obligation=obligations.find(o=>o.id===p.obligationId);if(!obligation)throw new ApiError(400,'Zahlung ohne Kostenposten im Backup.');payments.push({id:p.id,obligationId:p.obligationId,...normalizePayment(p,obligation,payments)});}
      const restoredVersion=snapshot().revision+1;
      db.exec('DELETE FROM payments; DELETE FROM obligations; DELETE FROM vehicles;');
      for(const {id,...details} of vehicles)db.prepare('INSERT INTO vehicles VALUES (?,?,?)').run(id,restoredVersion,JSON.stringify(details));
      for(const {id,...details} of obligations)db.prepare('INSERT INTO obligations VALUES (?,?,?,?)').run(id,restoredVersion,details.vehicleId||null,JSON.stringify(details));
      for(const {id,...details} of payments)db.prepare('INSERT INTO payments VALUES (?,?,?,?)').run(id,details.obligationId,restoredVersion,JSON.stringify(details));
    }),
  };
}
