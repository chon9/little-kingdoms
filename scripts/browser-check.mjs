import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const artifactDir = path.resolve('artifacts');await mkdir(artifactDir,{recursive:true});
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--remote-debugging-port=9333','--user-data-dir='+path.join(artifactDir,'browser-profile'),'about:blank'
],{windowsHide:true,stdio:'ignore'});
const sockets=[];
let nextID=0;
async function page(width=1440,height=1080){
  let target;
  for(let i=0;i<80;i++){try{target=await(await fetch('http://127.0.0.1:9333/json/new?about:blank',{method:'PUT'})).json();break;}catch{await wait(150);}}
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
  const desktop=await page();await desktop.navigate();
  await desktop.evaluate('localStorage.clear();sessionStorage.clear()');await desktop.navigate();
  assert.equal(await desktop.evaluate('(async()=>{await document.fonts.ready;return (await document.fonts.load("16px Marcellus")).length>0&&(await document.fonts.load("14px \\\"DM Sans\\\"")).length>0;})()'),true,'bundled fonts load successfully');
  assert.equal(await desktop.evaluate('document.querySelector("#blue-castles").textContent'),'40');
  assert.equal(await desktop.evaluate('Math.abs(document.querySelector(".cell").getBoundingClientRect().width-document.querySelector(".cell").getBoundingClientRect().height)<1'),true,'board cells are square');
  await desktop.screenshot('desktop');
  assert.equal(await desktop.evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'desktop fits viewport');
  await desktop.click('#begin');await desktop.click('[data-index="30"]');await desktop.click('#deploy');
  await desktop.until('document.querySelectorAll(".cell.blue,.cell.orange").length===2 && !document.querySelector("#pass").disabled');
  assert.equal(await desktop.evaluate('document.querySelector("#blue-castles").textContent'),'39');
  await desktop.screenshot('desktop-playing');
  await desktop.click('#undo');assert.equal(await desktop.evaluate('document.querySelectorAll(".cell.blue,.cell.orange").length'),0);
  await desktop.click('#generals-nav');assert.equal(await desktop.evaluate('document.querySelectorAll(".avatar-card").length'),40);await desktop.click('#modal-close');
  await desktop.click('#rules-nav');assert.equal(await desktop.evaluate('document.querySelector("#modal-content").textContent.includes("5 more raw territory")'),true);await desktop.click('#modal-close');
  // Local PvP exercises pass/pass and the actual result dialog.
  await desktop.click('#battle-back');await desktop.click('#mode-local');if(await desktop.evaluate('document.querySelector("#modal").open && !!document.querySelector("#confirm-change")'))await desktop.click('#confirm-change');
  await desktop.click('#begin');await desktop.click('#pass');await desktop.click('#pass');
  await desktop.until('document.querySelector("#modal").open && document.querySelector("#modal-content").textContent.includes("Wei rules")');
  await desktop.click('#modal-close');
  // Two independent tabs take online seats and see the same board through polling.
  await desktop.click('#battle-back');await desktop.click('#mode-online');await desktop.click('#create-room');await desktop.until('!document.querySelector("#room-details").hidden');
  const code=await desktop.evaluate('document.querySelector("#active-room-code").textContent');
  const guest=await page(390,844);await guest.navigate('http://127.0.0.1:4317/?room='+code);
  await guest.evaluate('document.querySelector("#join-form").requestSubmit()');
  await desktop.until('document.querySelector("#room-status").textContent.startsWith("Connected")');
  await guest.until('document.querySelector("#room-status").textContent.startsWith("Connected")');
  await desktop.click('[data-index="30"]');await desktop.click('#deploy');
  await guest.until('document.querySelectorAll(".cell.blue").length===1');
  await guest.click('[data-index="50"]');await guest.click('#deploy');
  await desktop.until('document.querySelectorAll(".cell.orange").length===1');
  await guest.screenshot('mobile-online',true);
  await guest.navigate('http://127.0.0.1:4317/?room='+code);
  await guest.until('document.querySelectorAll(".cell.orange").length===1');
  assert.equal(await guest.evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'mobile 390 fits viewport');
  // Small mobile layout and fresh bot game, isolated via storage clearing.
  const mobile=await page(360,800);await mobile.navigate();
  await mobile.evaluate('localStorage.clear();sessionStorage.clear()');await mobile.navigate();
  await mobile.screenshot('mobile',true);
  assert.equal(await mobile.evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'mobile 360 fits viewport');
  await mobile.click('#begin');await mobile.click('[data-index="20"]');await mobile.click('#deploy');
  await mobile.until('document.querySelectorAll(".cell.blue,.cell.orange").length===2 && !document.querySelector("#pass").disabled');
  await mobile.screenshot('mobile-playing',true);
  await mobile.click('#battle-back');await mobile.click('[data-level="10"]');
  await mobile.click('#confirm-change');
  assert.equal(await mobile.evaluate('document.querySelector("#general-name").textContent.includes("Cao Cao")'),true,'changing level prepares the correct general');
  assert.equal(await mobile.evaluate('document.querySelector("#blue-castles").textContent'),'40');
  const seed = async(blue,orange)=>{
    await mobile.evaluate(`(async()=>{const {newGame}=await import('/engine.js');const s=newGame();${JSON.stringify(blue)}.forEach(i=>s.board[i]=1);${JSON.stringify(orange)}.forEach(i=>s.board[i]=2);s.count=[0,${blue.length},${orange.length}];s.ply=${blue.length+orange.length};localStorage.setItem('little-kingdoms-save',JSON.stringify({schema:1,config:{mode:'bot',level:5,humanColor:1},state:s,started:true,snapshots:[]}));})()`);
    await mobile.navigate();
  };
  await seed([1,9],[10]);await mobile.click('[data-index="11"]');await mobile.click('#deploy');
  await mobile.until('document.querySelector("#hero-portrait").classList.contains("shock")');
  assert.equal(await mobile.evaluate('document.querySelector("#hero-portrait").style.backgroundImage.includes("generals-shock.webp")'),true,'threat triggers shocked portrait');
  await mobile.screenshot('mobile-shocked',true);
  await mobile.until('!document.querySelector("#hero-portrait").classList.contains("shock")',6500);
  await seed([1],[0]);await mobile.click('[data-index="9"]');await mobile.click('#deploy');
  await mobile.until('document.querySelector("#modal").open && document.querySelector("#hero-portrait").classList.contains("sad")');
  assert.equal(await mobile.evaluate('document.querySelector("#modal-content").textContent.includes("Shu rules")'),true,'capture shows the correct winner and a sad rival');
  await mobile.click('#modal-close');
  // A single protected liberty must never show a capture warning.
  await seed([10,11,12,19,21,28,29,30],[1,2,3,9,13,18,22,27,31,37,38,39]);
  assert.equal(await mobile.evaluate('document.querySelectorAll(".cell.blue.danger").length'),0);
  assert.equal(await mobile.evaluate('document.querySelectorAll(".cell.protected-castle").length'),0,'safe groups have no flags');
  assert.equal(await mobile.evaluate('document.querySelector("[data-index=\\"10\\"]").getAttribute("aria-label").includes("protected by sealed territory")'),true);
  await mobile.screenshot('protected-eye');
  await mobile.click('.danger-help');assert.equal(await mobile.evaluate('document.querySelector(".comic-book").dataset.comicPage'),'5');
  await mobile.click('[data-rule-try="eye"]');assert.equal(await mobile.evaluate('document.querySelector("#rule-feedback-eye").textContent.includes("BLOCKED")'),true);
  await mobile.screenshot('comic-eye');await mobile.click('#comic-next');
  await mobile.click('[data-rule-try="large"]');assert.equal(await mobile.evaluate('document.querySelector("#rule-feedback-large").textContent.includes("BLOCKED")'),true);
  await mobile.click('[data-rule-try="open"]');assert.equal(await mobile.evaluate('document.querySelector("#rule-feedback-open").textContent.includes("LEGAL")'),true);
  await mobile.click('#comic-next');await mobile.click('[data-rule-try="contested"]');assert.equal(await mobile.evaluate('document.querySelector("#rule-feedback-contested").textContent.includes("LEGAL")'),true);
  await mobile.click('#modal-close');
  await seed([0],[1]);assert.equal(await mobile.evaluate('document.querySelectorAll(".cell.blue.danger").length'),1,'real capturable group still gets a danger warning');
  // The battlefield and all primary controls must fit without page scrolling.
  for(const [w,h] of [[320,568],[360,640],[390,844],[844,390],[1366,768]]){
    await mobile.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<900});await wait(160);
    const fits=await mobile.evaluate(`(()=>{const ids=['#board','#deploy','#pass','#undo','.game-nav'];return ids.every(id=>{const r=document.querySelector(id).getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1;});})()`);
    assert.equal(fits,true,`battle controls must fit ${w}x${h}`);
    await mobile.click('#battle-back');
    const lobbyFits=await mobile.evaluate(`(()=>{const r=document.querySelector('#begin').getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight-40;})()`);assert.equal(lobbyFits,true,`lobby launch button must fit ${w}x${h}`);
    await mobile.click('#resume');
  }
  await mobile.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await mobile.click('#battle-back');await mobile.screenshot('mobile-lobby');await mobile.click('#resume');
  // Verify the service worker actually launches the game offline from its cache.
  await mobile.evaluate('navigator.serviceWorker.ready');
  await mobile.until(`(async()=>{const c=await caches.open('little-kingdoms-v2.8.1');return !!(await c.match('/assets/dm-sans.woff2'));})()`);
  await mobile.send('Network.enable');await mobile.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await mobile.send('Page.reload');await wait(200);await mobile.until('document.querySelectorAll(".cell").length===81');
  await mobile.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  // Exercise the reported multi-turn defense through the real level-10 Worker.
  await mobile.evaluate(`(async()=>{const{newGame,play}=await import('/engine.js');let s=newGame();for(const move of ['pass',9,10,36,1,'pass',19])s=play(s,move);sessionStorage.removeItem('little-kingdoms-room');localStorage.removeItem('little-kingdoms-room');localStorage.setItem('little-kingdoms-save',JSON.stringify({schema:1,config:{mode:'bot',level:10,humanColor:1},state:s,started:true,snapshots:[]}));})()`);
  await mobile.navigate();
  await mobile.until('document.querySelector("[data-index=\\"18\\"]").classList.contains("orange") && !document.querySelector("#pass").disabled',10000);
  await mobile.click('[data-index="0"]');await mobile.click('#deploy');
  await mobile.until('document.querySelector("[data-index=\\"27\\"]").classList.contains("orange") && !document.querySelector("#pass").disabled',10000);
  // A settled board must pass through the real Worker and finish on two passes.
  const settled=await mobile.evaluate(`(async()=>{const{newGame}=await import('/engine.js');const s=newGame();for(let i=0;i<81;i++)if(i!==40)s.board[i]=i%9<4?1:i%9===4?0:2;for(const i of [10,11,19,20,16,25])s.board[i]=0;s.count=[0,s.board.filter(c=>c===1).length,s.board.filter(c=>c===2).length];s.ply=s.count[1]+s.count[2];s.turn=2;localStorage.setItem('little-kingdoms-save',JSON.stringify({schema:1,config:{mode:'bot',level:10,humanColor:1},state:s,started:true,snapshots:[]}));return s;})()`);
  await mobile.navigate();await mobile.until('JSON.parse(localStorage.getItem("little-kingdoms-save")).state.passes===1 && !document.querySelector("#pass").disabled');
  assert.deepEqual(await mobile.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state.board'),settled.board,'AI leaves its territory and settled shared spaces empty');
  await mobile.click('#pass');await mobile.until('document.querySelector("#modal").open');
  const settledEnd=await mobile.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state');assert.equal(settledEnd.reason,'territory');assert.deepEqual(settledEnd.board,settled.board);assert.deepEqual(settledEnd.count,settled.count);
  // Exercise earned XP, locked/equipped avatars, their in-match identity and audio.
  const progress=await page(390,844);await progress.navigate();
  await progress.evaluate('localStorage.clear();sessionStorage.clear()');await progress.navigate();
  await progress.click('#profile-button');
  assert.equal(await progress.evaluate('document.querySelectorAll(".avatar-card").length'),40);
  await progress.click('[data-avatar="20"]');assert.equal(await progress.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-profile-v1")||"{}").avatar'),undefined,'locked avatar cannot be equipped');
  await progress.click('[data-avatar="10"]');assert.equal(await progress.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-profile-v1")).avatar'),10);
  await progress.screenshot('avatar-collection');await progress.click('#modal-close');
  await progress.evaluate(`(async()=>{const{newGame,play}=await import('/engine.js');let s={...newGame(),matchId:'browser-xp-capture',players:{1:{avatar:10}}};for(const m of [1,0,30,50])s=play(s,m);localStorage.setItem('little-kingdoms-save',JSON.stringify({schema:1,config:{mode:'bot',level:1,humanColor:1},state:s,started:true,snapshots:[]}));})()`);
  await progress.navigate();await progress.click('[data-index="9"]');await progress.click('#deploy');
  await progress.until('document.querySelector("#match-reward")?.textContent.includes("+117 XP")');
  assert.equal(await progress.evaluate('document.querySelector("#match-reward").textContent.includes("Guan Yu")'),true,'level up announces newly unlocked general');
  assert.equal(await progress.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-profile-v1")).xp'),117);
  await progress.screenshot('level-up');await progress.click('#modal-close');
  await progress.navigate();assert.equal(await progress.evaluate('document.querySelector("#profile-level").textContent'),'LV. 2');
  await progress.click('#profile-button');await progress.click('[data-avatar="20"]');await progress.click('#modal-close');
  await progress.click('#battle-back');await progress.click('#begin');
  assert.equal(await progress.evaluate('document.querySelector("#blue-avatar").getAttribute("aria-label")'),'Guan Yu');
  assert.equal(await progress.evaluate('!document.querySelector("#cutin").hidden && document.querySelector("#cutin-name").textContent.includes("Guan Yu")'),true,'self avatar appears in anime cut-in');
  assert.equal(await progress.evaluate('document.querySelector("#cutin-line").textContent.includes("I stand by my oath")'),true);
  await wait(350);await progress.screenshot('anime-cutin');
  await progress.until('document.querySelector("#game-music").currentTime>0.1');
  const music=await progress.evaluate('({duration:document.querySelector("#game-music").duration,loop:document.querySelector("#game-music").loop})');assert.ok(music.duration>64&&music.duration<66);assert.equal(music.loop,false);
  await progress.click('#sound');assert.equal(await progress.evaluate('document.querySelector("#game-music").paused'),true);
  await progress.click('#settings-nav');
  await progress.evaluate('document.querySelector("#music-volume").value=22;document.querySelector("#music-volume").dispatchEvent(new Event("input"))');
  assert.equal(await progress.evaluate('document.querySelector("#game-music").volume'),.22);
  await progress.click('#setting-cutins');assert.equal(await progress.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-audio-v1")).cutins'),false);
  await progress.click('#modal-close');await progress.navigate();
  assert.equal(await progress.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-audio-v1")).music'),.22);
  await progress.click('#profile-button');await progress.click('#rival-tab');assert.equal(await progress.evaluate('document.querySelectorAll(".roster-card").length'),20,'challenge roster remains separate from avatar collection');await progress.click('#modal-close');
  const allErrors=[...desktop.errors,...guest.errors,...mobile.errors,...progress.errors];assert.deepEqual(allErrors,[],'no uncaught browser exceptions');
  console.log('Browser checks passed: bundled fonts, 320px–desktop and landscape, visible touch controls, offline cached launch, bot turn, undo, roster, rules, local scoring, online create/join, bidirectional synchronization, reload reconnect, level changes, expressions, and the real level-10 Worker defending the reproduced multi-turn trap.');
}finally{for(const s of sockets)s.close();edge.kill();}

