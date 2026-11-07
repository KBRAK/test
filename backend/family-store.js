import { DatabaseSync } from 'node:sqlite';
import { attachDocuments } from './document-store.js';
import { attachAdministration } from './administration-store.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeMember, normalizeEvent } from '../src/domain/family.js';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const requireVersion = (current, version) => {
  if (current.version !== version) throw new ApiError(409, 'Dieser Eintrag wurde auf einem anderen Gerät geändert. Bitte Daten neu laden und erneut bearbeiten.');
};
export function createFamilyStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true, mode: 0o700});
  const db = new DatabaseSync(path);
  if (db.prepare('PRAGMA user_version').get().user_version > 3) { db.close(); throw new Error('Diese Familiendatenbank benötigt eine neuere Anwendungsversion.'); }
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, version INTEGER NOT NULL, profile TEXT NOT NULL, legacy_id TEXT UNIQUE);
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE, version INTEGER NOT NULL, details TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_member ON events(member_id);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    INSERT OR IGNORE INTO metadata VALUES ('revision',0);
    CREATE TABLE IF NOT EXISTS vehicles (id TEXT PRIMARY KEY, version INTEGER NOT NULL, details TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS obligations (id TEXT PRIMARY KEY, version INTEGER NOT NULL, vehicle_id TEXT REFERENCES vehicles(id) ON DELETE RESTRICT, details TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, obligation_id TEXT NOT NULL REFERENCES obligations(id) ON DELETE CASCADE, version INTEGER NOT NULL, details TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS obligations_vehicle ON obligations(vehicle_id);
    CREATE INDEX IF NOT EXISTS payments_obligation ON payments(obligation_id);
    CREATE TABLE IF NOT EXISTS document_users (id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,name TEXT NOT NULL,role TEXT NOT NULL,salt TEXT NOT NULL,password_hash BLOB NOT NULL,active INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS document_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES document_users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES document_users(id) ON DELETE RESTRICT,version INTEGER NOT NULL,filename TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL,content_hash TEXT NOT NULL,extracted_text TEXT NOT NULL,analysis TEXT NOT NULL,state TEXT NOT NULL,method TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(owner_id,content_hash));
    CREATE TABLE IF NOT EXISTS document_grants (document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES document_users(id) ON DELETE CASCADE,PRIMARY KEY(document_id,user_id));
    CREATE TABLE IF NOT EXISTS document_facts (document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,title TEXT NOT NULL,category TEXT NOT NULL,provider TEXT NOT NULL,reference TEXT NOT NULL,amount_cents INTEGER,currency TEXT,due_date TEXT,end_date TEXT,payment_interval TEXT NOT NULL,cancellation_date TEXT,notes TEXT NOT NULL,lead_days INTEGER NOT NULL,recipients TEXT NOT NULL,reviewed_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS document_reminder_ack (document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES document_users(id) ON DELETE CASCADE,due_date TEXT NOT NULL,PRIMARY KEY(document_id,user_id,due_date));
    CREATE TABLE IF NOT EXISTS document_audit (id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,document_id TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS document_owner ON documents(owner_id);
    CREATE INDEX IF NOT EXISTS document_grantee ON document_grants(user_id);
    PRAGMA user_version=3;`);
  const transaction = action => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = action(); db.exec("UPDATE metadata SET value=value+1 WHERE key='revision'; COMMIT"); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const member = id => {
    const row = db.prepare('SELECT * FROM members WHERE id=?').get(id);
    if (!row) throw new ApiError(404, 'Familienmitglied nicht gefunden.');
    return {id: row.id, version: row.version, legacyId: row.legacy_id || '', ...JSON.parse(row.profile)};
  };
  const event = id => {
    const row = db.prepare('SELECT * FROM events WHERE id=?').get(id);
    if (!row) throw new ApiError(404, 'Termin nicht gefunden.');
    return {id: row.id, memberId: row.member_id, version: row.version, ...JSON.parse(row.details)};
  };
  const snapshot = () => ({
    revision: db.prepare("SELECT value FROM metadata WHERE key='revision'").get().value,
    members: db.prepare('SELECT id FROM members ORDER BY rowid').all().map(row => member(row.id)),
    events: db.prepare('SELECT id FROM events ORDER BY rowid').all().map(row => event(row.id)),
  });
  return {
    close: () => db.close(), snapshot,
    administration: attachAdministration(db,transaction,ApiError),
    documents: attachDocuments(db,transaction,ApiError),
    addMember: input => transaction(() => {
      const profile = normalizeMember(input), id = randomUUID();
      db.prepare('INSERT INTO members(id,version,profile) VALUES (?,1,?)').run(id, JSON.stringify(profile)); return member(id);
    }),
    updateMember: (id, input) => transaction(() => {
      requireVersion(member(id), input.version);
      db.prepare('UPDATE members SET profile=?,version=version+1 WHERE id=?').run(JSON.stringify(normalizeMember(input)), id); return member(id);
    }),
    deleteMember: (id, version) => transaction(() => { requireVersion(member(id), version); db.prepare('DELETE FROM members WHERE id=?').run(id); }),
    addEvent: (memberId, input) => transaction(() => {
      member(memberId); const details = normalizeEvent(input), id = randomUUID();
      db.prepare('INSERT INTO events VALUES (?,?,1,?)').run(id, memberId, JSON.stringify(details)); return event(id);
    }),
    updateEvent: (id, input) => transaction(() => {
      requireVersion(event(id), input.version);
      db.prepare('UPDATE events SET details=?,version=version+1 WHERE id=?').run(JSON.stringify(normalizeEvent(input)), id); return event(id);
    }),
    deleteEvent: (id, version) => transaction(() => { requireVersion(event(id), version); db.prepare('DELETE FROM events WHERE id=?').run(id); }),
    migrateResidents: residents => transaction(() => {
      if (!Array.isArray(residents) || residents.length > 500) throw new ApiError(400, 'Ungültige Bewohnerliste.');
      let imported = 0;
      for (const resident of residents) {
        if (!resident || typeof resident.id !== 'string' || !resident.id || resident.id.length > 200 || typeof resident.name !== 'string' || !resident.name.trim()) throw new ApiError(400, 'Ungültiger Bewohner.');
        if (db.prepare('SELECT id FROM members WHERE legacy_id=?').get(resident.id)) continue;
        const profile = normalizeMember({firstName: resident.name, intolerances: resident.intolerances});
        db.prepare('INSERT INTO members VALUES (?,1,?,?)').run(randomUUID(), JSON.stringify(profile), resident.id); imported++;
      }
      return {imported};
    }),
    backup: () => ({format: 'zuhause-family', version: 1, ...snapshot()}),
    restore: (backup, revision) => transaction(() => {
      if (snapshot().revision !== revision) throw new ApiError(409, 'Familiendaten wurden inzwischen geändert. Bitte neu laden, bevor du das Backup importierst.');
      if (!backup || backup.format !== 'zuhause-family' || backup.version !== 1 || !Array.isArray(backup.members) || !Array.isArray(backup.events) || backup.members.length > 500 || backup.events.length > 10000) throw new ApiError(400, 'Ungültiges Familienbackup.');
      const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
      const members = backup.members.map(m => ({...normalizeMember(m), id: m.id, legacyId: typeof m.legacyId === 'string' && m.legacyId.length <= 200 ? m.legacyId : ''}));
      const events = backup.events.map(e => ({...normalizeEvent(e), id: e.id, memberId: e.memberId}));
      const memberIds = new Set(members.map(m => m.id));
      if (members.some(m => !validId(m.id)) || memberIds.size !== members.length || events.some(e => !validId(e.id) || !memberIds.has(e.memberId)) || new Set(events.map(e => e.id)).size !== events.length) throw new ApiError(400, 'Backup enthält ungültige oder doppelte Kennungen bzw. fehlende Familienmitglieder.');
      // Increase versions even across restore so stale clients cannot overwrite restored entries.
      const legacyIds = members.map(m=>m.legacyId).filter(Boolean);
      if (new Set(legacyIds).size !== legacyIds.length) throw new ApiError(400, 'Doppelte Übernahmekennungen im Backup.');
      const restoredVersion = snapshot().revision+1;
      db.exec('DELETE FROM events; DELETE FROM members;');
      for (const {id,legacyId, ...profile} of members) db.prepare('INSERT INTO members(id,version,profile,legacy_id) VALUES (?,?,?,?)').run(id, restoredVersion, JSON.stringify(profile), legacyId||null);
      for (const {id,memberId,...details} of events) db.prepare('INSERT INTO events VALUES (?,?,?,?)').run(id, memberId, restoredVersion, JSON.stringify(details));
      return snapshot();
    }),
  };
}
