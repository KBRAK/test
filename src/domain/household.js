export const emptyState = () => ({ version: 1, household: { name: 'Mein Haushalt', notes: '' }, residents: [], inventory: [], shopping: [] });
const name = value => { const text = String(value ?? '').trim(); if (!text || text.length > 200) throw new Error('Bitte einen Namen mit 1–200 Zeichen eingeben.'); return text; };
const amount = value => { const number = Number(value); if (!Number.isFinite(number) || number <= 0) throw new Error('Die Menge muss größer als 0 sein.'); return number; };
const id = () => crypto.randomUUID();
export function addResident(state, input) {
  return { ...state, residents: [...state.residents, { id: id(), name: name(input.name), intolerances: String(input.intolerances ?? '').split(',').map(x => x.trim()).filter(Boolean) }] };
}
export function addFood(state, input) {
  const location = input.location;
  if (!['Kühlschrank', 'Vorrat', 'Gefrierfach'].includes(location)) throw new Error('Ungültiger Lagerort.');
  const expiresOn = input.expiresOn || '';
  if (expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || Number.isNaN(Date.parse(expiresOn)) || new Date(expiresOn).toISOString().slice(0, 10) !== expiresOn)) throw new Error('Ungültiges Haltbarkeitsdatum.');
  return { ...state, inventory: [...state.inventory, { id: id(), name: name(input.name), quantity: amount(input.quantity), unit: name(input.unit), location, expiresOn }] };
}
export function consumeFood(state, foodId) {
  return { ...state, inventory: state.inventory.map(item => item.id === foodId ? { ...item, quantity: Math.max(0, item.quantity - 1) } : item) };
}
export function addShopping(state, input) {
  return { ...state, shopping: [...state.shopping, { id: id(), name: name(input.name), quantity: amount(input.quantity), unit: name(input.unit), done: false }] };
}
export function toggleShopping(state, itemId) {
  return { ...state, shopping: state.shopping.map(item => item.id === itemId ? { ...item, done: !item.done } : item) };
}
export function remove(state, collection, itemId) {
  if (!['residents', 'inventory', 'shopping'].includes(collection)) throw new Error('Ungültiger Bereich.');
  return { ...state, [collection]: state[collection].filter(item => item.id !== itemId) };
}
export function updateHousehold(state, input) {
  return { ...state, household: { name: name(input.name), notes: String(input.notes ?? '').trim() } };
}
export function validateState(value) {
  const text = v => typeof v === 'string';
  const item = v => v && text(v.id) && text(v.name);
  const quantity = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  return !!(value && value.version === 1 && value.household && text(value.household.name) && text(value.household.notes)
    && Array.isArray(value.residents) && value.residents.every(v => item(v) && Array.isArray(v.intolerances) && v.intolerances.every(text))
    && Array.isArray(value.inventory) && value.inventory.every(v => item(v) && quantity(v.quantity) && text(v.unit) && ['Kühlschrank', 'Vorrat', 'Gefrierfach'].includes(v.location) && text(v.expiresOn))
    && Array.isArray(value.shopping) && value.shopping.every(v => item(v) && quantity(v.quantity) && text(v.unit) && typeof v.done === 'boolean'));
}
