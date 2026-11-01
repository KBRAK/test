# Zuhause · Haushaltshelfer

Lauffähige MVP-Basis für PC und Handy. Eine responsive Web-App mit lokalen Browserdaten.

## Schnellstart

Voraussetzung: Node.js ab Version 22. Keine Pakete, API-Schlüssel oder Datenbank erforderlich.

```sh
git clone https://github.com/KBRAK/test.git
cd test
npm start
```

Im Browser `http://localhost:3000` öffnen. Für einen Test auf dem Handy im selben vertrauenswürdigen WLAN den Server mit `HOST=0.0.0.0 npm start` starten (PowerShell: `$env:HOST="0.0.0.0"; npm start`) und `http://<PC-IP>:3000` aufrufen. Firewall gegebenenfalls für das lokale Netz freigeben. Der Entwicklungsserver hat keine Anmeldung und ist nicht für öffentliche Bereitstellung gedacht.

## Enthalten

- Haushaltsname und Notizen bearbeiten.
- Bewohner anlegen und entfernen; Unverträglichkeiten je Person hinterlegen.
- Lebensmittel mit Menge, Einheit, Lagerort und optionalem Haltbarkeitsdatum erfassen und entfernen.
- Verbrauch um eine angegebene Mengeneinheit buchen, mindestens bis null (bei 0,5 kg wird der Rest verbraucht).
- Einkaufsbedarf manuell anlegen oder über „Nachkaufen“ mit einer Einheit aus dem Bestand übernehmen; erledigen, wieder öffnen, entfernen.
- Unverträglichkeiten bleiben beim Einkauf sichtbar. Kein automatischer Zutaten- oder Allergieabgleich.
- Speicherung nach jeder Änderung in `localStorage`; leere Erstinstallation ohne persönliche Beispieldaten.

„Als gekauft markieren“ ändert nur den Listenstatus. Bestand wird separat mit tatsächlicher Menge und Haltbarkeit erfasst. Wiederholtes „Nachkaufen“ erzeugt separate Einträge.

## Technologie und Struktur

Bewusst HTML, CSS und native JavaScript-Module ohne Framework oder Build-Schritt: kleiner Einstieg, reproduzierbar ohne Paketinstallation, eine Oberfläche für PC und Handy. Node.js dient ausschließlich als Entwicklungsserver und Testlaufzeit. Details und Ausbaupfad: [Architektur](docs/architecture.md), [Roadmap](docs/roadmap.md).

```text
index.html                Einstieg und Metadaten
src/app.js                Formulare, Ereignisse und Darstellung
src/domain/household.js   Datenmodell und fachliche Operationen
src/storage/local.js      Versionierter Browser-Speicher
src/ui/styles.css         Responsive Gestaltung
server.js                 Lokaler statischer Entwicklungsserver
tests/                    Fachlogik und Speicherprüfungen
docs/                     Architektur und Roadmap
.github/workflows/        Automatische Prüfungen
```

## Prüfen

```sh
npm test
npm run check
```

Manueller Funktionstest: Haushalt speichern, Bewohner mit Unverträglichkeit anlegen, Lebensmittel mit Menge und Datum erfassen, Verbrauch buchen, „Nachkaufen“ wählen, Einkauf erledigen und Seite neu laden. Einträge müssen erhalten bleiben. Mit schmalem Browserfenster die einspaltige Ansicht und Tastaturbedienung prüfen.

## Grenzen und Daten

Daten bleiben pro Browserprofil und Ursprung lokal; keine automatische Synchronisierung zwischen PC und Handy, keine Konten, kein Backend und noch keine installierbare Offline-PWA. Löschen der Browserdaten entfernt die Haushaltsdaten. Kein Export/Backup im MVP. Bei beschädigten Daten wird das Laden gesperrt, statt sie automatisch zu überschreiben. Bei Speicherfehlern wird die Änderung nicht übernommen und eine Fehlermeldung angezeigt. Gemeinsame Browserprofile teilen diese Daten; sensible persönliche Angaben entsprechend sparsam erfassen.

Sprachansagen, Sprachsteuerung, Aufgaben und automatische Einkaufs-/Rezeptvorschläge sind ausdrücklich nächste Ausbaustufen. Händlerpreise, Angebote und automatische Kühlschrankerkennung sind nicht angebunden.
