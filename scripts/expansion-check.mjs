import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const releaseVersion=JSON.parse(await readFile('package.json','utf8')).version;
const artifactDir = path.resolve('artifacts');await mkdir(artifactDir,{recursive:true});
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--remote-debugging-port=9364','--user-data-dir='+path.join(artifactDir,'expansion-ui-v300-profile'),'about:blank'
],{windowsHide:true,stdio:'ignore'});
const sockets=[];
let nextID=0;
async function page(width=1440,height=1080){
  let target;
  for(let i=0;i<80;i++){try{target=await(await fetch('http://127.0.0.1:9364/json/new?about:blank',{method:'PUT'})).json();break;}catch{await wait(150);}}
  if(!target)throw new Error('Could not connect to local Edge browser.');
  const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),errors=[];
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});sockets.push(ws);
  ws.onmessage=({data})=>{const msg=JSON.parse(data);if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);}}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextID;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<720});
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
  const until=async(expression,ms=8000)=>{const start=Date.now();while(Date.now()-start<ms){if(await evaluate(expression))return;await wait(80);}throw new Error('Timed out waiting for '+expression);};
  const click=async selector=>{
    await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest',inline:'nearest'})`);
    const box=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing element');const b=e.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2,width:b.width,height:b.height};})()`);
    const viewport=await evaluate('({width:innerWidth,height:innerHeight})');
    assert.ok(box.width>0&&box.height>0&&box.y>=0&&box.y<viewport.height&&box.x>=0&&box.x<viewport.width,selector+' must be visible and reachable '+JSON.stringify({box,viewport}));
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x,y:box.y,button:'left',clickCount:1});
  };
  const navigate=async(url='http://127.0.0.1:4317/')=>{await send('Page.navigate',{url});try{await until('document.querySelectorAll(".cell").length===81',15000);}catch(error){console.log('PAGE DIAGNOSTIC',await evaluate('({url:location.href,state:document.readyState,text:document.body?.innerText.slice(0,400),cells:document.querySelectorAll(".cell").length})'),errors);throw error;}await wait(300);};
  const screenshot=async(name,full=false)=>{if(full){const m=await send('Page.getLayoutMetrics');const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:width,height:m.cssContentSize.height,scale:1}});await writeFile(path.join(artifactDir,name+'.png'),Buffer.from(shot.data,'base64'));}else{const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(artifactDir,name+'.png'),Buffer.from(shot.data,'base64'));}};
  return{send,evaluate,until,click,navigate,screenshot,errors};
}

try{
  const p=await page(390,844);await p.navigate();await p.evaluate(`localStorage.clear();sessionStorage.clear();localStorage.setItem('little-kingdoms-profile-v1',JSON.stringify({schema:1,xp:35200,avatar:40,cosmetics:{owned:['c50','b40'],spent:2,castle:'c50',board:'b40'}}))`);await p.navigate();
  await p.click('#profile-button');assert.equal(await p.evaluate('document.querySelectorAll(".avatar-card").length'),60);await p.click('[data-avatar="59"]');await p.click('#modal-close');
  assert.match(await p.evaluate('document.querySelector("#profile-avatar").style.backgroundImage'),/a59.webp/);
  await p.click('#mode-local');await p.click('#begin');await p.until('!document.querySelector("#cutin").hidden');assert.match(await p.evaluate('document.querySelector("#cutin-portrait").style.backgroundImage'),/a59.webp/);
  await p.click('[data-index="30"]');await p.click('#deploy');assert.match(await p.evaluate('document.querySelector("[data-index=\\"30\\"] img").src'),/c50.webp/);assert.match(await p.evaluate('document.querySelector(".board-space").style.getPropertyValue("--board-art")'),/b40.webp/);await wait(2500);await p.screenshot('new-avatar-castle-board-phone-v300');
  const paths=await p.evaluate(`Promise.all([import('/progression.js'),import('/cosmetics.js')]).then(([a,c])=>[...a.AVATARS.slice(40).map(x=>x.image),...c.COSMETICS.filter(x=>x.id[0]==='c'?Number(x.id.slice(1))>30:Number(x.id.slice(1))>20).map(x=>x.image)])`);assert.equal(paths.length,60);
  assert.equal(await p.evaluate(`Promise.all(${JSON.stringify(paths)}.map(src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.naturalWidth>=256);i.onerror=()=>resolve(false);i.src=src;}))).then(x=>x.every(Boolean))`),true);
  await p.until(`(async()=>{await navigator.serviceWorker.ready;const c=await caches.open('little-kingdoms-v3.1.0');return (await Promise.all(${JSON.stringify(paths)}.map(x=>c.match(x)))).every(Boolean);})()`,20000);
  await p.send('Network.enable');await p.send('Network.clearBrowserCache');await p.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await p.navigate();assert.match(await p.evaluate('document.querySelector("#profile-avatar").style.backgroundImage'),/a59.webp/);assert.equal(await p.evaluate(`Promise.all(${JSON.stringify(paths)}.map(src=>fetch(src).then(r=>r.ok))).then(x=>x.every(Boolean))`),true);
  await p.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await p.send('Page.navigate',{url:'http://127.0.0.1:4317/download.html'});await p.until('!!document.querySelector("#download-windows")');assert.equal(await p.evaluate('document.querySelector("#download-windows").href'),`https://github.com/chon9/little-kingdoms/releases/download/v${releaseVersion}/LittleKingdoms-${releaseVersion}-Windows.zip`);
  await p.evaluate('window.__downloadClicks=0;document.querySelector("#download-windows").onclick=e=>{e.preventDefault();window.__downloadClicks++}');
  for(const [w,h]of[[320,568],[390,844],[844,390],[1440,900]]){await p.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<720});await p.click('#download-windows');assert.equal(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
  assert.equal(await p.evaluate('window.__downloadClicks'),4);await p.evaluate("import('/i18n.js').then(m=>m.setLanguage('zh-Hans'))");await p.until('document.querySelector("h1").textContent.includes("战场")');await p.screenshot('windows-download-zh-v300');assert.deepEqual(p.errors,[]);
  console.log('Expansion assets passed: 60 new images decode and cache offline, new avatar equip/cut-in and faction-colored c50/b40, 60-avatar roster, pinned Windows download/checksum links, four page widths and Chinese.');
}finally{for(const ws of sockets)ws.close();edge.kill();}

