export const EVENT_KINDS = { school: 'Schule', kindergarten: 'Kindergarten', sport: 'Sport', other: 'Sonstiges' };
export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const fail = message => { throw new Error(message); };
const text = (value, label, max = 2000) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > max) fail(`${label}: maximal ${max} Zeichen erlaubt.`);
  return value.trim();
};
const list = (value, label) => {
  const entries = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\n]/) : value === undefined ? [] : fail(`${label}: ungültige Liste.`);
  if (entries.length > 100) fail(`${label}: maximal 100 Einträge erlaubt.`);
  return [...new Set(entries.map(v => text(v, label, 200)).filter(Boolean))];
};
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= '9999-12-31'
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function memberName(member) { return member.nickname || [member.firstName, member.lastName].filter(Boolean).join(' '); }
export function normalizeMember(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Ungültiges Familienprofil.');
  const firstName = text(input.firstName, 'Vorname', 200);
  if (!firstName) fail('Bitte einen Vornamen eingeben.');
  const birthDate = text(input.birthDate, 'Geburtsdatum', 10);
  if (birthDate && (!validDate(birthDate) || birthDate > localDate())) fail('Bitte ein gültiges Geburtsdatum eingeben, das nicht in der Zukunft liegt.');
  return {
    firstName, lastName: text(input.lastName, 'Nachname', 200), nickname: text(input.nickname, 'Rufname', 200), birthDate,
    role: text(input.role, 'Familienrolle', 200),
    foodLikes: list(input.foodLikes, 'Lieblingsgerichte und Zutaten'), foodDislikes: list(input.foodDislikes, 'Abneigungen'),
    cuisines: list(input.cuisines, 'Bevorzugte Küchen'), diet: text(input.diet, 'Ernährungsweise', 200),
    foodNotes: text(input.foodNotes, 'Essensvorlieben im Detail'), intolerances: list(input.intolerances, 'Unverträglichkeiten'),
    healthNotes: text(input.healthNotes, 'Hinweise zu Unverträglichkeiten'), notes: text(input.notes, 'Weitere Informationen', 5000),
    institutionType: ['school', 'kindergarten', 'none'].includes(input.institutionType) ? input.institutionType : input.institutionType ? fail('Ungültige Einrichtung.') : 'none',
    institutionName: text(input.institutionName, 'Einrichtung', 200), institutionAddress: text(input.institutionAddress, 'Adresse', 500),
    institutionContact: text(input.institutionContact, 'Kontakt zur Einrichtung', 500), institutionNotes: text(input.institutionNotes, 'Hinweise zur Einrichtung'),
  };
}
export function normalizeEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Ungültiger Termin.');
  const title = text(input.title, 'Termintitel', 200);
  if (!title) fail('Bitte einen Termintitel eingeben.');
  if (!Object.hasOwn(EVENT_KINDS, input.kind)) fail('Bitte eine Terminart auswählen.');
  if (!['once', 'weekly'].includes(input.repeat)) fail('Ungültige Wiederholung.');
  if (!validDate(input.startDate)) fail('Bitte ein gültiges Datum angeben.');
  const endDate = input.repeat === 'once' ? input.startDate : text(input.endDate, 'Gültig bis', 10);
  if (endDate && (!validDate(endDate) || endDate < input.startDate)) fail('Das Enddatum muss am oder nach dem Anfangsdatum liegen.');
  const time = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (!time(input.startTime) || !time(input.endTime) || input.endTime <= input.startTime) fail('Beginn und Ende müssen am selben Tag liegen; Ende muss nach Beginn liegen.');
  const departureTime = text(input.departureTime, 'Losgehen um', 5);
  if (departureTime && (!time(departureTime) || departureTime > input.startTime)) fail('Die Losgehzeit muss am selben Tag vor oder bei Terminbeginn liegen.');
  const weekdays = input.repeat === 'weekly' ? input.weekdays : [];
  if (!Array.isArray(weekdays) || weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7) || (input.repeat === 'weekly' && weekdays.length === 0)) fail('Bitte mindestens einen gültigen Wochentag auswählen.');
  return { title, kind: input.kind, repeat: input.repeat, startDate: input.startDate, endDate,
    weekdays: [...new Set(weekdays)].sort(), startTime: input.startTime, endTime: input.endTime, departureTime,
    location: text(input.location, 'Ort / Verein', 500), contact: text(input.contact, 'Kontakt', 500), notes: text(input.notes, 'Hinweise und Ausrüstung') };
}
export function addDays(date, days) {
  if (!validDate(date)) fail('Ungültiges Kalenderdatum.');
  const value = new Date(date+'T12:00:00Z'); value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}
export function weekStart(date) {
  const weekday = new Date(date+'T12:00:00Z').getUTCDay() || 7;
  return addDays(date, 1-weekday);
}
export function calendarOccurrences(events, from, to) {
  if (!validDate(from) || !validDate(to) || to < from || (Date.parse(to)-Date.parse(from))/86400000 > 92) fail('Bitte einen Kalenderzeitraum von höchstens 93 Tagen wählen.');
  const result = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const weekday = new Date(day+'T12:00:00Z').getUTCDay() || 7;
    for (const event of events) {
      if (day < event.startDate || (event.endDate && day > event.endDate)) continue;
      if (event.repeat === 'once' ? day !== event.startDate : !event.weekdays.includes(weekday)) continue;
      result.push({...event, date: day});
    }
  }
  return result.sort((a,b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title));
}
