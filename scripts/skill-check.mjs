import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const artifactDir = path.resolve('artifacts');await mkdir(artifactDir,{recursive:true});
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--remote-debugging-port=9365','--user-data-dir='+path.join(artifactDir,'skill-ui-v310-profile'),'about:blank'
],{windowsHide:true,stdio:'ignore'});
const sockets=[];
let nextID=0;
async function page(width=1440,height=1080){
  let target;
  for(let i=0;i<80;i++){try{target=await(await fetch('http://127.0.0.1:9365/json/new?about:blank',{method:'PUT'})).json();break;}catch{await wait(150);}}
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

const profile=p=>p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-profile-v1"))');
async function fixture(p,rating=1040,games=20,peak=0){
 await p.evaluate(`(async()=>{localStorage.clear();sessionStorage.clear();const{newGame,play}=await import('/engine.js');let s={...newGame(),matchId:crypto.randomUUID(),rated:true};for(const n of[1,0,30,50])s=play(s,n);localStorage.setItem('little-kingdoms-profile-v1',JSON.stringify({schema:1,xp:1000,avatar:0,skill:{schema:1,rating:${rating},games:${games},wins:10,peak:${peak}},cosmetics:{owned:['c01'],spent:1,castle:'c01'}}));localStorage.setItem('little-kingdoms-save',JSON.stringify({schema:1,started:true,config:{mode:'bot',level:5,humanColor:1},state:s,snapshots:[]}));})()`);await p.navigate();
}
try{
 const p=await page(390,844);await p.navigate();await fixture(p);assert.equal(await p.evaluate('document.querySelector("#undo").disabled'),true);
 await p.click('[data-index="9"]');await p.click('#deploy');await p.until('!!document.querySelector(".skill-result.win")');const won=await profile(p);assert.ok(won.skill.rating>1040);assert.equal(won.skill.games,21);assert.match(await p.evaluate('document.querySelector(".skill-result").textContent'),/PROMOTION/);assert.equal(won.cosmetics.castle,'c01');await p.screenshot('skill-promotion-phone-v310');
 await p.navigate();await p.click('#undo');await p.until('!!document.querySelector(".result-view")');assert.equal((await profile(p)).skill.rating,won.skill.rating,'reload rates once');await p.click('#result-lobby');await p.click('#profile-button');await p.click('#skill-details');await p.until('!!document.querySelector(".skill-view")');assert.equal(await p.evaluate('document.querySelectorAll(".skill-rung").length'),29);
 for(const [w,h]of[[320,568],[390,844],[844,390],[1440,900]]){await p.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<720});await wait(100);await p.click('#skill-back');await p.click('#skill-details');const box=await p.evaluate('document.querySelector("#skill-back").getBoundingClientRect().toJSON()');assert.ok(box.top>=0&&box.bottom<=h&&box.left>=0&&box.right<=w);assert.equal(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await p.screenshot('skill-journey-'+w+'-v310');}
 await p.evaluate("import('/i18n.js').then(m=>m.setLanguage('zh-Hans'))");await p.until('document.querySelector(".skill-view h2").textContent.includes("棋力")');await p.screenshot('skill-journey-zh-v310');
 const untranslated=await p.evaluate(`(()=>{const copy=document.querySelector('.skill-view').cloneNode(true);copy.querySelectorAll('.skill-seal').forEach(e=>e.remove());return copy.textContent.replace(/AI|XP|PvP/g,'').match(/[A-Za-z]{2,}/g);})()`);assert.equal(untranslated,null);
 await p.evaluate("import('/i18n.js').then(m=>m.setLanguage('en'))");await fixture(p,1051,20,1);await p.click('#resign');await p.click('#confirm-resign');await p.until('!!document.querySelector(".skill-result.loss")');const lost=await profile(p);assert.ok(lost.skill.rating<1051);assert.equal(lost.skill.peak,1);assert.equal(lost.xp,1000);await p.screenshot('skill-demotion-pc-v310');
 // Restarting records one loss. Merely returning to the lobby or cancelling does not.
 await fixture(p);await p.click('#battle-back');assert.equal((await profile(p)).skill.games,20);await p.click('#resume');await p.click('#battle-restart');await p.click('#cancel-restart');assert.equal((await profile(p)).skill.games,20);await p.click('#battle-restart');await p.click('#confirm-restart');assert.equal((await profile(p)).skill.games,21);assert.ok((await profile(p)).skill.rating<1040);
 await p.click('#battle-back');await p.click('#settings-nav');await p.click('#setting-ranked');await p.click('#modal-close');await p.click('#begin');await p.click('[data-index="30"]');await p.click('#deploy');await p.until('!document.querySelector("#undo").disabled');const casual=await profile(p);await p.click('#resign');await p.click('#confirm-resign');await p.until('!!document.querySelector(".skill-result.practice")');assert.equal((await profile(p)).skill.games,casual.skill.games,'AI practice does not rate');
 await p.click('#result-lobby');await p.click('#rankings-nav');await p.click('#rank-skill');await p.until('!!document.querySelector(".skill-view")');
 await p.until(`(async()=>{await navigator.serviceWorker.ready;const c=await caches.open('little-kingdoms-v3.1.0');return !!(await c.match('/skill-ui.js'))&&!!(await c.match('/locales/zh-skill.js'));})()`,20000);await p.send('Network.enable');await p.send('Network.clearBrowserCache');await p.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await p.navigate();await p.click('#profile-button');await p.click('#skill-details');assert.ok(await p.evaluate('document.querySelector(".skill-view")!==null'));assert.deepEqual(p.errors,[]);
 console.log('Skill UI passed: capture promotion, resignation demotion, reload idempotence, XP/cosmetic preservation, ranked undo lock, explicit restart loss, cancel/lobby safety, AI practice undo/no rating, leaderboard entry, 29-rank journey, four sizes, Chinese and cold offline.');
}finally{for(const ws of sockets)ws.close();edge.kill();}

