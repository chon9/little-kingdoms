import{spawn}from'node:child_process';
import{mkdir,writeFile}from'node:fs/promises';
import path from'node:path';
import assert from'node:assert/strict';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir('artifacts',{recursive:true});await mkdir('output/pdf',{recursive:true});
const edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9335','--user-data-dir='+path.resolve('artifacts/comic-browser'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try{
  let target;for(let i=0;i<80;i++){try{target=await(await fetch('http://127.0.0.1:9335/json/new?about:blank',{method:'PUT'})).json();break;}catch{}await wait(150);}
  assert.ok(target);ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let id=0;const pending=new Map(),errors=[];
  ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
  const until=async expression=>{for(let i=0;i<100;i++){try{if(await evaluate(expression))return;}catch{}await wait(100);}throw new Error('Comic timed out: '+expression);};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:780,height:1100,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:4317/rulebook.html'});
  await until('document.querySelectorAll("[data-rule-page]").length===12');await evaluate('document.fonts.ready');
  assert.equal(await evaluate('document.querySelector("[data-rule-page=\\"0\\"]").hidden'),false);
  await evaluate('document.querySelector("[data-comic-jump]").click()');
  assert.equal(await evaluate('document.querySelector(".comic-book").dataset.comicPage'),'5');
  await evaluate('document.querySelector("[data-rule-try=\\"eye\\"]").click()');
  assert.match(await evaluate('document.querySelector("#rule-feedback-eye").textContent'),/BLOCKED.*sealed/);
  const screenshot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/'+name+'.png',Buffer.from(r.data,'base64'));};
  await screenshot('comic-desktop');
  for(const width of[320,390,768]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<500});
    for(let i=0;i<12;i++){
      await evaluate(`(()=>{const s=document.querySelector('#comic-chapter');s.value=${i};s.dispatchEvent(new Event('change'));})()`);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`comic chapter ${i+1} fits ${width}px`);
    }
  }
  await evaluate(`(()=>{const s=document.querySelector('#comic-chapter');s.value=5;s.dispatchEvent(new Event('change'));})()`);await screenshot('comic-mobile');
  await send('Page.navigate',{url:'http://127.0.0.1:4317/rulebook.html?print=1'});await until('document.querySelectorAll("[data-rule-page]").length===12');await evaluate('document.fonts.ready');
  await evaluate(`Promise.all(['/assets/generals-unlock.webp','/assets/generals.webp','/assets/generals-shock.webp'].map(src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=reject;image.src=src;})))`);
  const pdf=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,generateTaggedPDF:true});
  await writeFile('output/pdf/little-kingdoms-comic-rules.pdf',Buffer.from(pdf.data,'base64'));
  assert.deepEqual(errors,[]);
  console.log('Comic checks passed: 12 chapters at 320/390/768px, engine-backed eye example and printable A5 PDF.');
}finally{ws?.close();edge.kill();}
