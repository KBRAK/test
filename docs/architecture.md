# Architektur: gemeinsamer Familienserver und lokale Haushaltsdaten

Die ursprüngliche reine Browserarchitektur wird um eine gemeinsame SQLite-Datenbank für Familienprofile und Kalender ergänzt. Vorräte, Einkauf und die bestehende lokale Bewohnerliste bleiben unverändert im Browser. Keine Frameworks, Paketinstallation oder Build-Schritte. Node.js >=22.13 stellt HTTP und SQLite bereit; empfohlen ist Node.js 24.

## Gemeinsame Daten

`backend/family-store.js` verwaltet eine SQLite-Datei (Standard `data/family.sqlite`) mit WAL, Fremdschlüsseln und Transaktionen. Die Tabellen sind `members` (Kennung, Version, validiertes Profil als JSON, optionale Kennung aus der Bewohnerübernahme), `events` (Kennung, Mitglied-Fremdschlüssel, Version, validierte Termindaten als JSON) und `metadata` (Datenrevision). Die Verwaltungserweiterung des SQLite-Schemas ergänzt die Tabellen `vehicles`, `obligations` und `payments` ohne Änderungen bestehender Familienprofile; neuere unbekannte Fassungen werden abgewiesen. Eine Serverinstanz pro Datei betreiben.

Profile enthalten Vor-/Nachname, Rufname, Geburtsdatum, Familienrolle, Lieblingsgerichte/Zutaten, Abneigungen, Küchen, Ernährungsweise, Essensnotizen, Unverträglichkeiten und ergänzende Hinweise, Schule/Kindergarten mit Adresse und Kontakt sowie allgemeine Notizen. Optionales Geburtsdatum muss ein reales Datum sein und darf nicht in der Zukunft liegen. Fehlende Angaben bleiben leer; es werden keine persönlichen Daten erfunden.

Termine gehören zwingend zu genau einem Mitglied. Typen: Schule, Kindergarten, Sport, Sonstiges. Einzeltermine oder wöchentliche Serien mit Anfangsdatum, optionalem Enddatum, Wochentagen, Beginn, Ende, optionaler Losgehzeit, Ort/Verein, Kontakt und Notizen. Das Löschen eines Mitglieds löscht zugehörige Termine per Fremdschlüssel. Servervalidierung ist unabhängig von HTML-Formularprüfungen.

Kalender berechnen Vorkommen aus lokalen Kalenderdaten und Uhrzeiten, ohne UTC-Verschiebung der Termine. UTC wird nur für die Arithmetik von Kalendertagen verwendet. Die Wochenansicht reicht von Montag bis Sonntag. Überschneidungen werden pro Mitglied markiert. Keine Ferienlogik, Serienausnahmen, mehrtägigen Termine oder Erinnerungsdienste.

## API und gleichzeitige Bearbeitung

- `GET /api/family`: Profile, Termine und Datenrevision.
- `POST /api/family/members`; `PUT/DELETE /api/family/members/:id`.
- `POST /api/family/members/:id/events`; `PUT/DELETE /api/family/events/:id`.
- `POST /api/family/migrate`: wiederholbare Übernahme lokaler Bewohner über deren bisherige Kennung.
- `GET /api/family/backup`; `POST /api/family/restore`.

Updates tragen die zuletzt geladene Datensatzversion im JSON; Löschungen im `If-Match`-Header. Abweichungen ergeben HTTP 409. Ein Restore vergleicht die gesamte Datenrevision und ersetzt die Daten innerhalb einer Transaktion; Kennungen bleiben erhalten, Datensatzversionen werden erhöht. Bestehende Übernahmekennungen bleiben auch nach JSON-Restore erhalten. Profile/Termine werden nach erfolgreichen Aktionen neu geladen; es gibt kein automatisches Polling während der Eingabe.

Passwortauthentifizierung über `Authorization: Bearer ...` mit `FAMILY_ACCESS_KEY`. Das Passwort bleibt im Browser nur im Arbeitsspeicher. Schlüssel werden nicht in URLs, Datenbank oder Backups geschrieben. Netzwerk-Bindung benötigt mindestens 16 Zeichen; ohne Schlüssel gilt nur Loopback-Zugriff mit lokalem Hostnamen. Origin-Prüfung, begrenzte Anfragen, Login-Ratenbegrenzung und `Cache-Control: no-store` schützen die API. Für Netzwerkbetrieb TLS am Reverse Proxy konfigurieren und Host-Header erhalten. Das gemeinsame Passwort hat volle Familienrechte; mehrere Nutzerrollen/Haushalte sind nicht implementiert.

## Lokale Daten und Übergang

Das Haushaltsformat Version 1 bleibt bestehen: Haushalt, Bewohner, Vorrat, Einkauf. `src/storage/local.js` und `src/storage/backup.js` speichern/prüfen dieses Format. Vorhandene Daten werden nicht automatisch verändert. Bewohnerübernahme kopiert nur Namen und Unverträglichkeiten; die alte Liste wird nicht gelöscht oder synchronisiert. Bei einem bisherigen vollständigen Namen wird keine unzuverlässige automatische Trennung vorgenommen.

Die Familienoberfläche nutzt einen eigenen DOM-Bereich; lokale Formulare bleiben bei deren Speicherung erhalten. Nach dem Laden der Serverprofile erhalten die lokalen Einkaufshinweise die gemeinsamen Unverträglichkeiten über ein internes Ereignis. Beide Backups sind getrennt und entsprechend beschriftet.

## Betrieb und Grenzen

Die SQLite-Datei benötigt dauerhaften Speicher. Eine JSON-Sicherung enthält Familienprofile und Kalender, keine Schlüssel. Für Dateisicherung bei laufendem WAL-Betrieb SQLite-Backup-Verfahren nutzen oder den Server vor dem Kopieren stoppen. Browserdatenlöschung entfernt lokale Haushaltsdaten, nicht die Serverdaten. Offline-Änderungen an Serverprofilen werden nicht gepuffert. Weiterer Ausbau: individuelle Konten/Rollen, Ferienausnahmen, Erinnerungen, gemeinsame Vorratsdaten und Offline-Synchronisierung.


## Verwaltung: Verträge, Fahrzeuge und Zahlungen

`backend/administration-store.js` ergänzt die bestehende Datenbank um Fahrzeuge, Kostenposten/Verträge und einzelne Zahlungsbuchungen. `obligations.vehicle_id` ist ein optionaler Fremdschlüssel mit Löschschutz, `payments.obligation_id` ein verpflichtender Fremdschlüssel mit kaskadierender Löschung. Änderungen laufen über dieselben Transaktionen und die globale Datenrevision. Die Schemaerweiterung ist wiederholbar und erhält Daten aus Schema 1. Neuere unbekannte Datenbankschemata werden weiterhin abgewiesen.

API-Basis `/api/administration`: GET liefert `vehicles`, `obligations`, `payments` und `revision`; POST/PUT/DELETE für `vehicles` und `obligations`; POST `obligations/:id/payments`, DELETE `payments/:id`; GET `backup`, POST `restore`. Derselbe Passwort- und Origin-Schutz wie für Familienprofile. Der gemeinsame Browser-API-Client hält das Familienpasswort nur im Arbeitsspeicher.

Beträge werden als positive Ganzzahlen in EUR-Cent gespeichert. Wiederholungen werden aus erster Fälligkeit und Monatsintervall berechnet; kurze Monate verändern den ursprünglichen Ankertag nicht. Zahlungen referenzieren eine konkrete gültige Fälligkeit. Teilzahlungen werden summiert, übersteigende Zahlungen zurückgewiesen. Zahlungserfassung prüft die geladene Version des Kostenpostens und erhöht sie, sodass doppelte parallele Vollzahlungen nicht beide durchgehen können. Zahlungslöschungen öffnen den entsprechenden Restbetrag erneut.

Betrag, erste Fälligkeit und Rhythmus bleiben nach einer Buchung geschützt; das Enddatum darf keine gebuchten Fälligkeiten ausschließen. Für neue Konditionen einen neuen Kostenposten verwenden. Die Übersicht zeigt den laufenden Monat als Planung, offene Fälligkeiten bis einen Monat voraus sowie Rückstände. Keine Bankanbindung, Verbuchung von Zinsen, automatische Überweisungen, Feiertagsverschiebung oder Steuerberechnung.

Sachtermine: manuelle nächste Aktion und Kündigungsdatum je Vertrag, HU/TÜV-Monat sowie Wartungsdatum je Fahrzeug. HU wird als Monatsenddatum angezeigt. Kein automatisches Erledigen, Fortschreiben oder Versenden von Erinnerungen. Weitere Müllabfuhr-/Zählertermine werden manuell aktualisiert. Serienausnahmen oder kommunale Abfuhrkalender sind nicht angebunden.

Das Verwaltungsbackup ist ein drittes, getrenntes Format (`zuhause-administration`, Version 1). Ein Restore validiert Kennungen, Relationen, Zahlungspläne und Summen vollständig vor dem Ersetzen der Verwaltungsdaten. Bei einem Fehler wird die Transaktion zurückgerollt. Familien-/Haushaltsbackup und Verwaltungsbackup werden jeweils nur in ihrem Bereich eingespielt; Familien-Restore berührt Verwaltungsdaten nicht und umgekehrt. Die globale Revision schützt konservativ auch gegen Änderungen in anderen Serverbereichen während eines Restore-Dialogs.


## Persönliche Dokumente (Schema 3)

Das Dokumentenmodul ergänzt getrennte persönliche Konten und ACL pro Dokument. Es verwendet die vorhandene SQLite-Datei, aber keine pauschale Übernahme in die gemeinsamen Kostenposten. Passwortschutz des Familienservers bleibt erste Zugangsschranke, persönliche Sitzung und Dokumentrechte die zweite. Details zu Tabellen, Extraktion, Finanzfeldern, Erinnerungsberechnung und Betriebsgrenzen stehen in [Dokumentenmodul](documents.md).

Persönliche Originale, Text, Vorschläge und Fakten sind in Liste, Detail, Originaldownload und Export stets durch Eigentümer-/Leserprüfung geschützt. Nur der Eigentümer bestätigt Fakten oder ändert Rechte. Dokumentadministratoren verwalten Konten ohne pauschales Leserecht. Erinnerungsempfänger werden beim Bestätigen, beim Rechteentzug und erneut beim Abruf geprüft. Deaktivierte Konten und widerrufene Sitzungen erhalten keine API-Daten. Logout während einer laufenden OCR verhindert auch die nachträgliche Speicherung.

Die bisher gemeinsam zugänglichen JSON-Backups der Familie und Verwaltung enthalten keine Dokumentkonten oder Dokumentdaten. Eine vollständige SQLite-Sicherung umfasst diese weiterhin. Die Migration von Schema 1/2 auf 3 legt nur zusätzliche Tabellen an; unbekannte neuere Schemas werden abgewiesen.
