import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
// Opt in where headless Chromium execution is supported.
let browser = process.env.CHROMIUM_PATH;
if (!browser) {
  try { await access('/usr/lib/chromium/chromium'); browser = '/usr/lib/chromium/chromium'; }
  catch { browser = '/usr/bin/chromium'; }
}
let available = true;
try { await access(browser); } catch { available = false; }
test('Browser: Formularentwürfe, Dezimalmengen sowie Backup-Export und -Import', { skip: !available || process.env.RUN_BROWSER_TESTS !== '1', timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'household-browser-'));
  let child, socket, server;
  try {
    const html = `<main id="app"></main><pre id="result">PENDING</pre><script type="module">
try {
  localStorage.clear();
  await import('/src/app.js');
  const form = key => document.querySelector('form[data-form="'+key+'"]');
  const input = (key, name) => form(key).elements.namedItem(name);
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  input('household','notes').value = 'Ungespeicherte Notiz';
  input('food','name').value = 'Reis';
  input('food','quantity').value = '1.1';
  input('resident','name').value = 'Alex';
  form('resident').requestSubmit();
  check(input('household','notes').value === 'Ungespeicherte Notiz', 'Notizen verloren');
  check(input('food','name').value === 'Reis', 'Lebensmittelentwurf verloren');
  check(input('resident','name').value === '', 'Abgesendetes Formular nicht zurückgesetzt');
  form('food').requestSubmit();
  document.querySelector('[data-action="consume"]').click();
  check(document.querySelector('#app').textContent.includes('0.1 Stück'), 'Falsche Mengenanzeige: '+document.querySelector('#app').textContent);
  check(!document.querySelector('#app').textContent.includes('0.10000000000000009'), 'Rundungsartefakt');
  check(input('household','notes').value === 'Ungespeicherte Notiz', 'Notizen nach Verbrauch verloren');
  form('household').requestSubmit();
  check(input('household','notes').value === 'Ungespeicherte Notiz', 'Gespeicherte Notizen fehlen');
  check(JSON.parse(localStorage.getItem('zuhause.household.v1')).household.notes === 'Ungespeicherte Notiz', 'Notizen nicht persistiert');
  // Exercise the actual export button without triggering an operating-system download.
  const beforeBackup = localStorage.getItem('zuhause.household.v1');
  let downloaded;
  const createURL = URL.createObjectURL;
  const anchorClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = blob => { downloaded = blob; return createURL(blob); };
  HTMLAnchorElement.prototype.click = function () { check(this.download.endsWith('.json'), 'Dateiname fehlt'); };
  document.querySelector('[data-action="export"]').click();
  check(JSON.stringify(JSON.parse(await downloaded.text())) === beforeBackup, 'Export weicht von gespeicherten Daten ab');
  URL.createObjectURL = createURL;
  HTMLAnchorElement.prototype.click = anchorClick;
  const imported = JSON.parse(beforeBackup);
  imported.household.name = 'Importierter Haushalt';
  imported.household.notes = 'Wiederhergestellt';
  const selectFile = text => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], 'backup.json', {type: 'application/json'}));
    document.querySelector('[data-backup-import] input').files = transfer.files;
    document.querySelector('[data-backup-import]').requestSubmit();
  };
  const settled = async () => {
    for (let i=0; i<100 && document.querySelector('[data-backup-import] button').disabled; i++) await new Promise(resolve => setTimeout(resolve, 10));
    check(!document.querySelector('[data-backup-import] button').disabled, 'Import hängt');
  };
  let confirmations = 0;
  window.confirm = () => { confirmations++; return false; };
  selectFile('{'); await settled();
  check(confirmations === 0, 'Ungültige Datei löst Bestätigung aus');
  check(localStorage.getItem('zuhause.household.v1') === beforeBackup, 'Ungültiger Import verändert Daten');
  selectFile(JSON.stringify(imported)); await settled();
  check(confirmations === 1, 'Bestätigung fehlt');
  check(localStorage.getItem('zuhause.household.v1') === beforeBackup, 'Abbruch verändert Daten');
  window.confirm = () => true;
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = () => { throw new Error('Speicher voll'); };
  selectFile(JSON.stringify(imported)); await settled();
  Storage.prototype.setItem = originalSetItem;
  check(input('household','name').value !== imported.household.name, 'Speicherfehler verändert Oberfläche');
  check(localStorage.getItem('zuhause.household.v1') === beforeBackup, 'Speicherfehler verändert Daten');
  input('household','notes').value = 'Alter Entwurf';
  selectFile(JSON.stringify(imported)); await settled();
  check(input('household','name').value === imported.household.name, 'Importierter Name fehlt');
  check(input('household','notes').value === imported.household.notes, 'Alter Entwurf überschreibt Import');
  check(JSON.parse(localStorage.getItem('zuhause.household.v1')).household.name === imported.household.name, 'Import nicht gespeichert');
  document.querySelector('#result').textContent = 'PASS';
} catch (error) { document.querySelector('#result').textContent = 'FAIL: '+error.message; }
</script>`;
    server = createServer(async (req, res) => {
      try {
        if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
        const files = new Map([
          ['/src/app.js', new URL('../src/app.js', import.meta.url)],
          ['/src/domain/household.js', new URL('../src/domain/household.js', import.meta.url)],
          ['/src/storage/backup.js', new URL('../src/storage/backup.js', import.meta.url)],
          ['/src/storage/local.js', new URL('../src/storage/local.js', import.meta.url)],
        ]);
        const file = files.get(req.url);
        if (!file) { res.writeHead(404); res.end(); return; }
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.end(await readFile(file));
      } catch { res.writeHead(500); res.end(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    child = spawn(browser, ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir='+join(dir,'profile'), 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']});
    const endpoint = await new Promise((resolve, reject) => {
      let stderr = '';
      const timer = setTimeout(() => reject(new Error('Chromium DevTools startup timeout: '+stderr.slice(-2000))), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Chromium exited: '+code)); });
      child.stderr.on('data', data => {
        stderr += data;
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    const pages = await fetch('http://'+new URL(endpoint).host+'/json/list', {signal: AbortSignal.timeout(5000)}).then(r => r.json());
    const page = pages.find(p => p.type === 'page');
    assert.ok(page, 'No browser page available');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('DevTools connection timeout')), 5000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, {once: true});
      socket.addEventListener('error', error => { clearTimeout(timer); reject(error); }, {once: true});
    });
    let id = 0;
    const command = (method, params) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { socket.removeEventListener('message', onMessage); reject(new Error(method+' timeout')); }, 7000);
      function onMessage(event) {
        const message = JSON.parse(event.data);
        if (message.id !== requestId) return;
        clearTimeout(timer); socket.removeEventListener('message', onMessage);
        if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
      }
      socket.addEventListener('message', onMessage);
      socket.send(JSON.stringify({id: requestId, method, params}));
    });
    await command('Page.navigate', {url: 'http://127.0.0.1:'+server.address().port+'/'});
    // Poll from Node so navigation cannot destroy a pending page-side promise.
    let result;
    const deadline = Date.now()+6000;
    while (Date.now() < deadline) {
      const response = await command('Runtime.evaluate', {expression: 'document.querySelector("#result")?.textContent', returnByValue: true});
      result = response.result?.value;
      if (result && result !== 'PENDING') break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(result, 'PASS');
  } finally {
    socket?.close();
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGKILL'); await exited;
    }
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(dir, {recursive: true, force: true});
  }
});
