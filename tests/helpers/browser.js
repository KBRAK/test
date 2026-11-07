import { access, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export let browser = process.env.CHROMIUM_PATH;
if (!browser) {
  try {await access('/usr/lib/chromium/chromium');browser='/usr/lib/chromium/chromium';}
  catch {browser='/usr/bin/chromium';}
}
export let browserEnabled = process.env.RUN_BROWSER_TESTS === '1';
try {await access(browser);} catch {browserEnabled=false;}
export async function withBrowser(url, run) {
  const dir=await mkdtemp(join(tmpdir(),'family-browser-'));
  let child, socket;
  try {
    child=spawn(browser,['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:['ignore','ignore','pipe']});
    const endpoint=await new Promise((resolve,reject)=>{
      let logs=''; const timer=setTimeout(()=>reject(new Error('Browser startup timeout: '+logs.slice(-1000))),10000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);reject(new Error('Browser exit '+code));});
      child.stderr.on('data',chunk=>{logs+=chunk;const match=logs.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    });
    const pages=await fetch('http://'+new URL(endpoint).host+'/json/list',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());
    socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Browser WebSocket timeout')),5000);
      socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      socket.addEventListener('error',error=>{clearTimeout(timer);reject(error);},{once:true});
    });
    let id=0;
    const command=(method,params={})=>new Promise((resolve,reject)=>{
      const requestId=++id;
      const timer=setTimeout(()=>{socket.removeEventListener('message',receive);reject(new Error(method+' timeout'));},10000);
      function receive(event){const msg=JSON.parse(event.data);if(msg.id!==requestId)return;clearTimeout(timer);socket.removeEventListener('message',receive);if(msg.error)reject(new Error(JSON.stringify(msg.error)));else resolve(msg.result);}
      socket.addEventListener('message',receive);socket.send(JSON.stringify({id:requestId,method,params}));
    });
    const evaluate=async expression=>{
      const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result?.value;
    };
    const waitFor=async expression=>{
      const deadline=Date.now()+7000;
      while(Date.now()<deadline){try{if(await evaluate(expression))return;}catch{}await new Promise(resolve=>setTimeout(resolve,30));}
      throw new Error('Browser wait failed: '+expression+'\n'+await evaluate('document.body.innerText'));
    };
    await command('Page.navigate',{url});
    await run({command,evaluate,waitFor});
  } finally {
    socket?.close();
    if(child&&child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await exited;}
    await rm(dir,{recursive:true,force:true});
  }
}
