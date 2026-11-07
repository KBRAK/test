import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,writeFile,rm,access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { MAX_DOCUMENT_BYTES,MAX_DOCUMENT_TEXT } from '../src/domain/documents.js';
const exec=promisify(execFile);
const tool=(command,args,extraEnv={})=>exec(command,args,{timeout:30000,maxBuffer:2*1024*1024,env:{...process.env,...extraEnv,OMP_THREAD_LIMIT:'1'}});
function detect(bytes,name) {
  const ext=name.toLowerCase().split('.').at(-1);
  if(ext==='pdf'&&bytes.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
  if(ext==='png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(['jpg','jpeg'].includes(ext)&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(ext==='txt')return 'text/plain';
  throw new Error('Unterstützt werden PDF, PNG, JPEG und UTF-8-Textdateien. Dateiendung und Inhalt müssen zusammenpassen.');
}
function imageSize(bytes,type) {
  if(type==='image/png'&&bytes.length>=24)return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
  if(type==='image/jpeg'){
    let offset=2;
    while(offset+8<bytes.length){if(bytes[offset]!==255)break;const marker=bytes[offset+1],size=bytes.readUInt16BE(offset+2);if(size<2)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return [bytes.readUInt16BE(offset+7),bytes.readUInt16BE(offset+5)];offset+=size+2;}
  }
  throw new Error('Bildabmessungen konnten nicht geprüft werden.');
}
export async function extractDocument({filename,base64}) {
  if(typeof filename!=='string'||!filename.trim()||filename.length>200||/[\x00-\x1f/\\]/.test(filename))throw new Error('Ungültiger Dateiname.');
  if(typeof base64!=='string'||base64.length>Math.ceil(MAX_DOCUMENT_BYTES/3)*4||base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new Error('Ungültige Datei oder Dateigröße über 10 MB.');
  const bytes=Buffer.from(base64,'base64');if(!bytes.length||bytes.length>MAX_DOCUMENT_BYTES)throw new Error('Bitte eine nicht leere Datei mit höchstens 10 MB wählen.');
  const mime=detect(bytes,filename),warnings=[];let text='',method='text';
  if(mime==='text/plain'){
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('Textdateien müssen als UTF-8 gespeichert sein.');}
    if(text.includes('\0'))throw new Error('Binärdateien werden nicht als Text akzeptiert.');
  }else{
    const dir=await mkdtemp(join(tmpdir(),'zuhause-document-'));
    try{
      const source=join(dir,mime==='application/pdf'?'source.pdf':mime==='image/png'?'source.png':'source.jpg');await writeFile(source,bytes,{mode:0o600});
      let language;
      const ocrEnv={};
      const languageDir=process.env.OCR_TESSDATA_DIR||fileURLToPath(new URL('../data/ocr/tessdata',import.meta.url));
      try{await access(languageDir+'/deu.traineddata');ocrEnv.TESSDATA_PREFIX=languageDir;}catch{}
      const ocr=async path=>{
        if(!language){const available=(await tool('tesseract',['--list-langs'],ocrEnv)).stdout;language=/^deu$/m.test(available)?'deu+eng':'eng';if(language==='eng')warnings.push('Deutsches OCR-Sprachpaket fehlt; englische Texterkennung verwendet. Umlaute und Zahlen besonders prüfen.');}
        return (await tool('tesseract',[path,'stdout','-l',language,'--psm','3'],ocrEnv)).stdout;
      };
      if(mime==='application/pdf'){
        const info=(await tool('pdfinfo',[source])).stdout,pages=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
        if(!pages||pages>20)throw new Error('PDF-Dateien dürfen höchstens 20 Seiten enthalten.');
        const extracted=(await tool('pdftotext',['-layout',source,'-'])).stdout.split('\f');
        const output=[];let ocrPages=0;
        for(let page=1;page<=pages;page++){
          let content=extracted[page-1]||'';
          if(content.replace(/\s/g,'').length<20){const prefix=join(dir,'page-'+page);await tool('pdftoppm',['-f',String(page),'-l',String(page),'-singlefile','-scale-to','2000','-png',source,prefix]);const recognized=await ocr(prefix+'.png');if(recognized.trim().length>content.trim().length)content=recognized;ocrPages++;}
          output.push(content);
          if(output.join('\f').length>MAX_DOCUMENT_TEXT)throw new Error('Der extrahierte Text überschreitet 200.000 Zeichen.');
        }
        text=output.join('\f');method=ocrPages?'pdf+ocr':'pdf-text';
        if(!ocrPages)warnings.push('PDF-Textschicht ausgelesen. Nicht als Text hinterlegte Bildbestandteile werden auf textreichen Seiten nicht zusätzlich erkannt.');
      }else{
        const [width,height]=imageSize(bytes,mime);if(!width||!height||width>10000||height>10000||width*height>25000000)throw new Error('Bilder dürfen höchstens 25 Megapixel und 10.000 Pixel je Seite haben.');
        text=await ocr(source);method='ocr';
      }
    }catch(error){if(error.code==='ENOENT')throw new Error('Auf dem Server fehlen PDF-/OCR-Werkzeuge. Bitte Poppler und Tesseract installieren.');if(error.killed||error.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER')throw new Error('Dokumentverarbeitung hat das Zeit- oder Textlimit überschritten.');if(error.cmd)throw new Error('Dokument konnte nicht gelesen werden. Bitte beschädigte oder verschlüsselte Dateien prüfen.');throw error;}
    finally{await rm(dir,{recursive:true,force:true});}
  }
  text=text.trim();if(!text||text.length>MAX_DOCUMENT_TEXT)throw new Error('Kein lesbarer Text oder mehr als 200.000 Zeichen.');
  return {filename,mime,bytes,text,method,warnings:[...new Set(warnings)]};
}
