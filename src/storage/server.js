// Shared only within this page; credentials are never written to browser storage.
let accessKey='';
export let serverIsConnected=false;
export function setServerKey(key){accessKey=key;}
export async function serverRequest(path,{method='GET',body,version,headers:additionalHeaders={}}={}) {
  const headers={...additionalHeaders};
  if(accessKey)headers.Authorization='Bearer '+accessKey;
  if(body!==undefined)headers['Content-Type']='application/json';
  if(version!==undefined)headers['If-Match']=String(version);
  const response=await fetch('/api/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  let result;
  try{result=await response.json();}catch{throw new Error('Der Server hat keine gültige Antwort geliefert. Bitte Verbindung prüfen.');}
  if(response.ok)serverIsConnected=true;
  if(!response.ok){if(response.status===401)serverIsConnected=false;const error=new Error(result.error||'Anfrage fehlgeschlagen.');error.status=response.status;throw error;}
  return result;
}
export async function serverDownload(path,{headers:additionalHeaders={}}={}) {
  const headers={...additionalHeaders};if(accessKey)headers.Authorization='Bearer '+accessKey;
  const response=await fetch('/api/'+path,{headers,cache:'no-store'});
  if(!response.ok){let value;try{value=await response.json();}catch{}const error=new Error(value?.error||'Download fehlgeschlagen.');error.status=response.status;throw error;}
  return response.blob();
}
