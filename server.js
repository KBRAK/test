import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createDocumentRoutes } from './backend/document-routes.js';
import { createFamilyStore, ApiError } from './backend/family-store.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const digest = text => createHash('sha256').update(text).digest();
const loopback = address => ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
const json = (res, status, value) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(value)); };
async function body(req,limit=5*1024*1024) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'JSON-Daten erforderlich.');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new ApiError(413, 'Die Anfrage überschreitet die erlaubte Dateigröße.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400, 'Ungültige JSON-Daten.'); }
}
export function createAppServer({store, accessKey = '', documentExtractor}) {
  const attempts = new Map();
  const documentRoutes=createDocumentRoutes({documents:store.documents,body,json,loopback,ApiError,extractor:documentExtractor});
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    try {
      if (path.startsWith('/api/')) {
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new ApiError(403, 'Anfragen von anderen Webseiten sind nicht erlaubt.');
        if (accessKey) {
          const address = req.socket.remoteAddress;
          const now = Date.now();
          const previous = attempts.get(address);
          if (previous && previous.until > now && previous.count >= 10) throw new ApiError(429, 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.');
          if (!timingSafeEqual(digest(req.headers.authorization || ''), digest('Bearer '+accessKey))) {
            attempts.set(address, {count: previous?.until > now ? previous.count+1 : 1, until: previous?.until > now ? previous.until : now+900000});
            // Bound memory and discard expired records.
            if (attempts.size > 1000) for (const [key,value] of attempts) if (value.until < now || attempts.size > 1000) attempts.delete(key);
            throw new ApiError(401, 'Bitte mit dem Familienpasswort verbinden.');
          }
          attempts.delete(address);
        } else if (!loopback(req.socket.remoteAddress) || !['localhost','127.0.0.1','[::1]'].includes(new URL('http://'+req.headers.host).hostname)) {
          throw new ApiError(403, 'Für den Zugriff im Netzwerk muss ein Familienpasswort eingerichtet werden.');
        }
        if(await documentRoutes(req,res,path))return;
        let match;
        const admin=store.administration;
        if(path==='/api/administration'&&req.method==='GET')return json(res,200,admin.snapshot());
        for(const [plural,singular] of [['vehicles','Vehicle'],['obligations','Obligation']]) {
          if(path==='/api/administration/'+plural&&req.method==='POST')return json(res,201,admin['add'+singular](await body(req)));
          const segments=path.split('/');
          if(segments.length===5&&segments[1]==='api'&&segments[2]==='administration'&&segments[3]===plural) {
            const id=decodeURIComponent(segments[4]);
            if(req.method==='PUT')return json(res,200,admin['update'+singular](id,await body(req)));
            if(req.method==='DELETE'){admin['delete'+singular](id,Number(req.headers['if-match']));return json(res,200,{deleted:true});}
          }
        }
        if((match=path.match(/^\/api\/administration\/obligations\/([^/]+)\/payments$/))&&req.method==='POST')return json(res,201,admin.addPayment(decodeURIComponent(match[1]),await body(req)));
        if((match=path.match(/^\/api\/administration\/payments\/([^/]+)$/))&&req.method==='DELETE'){admin.deletePayment(decodeURIComponent(match[1]),Number(req.headers['if-match']));return json(res,200,{deleted:true});}
        if(path==='/api/administration/backup'&&req.method==='GET')return json(res,200,admin.backup());
        if(path==='/api/administration/restore'&&req.method==='POST'){const input=await body(req);admin.restore(input.backup,input.revision);return json(res,200,admin.snapshot());}

        if (path === '/api/family' && req.method === 'GET') return json(res, 200, store.snapshot());
        if (path === '/api/family/members' && req.method === 'POST') return json(res, 201, store.addMember(await body(req)));
        if ((match = path.match(/^\/api\/family\/members\/([^/]+)$/))) {
          const id = decodeURIComponent(match[1]);
          if (req.method === 'PUT') return json(res, 200, store.updateMember(id, await body(req)));
          if (req.method === 'DELETE') { store.deleteMember(id, Number(req.headers['if-match'])); return json(res, 200, {deleted: true}); }
        }
        if ((match = path.match(/^\/api\/family\/members\/([^/]+)\/events$/)) && req.method === 'POST') return json(res, 201, store.addEvent(decodeURIComponent(match[1]), await body(req)));
        if ((match = path.match(/^\/api\/family\/events\/([^/]+)$/))) {
          const id = decodeURIComponent(match[1]);
          if (req.method === 'PUT') return json(res, 200, store.updateEvent(id, await body(req)));
          if (req.method === 'DELETE') { store.deleteEvent(id, Number(req.headers['if-match'])); return json(res, 200, {deleted: true}); }
        }
        if (path === '/api/family/migrate' && req.method === 'POST') return json(res, 200, store.migrateResidents((await body(req)).residents));
        if (path === '/api/family/backup' && req.method === 'GET') return json(res, 200, store.backup());
        if (path === '/api/family/restore' && req.method === 'POST') {
          const input = await body(req); store.restore(input.backup, input.revision); return json(res, 200, store.snapshot());
        }
        throw new ApiError(404, 'API-Endpunkt nicht gefunden.');
      }
      if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const decoded = decodeURIComponent(path);
      const documentPage=decoded==='/dokumente'||decoded==='/dokumente/';
      if (decoded !== '/' && !documentPage && !decoded.startsWith('/src/')) { res.writeHead(404); res.end(); return; }
      const file = resolve(root, documentPage ? 'documents.html' : decoded === '/' ? 'index.html' : `.${decoded}`);
      const staticRoot = decoded === '/' || documentPage ? root : resolve(root, 'src');
      if (!file.startsWith(staticRoot.endsWith(sep) ? staticRoot : staticRoot+sep)) { res.writeHead(404); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Referrer-Policy':'same-origin'});
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (path.startsWith('/api/')) {
        const status = error.status || (error.code?.startsWith('SQLITE') || error.code === 'ERR_SQLITE_ERROR' ? 500 : 400);
        json(res, status, {error: status === 500 ? 'Die Datenbank ist derzeit nicht verfügbar.' : error.message});
      } else { res.writeHead(404); res.end('Nicht gefunden'); }
    }
  });
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1';
  const accessKey = process.env.FAMILY_ACCESS_KEY || '';
  if (!['127.0.0.1','localhost','::1'].includes(host) && accessKey.length < 16) throw new Error('Für Netzwerkzugriff FAMILY_ACCESS_KEY mit mindestens 16 Zeichen setzen.');
  const store = createFamilyStore(process.env.FAMILY_DB_PATH || resolve(root, 'data/family.sqlite'));
  const server = createAppServer({store, accessKey});
  server.listen(Number(process.env.PORT || 3000), host, () => console.log('Zuhause: Familien-Datenbank und Entwicklungsserver gestartet, Port '+server.address().port));
  const close = () => server.close(() => {store.close(); process.exit(0);});
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
