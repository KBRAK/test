import { addResident, addFood, consumeFood, addShopping, toggleShopping, remove, updateHousehold } from './domain/household.js';
import { load, save } from './storage/local.js';
const app = document.querySelector('#app');
let state;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field = (label, key, type = 'text', value = '') => `<label>${label}<input name="${key}" type="${type}" value="${escape(value)}" ${type === 'number' ? 'min="0.001" step="any"' : ''} ${type === 'date' ? '' : 'required'} ${type === 'text' ? 'maxlength="200"' : ''}></label>`;
const button = (action, collection, id, label) => `<button type="button" data-action="${action}" data-collection="${collection}" data-id="${escape(id)}">${label}</button>`;
const list = rows => `<ul>${rows.join('') || '<li class="empty">Noch keine Einträge.</li>'}</ul>`;
function render() {
  const warnings = state.residents.filter(r => r.intolerances.length).map(r => `${escape(r.name)}: ${r.intolerances.map(escape).join(', ')}`);
  app.innerHTML = `<p id="status" role="status" aria-live="polite"></p><div class="grid">
  <section><h2>Haushalt</h2><form data-form="household">${field('Haushaltsname', 'name', 'text', state.household.name)}<label>Notizen<textarea name="notes">${escape(state.household.notes)}</textarea></label><button>Haushalt speichern</button></form></section>
  <section><h2>Bewohner <small>${state.residents.length}</small></h2><form data-form="resident">${field('Name', 'name')}<label>Unverträglichkeiten (mit Komma trennen)<input name="intolerances" maxlength="1000" placeholder="z. B. Laktose, Erdnüsse"></label><button>Bewohner hinzufügen</button></form>${list(state.residents.map(r => `<li><strong>${escape(r.name)}</strong><p>${r.intolerances.map(escape).join(', ') || 'Keine Angaben zu Unverträglichkeiten'}</p>${button('remove','residents',r.id,'Entfernen')}</li>`))}</section>
  <section><h2>Lebensmittelbestand</h2><form data-form="food">${field('Lebensmittel', 'name')}<div class="row">${field('Menge','quantity','number',1)}${field('Einheit','unit','text','Stück')}</div><label>Lagerort<select name="location"><option>Kühlschrank</option><option>Vorrat</option><option>Gefrierfach</option></select></label>${field('Haltbar bis (optional)','expiresOn','date')}<button>Vorrat hinzufügen</button></form>${list(state.inventory.map(i => `<li><strong>${escape(i.name)}</strong><p>${i.quantity} ${escape(i.unit)} · ${escape(i.location)}${i.expiresOn ? ` · Haltbar bis ${escape(i.expiresOn)}` : ''}</p>${button('consume','inventory',i.id,'1 Einheit verbrauchen')} ${button('need','inventory',i.id,'Nachkaufen')} ${button('remove','inventory',i.id,'Entfernen')}</li>`))}</section>
  <section><h2>Einkaufsbedarf <small>${state.shopping.filter(i => !i.done).length} offen</small></h2><aside><strong>Unverträglichkeiten beachten</strong><p>${warnings.join('<br>') || 'Noch keine Unverträglichkeiten hinterlegt.'}</p><p>Produkte und Zutaten selbst prüfen; es findet kein automatischer Abgleich statt.</p></aside><form data-form="shopping">${field('Benötigtes Lebensmittel','name')}<div class="row">${field('Menge','quantity','number',1)}${field('Einheit','unit','text','Stück')}</div><button>Auf die Einkaufsliste</button></form>${list(state.shopping.map(i => `<li class="${i.done ? 'done' : ''}"><strong>${escape(i.name)}</strong><p>${i.quantity} ${escape(i.unit)} · ${i.done ? 'Erledigt' : 'Offen'}</p>${button('toggle','shopping',i.id,i.done ? 'Wieder öffnen' : 'Als gekauft markieren')} ${button('remove','shopping',i.id,'Entfernen')}</li>`))}</section></div>`;
}
function commit(next) { save(localStorage, next); state = next; render(); document.querySelector('#status').textContent = 'Gespeichert.'; }
function report(error) { document.querySelector('#status').textContent = `Nicht gespeichert: ${error.message}`; }
app.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const input = Object.fromEntries(new FormData(form));
  const actions = { household: updateHousehold, resident: addResident, food: addFood, shopping: addShopping };
  try { commit(actions[form.dataset.form](state, input)); } catch (error) { report(error); }
});
app.addEventListener('click', event => {
  const target = event.target.closest('[data-action]'); if (!target) return;
  const { action, collection, id } = target.dataset;
  try {
    if (action === 'remove') commit(remove(state, collection, id));
    if (action === 'consume') commit(consumeFood(state, id));
    if (action === 'toggle') commit(toggleShopping(state, id));
    if (action === 'need') { const food = state.inventory.find(i => i.id === id); commit(addShopping(state, { ...food, quantity: 1 })); }
  } catch (error) { report(error); }
});
try { state = load(localStorage); render(); } catch { app.innerHTML = '<section role="alert"><h2>Daten konnten nicht geladen werden</h2><p>Browserspeicher ist nicht verfügbar oder die gespeicherten Daten sind beschädigt. Bestehende Daten werden nicht überschrieben. Bitte Browser-Einstellungen prüfen oder die Daten über die Entwicklerwerkzeuge sichern.</p></section>'; }
