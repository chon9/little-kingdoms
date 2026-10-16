import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const artifactDir = path.resolve('artifacts');await mkdir(artifactDir,{recursive:true});
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--remote-debugging-port=9357','--user-data-dir='+path.join(artifactDir,'battle-ui-v270-profile'),'about:blank'
],{windowsHide:true,stdio:'ignore'});
const sockets=[];
let nextID=0;
async function page(width=1440,height=1080){
  let target;
  for(let i=0;i<80;i++){try{target=await(await fetch('http://127.0.0.1:9357/json/new?about:blank',{method:'PUT'})).json();break;}catch{await wait(150);}}
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
const p=await page(390,844);await p.navigate();await p.evaluate('localStorage.clear();sessionStorage.clear()');await p.navigate();await p.click('#begin');assert.equal(await p.evaluate('document.querySelector("#lead-label").textContent'),'Orange Lead 2');
async function fixture(blue,orange,turn=1){await p.evaluate(`(async()=>{const{newGame}=await import('/engine.js');const s=newGame();${JSON.stringify(blue)}.forEach(i=>s.board[i]=1);${JSON.stringify(orange)}.forEach(i=>s.board[i]=2);s.count=[0,${blue.length},${orange.length}];s.turn=${turn};s.ply=${blue.length+orange.length};localStorage.setItem('little-kingdoms-save',JSON.stringify({schema:1,config:{mode:'local',level:5,humanColor:1},state:s,started:true,snapshots:[]}));})()`);await p.navigate();}
for(const owner of [1,2])for(const actor of [1,2]){await fixture(owner===1?[2,10,18]:[],owner===2?[2,10,18]:[],actor);assert.equal(await p.evaluate('document.querySelectorAll(".cell")[0].getAttribute("aria-disabled")'),'true');await p.click('[data-index="30"]');await p.click('[data-index="0"]');assert.equal(await p.evaluate('document.querySelectorAll(".ghost").length'),0);assert.equal(await p.evaluate('document.querySelector("#deploy").disabled'),true);assert.match(await p.evaluate('document.querySelector("#toast").textContent'),/locked for both players/);}
await fixture([3,11,19,27],[]);assert.equal(await p.evaluate('document.querySelector("#lead-label").textContent'),'Blue Lead 4');await p.screenshot('battle-lead-blue-v270');
await fixture([1,10,18],[]);assert.equal(await p.evaluate('document.querySelector("#lead-label").textContent'),'Level · 0');
await fixture([1],[0]);await p.click('[data-index="9"]');await p.click('#deploy');await p.until('!!document.querySelector(".capture-callout")');assert.equal(await p.evaluate('document.querySelector(".capture-callout b").textContent'),'BLUE WINS BY CAPTURE');await p.screenshot('capture-blue-mobile-v270');await p.click('#play-again');assert.equal(await p.evaluate('document.querySelector("#lead-label").textContent'),'Orange Lead 2');
await fixture([0],[1],2);await p.click('[data-index="9"]');await p.click('#deploy');await p.until('!!document.querySelector(".capture-callout")');assert.equal(await p.evaluate('document.querySelector(".capture-callout b").textContent'),'ORANGE WINS BY CAPTURE');await p.screenshot('capture-orange-mobile-v270');
for(const [width,height] of [[320,568],[844,390],[1440,900]]){await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<720});await wait(150);assert.equal(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);const b=await p.evaluate('(()=>{const b=document.querySelector("#play-again").getBoundingClientRect();return {x:b.x,y:b.y,bottom:b.bottom,right:b.right}})()');assert.ok(b.y>=0&&b.bottom<=height&&b.x>=0&&b.right<=width,JSON.stringify({width,height,b}));await p.screenshot('capture-'+width+'-v270');}
await p.evaluate("(async()=>{const i=await import('/i18n.js');await i.setLanguage('zh-Hans');})()");await wait(100);assert.equal(await p.evaluate('document.querySelector(".capture-callout strong").textContent'),'破城定天下！');assert.equal(await p.evaluate('document.querySelector(".capture-callout b").textContent'),'橙方吃子获胜');await p.screenshot('capture-zh-v270');await p.click('#play-again');assert.equal(await p.evaluate('document.querySelector("#lead-label").textContent'),'橙方领先 2');
assert.deepEqual(p.errors,[]);console.log('Battle UI checks passed: opening handicap, both lead colors, tied score, locked owner and opponent squares, clearing selection, blue/orange capture, replay, 320px, landscape and desktop.');
}finally{for(const ws of sockets)ws.close();edge.kill();}

