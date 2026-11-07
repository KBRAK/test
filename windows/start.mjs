import {spawn,spawnSync} from 'node:child_process';
import {resolve,join,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<13)){
  console.error('Bitte zuerst Node.js 24 LTS installieren: https://nodejs.org/de/download');
  process.exit(1);
}
const check=process.argv.includes('--check');
const directory=check?process.env.ZUHAUSE_CHECK_DATA:process.env.LOCALAPPDATA?join(process.env.LOCALAPPDATA,'Zuhause'):join(root,'data');
if(check&&!directory)throw new Error('Pruefmodus benoetigt ZUHAUSE_CHECK_DATA.');
mkdirSync(directory,{recursive:true});
const port=check?0:3000;
const env={...process.env,HOST:'127.0.0.1',PORT:String(port),FAMILY_DB_PATH:join(directory,'family.sqlite')};
if(process.platform==='win32'){
  const tesseract=join(process.env.ProgramFiles||'C:\\Program Files','Tesseract-OCR');
  if(existsSync(tesseract))env.PATH=tesseract+delimiter+(env.PATH||'');
}
const openBrowser=url=>{
  console.log('\nBrowseradresse: '+url);
  if(process.platform==='win32'){
    const browser=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{stdio:'ignore',windowsHide:true});
    browser.on('error',()=>console.log('Bitte die Browseradresse oben manuell oeffnen.'));
  }
};
// A second double-click reuses the existing local application.
if(!check){
  try{
    const response=await fetch('http://127.0.0.1:3000/dokumente',{signal:AbortSignal.timeout(1500)});
    if(response.ok&&(await response.text()).includes('data-standalone="true"')){
      openBrowser('http://127.0.0.1:3000/dokumente');process.exit(0);
    }
  }catch{}
}
console.log('Zuhause wird gestartet. Bitte dieses Fenster offen lassen.');
console.log('Deine Datenbank: '+env.FAMILY_DB_PATH);
const child=spawn(process.execPath,['server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
let output='',errors='',actualPort;
child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);const match=output.match(/Port (\d+)/);if(match)actualPort=Number(match[1]);});
child.stderr.on('data',chunk=>{errors+=chunk;process.stderr.write(chunk);});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
let stopping=false;
const stop=()=>{if(stopping)return;stopping=true;child.kill('SIGTERM');};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
try{
  const deadline=Date.now()+15000;let ready=false;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw new Error(errors.includes('EADDRINUSE')?'Port 3000 ist belegt. Bitte die andere Anwendung oder ein aelteres Zuhause-Fenster schliessen.':'Der Server konnte nicht gestartet werden.');
    if(actualPort){
      try{const response=await fetch('http://127.0.0.1:'+actualPort+'/dokumente',{signal:AbortSignal.timeout(1000)});if(response.ok&&(await response.text()).includes('data-standalone="true"')){ready=true;break;}}catch{}
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready)throw new Error('Die Anwendung hat nicht rechtzeitig geantwortet.');
  if(check){console.log('Startpruefung erfolgreich.');stop();}
  else{
    const available=command=>!spawnSync(command,['-v'],{env,windowsHide:true,timeout:3000}).error;
    if(!['pdftotext','pdfinfo','pdftoppm','tesseract'].every(available))console.log('\nOberflaeche und TXT-Import sind bereit. Fuer PDF/Bild-Auslesung muessen Poppler und Tesseract zusaetzlich installiert sein. Siehe WINDOWS-ANLEITUNG.txt.');
    openBrowser('http://127.0.0.1:'+actualPort+'/dokumente');
    console.log('Zum Beenden dieses Fenster schliessen oder Strg+C druecken.');
  }
  if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));
}catch(error){console.error('\n'+error.message);stop();if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));process.exitCode=1;}
