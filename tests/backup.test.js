import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, addResident, addFood, addShopping, consumeFood } from '../src/domain/household.js';
import { exportBackup, parseBackup, readBackup, MAX_BACKUP_BYTES } from '../src/storage/backup.js';

function populated() {
  let state = addResident(emptyState(), {name: 'Alex', intolerances: 'Milch, Nüsse'});
  state = addFood(state, {name: 'Reis', quantity: 0.5, unit: 'kg', location: 'Vorrat', expiresOn: '2027-01-01'});
  state = consumeFood(state, state.inventory[0].id);
  return addShopping(state, {name: 'Äpfel', quantity: 2, unit: 'Stück'});
}
test('Backup-Roundtrip erhält alle Haushaltsdaten einschließlich Nullbestand und Unicode', () => {
  for (const state of [emptyState(), populated()]) assert.deepEqual(parseBackup(exportBackup(state)), state);
});
test('Beschädigte, unvollständige und unbekannte Backups werden abgelehnt', () => {
  for (const text of ['{', 'null', '[]', '{}', JSON.stringify({...emptyState(), version: 2})]) assert.throws(() => parseBackup(text));
  const mutations = [
    s => { s.inventory[0].quantity = -1; },
    s => { s.inventory[0].expiresOn = '2026-02-30'; },
    s => { s.household.name = ''; },
    s => { s.residents.push(s.residents[0]); },
    s => { s.shopping[0].done = 'ja'; },
    s => { s.inventory[0].unit = ''; },
  ];
  for (const mutate of mutations) {
    const state = populated(); mutate(state); assert.throws(() => parseBackup(JSON.stringify(state)));
  }
});
test('Import entfernt unbekannte Felder und akzeptiert eine UTF-8-BOM', () => {
  const state = emptyState();
  assert.deepEqual(parseBackup('\uFEFF'+JSON.stringify({...state, unexpected: 'ignorieren'})), state);
});
test('Dateiauswahl und Größenlimit werden vor dem Lesen geprüft', async () => {
  await assert.rejects(readBackup(undefined), /auswählen/);
  await assert.rejects(readBackup({size: MAX_BACKUP_BYTES+1, text() { throw new Error('Darf nicht gelesen werden'); }}), /5 MB/);
  assert.throws(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES+1)), /5 MB/);
  assert.deepEqual(await readBackup(new File([exportBackup(emptyState())], 'backup.json')), emptyState());
});
