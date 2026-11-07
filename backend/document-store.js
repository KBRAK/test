import { randomBytes,randomUUID,createHash,scryptSync,timingSafeEqual } from 'node:crypto';
import { normalizeDocumentFacts } from '../src/domain/documents.js';
import { validDate,addDays } from '../src/domain/family.js';
import { dueDates } from '../src/domain/administration.js';
const hash=token=>createHash('sha256').update(token).digest('hex');
function credentials(input) {
  if(!input||typeof input!=='object')throw new Error('Ungültige Kontodaten.');
  const username=typeof input.username==='string'?input.username.trim().toLowerCase():'';
  if(!/^[a-z0-9._-]{3,50}$/.test(username))throw new Error('Benutzername: 3–50 Zeichen, Buchstaben a–z, Zahlen, Punkt, Bindestrich oder Unterstrich.');
  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>100)throw new Error('Bitte einen Anzeigenamen mit höchstens 100 Zeichen angeben.');
  if(typeof input.password!=='string'||input.password.length<12||input.password.length>256)throw new Error('Das persönliche Passwort muss 12–256 Zeichen lang sein.');
  return {username,name:input.name.trim(),password:input.password};
}
const passwordHash=(password,salt)=>scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:128*1024*1024});
export function berlinDate() {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
}
export function attachDocuments(db,transaction,ApiError) {
  const audit=(actor,action,documentId='')=>db.prepare('INSERT INTO document_audit VALUES (?,?,?,?,?)').run(randomUUID(),actor.id,action,documentId,new Date().toISOString());
  const safeUser=row=>({id:row.id,username:row.username,name:row.name,role:row.role,active:Boolean(row.active)});
  const user=id=>{const row=db.prepare('SELECT * FROM document_users WHERE id=?').get(id);if(!row)throw new ApiError(404,'Dokumentkonto nicht gefunden.');return safeUser(row);};
  const activeUser=id=>{const result=user(id);if(!result.active)throw new ApiError(400,'Dieses Dokumentkonto ist deaktiviert.');return result;};
  const admin=actor=>{activeUser(actor.id);if(actor.role!=='admin')throw new ApiError(403,'Nur die Dokumentadministration darf Konten verwalten.');};
  const actor=token=>{
    if(typeof token!=='string'||token.length!==64)throw new ApiError(401,'Bitte persönlich im Dokumentenbereich anmelden.');
    const row=db.prepare('SELECT u.* FROM document_sessions s JOIN document_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').get(hash(token),Date.now());
    if(!row)throw new ApiError(401,'Persönliche Anmeldung abgelaufen oder ungültig.');return safeUser(row);
  };
  const allowed=(person,id)=>db.prepare('SELECT d.* FROM documents d WHERE d.id=? AND (d.owner_id=? OR EXISTS (SELECT 1 FROM document_grants g WHERE g.document_id=d.id AND g.user_id=?))').get(id,person.id,person.id);
  const access=(person,id,owner=false)=>{
    activeUser(person.id);const result=allowed(person,id);if(!result)throw new ApiError(404,'Dokument nicht gefunden oder nicht freigegeben.');
    if(owner&&result.owner_id!==person.id)throw new ApiError(403,'Nur der Eigentümer darf dieses Dokument ändern.');return result;
  };
  const version=(row,value)=>{if(row.version!==value)throw new ApiError(409,'Dokument wurde inzwischen geändert. Bitte erneut laden.');};
  const facts=id=>{
    const r=db.prepare('SELECT * FROM document_facts WHERE document_id=?').get(id);if(!r)return null;
    return {title:r.title,category:r.category,provider:r.provider,reference:r.reference,amountCents:r.amount_cents,currency:r.currency,dueDate:r.due_date,endDate:r.end_date,interval:r.payment_interval,cancellationDate:r.cancellation_date,notes:r.notes,leadDays:r.lead_days,recipientIds:JSON.parse(r.recipients)};
  };
  const setFacts=(id,f)=>db.prepare(`INSERT OR REPLACE INTO document_facts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,f.title,f.category,f.provider,f.reference,f.amountCents,f.currency,f.dueDate,f.endDate,f.interval,f.cancellationDate,f.notes,f.leadDays,JSON.stringify(f.recipientIds),new Date().toISOString());
  const readers=id=>db.prepare('SELECT user_id FROM document_grants WHERE document_id=?').all(id).map(v=>v.user_id);
  const summary=row=>({id:row.id,ownerId:row.owner_id,filename:row.filename,mime:row.mime,version:row.version,createdAt:row.created_at,state:row.state,method:row.method,facts:facts(row.id)});
  const createUser=(by,input,bootstrap=false)=>{
    const c=credentials(input),role=bootstrap?'admin':input.role;
    if(!['admin','user'].includes(role))throw new Error('Ungültige Kontorolle.');
    if(db.prepare('SELECT id FROM document_users WHERE username=?').get(c.username))throw new ApiError(409,'Benutzername ist bereits vergeben.');
    const salt=randomBytes(32).toString('hex'),id=randomUUID();
    db.prepare('INSERT INTO document_users VALUES (?,?,?,?,?,?,1)').run(id,c.username,c.name,role,salt,passwordHash(c.password,salt));
    audit(by||{id},'account-created');return user(id);
  };
  return {
    actor,hasUsers:()=>Boolean(db.prepare('SELECT id FROM document_users LIMIT 1').get()),
    setup:input=>transaction(()=>{if(db.prepare('SELECT id FROM document_users LIMIT 1').get())throw new ApiError(409,'Die persönliche Dokumentanmeldung ist bereits eingerichtet.');return createUser(null,input,true);}),
    login:input=>{
      if(typeof input?.username!=='string'||typeof input?.password!=='string'||input.password.length>256)throw new ApiError(401,'Benutzername oder Passwort ungültig.');
      const row=db.prepare('SELECT * FROM document_users WHERE username=?').get(input.username.trim().toLowerCase());
      const expected=row?Buffer.from(row.password_hash):Buffer.alloc(64),actual=passwordHash(input.password,row?.salt||'unknown-document-user');
      if(!timingSafeEqual(expected,actual)||!row?.active)throw new ApiError(401,'Benutzername oder Passwort ungültig.');
      const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM document_sessions WHERE expires_at<=?').run(Date.now());
      db.prepare('INSERT INTO document_sessions VALUES (?,?,?)').run(hash(token),row.id,Date.now()+12*60*60*1000);audit(safeUser(row),'login');
      return {token,user:safeUser(row)};
    },
    logout:token=>db.prepare('DELETE FROM document_sessions WHERE token_hash=?').run(hash(token)),
    users:person=>{activeUser(person.id);return db.prepare('SELECT * FROM document_users WHERE active=1 ORDER BY name').all().map(safeUser);},
    createUser:(person,input)=>transaction(()=>{admin(person);return createUser(person,input);}),
    deactivateUser:(person,id)=>transaction(()=>{admin(person);if(id===person.id)throw new ApiError(400,'Das eigene Konto kann hier nicht deaktiviert werden.');user(id);db.prepare('UPDATE document_users SET active=0 WHERE id=?').run(id);db.prepare('DELETE FROM document_sessions WHERE user_id=?').run(id);audit(person,'account-deactivated',id);}),
    changePassword:(person,input)=>transaction(()=>{
      const c=credentials({username:person.username,name:person.name,password:input?.newPassword});
      const current=db.prepare('SELECT * FROM document_users WHERE id=?').get(person.id);
      if(typeof input.currentPassword!=='string'||input.currentPassword.length>256||!timingSafeEqual(Buffer.from(current.password_hash),passwordHash(input.currentPassword,current.salt)))throw new ApiError(401,'Das bisherige persönliche Passwort stimmt nicht.');
      const salt=randomBytes(32).toString('hex');db.prepare('UPDATE document_users SET salt=?,password_hash=? WHERE id=?').run(salt,passwordHash(c.password,salt),person.id);db.prepare('DELETE FROM document_sessions WHERE user_id=?').run(person.id);audit(person,'password-changed');
    }),
    list:person=>{activeUser(person.id);return db.prepare('SELECT d.id,d.owner_id,d.filename,d.mime,d.version,d.created_at,d.state,d.method FROM documents d WHERE d.owner_id=? OR EXISTS(SELECT 1 FROM document_grants g WHERE g.document_id=d.id AND g.user_id=?) ORDER BY d.created_at DESC').all(person.id,person.id).map(summary);},
    details:(person,id)=>{const row=access(person,id);return {...summary(row),text:row.extracted_text,analysis:JSON.parse(row.analysis),readerIds:readers(id)};},
    original:(person,id)=>{const row=access(person,id);return {filename:row.filename,mime:row.mime,bytes:row.content};},
    add:(person,extracted,analysis)=>transaction(()=>{
      activeUser(person.id);const contentHash=hash(extracted.bytes);
      if(db.prepare('SELECT id FROM documents WHERE owner_id=? AND content_hash=?').get(person.id,contentHash))throw new ApiError(409,'Diese Datei wurde von dir bereits hochgeladen.');
      const count=db.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(length(content)),0) AS bytes FROM documents WHERE owner_id=?').get(person.id);
      if(count.n>=500||count.bytes+extracted.bytes.length>200*1024*1024)throw new ApiError(413,'Dein Dokumentenspeicher ist voll (500 Dateien oder 200 MB).');
      const id=randomUUID();db.prepare('INSERT INTO documents VALUES (?,?,1,?,?,?,?,?,?,?,?,?)').run(id,person.id,extracted.filename,extracted.mime,extracted.bytes,contentHash,extracted.text,JSON.stringify(analysis),'draft',extracted.method,new Date().toISOString());audit(person,'uploaded',id);return id;
    }),
    // Caller receives the identifier without exposing document contents to other accounts.
    findUploaded:(person,bytes)=>db.prepare('SELECT id FROM documents WHERE owner_id=? AND content_hash=?').get(person.id,hash(bytes))?.id,
    confirm:(person,id,input)=>transaction(()=>{
      const row=access(person,id,true);version(row,input?.version);if(input.reviewed!==true)throw new Error('Bitte die Prüfung am Original ausdrücklich bestätigen.');const normalized=normalizeDocumentFacts(input.facts);
      const permitted=new Set([row.owner_id,...readers(id)]);
      for(const recipient of normalized.recipientIds){activeUser(recipient);if(!permitted.has(recipient))throw new ApiError(403,'Erinnerungen dürfen nur an aktuell berechtigte Nutzer gerichtet werden.');}
      const previous=facts(id);
      setFacts(id,normalized);db.prepare("UPDATE documents SET state='reviewed',version=version+1 WHERE id=?").run(id);
      if(!previous||['dueDate','endDate','interval','amountCents'].some(key=>previous[key]!==normalized[key]))db.prepare('DELETE FROM document_reminder_ack WHERE document_id=?').run(id);
      audit(person,'facts-confirmed',id);
    }),
    share:(person,id,input)=>transaction(()=>{
      const row=access(person,id,true);version(row,input?.version);
      if(!Array.isArray(input.readerIds)||input.readerIds.length>100||input.readerIds.some(v=>typeof v!=='string'))throw new Error('Ungültige Dokumentfreigaben.');
      const ids=[...new Set(input.readerIds)].filter(v=>v!==person.id);for(const id of ids)activeUser(id);
      db.prepare('DELETE FROM document_grants WHERE document_id=?').run(id);for(const reader of ids)db.prepare('INSERT INTO document_grants VALUES (?,?)').run(id,reader);
      const confirmed=facts(id);if(confirmed){confirmed.recipientIds=confirmed.recipientIds.filter(v=>v===person.id||ids.includes(v));setFacts(id,confirmed);}
      db.prepare('UPDATE documents SET version=version+1 WHERE id=?').run(id);audit(person,'access-changed',id);
    }),
    remove:(person,id,value)=>transaction(()=>{const row=access(person,id,true);version(row,value);db.prepare('DELETE FROM documents WHERE id=?').run(id);audit(person,'deleted',id);}),
    reminders:(person,today=berlinDate())=>{
      if(!validDate(today))throw new Error('Ungültiges Erinnerungsdatum.');
      activeUser(person.id);const result=[];
      for(const row of db.prepare("SELECT d.id FROM documents d WHERE d.state='reviewed' AND (d.owner_id=? OR EXISTS(SELECT 1 FROM document_grants g WHERE g.document_id=d.id AND g.user_id=?))").all(person.id,person.id)){
        activeUser(person.id);const f=facts(row.id);if(!f?.dueDate||!f.recipientIds.includes(person.id))continue;
        const schedule={firstDueDate:f.dueDate,endDate:f.endDate||'',interval:f.interval==='unknown'?'once':f.interval};
        const dates=dueDates(schedule,addDays(today,-365),addDays(today,f.leadDays));
        for(const date of dates){if(db.prepare('SELECT 1 FROM document_reminder_ack WHERE document_id=? AND user_id=? AND due_date=?').get(row.id,person.id,date))continue;
          result.push({documentId:row.id,title:f.title,provider:f.provider,amountCents:f.amountCents,currency:f.currency,dueDate:date,overdue:date<today});}
      }
      return result.sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
    },
    acknowledge:(person,id,dueDate)=>transaction(()=>{
      const row=access(person,id);const f=facts(id);if(!f?.recipientIds.includes(person.id)||!f.dueDate||!validDate(dueDate)||!dueDates({firstDueDate:f.dueDate,endDate:f.endDate||'',interval:f.interval==='unknown'?'once':f.interval},dueDate,dueDate).includes(dueDate))throw new ApiError(403,'Diese Zahlungserinnerung ist dir nicht zugeordnet.');
      db.prepare('INSERT OR IGNORE INTO document_reminder_ack VALUES (?,?,?)').run(row.id,person.id,dueDate);audit(person,'reminder-acknowledged',id);
    }),
  };
}
