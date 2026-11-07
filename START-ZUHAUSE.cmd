@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Bitte zuerst Node.js 24 LTS installieren.
  echo Offizielle Downloadseite: https://nodejs.org/de/download
  echo Danach diese Startdatei erneut doppelt anklicken.
  start "" "https://nodejs.org/de/download"
  pause
  exit /b 1
)
node "%~dp0windows\start.mjs"
if errorlevel 1 (
  echo.
  echo Der Start wurde mit einem Fehler beendet. Siehe Meldung oben.
  pause
)
