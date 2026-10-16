import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const artifactDir = path.resolve('artifacts');await mkdir(artifactDir,{recursive:true});
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--remote-debugging-port=9340','--user-data-dir='+path.join(artifactDir,'music-profile'),'about:blank'
],{windowsHide:true,stdio:'ignore'});
const sockets=[];
let nextID=0;
async function page(width=1440,height=1080){
  let target;
  for(let i=0;i<80;i++){try{target=await(await fetch('http://127.0.0.1:9340/json/new?about:blank',{method:'PUT'})).json();break;}catch{await wait(150);}}
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
  const p=await page(390,844);await p.navigate();await p.evaluate('localStorage.clear();sessionStorage.clear();localStorage.setItem("little-kingdoms-audio-v1",JSON.stringify({music:.35,effects:.55,cutins:true,voice:false,muted:false,track:"war-theme",musicMode:"repeat"}))');await p.navigate();
  await p.click('#begin');const match=await p.evaluate('localStorage.getItem("little-kingdoms-save")');
  await p.click('#settings-nav');
  assert.equal(await p.evaluate('document.querySelectorAll("#music-track option").length'),7);
  assert.equal(await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-audio-v1")).track'),'pb-545843','retired music selection migrates to the new catalog');
  assert.equal(await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-audio-v1")).musicMode'),'repeat','migration preserves playback mode');
  assert.equal(await p.evaluate('document.querySelector("#music-track").value'),'pb-545843');
  const select=async(id,value)=>p.evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const tracks=await p.evaluate(`import('/music-library.js').then(m=>m.MUSIC_TRACKS)`);
  for(const track of tracks){
    await select('music-track',track.id);
    await p.until(`document.querySelector('#game-music').currentSrc.endsWith(${JSON.stringify(track.file)})&&document.querySelector('#game-music').currentTime>.1`);
    const duration=await p.evaluate('document.querySelector("#game-music").duration');assert.ok(Math.abs(duration-track.duration)<.2,'complete decodable recording '+track.id);
    assert.equal(await p.evaluate('document.querySelector("#music-source").href'),track.source);assert.equal(await p.evaluate('document.querySelector("#music-license").textContent'),track.license);assert.equal(await p.evaluate('document.querySelector("#music-license").href'),track.licenseUrl);
  }
  await select('music-track','pb-155927');await select('music-mode','rotation');await p.until('document.querySelector("#game-music").currentSrc.endsWith("/assets/music/pb-155927.mp3")&&document.querySelector("#game-music").currentTime>.1');await p.evaluate('document.querySelector("#game-music").playbackRate=16');await p.until('document.querySelector("#music-track").value==="pb-545843"');await p.until('document.querySelector("#game-music").currentTime>.1');await p.evaluate('document.querySelector("#game-music").playbackRate=1');
  await select('music-track','pb-155927');await select('music-mode','rotation');
  // Accelerated real playback reaches the end without relying on HTTP seeking.
  await p.until('document.querySelector("#game-music").currentSrc.endsWith("/assets/music/pb-155927.mp3")&&document.querySelector("#game-music").currentTime>.1');
  await p.evaluate('document.querySelector("#game-music").playbackRate=16');
  await p.until('document.querySelector("#music-track").value==="pb-545843"');
  await p.until('document.querySelector("#game-music").currentTime>.1');
  await p.evaluate('document.querySelector("#game-music").playbackRate=1');
  await select('music-track','pb-155927');await select('music-mode','repeat');assert.equal(await p.evaluate('document.querySelector("#game-music").loop'),true);
  await p.until('document.querySelector("#game-music").currentSrc.endsWith("/assets/music/pb-155927.mp3")&&document.querySelector("#game-music").currentTime>.1');
  await p.evaluate('document.querySelector("#game-music").playbackRate=16');
  await p.until('document.querySelector("#game-music").currentTime>28');await p.until('document.querySelector("#game-music").currentTime<10');
  assert.equal(await p.evaluate('document.querySelector("#music-track").value'),'pb-155927');
  await p.evaluate('document.querySelector("#game-music").playbackRate=1');
  await p.click('#music-next');assert.equal(await p.evaluate('document.querySelector("#music-track").value'),'pb-545843');
  await select('music-mode','shuffle');const heard=[await p.evaluate('document.querySelector("#music-track").value')];
  for(let i=0;i<tracks.length-1;i++){await p.click('#music-next');heard.push(await p.evaluate('document.querySelector("#music-track").value'));}
  assert.equal(new Set(heard).size,tracks.length,'shuffle has no duplicate within a cycle');
  await select('music-track','pb-489219');await select('music-mode','repeat');
  await p.evaluate('document.querySelector("#music-volume").value=24;document.querySelector("#music-volume").dispatchEvent(new Event("input"))');
  await p.click('#setting-sound');assert.equal(await p.evaluate('document.querySelector("#game-music").paused'),true);await p.click('#setting-sound');
  await p.until('!document.querySelector("#game-music").paused');
  await select('music-track','pb-390058');await select('language-select','zh-Hans');await p.until('document.documentElement.lang==="zh-Hans"');
  assert.equal(await p.evaluate('document.querySelector("#music-now-playing").textContent'),'东方雅韵');
  assert.equal(await p.evaluate('document.querySelector("#music-author").textContent'),'geoffharvey');
  for(const [w,h]of [[320,568],[390,844],[844,390],[1366,768]]){
    await p.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<720});
    await p.click('#music-next');await p.click('#music-track');await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await p.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    assert.equal(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await p.screenshot('music-zh-'+w);
  }
  await select('music-track','pb-545843');
  assert.equal(await p.evaluate('localStorage.getItem("little-kingdoms-save")'),match,'music preferences preserve the saved match');
  await p.until(`(async()=>{await navigator.serviceWorker.ready;const cache=await caches.open('little-kingdoms-v3.1.0');return (await Promise.all(${JSON.stringify(tracks.map(t=>t.file))}.map(f=>cache.match(f)))).every(Boolean);})()`,20000);
  await p.send('Network.enable');await p.send('Network.clearBrowserCache');await p.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await p.navigate();await p.click('#settings-nav');
  assert.equal(await p.evaluate('document.querySelector("#music-track").value'),'pb-545843');
  assert.equal(await p.evaluate('document.querySelector("#music-mode").value'),'repeat');
  assert.equal(await p.evaluate('document.querySelector("#game-music").volume'),.24);
  assert.equal(await p.evaluate('document.documentElement.lang'),'zh-Hans');
  for(const track of tracks){await select('music-track',track.id);await p.until(`document.querySelector('#game-music').currentSrc.endsWith(${JSON.stringify(track.file)})&&document.querySelector('#game-music').currentTime>.1`);}
  await select('music-track','pb-155927');await select('music-mode','rotation');await p.until('document.querySelector("#game-music").currentSrc.endsWith("/assets/music/pb-155927.mp3")&&document.querySelector("#game-music").currentTime>.1');
  await p.evaluate('document.querySelector("#game-music").playbackRate=16');
  await p.until('document.querySelector("#music-track").value==="pb-545843"');await p.until('document.querySelector("#game-music").currentTime>.1');
  assert.deepEqual(p.errors,[]);
  console.log('Music checks passed: all seven supplied Pixabay recordings with accurate per-track licenses decode/play online and cold-offline, actual media-ended rotation and repeat, shuffle, next, mute, persisted track/mode/volume, Chinese controls, reachable 320px/landscape/PC layouts, and saved-match preservation.');
}finally{for(const s of sockets)s.close();edge.kill();}

