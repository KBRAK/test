# Ausführbares Entwicklerteam

Das Node.js-Kommando orchestriert fünf getrennte Codex-Sitzungen im bestehenden Repository: Teamleitung → Architektur → Entwicklung → Qualitätssicherung → Code-Review. Jede Rolle erhält den Auftrag und die bisherigen strukturierten Übergaben. Nur Entwicklung erhält Schreibrechte. QA und Review können genau einen Korrekturdurchlauf mit anschließender erneuter Prüfung auslösen. Bleiben Befunde offen, endet der Lauf mit Exitcode 2; technische Fehler liefern Exitcode 1.

## Starten

Voraussetzungen: Node.js >=22, Git und für echte Läufe eine installierte, bereits authentifizierte Codex-CLI. Das Tool übernimmt deren bestehende Modell- und Provider-Konfiguration. Es installiert keine Pakete und speichert keine Schlüssel.

```sh
cd /workspace/test
npm run team -- --demo "Ergänze einen Export der Haushaltsdaten"
npm run team -- "Ergänze einen Export der Haushaltsdaten mit Tests"
npm run team -- --task-file /tmp/auftrag.txt --repo /workspace/test --output /tmp/team-export
```

Der Demomodus simuliert die Übergaben ohne Modellzugriff oder Codeänderungen. Echte Läufe können Kosten verursachen und ändern den ausgewählten Checkout. Vorher bestehende Arbeit sichern und nachher den Diff prüfen. Die Agenten sollen keine Commits, Pushes oder Deployments ausführen; diese Einschränkung ist eine Prompt-Vorgabe, keine zusätzliche Betriebssystemgrenze. Codex erzwingt die ausgewählten Sandbox-Modi. Repository-Anweisungen gelten weiterhin.

## Ergebnisse und Betrieb

Ein expliziter `--output`-Ordner darf noch nicht existieren; vorhandene Protokolle werden nicht überschrieben. Ohne `--output` entsteht ein eigener Laufordner unter dem temporären Systemverzeichnis. Darin liegen `run.json`, `report.md`, Rollen-Prompts, JSON-Ergebnisse und Codex-Protokolle. Diese können Projektinformationen enthalten und sollten entsprechend behandelt werden. Temporäre Ergebnisse bei Bedarf an einen dauerhaften Ort kopieren.

`.dev-team.lock` verhindert gleichzeitige Teamläufe im selben Arbeitsverzeichnis. Nach einem Absturz darf die Sperre nur entfernt werden, wenn kein Teamprozess mehr arbeitet. Nicht mehrere Checkout-Pfade für dasselbe Repository verwenden. Agenten laufen nacheinander; es gibt keine konkurrierenden Dateiänderungen durch dieses Kommando. Pro Rolle gilt ein Zeitlimit von 15 Minuten. Bei Fehlern bleibt der bisherige Fortschritt erhalten; automatische Wiederaufnahme ist noch nicht enthalten. Ein fehlgeschlagener Lauf kann bereits Codeänderungen hinterlassen.

Ein positives Review ist eine KI-Einschätzung. Die Ergebnisse nennen ausgeführte und ungeprüfte Tests; sie ersetzen keine menschliche Freigabe. Der Ablauf und der Codex-Adapter werden automatisiert mit simulierten Antworten geprüft. Eine echte Modellanfrage benötigt funktionierende Codex-Authentifizierung und Netzzugriff.

Tests: `npm test`. Die bestehende Haushalts-App startet weiterhin über `npm start`.
