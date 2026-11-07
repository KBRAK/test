# Zuhause · Haushaltshelfer

Responsive Familienverwaltung für PC und Handy: gemeinsame Familienprofile, Kalender, Verträge und Fahrzeugdaten auf einem Server; Haushalt, Vorräte und Einkauf weiterhin lokal im Browser.

## Schnellstart

Node.js **ab 22.13**, empfohlen Node.js 24. SQLite ist in Node.js enthalten; keine Node-Paketinstallation oder externe Datenbank nötig. Für PDF-/OCR-Verarbeitung werden zusätzliche Serverwerkzeuge benötigt, siehe Dokumentenmodul.

```sh
git clone https://github.com/KBRAK/test.git
cd test
npm start
```

Der Server hört standardmäßig nur auf dem lokalen Rechner, Port 3000. Die Familien-Datenbank wird beim Start in `data/family.sqlite` angelegt. Auf demselben Rechner ist ohne konfiguriertes Passwort keine Anmeldung nötig.

## Familienprofile und persönliche Kalender

- Vorname, Nachname, optionaler Rufname, Geburtsdatum und Familienrolle.
- Lieblingsgerichte und Zutaten, Abneigungen, bevorzugte Küchen, Ernährungsweise und ausführliche Essensvorlieben.
- Unverträglichkeiten / Allergien sowie ergänzende Hinweise; kein medizinischer oder automatischer Zutatenabgleich.
- Kindergarten oder Schule mit Name, Adresse, Kontakt, Gruppe/Klasse und Notizen.
- Persönlicher Kalender für jedes Mitglied: Schule, Kindergarten, Sport und sonstige Termine.
- Einzeltermine oder wöchentliche Serien mit Wochentagen und Gültigkeitszeitraum, Beginn, Ende, Losgeh-/Abfahrtszeit, Ort/Verein, Kontakt und Ausrüstungshinweisen.
- Wochenübersicht für ein Mitglied oder die gesamte Familie; Zeitüberschneidungen innerhalb eines persönlichen Kalenders werden markiert.
- Profile und Termine bearbeiten/löschen. Beim Löschen eines Mitglieds werden dessen Termine nach Bestätigung mitgelöscht.
- Schutz vor dem Überschreiben neuerer Änderungen anderer Geräte. „Aktualisieren“ lädt die aktuellen Serverdaten; keine Hintergrundaktualisierung während der Eingabe.

Uhrzeiten sind lokale Kalenderzeiten des Familienstandorts, ohne automatische Umrechnung für Reisende. Termine liegen innerhalb eines Kalendertags. Ferien, Feiertage, Ausfalltage, einzelne Ausnahmen in Serien, Benachrichtigungen und automatische Erinnerungen sind noch nicht enthalten. Eine Serienänderung gilt für die gesamte Serie.

## Dokumente und persönliche Erinnerungen

Die Browseroberfläche über **Dokumente öffnen** in der Hauptnavigation starten. Der eigene Bereich liegt unter `/dokumente` und bietet Suche, Status-/Bereichsfilter, Drag-and-drop-Upload, Originalvorschau, Prüfansichten, Freigaben und persönliche Erinnerungen.

PDFs, Bilder (PNG/JPEG) und UTF-8-Textdateien können lokal ausgelesen und auf Kosten, Zahlungsdaten, Anbieter und Referenzen geprüft werden. Original, Text und Fundstellen bleiben erhalten. Beträge und Termine werden erst nach ausdrücklicher manueller Bestätigung für Erinnerungen genutzt.

Der Dokumentenbereich hat persönliche Konten und Freigaben pro Dokument. Das gemeinsame Familienpasswort allein erlaubt keinen Zugriff auf private Dokumente. Das erste persönliche Administratorkonto direkt am Familienserver einrichten; weitere Konten können anschließend in der Oberfläche angelegt werden. Nur der Eigentümer verwaltet Angaben und Rechte. Erinnerungsempfänger müssen weiterhin ein Leserecht besitzen.

Erinnerungen erscheinen vorerst in der Anwendung, ohne E-Mail-/Push-Versand oder Bankzahlung. Private Dokumentdaten werden nicht automatisch in die allgemeine Kostenverwaltung kopiert. Die bisherigen drei JSON-Backups enthalten keine privaten Dokumente; dafür Original-/Dokumentexport oder vollständige SQLite-Sicherung verwenden.

[Bedienung, Rechte, OCR-Installation und Sicherung](docs/documents.md). Die aktuellen Grenzen sind 10 MB pro Datei und 20 PDF-Seiten. Deutsche OCR-Sprachdaten lassen sich bei vorhandenen Werkzeugen über `npm run setup:ocr` installieren.

## Versicherungen, Fahrzeuge und laufende Kosten

Der Bereich **Verträge, Kosten und Fahrzeuge** speichert seine Daten gemeinsam auf demselben Familienserver. Dieser gemeinsame Bereich benötigt keine zweite Anmeldung oder externe Datenbank. Persönliche Dokumente haben dagegen einen zusätzlichen persönlichen Zugang. Kategorien: Versicherungen, PKW, Wohnen, Energie, Müll, Wasser und Sonstiges. Der unklare Begriff „Moderation“ ist noch keiner eigenen Kategorie zugeordnet; „Wohnen“ ist vorläufig aufgenommen, frei benannte Kostenposten sind unter „Sonstiges“ möglich.

**Verträge / Kostenposten:** Bezeichnung, Anbieter/Versicherung/Behörde, Vertrags- oder Kundennummer, Vertragspartner, Kontakt, Betrag je Fälligkeit in EUR, Zahlungsweise, Rhythmus (einmalig, monatlich, vierteljährlich, halbjährlich, jährlich), erste und optional letzte Fälligkeit. Ergänzend Leistungsumfang/Tarif, Zähler- oder Behälternummer, Kündigungsdatum und ein manuell gepflegter Sachtermin, etwa Müllabfuhr oder Zählerablesung. Versicherungen und Fahrzeugkosten können mit einem PKW verknüpft werden.

**Fahrzeuge:** Bezeichnung, Kennzeichen, Hersteller, Modell, Fahrgestellnummer, Erstzulassung, HU/TÜV-Monat, Kilometerstand, nächste Wartung nach Datum bzw. Kilometerstand und Notizen. HU/TÜV-Fristen werden bis zum letzten Tag des eingegebenen Monats angezeigt. Nach erfolgter Prüfung selbst den nächsten Termin eintragen; die Anwendung erfindet keine Prüffristen.

**Zahlungen:** Monatsplanung, offene Fälligkeiten bis einen Monat voraus und Rückstände. Die erste hier geführte Fälligkeit ist der Beginn der Dokumentation: Bei einem laufenden Vertrag die nächste noch offene Fälligkeit eingeben, wenn frühere Zahlungen nicht nachgetragen werden sollen. Monatsserien behalten den ursprünglichen Monatstag; der 31. wird in kurzen Monaten auf den letzten Tag begrenzt und bleibt im Folgemonat wieder der 31. Keine Verschiebung auf Bankarbeitstage.

Zahlungen können vollständig oder teilweise dokumentiert werden. Der Server verhindert Überbuchungen und veraltete parallele Buchungen. Falsche Zahlungseinträge lassen sich nach Bestätigung entfernen; der Betrag wird wieder offen. Keine Bankanbindung, keine Überweisung, keine automatische Erkennung von Lastschriften. „Offen“ heißt nur: nicht als bezahlt dokumentiert.

Geldbeträge werden in ganzen Cent gespeichert. Sobald Zahlungen vorliegen, sind Betrag, Rhythmus und erste Fälligkeit des Kostenpostens geschützt. Für geänderte Konditionen den bisherigen Posten mit letzter Fälligkeit beenden und einen neuen anlegen. Ein Fahrzeug mit verknüpften Kostenposten kann erst nach Auflösen der Verknüpfungen gelöscht werden. Das Löschen eines Kostenpostens löscht nach ausdrücklicher Bestätigung auch dessen Zahlungshistorie.

## Gemeinsamer Zugriff über einen Familienserver

Alle Geräte müssen dieselbe Serveradresse verwenden. Für einen Netzwerkzugriff sind `HOST=0.0.0.0` und ein **`FAMILY_ACCESS_KEY` mit mindestens 16 Zeichen** erforderlich. Den Wert sicher in der Serverumgebung setzen, nicht in Git einchecken. Anschließend `npm start` mit diesen Umgebungsvariablen starten. In der Oberfläche das Familienpasswort eingeben; es bleibt nur im Arbeitsspeicher der geöffneten Seite. Beim Neuladen erneut verbinden.

Weitere Einstellungen:

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind-Adresse |
| `PORT` | `3000` | Serverport |
| `FAMILY_DB_PATH` | `data/family.sqlite` | Dauerhafter SQLite-Dateipfad |
| `FAMILY_ACCESS_KEY` | nicht gesetzt | Gemeinsames Familienpasswort; für Netzwerkzugriff erforderlich |

Für dauerhaften Betrieb genau eine Serverinstanz, ein persistentes Datenverzeichnis und HTTPS über einen Reverse Proxy verwenden. Dieser muss den `Host`-Header beibehalten und darf API-Antworten nicht cachen. Das Familienpasswort berechtigt zum Lesen und Ändern aller Familienprofile, Kalender, Verträge, Zahlungen und Fahrzeuge. Individuelle Nutzerkonten, Rollen und mehrere getrennte Haushalte sind noch nicht enthalten. Ohne Passwort werden API-Anfragen nur von Loopback und mit lokalem Hostnamen akzeptiert; Cross-Origin-Anfragen werden abgewiesen.

Die Umsetzung ist lokal mit echtem Server und Chromium geprüft. Ein öffentlich erreichbarer, dauerhafter Server oder eine Domain wird durch dieses Repository nicht eingerichtet.

## Bisherige lokale Daten

Vorräte, Haushalt, Einkauf und die ältere Bewohnerliste bleiben in `localStorage` des jeweiligen Browserprofils. Sie werden nicht zwischen Geräten synchronisiert. „Bisherige lokale Bewohner übernehmen“ kopiert Namen und Unverträglichkeiten in die gemeinsame Datenbank. Wiederholte Übernahme derselben Kennungen erzeugt keine Duplikate. Der bisherige Name wird als Vorname übernommen; Nachnamen anschließend ergänzen. Die alte Liste bleibt erhalten und wird nicht laufend mit der Datenbank abgeglichen.

Unverträglichkeiten aus geladenen Familienprofilen werden zusätzlich beim Einkauf angezeigt. Nach Änderungen auf einem anderen Gerät hierfür „Aktualisieren“ verwenden. Gleiche Personen in alter Liste und Datenbank können bis zur manuellen Bereinigung doppelt erscheinen.

## Vorräte und Einkauf

Lebensmittel mit Menge, Einheit, Lagerort und optionalem Haltbarkeitsdatum erfassen. „1 Einheit verbrauchen“ reduziert mindestens bis null. „Nachkaufen“ legt einen separaten Einkaufsbedarf an; wiederholte Aktionen erzeugen separate Einträge. „Als gekauft markieren“ verändert nur den Listenstatus, nicht den Bestand. Eingaben anderer lokaler Formulare bleiben beim Speichern erhalten.

## Sicherung und Wiederherstellung

Es gibt **drei getrennte Backups**:

1. **Familienbackup** unter „Übernahme und Sicherung“: enthält sämtliche gemeinsamen Familienprofile und Kalender. Die Wiederherstellung überträgt die Datei an den Familienserver und ersetzt nach Bestätigung dessen Daten atomar. Zwischenzeitliche Änderungen anderer Geräte blockieren eine Wiederherstellung bis zum Neuladen. Format `zuhause-family`, Version 1.
2. **Haushaltsbackup** unter „Backup“: enthält lokale Haushaltsdaten, ältere Bewohner, Vorräte und Einkauf; keine Serverprofile oder Kalender. Die Datei bleibt beim Import im Browser. Haushaltsdatenformat Version 1.

3. **Verwaltungsbackup** im Verwaltungsbereich: enthält Fahrzeuge, Kostenposten und Zahlungshistorie. Wiederherstellung ersetzt diese Daten nach Bestätigung atomar; Familienprofile, Kalender und lokale Haushaltsdaten bleiben erhalten. Format `zuhause-administration`, Version 1.

JSON-Dateien dürfen höchstens 5 MB groß sein. Ungültige Dateien, abgebrochene Bestätigungen und Speicherfehler verändern die bisherigen Daten nicht. Ungespeicherte Formulareingaben sind nicht in Backups enthalten. Alle Backup-Dateien enthalten persönliche Angaben unverschlüsselt. Es gibt keine automatische Sicherung.

Für eine serverseitige Dateisicherung den Server sauber stoppen und dann die SQLite-Datei kopieren; bei einer laufenden WAL-Datenbank nicht nur die Hauptdatei kopieren. Nach einem Restore aus einer Dateisicherung alle Clients neu laden. `data/` und SQLite-Journaldateien werden von Git ausgeschlossen. In verwalteten Umgebungen zusätzlich einen persistenten Datenträger bzw. deren Sicherungsfunktion nutzen.

## Prüfen

```sh
npm test
npm run check
npm run test:browser
```

Der Browser-Test benötigt Headless-Chromium. Unter Linux wird bevorzugt `/usr/lib/chromium/chromium` verwendet; `CHROMIUM_PATH` überschreibt den Pfad. Browser-Tests laufen über die lokale DevTools-Schnittstelle. Ohne `RUN_BROWSER_TESTS=1` werden sie beim normalen `npm test` als übersprungen ausgewiesen. Mit `RUN_BROWSER_TESTS=1 npm test` werden alle Tests einschließlich Browserabläufen ausgeführt.

Tests decken unter anderem Datenbankpersistenz nach Neustart, Mehrgeräte-Konflikte, Datums-/Zeitvalidierung, Kalenderwiederholungen, Bewohnerübernahme sowie Backups ab. Die Browserabläufe prüfen Profil- und Terminerfassung, persönliche Kalender, Mobilansicht, Backups und Erhalt ungespeicherter Eingaben.

## Struktur

```text
server.js                    HTTP-Server und Familien-API
backend/family-store.js       SQLite-Schema, Familienprofile und Transaktionen
backend/administration-store.js Verträge, Fahrzeuge und Zahlungen
backend/document-store.js      Persönliche Konten, Dokumente, Rechte und Erinnerungen
backend/document-extraction.js PDF- und Bildtexterkennung
src/documents-app.js           Persönliche Dokumentenoberfläche
src/administration-app.js     Verwaltungsoberfläche
src/domain/administration.js  Zahlungspläne, Centbeträge und Fristen
src/family-app.js             Familienprofile und Kalenderoberfläche
src/domain/family.js          Profilvalidierung und Kalenderlogik
src/app.js                    Lokale Haushalts-, Vorrats- und Einkaufsoberfläche
src/domain/household.js       Lokale Haushaltslogik
src/storage/                 Lokaler Speicher und Haushaltsbackup
src/ui/styles.css            Responsive Darstellung
tests/                       Fachlogik-, Datenbank-, API- und Browserprüfungen
```

[Architektur](docs/architecture.md) · [Roadmap](docs/roadmap.md)

## KI-Entwicklerteam

Ein separates Mehragenten-Kommando koordiniert Planung, Architektur, Entwicklung, QA und Review über die Codex-CLI:

```sh
npm run team -- --demo "Prüfe die Anwendung"
```

Für echte Entwicklung `--demo` weglassen. Voraussetzungen, Protokolle und Grenzen: [Entwicklerteam](docs/dev-team.md).
