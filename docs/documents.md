# Dokumente, strukturierte Daten und persönliche Erinnerungen

Das Modul verarbeitet Dokumente lokal auf dem Familienserver. Es lädt keine Originale oder Texte zu einem externen KI-/OCR-Dienst hoch. Die Analyse verwendet nachvollziehbare Textmuster; sie ist keine allgemeine KI-Interpretation und keine rechtliche Dokumentprüfung.

## Browseroberfläche

Die eigenständige Oberfläche ist über die Hauptnavigation **Dokumente** bzw. den Pfad `/dokumente` erreichbar. Sie verwendet dieselben Serverdaten und persönlichen Konten wie der eingebettete Bereich der Haushaltsübersicht.

- **Alle Dokumente / Zu prüfen / Geprüft / Mit mir geteilt:** persönliche Ablage mit Status, bestätigtem Betrag und Fälligkeit. Suche über Dokumenttitel, Dateiname und bestätigte Anbieter/Referenzen; Filter für bestätigte Bereiche und noch nicht zugeordnete Entwürfe. Sortierung nach neuestem Dokument, Titel oder bestätigter Fälligkeit.
- **Upload:** Datei auswählen oder genau eine Datei in den markierten Bereich ziehen. Dateiname und Größe werden angezeigt. Erst „Auslesen & analysieren“ überträgt und verarbeitet die Datei. Währenddessen erscheint eine laufende Fortschrittsanzeige ohne erfundene Prozentangabe.
- **Dokumentdetails:** Ansichten für Angaben, Fundstellen, Dokumenttext, Originalvorschau und Eigentümer-Freigaben. Die Ansichten lassen sich mit Tab sowie Pfeiltasten, Pos1 und Ende bedienen. Ungespeicherte Eingaben bleiben bei Suche, Filtern und Wechsel zwischen Dokumentansichten erhalten. Ein Wechsel zu einem anderen Bereich oder Dokument fragt bei ungespeicherten Angaben nach.
- **Vorschau:** Text wird als Text angezeigt, Bilder werden eingeblendet und PDFs mit dem integrierten Browser-PDF-Betrachter geöffnet. Die Originaldatei wird hierfür nach erneuter persönlicher Rechteprüfung geladen. Bei Browsern ohne eingebetteten PDF-Betrachter steht der Originaldownload bereit. Vorschau-URLs werden beim Wechsel oder Abmelden entfernt.
- **Erinnerungen:** persönliche Fälligkeiten ansehen, das zugehörige Dokument öffnen oder den eigenen Hinweis erledigen.
- **Konto / Konto & Nutzer:** persönliches Passwort ändern; Administratoren legen weitere Konten an oder deaktivieren sie.

Auf der eigenständigen Seite wird bei Bedarf zuerst das Familienpasswort und anschließend der persönliche Zugang abgefragt. Bei lokalem Betrieb ohne gesetztes Familienpasswort entfällt der erste Schritt. Es werden keine Zugangsdaten im Browser gespeichert. Desktop und schmale Bildschirme werden unterstützt.

## Bedienung

1. Mit dem bisherigen Familienpasswort verbinden.
2. Beim ersten Einsatz direkt am Familienserver über den lokalen Host das erste persönliche Dokument-Administratorkonto anlegen. Danach mit diesem persönlichen Konto anmelden. Passwörter nicht in Chat oder Git eingeben, sondern in der Oberfläche.
3. PDF, PNG, JPEG oder UTF-8-TXT hochladen. Original, Text, Erkennungsvorschläge und Fundstellen werden zunächst als **ungeprüfter Entwurf** gespeichert.
4. Bei Bedarf weitere persönliche Konten anlegen und diesen Leserechte für das ausgewählte Dokument geben. Ein Dokument bleibt standardmäßig privat.
5. Anbieter, Referenz, EUR-Betrag, erste Fälligkeit, Rhythmus, optionales Ende und Kündigungstermin mit dem Original vergleichen. Unbekannte Werte dürfen leer bleiben. Relative Zahlungsfristen oder mehrere gleichwertige Beträge/Termine benötigen manuelle Prüfung.
6. Erinnerungsvorlauf (0–90 Tage) und aktuell berechtigte Empfänger wählen. Die Prüfung ausdrücklich bestätigen und speichern. Erst jetzt entstehen Zahlungserinnerungen.

Kosten werden als ganze EUR-Cent gespeichert, Datumsspalten als ISO-Kalenderdaten. Ein fehlender oder mehrdeutiger Wert wird nicht erfunden. Gutschriftzeilen werden nicht als positive Zahlungsforderung übernommen. Die automatische Erkennung unterstützt vor allem deutsche Angaben wie „Gesamtbetrag“, „Zahlbar bis“, „Zahlungsziel“, „Vertragsnummer“ und gängige Zahlungsrhythmen. Ohne bekannten Rhythmus wird ausschließlich der bestätigte einzelne Termin berücksichtigt. Jährliche/monatliche Serien folgen dem bestätigten Datum, einschließlich Monatsend- und Schaltjahrbehandlung.

Die private Dokumentablage enthält die strukturierten Angaben in derselben SQLite-Datenbank wie die Familienverwaltung. Sie kopiert diese Angaben nicht automatisch in die mit dem gemeinsamen Familienpasswort für alle zugänglichen Verträge und Kostenposten. Dadurch bleiben Dokumente und ihre Finanzdaten auf die ausdrücklich berechtigten Nutzer begrenzt.

## Rechte und Anmeldung

Der bisherige gemeinsame Familienzugang bleibt für Familienprofile, Kalender, Fahrzeuge und allgemeine Kostenverwaltung bestehen. **Die persönlichen Rechte dieses Moduls gelten für Dokumente und deren Erinnerungen**, nicht rückwirkend für alle übrigen Bereiche.

- Jedes Dokument hat genau einen Eigentümer. Dieser darf Fakten bestätigen, Freigaben ändern und das Dokument löschen.
- Freigegebene persönliche Konten dürfen Original, Text, Vorschläge und bestätigte Angaben lesen/exportieren. Sie dürfen keine Eigentümerangaben oder Freigaben ändern.
- Dokumentadministratoren dürfen Konten anlegen und andere Konten deaktivieren. Sie erhalten dadurch kein automatisches Leserecht auf fremde Dokumente.
- Der Eigentümer darf Erinnerungsempfänger nur unter den aktuell berechtigten aktiven Konten wählen.
- Entzug einer Freigabe entfernt die Zuordnung zu künftigen Erinnerungen. API-Anfragen einschließlich Originaldownload, Export und Erinnerungsabruf prüfen die aktuellen Rechte erneut. Bereits außerhalb des Systems gespeicherte Dateien können nicht zurückgerufen werden.
- Deaktivierung beendet alle persönlichen Sitzungen dieses Kontos. Das eigene Konto kann nicht versehentlich über diese Funktion deaktiviert werden. Eine Reaktivierungsoberfläche ist noch nicht enthalten.

Persönliche Passwörter sind 12–256 Zeichen lang und werden mit individuellem Zufallssalz über scrypt gehasht. Sitzungstoken werden nur im Arbeitsspeicher der geöffneten Browserseite gehalten; die Datenbank enthält nur ihre Hashwerte mit maximal zwölf Stunden Gültigkeit. Neuladen erfordert erneute persönliche Anmeldung. Passwortänderung beendet alle persönlichen Sitzungen des Kontos. Anmeldung und Erstkonfiguration sind gegen wiederholte Versuche bzw. erneutes Überschreiben geschützt. Das erste Konto wird nur einmalig und nur über Loopback mit lokalem Hostnamen angelegt.

Eine Benutzerverwaltung kann Anfangspasswörter für neue Konten vergeben. Neue Nutzer sollten diese persönlich ändern. Selbstständiges Passwort-Zurücksetzen, Reaktivierung und Eigentümerübertragung sind noch nicht implementiert; ein verlorenes einziges Administratorkonto benötigt serverseitige Wiederherstellung durch den Betreiber.

## Erinnerungen

„Deine offenen Zahlungserinnerungen“ zeigt nur Hinweise, bei denen das persönliche Konto als Empfänger eingetragen ist **und weiterhin Leserecht hat**. Die Rechte werden bei jedem Abruf geprüft, nicht nur beim Anlegen. Grundlage sind bestätigte Zahlungsdaten. Entwürfe erzeugen keine Hinweise.

Der Standardvorlauf beträgt sieben Tage. Angezeigt werden bevorstehende Fälligkeiten innerhalb dieses Vorlaufs sowie nicht erledigte Fälligkeiten aus dem letzten Jahr. Tagesgrenzen der serverseitigen Erinnerungsberechnung gelten für Europe/Berlin. „Erinnerung erledigen“ blendet nur den eigenen Hinweis zur jeweiligen Fälligkeit aus. Es ist keine tatsächliche Zahlung und keine Buchung in der gemeinsamen Zahlungshistorie. Andere Empfänger behalten ihren Hinweis. Bei Änderung des Zahlungsplans oder Betrags werden bisherige Erledigt-Markierungen zurückgesetzt; reine Notizänderungen tun dies nicht.

Aktuell handelt es sich um **Erinnerungen in der geöffneten Anwendung nach Aktualisierung**. Es gibt noch keinen Hintergrunddienst, E-Mail-, Push- oder SMS-Versand. Ein künftiger Versanddienst muss denselben aktuellen Berechtigungs- und Empfängercheck verwenden; ein alter Empfänger-Snapshot darf nicht ungeprüft versendet werden.

## Dokumentauslesung und Grenzen

- Maximal 10 MB je Datei und 20 Seiten je PDF.
- Originaldateien werden als BLOB in SQLite gespeichert, nicht öffentlich als statische Dateien ausgeliefert. Downloads erfolgen als Attachment nach persönlicher Rechteprüfung.
- PDF-Textschicht: Poppler `pdfinfo` / `pdftotext`.
- Textarme PDF-Seiten: Rendering mit `pdftoppm`, anschließend Tesseract-OCR. Auf textreichen Seiten werden eingebettete Bildbestandteile nicht zusätzlich vollständig per OCR interpretiert; entsprechender Hinweis wird angezeigt.
- PNG/JPEG: lokale Tesseract-OCR; maximal 25 Megapixel und höchstens 10.000 Pixel je Bildseite.
- Verschlüsselte, beschädigte, inkompatible oder leere Dateien werden abgelehnt. DOCX, Tabellen und andere Formate sind noch nicht unterstützt.
- Maximal 200.000 extrahierte Textzeichen; bei Überschreitung wird nicht stillschweigend abgeschnitten. Fundstellen sind auf 100 je Feld begrenzt, mit manuellem Prüfhinweis bei Überschreitung.
- Höchstens zwei gleichzeitige Auslesevorgänge. Temporäre Dateien werden nach der Verarbeitung entfernt. Pro persönlichem Konto gelten 500 Dateien bzw. 200 MB Originalspeicher.
- OCR kann Zahlen, Umlaute, Tabellen, Schräglagen und handschriftliche Inhalte falsch erkennen. Keine automatische Bestätigung oder Zahlung aus OCR-Ergebnissen.

## Serverwerkzeuge installieren

Die normale Anwendung benötigt weiterhin keine Node-Paketinstallation. PDF-/OCR-Funktionen benötigen zusätzlich Poppler und Tesseract. Auf Debian/Ubuntu kann der Betreiber mit Systemrechten installieren:

```sh
apt-get install poppler-utils tesseract-ocr tesseract-ocr-deu tesseract-ocr-eng
```

Wenn die Werkzeuge bereits vorhanden sind, aber das deutsche Sprachpaket fehlt, gibt es eine Installation ohne Systemrechte:

```sh
sh tools/install-document-ocr.sh
```

Das Skript bezieht ausschließlich `deu.traineddata` und `eng.traineddata` aus dem offiziellen Repository `tesseract-ocr/tessdata_fast`, gepinnt auf Commit `87416418657359cb625c412a48b6e1d6d41c29bd`. Git-Objektprüfung und `git fsck` prüfen die Integrität. Die Sprachdaten landen unter dem von Git ignorierten Verzeichnis `data/ocr/tessdata`. Die Laufzeit verwendet dieses Verzeichnis automatisch. `OCR_TESSDATA_DIR` kann einen anderen Sprachdatenpfad auswählen. Fehlt Deutsch, wird mit sichtbarem Warnhinweis das vorhandene englische Modell verwendet. Fehlen die eigentlichen Werkzeuge, bleibt TXT nutzbar; PDF-/Bildverarbeitung meldet den fehlenden Serverbestandteil.

In dieser Cloud-Instanz wurden PDF-Text, deutsche OCR für Bilder und Scan-PDFs und die Sprachdateninstallation erfolgreich geprüft. Werkzeuge, Sprachdateien und ein dauerhafter Datenpfad müssen auch auf einem späteren Server vorhanden sein. HTTPS für den Netzwerkbetrieb bleibt erforderlich. Die Installation veröffentlicht keine Anwendung.

## Speicherung, Sicherung und Migration

SQLite-Schema 3 ergänzt `document_users`, `document_sessions`, `documents`, `document_grants`, `document_facts`, `document_reminder_ack` und `document_audit`. Bestehende Familien-, Kalender- und Verwaltungsdaten bleiben erhalten. Originaldatei, Text, Vorschläge, Fakten, Eigentümer, Leserechte und Erinnerungszuordnungen liegen in der gemeinsamen Datenbank, werden aber getrennt berechtigt. Upload, Faktenbestätigung, Rechteänderungen, Löschungen und Kontoverwaltung werden ohne Dokumentvolltext protokolliert.

Ein berechtigter Nutzer kann jedes zugängliche Original und einen JSON-Dokumentexport mit Originaldatei, Text und Angaben herunterladen. Der Import dieses Exportformats ist noch nicht enthalten. Die drei bisherigen JSON-Backups enthalten **keine privaten Dokumente, Konten oder Sitzungen** und ersetzen diese auch bei einem Restore nicht.

Für eine vollständige Sicherung einschließlich persönlicher Konten und Originalen die gesamte SQLite-Datenbank über ein geeignetes SQLite-Backup-Verfahren sichern oder den Server vor dem Dateikopieren sauber stoppen. Beim laufenden WAL-Betrieb nicht nur die Hauptdatei kopieren. Eine Dateiwiederherstellung setzt auch Rechte und Kontostände auf den Sicherungszeitpunkt zurück; der Betreiber sollte danach persönliche Sitzungen in `document_sessions` widerrufen. Datenbankdatei und Exporte enthalten vertrauliche Inhalte unverschlüsselt. Serverbetreiber mit direktem Dateizugriff können sie lesen; die persönlichen Anwendungsrechte ersetzen keine Verschlüsselung des Serverspeichers.

## Prüfen

```sh
node --test tests/documents.test.js tests/document-api.test.js tests/document-extraction.test.js
RUN_BROWSER_TESTS=1 node --test tests/documents.browser.test.js tests/documents-ui.browser.test.js
```

Die Extraktionstests verwenden ausschließlich synthetische PDF-/Bilddateien in `tests/fixtures`; keine privaten Dokumente. Die verschlüsselte Testdatei verwendet nur ein Testpasswort. Fehlen Systemwerkzeuge, weisen die entsprechenden Extraktionstests ihre Überspringung aus. In der validierten Cloud-Instanz liefen diese Tests vollständig.
