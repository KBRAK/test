import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, addResident, addFood, consumeFood, addShopping, toggleShopping, updateHousehold, remove } from '../src/domain/household.js';
import { load, save } from '../src/storage/local.js';
test('Haushalt, Bewohner und Unverträglichkeiten', () => {
  const state = addResident(updateHousehold(emptyState(), { name: 'Familie', notes: 'Notiz' }), { name: 'Alex', intolerances: 'Laktose, Erdnüsse' });
  assert.equal(state.household.name, 'Familie');
  assert.deepEqual(state.residents[0].intolerances, ['Laktose', 'Erdnüsse']);
  assert.equal(remove(state, 'residents', state.residents[0].id).residents.length, 0);
});
test('Verbrauch wird nicht negativ und verändert Ausgangsdaten nicht', () => {
  const state = addFood(emptyState(), { name: 'Reis', quantity: 0.5, unit: 'kg', location: 'Vorrat', expiresOn: '2027-01-01' });
  const next = consumeFood(state, state.inventory[0].id);
  assert.equal(next.inventory[0].quantity, 0);
  assert.equal(state.inventory[0].quantity, 0.5);
});
test('Ungültige Mengen, Namen und Datumswerte werden abgelehnt', () => {
  for (const quantity of [-1, 0, NaN, Infinity]) assert.throws(() => addShopping(emptyState(), { name: 'Reis', quantity, unit: 'kg' }));
  assert.throws(() => addResident(emptyState(), { name: ' ' }));
  assert.throws(() => addFood(emptyState(), { name: 'Reis', quantity: 1, unit: 'kg', location: 'Vorrat', expiresOn: '2026-02-30' }));
});
test('Einkaufsbedarf lässt sich erledigen und wieder öffnen', () => {
  const state = addShopping(emptyState(), { name: 'Reis', quantity: 2, unit: 'kg' });
  const next = toggleShopping(state, state.shopping[0].id);
  assert.equal(next.shopping[0].done, true);
  assert.equal(toggleShopping(next, state.shopping[0].id).shopping[0].done, false);
});
test('Persistenz-Roundtrip und beschädigte Daten', () => {
  let raw = null;
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
  assert.deepEqual(load(storage), emptyState());
  const state = addShopping(emptyState(), { name: 'Äpfel', quantity: 2, unit: 'Stück' });
  save(storage, state); assert.deepEqual(load(storage), state);
  raw = '{'; assert.throws(() => load(storage));
  raw = '{"version":2}'; assert.throws(() => load(storage));
  assert.throws(() => save({ setItem() { throw new Error('voll'); } }, state));
});
test('Verbrauch erhält Dezimalmengen ohne Rundungsartefakte', () => {
  for (const [quantity, expected] of [[1.1, 0.1], [2.3, 1.3], [1.001, 0.001], [1.0000000000000002, 0.0000000000000002], [0.1, 0], [2, 1]]) {
    const state = addFood(emptyState(), { name: 'Reis', quantity, unit: 'kg', location: 'Vorrat' });
    assert.equal(consumeFood(state, state.inventory[0].id).inventory[0].quantity, expected);
  }
});
