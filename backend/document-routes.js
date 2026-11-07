import { extractDocument } from './document-extraction.js';
import { analyzeDocument } from '../src/domain/documents.js';
export function createDocumentRoutes({documents,body,json,loopback,ApiError,extractor=extractDocument}) {
  const attempts=new Map();let processing=0;
  return async(req,res,path)=>{
    if(!path.startsWith('/api/documents'))return false;
    if(path==='/api/documents/status'&&req.method==='GET'){json(res,200,{setupRequired:!documents.hasUsers(),formats:['pdf','png','jpg','jpeg','txt'],maxBytes:10*1024*1024});return true;}
    if(path==='/api/documents/setup'&&req.method==='POST'){
      if(!loopback(req.socket.remoteAddress)||!['localhost','127.0.0.1','[::1]'].includes(new URL('http://'+req.headers.host).hostname))throw new ApiError(403,'Das erste persönliche Administratorkonto muss einmalig direkt am Familienserver (localhost) eingerichtet werden.');
      json(res,201,documents.setup(await body(req,65536)));return true;
    }
    if(path==='/api/documents/login'&&req.method==='POST'){
      const address=req.socket.remoteAddress,previous=attempts.get(address),now=Date.now();
      if(previous?.until>now&&previous.count>=10)throw new ApiError(429,'Zu viele persönliche Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.');
      try{const result=documents.login(await body(req,65536));attempts.delete(address);json(res,200,result);}
      catch(error){attempts.set(address,{count:previous?.until>now?previous.count+1:1,until:previous?.until>now?previous.until:now+900000});if(attempts.size>1000)for(const[key,value]of attempts)if(value.until<now||attempts.size>1000)attempts.delete(key);throw error;}
      return true;
    }
    const token=req.headers['x-document-session'],person=documents.actor(token);
    if(path==='/api/documents'&&req.method==='GET'){json(res,200,{user:person,documents:documents.list(person),users:documents.users(person),reminders:documents.reminders(person)});return true;}
    if(path==='/api/documents/logout'&&req.method==='POST'){documents.logout(token);json(res,200,{loggedOut:true});return true;}
    if(path==='/api/documents/password'&&req.method==='POST'){documents.changePassword(person,await body(req,65536));json(res,200,{loggedOut:true});return true;}
    if(path==='/api/documents/users'&&req.method==='POST'){json(res,201,documents.createUser(person,await body(req,65536)));return true;}
    let match;
    if((match=path.match(/^\/api\/documents\/users\/([^/]+)$/))&&req.method==='DELETE'){documents.deactivateUser(person,decodeURIComponent(match[1]));json(res,200,{deactivated:true});return true;}
    if(path==='/api/documents/upload'&&req.method==='POST'){
      if(processing>=2)throw new ApiError(429,'Es werden bereits zwei Dokumente verarbeitet. Bitte kurz warten.');
      processing++;
      try{
        const extracted=await extractor(await body(req,14*1024*1024));
        if(req.aborted||res.destroyed)return true;
        const current=documents.actor(token),analysis=analyzeDocument(extracted.text,extracted.filename);analysis.warnings.push(...extracted.warnings);
        const id=documents.add(current,extracted,analysis);json(res,201,documents.details(current,id));
      }finally{processing--;}
      return true;
    }
    if((match=path.match(/^\/api\/documents\/([^/]+)(?:\/(original|export|confirm|grants|acknowledge))?$/))){
      const id=decodeURIComponent(match[1]),action=match[2];
      if(!action&&req.method==='GET'){json(res,200,documents.details(person,id));return true;}
      if(!action&&req.method==='DELETE'){documents.remove(person,id,Number(req.headers['if-match']));json(res,200,{deleted:true});return true;}
      if(action==='original'&&req.method==='GET'){
        const original=documents.original(person,id);res.writeHead(200,{'Content-Type':original.mime,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(original.filename),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'});res.end(original.bytes);return true;
      }
      if(action==='export'&&req.method==='GET'){
        const detail=documents.details(person,id),original=documents.original(person,id);json(res,200,{format:'zuhause-document',version:1,document:detail,originalBase64:Buffer.from(original.bytes).toString('base64')});return true;
      }
      if(action==='confirm'&&req.method==='POST'){documents.confirm(person,id,await body(req));json(res,200,documents.details(person,id));return true;}
      if(action==='grants'&&req.method==='POST'){documents.share(person,id,await body(req));json(res,200,documents.details(person,id));return true;}
      if(action==='acknowledge'&&req.method==='POST'){documents.acknowledge(person,id,(await body(req)).dueDate);json(res,200,{acknowledged:true});return true;}
    }
    throw new ApiError(404,'Dokument-Endpunkt nicht gefunden.');
  };
}
