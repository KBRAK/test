import { validateState } from '../domain/household.js';

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
function checkedState(value) {
  if (!validateState(value)) throw new Error('Die Datei enthält kein unterstütztes Haushaltsbackup (Version 1).');
  const name = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
  const uniqueItems = items => items.every(v => name(v.id) && name(v.name)) && new Set(items.map(v => v.id)).size === items.length;
  const date = v => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
  if (!name(value.household.name) || ![value.residents, value.inventory, value.shopping].every(uniqueItems)
      || !value.inventory.every(v => name(v.unit) && date(v.expiresOn)) || !value.shopping.every(v => name(v.unit))) {
    throw new Error('Das Backup enthält ungültige Namen, Kennungen, Einheiten oder Datumswerte.');
  }
  // Only retain known fields, including for files edited outside the application.
  return {
    version: 1,
    household: { name: value.household.name, notes: value.household.notes },
    residents: value.residents.map(v => ({ id: v.id, name: v.name, intolerances: [...v.intolerances] })),
    inventory: value.inventory.map(v => ({ id: v.id, name: v.name, quantity: v.quantity, unit: v.unit, location: v.location, expiresOn: v.expiresOn })),
    shopping: value.shopping.map(v => ({ id: v.id, name: v.name, quantity: v.quantity, unit: v.unit, done: v.done })),
  };
}
export function exportBackup(state) {
  const text = JSON.stringify(checkedState(state), null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('Das Backup überschreitet die maximale Dateigröße von 5 MB.');
  return text;
}
export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('Backups dürfen höchstens 5 MB groß sein.');
  let value;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('Die Datei ist keine gültige JSON-Datei.'); }
  return checkedState(value);
}
export async function readBackup(file) {
  if (!file) throw new Error('Bitte eine Backup-Datei auswählen.');
  if (file.size > MAX_BACKUP_BYTES) throw new Error('Backups dürfen höchstens 5 MB groß sein.');
  return parseBackup(await file.text());
}
