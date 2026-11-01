# Architekturentscheidung 001: lokale responsive Web-App

Status: angenommen für das MVP.

## Entscheidung

HTML/CSS und native JavaScript-Module bilden einen gemeinsamen Browser-Client für PC und Handy. Der Einstieg benötigt nur Node.js, keine Paketinstallation und keinen Build. Fachlogik ist unabhängig von DOM und Speicher testbar. Ein späteres Framework bleibt möglich, sobald Navigation und UI-Komplexität es rechtfertigen.

Die Speicherung liegt hinter `load`/`save`. Datenformat Version 1 umfasst:

| Entität | Felder |
| --- | --- |
| Haushalt | name, notes |
| Bewohner | id, name, intolerances[] |
| Lebensmittelbestand | id, name, quantity, unit, location, expiresOn |
| Einkaufsbedarf | id, name, quantity, unit, done |

IDs sind UUIDs; Mengen sind numerisch, Einheiten Freitext, Haltbarkeit ein lokales Kalenderdatum im ISO-Format. Unverträglichkeiten sind manuell gepflegte Angaben ohne medizinische Bewertung. Es gibt einen Haushalt je Browser-Ursprung. Verbrauch verändert den verbleibenden Bestand, noch ohne Historie. Eingaben werden validiert und Textausgaben HTML-escaped.

## Folgen

Schneller, kleiner Start ohne Betriebskosten für ein Backend. Dafür keine gemeinsame Datenbasis, keine Authentifizierung und kein Geräteabgleich. `localStorage` ist kein dauerhaftes Backup. Speicherfehler werden angezeigt; unbekannte oder beschädigte Formate nicht automatisch ersetzt. Tests decken Fachlogik und Speicher ab; ein automatisierter Browser-End-to-End-Test ist noch offen.

## Später

Vor Synchronisierung: persistente Datenbank, API, Authentifizierung, Berechtigungen je Haushalt, Konfliktauflösung, Migrationen und Datenschutzkonzept festlegen. Für Offline-Installation Manifest und Service Worker mit getesteter Aktualisierungsstrategie ergänzen. Sprachfunktionen erst hinter separaten Browser-Adaptern hinzufügen.
