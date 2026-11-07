# Windows-Startpaket

[Zuhause-Windows.zip herunterladen](https://github.com/KBRAK/test/raw/refs/heads/windows-testpaket/downloads/Zuhause-Windows.zip)

1. Node.js ab 22.13 installieren; empfohlen Node.js 24 LTS. „Node.js runtime“, „npm package manager“ und „Add to PATH“ aktivieren.
2. ZIP speichern und im Windows-Explorer über „Alle extrahieren“ vollständig entpacken.
3. Im entpackten Ordner `START-ZUHAUSE.cmd` doppelt anklicken und das Startfenster offen lassen.
4. Der Browser soll automatisch öffnen. Falls nötig, auf demselben PC `http://127.0.0.1:3000/dokumente` aufrufen.
5. Beim ersten Aufruf ein persönliches Dokumentkonto einrichten.

Das Paket enthält Anwendungscode, synthetische Testdateien und deutsche/englische OCR-Sprachdaten. Es enthält keine persönlichen Datenbanken oder Zugangsdaten. Unter Windows sind für PDF/Bild-Auslesung zusätzlich Poppler und Tesseract erforderlich; Oberfläche und TXT-Analyse benötigen nur Node.js. Siehe `WINDOWS-ANLEITUNG.txt` im Paket.

Der Serverstart aus dem entpackten ZIP wurde in der Cloud mit Node.js geprüft. Ein Test des Doppelklicks auf echtem Windows steht noch aus. Lokale Daten werden normalerweise unter `%LOCALAPPDATA%\Zuhause` gespeichert; Cloud-Daten werden nicht automatisch übertragen.

Die Prüfsumme des ZIP steht in `SHA256SUMS.txt`. Das Paket liegt zusammen mit dem aktuellen Code im separaten Zweig `windows-testpaket`.
