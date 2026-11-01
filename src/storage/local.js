import { emptyState, validateState } from '../domain/household.js';
export const STORAGE_KEY = 'zuhause.household.v1';
export function load(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return emptyState();
  const value = JSON.parse(raw);
  if (!validateState(value)) throw new Error('Gespeicherte Daten haben ein unbekanntes Format.');
  return value;
}
export function save(storage, state) {
  if (!validateState(state)) throw new Error('Ungültige Haushaltsdaten.');
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
