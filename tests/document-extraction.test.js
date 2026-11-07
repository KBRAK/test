import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {extractDocument} from '../backend/document-extraction.js';
import {analyzeDocument} from '../src/domain/documents.js';
const toolsAvailable=['pdfinfo','pdftotext','pdftoppm','tesseract'].every(command=>!spawnSync(command,['-v'],{timeout:5000}).error);
const fixture=async name=>({filename:name,base64:(await readFile(new URL('./fixtures/'+name,import.meta.url))).toString('base64')});
test('UTF-8-Textdateien werden lokal und verlustfrei ausgelesen',async()=>{
  const text='Müllgebühr: 25,50 EUR\nZahlbar bis 10.11.2026';const result=await extractDocument({filename:'rechnung.txt',base64:Buffer.from(text).toString('base64')});
  assert.equal(result.text,text);assert.equal(result.method,'text');assert.equal(analyzeDocument(result.text).fields.amountCents,2550);
});
test('Ungültige Formate, Dateinamen und Binärtexte werden abgelehnt',async()=>{
  for(const input of [{filename:'../file.txt',base64:'dGVzdA=='},{filename:'file.exe',base64:'dGVzdA=='},{filename:'fake.pdf',base64:'dGVzdA=='},{filename:'file.txt',base64:'not valid base64'},{filename:'file.txt',base64:Buffer.from([0,1,2]).toString('base64')}])await assert.rejects(extractDocument(input));
});
test('Echte Text-PDFs werden gelesen und verschlüsselte Dateien abgelehnt',{skip:!toolsAvailable,timeout:30000},async()=>{
  const result=await extractDocument(await fixture('document-text.pdf'));assert.equal(result.method,'pdf-text');assert.equal(analyzeDocument(result.text).fields.dueDate,'2026-11-10');
  await assert.rejects(extractDocument(await fixture('document-locked.pdf')),/verschlüsselte/);
});
test('Echte Bildscans und bildbasierte PDFs durchlaufen OCR',{skip:!toolsAvailable,timeout:90000},async()=>{
  for(const name of ['document-scan.png','document-scan.pdf']){
    const result=await extractDocument(await fixture(name));assert.ok(['ocr','pdf+ocr'].includes(result.method));
    assert.match(result.text,/49,90/);const analysis=analyzeDocument(result.text);assert.equal(analysis.fields.amountCents,4990);assert.equal(analysis.fields.dueDate,'2026-11-10');
  }
});
