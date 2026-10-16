import{spawn}from'node:child_process';
import{mkdir,writeFile,readFile}from'node:fs/promises';
import path from'node:path';
import assert from'node:assert/strict';
const model=(await readFile('public/tutorial-model.js','utf8')).replace("from '/engine.js'",`from '${new URL('../shared/engine.js',import.meta.url).href}'`);
const{LESSONS}=await import('data:text/javascript;base64,'+Buffer.from(model).toString('base64'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));await mkdir('artifacts',{recursive:true});
const edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9336','--user-data-dir='+path.resolve('artifacts/tutorial-browser'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try{
  let target;for(let i=0;i<80;i++){try{target=await(await fetch('http://127.0.0.1:9336/json/new?about:blank',{method:'PUT'})).json();break;}catch{}await wait(150);}assert.ok(target);
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map(),errors=[];
  ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
  const until=async expression=>{for(let i=0;i<100;i++){try{if(await evaluate(expression))return;}catch{}await wait(80);}throw new Error('Tutorial timed out: '+expression+' '+errors.join('; '));};
  const click=async selector=>{const r=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});const b=e.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2,w:b.width,h:b.height};})()`);const viewport=await evaluate('({w:innerWidth,h:innerHeight})');assert.ok(r.w>0&&r.h>0&&r.x>=0&&r.x<viewport.w&&r.y>=0&&r.y<viewport.h,'reachable tutorial control: '+selector+JSON.stringify({r,viewport}));await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1});};
  const navigate=async(url='/tutorial.html')=>{await send('Page.navigate',{url:'http://127.0.0.1:4317'+url});await until('document.querySelectorAll("#tutorial-board .cell").length===81');await wait(100);};
  const choose=async lesson=>evaluate(`(()=>{const s=document.querySelector('#tutorial-lesson');s.value=${JSON.stringify(lesson)};s.dispatchEvent(new Event('change'));})()`);
  const screenshot=async name=>{const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/'+name+'.png',Buffer.from(shot.data,'base64'));};
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate();await evaluate('localStorage.clear();sessionStorage.clear()');await navigate();
  const sentinel=await evaluate(`(()=>{const save='saved-match-preserved',profile='{"schema":1,"xp":321}',room='private-room-preserved';localStorage.setItem('little-kingdoms-save',save);localStorage.setItem('little-kingdoms-profile-v1',profile);sessionStorage.setItem('little-kingdoms-room',room);return{save,profile,room};})()`);
  await click('[data-index="0"]');await click('#tutorial-deploy');assert.equal(await evaluate('document.querySelectorAll(".cell.blue:not(.ghost)").length'),0);assert.equal(await evaluate('document.querySelector("#tutorial-feedback").textContent.includes("D6")'),true);
  for(const lesson of LESSONS){
    await choose(lesson.id);
    for(let n=0;n<lesson.steps.length;n++){
      const step=lesson.steps[n];
      if(lesson.id==='danger')assert.ok(await evaluate('document.querySelectorAll(".cell.blue.danger").length>0'));
      if(step.action==='pass')await click('#tutorial-pass');else{await click(`[data-index="${step.action}"]`);await click('#tutorial-deploy');}
      await until('!document.querySelector("#tutorial-next").hidden');
      if(step.blocked){assert.equal(await evaluate(`document.querySelector('[data-index="${step.action}"]').classList.contains('blue')||document.querySelector('[data-index="${step.action}"]').classList.contains('orange')`),false);}
      assert.equal(await evaluate('document.querySelectorAll(".cell.protected-castle").length'),0,'safe groups never show a flag');
      if(lesson.id==='single-eye'&&n===0){assert.equal(await evaluate('document.querySelectorAll(".cell.blue.danger").length'),0);await screenshot('tutorial-eye');await send('Page.reload');await until('document.querySelectorAll("#tutorial-board .cell").length===81 && !document.querySelector("#tutorial-next").hidden');assert.equal(await evaluate('document.querySelector("#tutorial-lesson").value'),'single-eye');}
      if(lesson.id==='large-territory'&&n===0)await screenshot('tutorial-territory');
      if(lesson.id==='danger'){assert.equal(await evaluate('document.querySelectorAll(".cell.blue.danger").length'),0);if(n===0)await screenshot('tutorial-defense');}
      await click('#tutorial-next');
    }
  }
  assert.equal(await evaluate('document.querySelector("#course-progress").textContent'),'10 / 10');assert.equal(await evaluate('document.querySelector("#tutorial-complete").hidden'),false);await screenshot('tutorial-complete');
  const seen=await evaluate(`({save:localStorage.getItem('little-kingdoms-save'),profile:localStorage.getItem('little-kingdoms-profile-v1'),room:sessionStorage.getItem('little-kingdoms-room')})`);assert.deepEqual(seen,sentinel,'practice cannot change a real match, room or XP');
  for(const[w,h]of[[320,568],[390,844],[844,390],[1366,768]]){
    await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<900});await choose('single-eye');await wait(120);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    for(const selector of['#tutorial-board','#tutorial-deploy','#tutorial-pass','#tutorial-lesson'])assert.equal(await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1})()`),true,selector+' fits '+w+'x'+h);
    await click('[data-index="29"]');await click('#tutorial-deploy');await click('#tutorial-next');await click('[data-index="20"]');await click('#tutorial-deploy');
    assert.equal(await evaluate('document.querySelector("#tutorial-next").getBoundingClientRect().bottom<=innerHeight'),true,'review fits '+w+'x'+h);
  }
  await screenshot('tutorial-desktop');
  await evaluate('navigator.serviceWorker.ready');await until(`caches.keys().then(keys=>keys.includes('little-kingdoms-v3.1.0'))`);
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await send('Page.reload');await until('document.querySelectorAll("#tutorial-board .cell").length===81');
  assert.deepEqual(errors,[]);console.log('Tutorial browser checks passed: all ten lessons, safe eyes, sealed territory, true danger/defense, blocked moves, refresh recovery, isolated match/XP data, phone/landscape/desktop and cached offline launch.');
}finally{ws?.close();edge.kill();}
