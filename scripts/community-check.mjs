import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// This suite creates fixture identities and rooms. Never seed a public leaderboard.
const base=process.env.KINGDOMS_TEST_URL||'http://127.0.0.1:4317',port=9338;
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'Community fixture checks require a local preview.');
const checkArt=process.argv.includes('--art'),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await mkdir('artifacts',{recursive:true});
const edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--remote-debugging-port='+port,'--user-data-dir='+path.resolve('artifacts/community-profile'),'about:blank'
],{windowsHide:true,stdio:'ignore'});
const sockets=[];let sequence=0;
async function page(width,height){
  let target;for(let n=0;n<100;n++){try{target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();break;}catch{await wait(100);}}
  assert.ok(target,'Edge starts');const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),errors=[];
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});sockets.push(ws);
  ws.onmessage=({data})=>{const message=JSON.parse(data);if(message.id){const request=pending.get(message.id);if(request){pending.delete(message.id);message.error?request.reject(new Error(JSON.stringify(message.error))):request.resolve(message.result);}}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<720});await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;};
  const until=async expression=>{for(let n=0;n<180;n++){if(await evaluate(expression))return;await wait(70);}throw new Error(`Timed out at ${width}x${height}: ${expression}`);};
  const reachable=async selector=>assert.equal(await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element||element.disabled)return false;const b=element.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return b.width>0&&b.height>0&&b.top>=0&&b.bottom<=innerHeight+1&&b.left>=0&&b.right<=innerWidth+1&&element.contains(hit);})()`),true,`${selector} is reachable at ${width}x${height}`);
  const click=async(selector,{scroll=false}={})=>{if(scroll)await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);await reachable(selector);const point=await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};})()`);for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});};
  const navigate=async()=>{await send('Page.navigate',{url:base+'/index.html'});await until('document.querySelectorAll("#board .cell").length===81');};
  const fixture=async({xp=0,owned=[],castle='classic',board='classic',wins=0,matches=0,battle=false}={})=>{
    await evaluate(`(async()=>{localStorage.clear();sessionStorage.clear();const{normalizeProfile}=await import('/progression.js');const profile=normalizeProfile({schema:1,xp:${xp},wins:${wins},matches:${matches},cosmetics:${JSON.stringify({owned,castle,board})}});localStorage.setItem('little-kingdoms-profile-v1',JSON.stringify(profile));localStorage.setItem('little-kingdoms-audio-v1',JSON.stringify({muted:true,cutins:false,voice:false}));${battle?`const{newGame}=await import('/engine.js');localStorage.setItem('little-kingdoms-save',JSON.stringify({schema:1,config:{mode:'local',level:5,humanColor:1},state:{...newGame(),matchId:crypto.randomUUID()},started:true,snapshots:[]}));`:''}})()`);await navigate();
  };
  const screenshot=async name=>{const image=await send('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/community-'+name+'.png',Buffer.from(image.data,'base64'));};
  const profile=()=>evaluate('JSON.parse(localStorage.getItem("little-kingdoms-profile-v1"))');
  return{send,evaluate,until,reachable,click,navigate,fixture,screenshot,profile,errors};
}
async function call(route,body,token){const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json();assert.ok(response.ok,`${route}: ${response.status} ${result.error||''}`);return result;}
try{
  for(const[width,height]of[[320,568],[390,844],[844,390],[1366,768]]){
    const p=await page(width,height);await p.navigate();await p.fixture();
    await p.reachable('#treasury-nav');await p.reachable('#rankings-nav');assert.equal(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'navigation fits screen');
    await p.click('#treasury-nav');await p.reachable('#treasury-draw');assert.equal(await p.evaluate('document.querySelector(".treasury-pull-count strong").textContent'),'1');
    await p.click('#treasury-draw');const saved=await p.profile();assert.equal(saved.cosmetics.owned.length,1,'reward saved before closing reveal');assert.equal(saved.cosmetics.spent,1);await p.reachable('#treasury-equip');await p.reachable('#treasury-back');
    if(width===320)await p.screenshot('reveal-phone');
    await p.click('#modal-close');await p.navigate();await p.click('#treasury-nav');assert.equal((await p.profile()).cosmetics.owned[0],saved.cosmetics.owned[0]);assert.equal(await p.evaluate('document.querySelector("#treasury-draw").disabled'),true,'level one cannot draw twice');await p.click('#modal-close');
    await p.fixture({xp:240,owned:['c01','b01'],wins:4,matches:6,battle:true});
    await p.click('#treasury-nav');await p.click('[data-treasury-tab="castle"]');await p.click('[data-preview="c01"]',{scroll:true});assert.match(await p.evaluate('document.querySelector(".treasury-reveal").textContent'),/next battle/);await p.click('#treasury-equip');assert.equal((await p.profile()).cosmetics.castle,'c01');await p.click('#modal-close');
    // Equip a board while a battle is active, without changing that battle's state.
    const before=await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state');
    await p.click('#treasury-nav');await p.click('[data-treasury-tab="board"]');await p.click('[data-preview="b01"]',{scroll:true});assert.match(await p.evaluate('document.querySelector(".treasury-reveal").textContent'),/your screen/);await p.click('#treasury-equip');await p.click('#modal-close');
    assert.equal((await p.profile()).cosmetics.board,'b01');assert.match(await p.evaluate('document.querySelector(".board-space").style.getPropertyValue("--board-art")'),/b01.webp/);assert.deepEqual(await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state'),before,'board equip preserves match rules and state');
    await p.click('#battle-restart');await p.click('[data-index="0"]');await p.click('#deploy');await p.click('[data-index="80"]');await p.click('#deploy');
    assert.equal(await p.evaluate('document.querySelectorAll("#board .castle-art.faction-blue").length'),1);assert.equal(await p.evaluate('document.querySelectorAll("#board .castle-art.faction-orange").length'),1);assert.equal(await p.evaluate(`document.querySelector('[data-index="40"]').classList.contains('neutral')&&!document.querySelector('[data-index="40"] .castle-art')`),true);
    if(width===390){await p.until('!document.querySelector("#toast").classList.contains("visible")');await p.screenshot('board-phone');}
    // A new guest account exposes the device record distinctly from online results.
    await p.click('#rankings-nav');await p.until('document.querySelector(".rank-table tbody tr")!==null');await p.reachable('#rank-refresh');await p.reachable('#rank-close');assert.equal(await p.evaluate('document.querySelector(".commander-details").open'),false,'personal editor starts collapsed');await p.reachable('.rank-table tbody tr');
    await p.click('.commander-card-top');await p.reachable('.commander-record');assert.match(await p.evaluate('document.querySelector(".commander-record").textContent'),/4 wins 2 losses/);assert.match(await p.evaluate('document.querySelector(".commander-card-top").textContent'),/LV 3/);await p.click('.commander-card-top');
    await p.click('#rank-wins',{scroll:true});await p.until('document.querySelector("#commander-name")!==null');await p.reachable('#rank-refresh');await p.reachable('#rank-close');await p.click('#rank-level',{scroll:true});await p.until('document.querySelector(".rank-table")!==null');
    await p.reachable('.rank-table tbody tr');if(width===320)await p.screenshot('rankings-phone');if(width===844)await p.screenshot('rankings-landscape');await p.click('#rank-close');assert.deepEqual(p.errors,[]);
    console.log(`Community UI passed ${width}x${height}.`);
  }
  const p=await page(390,844);await p.navigate();await p.fixture({xp:51940});await p.click('#treasury-nav');
  const seen=new Set();for(let n=0;n<50;n++){
    await p.click(n===0?'#treasury-draw':'#treasury-back');const saved=await p.profile(),id=saved.cosmetics.owned.at(-1);assert.equal(saved.cosmetics.owned.length,n+1);assert.equal(seen.has(id),false,'draw cannot duplicate an owned item');seen.add(id);
  }
  await p.click('#treasury-back');await p.click('[data-treasury-tab="summon"]');assert.equal(await p.evaluate('document.querySelector("#treasury-draw").disabled'),true);assert.equal((await p.profile()).cosmetics.owned.length,50);
  await p.click('[data-treasury-tab="castle"]');assert.equal(await p.evaluate('document.querySelectorAll(".treasury-card.owned").length'),30);await p.click('[data-treasury-tab="board"]');assert.equal(await p.evaluate('document.querySelectorAll(".treasury-card.owned").length'),20);await p.click('#modal-close');
  await p.fixture({xp:240,wins:4,matches:6});await p.click('#rankings-nav');await p.until('document.querySelector("#commander-name")!==null');
  await p.click('.commander-card-top');await p.evaluate('document.querySelector("#commander-name").value="<King> River"');await p.click('#commander-name-form button',{scroll:true});await p.until('document.querySelector(".commander-card-top strong")?.textContent==="King River"');
  assert.equal(await p.evaluate('document.querySelector(".commander-card-top strong").children.length'),0,'public nickname remains text');await p.click('#rank-close');
  // A rejected cached identity must recover before the room request uses its token.
  const progressBeforeRecovery=await p.profile();
  await p.evaluate('(()=>{const key="little-kingdoms-commander-v1",saved=JSON.parse(localStorage.getItem(key));saved.token="f".repeat(64);localStorage.setItem(key,JSON.stringify(saved));})()');await p.navigate();
  await p.click('#mode-online');await p.click('#create-room');await p.until('document.querySelector("#active-room-code").textContent.length===6');
  assert.notEqual(await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-commander-v1")).token'),'f'.repeat(64));assert.deepEqual(await p.profile(),progressBeforeRecovery,'identity recovery preserves earned progress and collectibles');
  const room=await p.evaluate('JSON.parse(sessionStorage.getItem("little-kingdoms-room"))'),me=await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-commander-v1"))');
  const guestCommander=await call('/api/commanders',{displayName:'QA Guest '+Date.now().toString().slice(-6),avatar:25});const guest=await call(`/api/rooms/${room.code}/join`,{commanderToken:guestCommander.token,castle:'c01',avatar:25});let version=guest.version;
  for(const[action,token]of[[0,room.token],[80,guest.token],[1,room.token],[79,guest.token]])version=(await call(`/api/rooms/${room.code}/move`,{action,version},token)).version;
  await p.until('document.querySelectorAll("#board .cell.blue, #board .cell.orange").length===4');
  // Finish while the app is closed, with an unrelated finished local save still present.
  await p.evaluate(`(async()=>{const{newGame,play}=await import('/engine.js');const state=play(play({...newGame(),matchId:'previous-local-win'},'pass'),'pass');localStorage.setItem('little-kingdoms-save',JSON.stringify({schema:1,config:{mode:'local',humanColor:1,level:1},state,started:true,snapshots:[]}));})()`);
  await p.send('Page.navigate',{url:'about:blank'});await p.until('location.href==="about:blank"');
  await call(`/api/rooms/${room.code}/move`,{action:'resign',version},room.token);
  await p.navigate();await p.until('document.querySelector("#play-again")!==null');assert.equal((await p.profile()).claimed.includes(guest.state.matchId),true,'a different finished local save cannot suppress the restored online reward');assert.equal((await p.profile()).matches,7,'a played surrender is recorded on reconnect without extra XP');await p.click('#modal-close');
  let mine=await call('/api/commanders/me',undefined,me.token);assert.equal(mine.commander.onlineLosses,1);assert.equal(mine.commander.onlineWins,0);
  const guestBefore=await call('/api/commanders/me',undefined,guestCommander.token);assert.equal(guestBefore.commander.onlineWins,1);
  for(let n=0;n<3;n++)await call(`/api/rooms/${room.code}`,undefined,room.token);
  await p.navigate();await p.until('document.querySelector("#play-again")!==null');await p.click('#modal-close');await p.click('#rankings-nav');await p.until('document.querySelector("#commander-name")!==null');await p.click('#rank-wins',{scroll:true});await p.until('document.querySelector(".commander-record")?.textContent.includes("0 wins 1 losses")');await p.click('.commander-card-top');await p.reachable('.commander-record');await p.click('#rank-refresh');await p.until('document.querySelector("#commander-name")!==null');mine=await call('/api/commanders/me',undefined,me.token);assert.equal(mine.commander.onlineLosses,1,'polling/reload/refresh cannot duplicate online results');await p.click('#rank-close');
  // Local progression and collectible controls work while the network is unavailable.
  await p.fixture({xp:240,owned:['c01','b01'],castle:'c01',board:'b01',battle:true});
  await p.until('navigator.serviceWorker.controller!==null');await p.until('(async()=>{const c=await caches.open("little-kingdoms-v2.9.0");return !!(await c.match("/collection.js"))&&!!(await c.match("/rankings.js"));})()');
  if(checkArt){await p.until(`(async()=>{const{COSMETICS}=await import('/cosmetics.js');const cache=await caches.open('little-kingdoms-v2.9.0');return(await Promise.all(COSMETICS.map(item=>cache.match(item.image)))).every(Boolean);})()`);await p.send('Network.clearBrowserCache');}
  await p.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await p.navigate();
  if(checkArt){const decoded=await p.evaluate(`(async()=>{const{COSMETICS}=await import('/cosmetics.js');return Promise.all(COSMETICS.map(async item=>{const image=new Image();image.src=item.image;try{await image.decode();return{id:item.id,width:image.naturalWidth,height:image.naturalHeight};}catch{return{id:item.id,width:0,height:0};}}));})()`);assert.equal(decoded.filter(item=>item.width>0&&item.height>0).length,50,'all fifty artworks decode offline from the service-worker cache');}
  await p.click('#treasury-nav');await p.click('#treasury-draw');assert.equal((await p.profile()).cosmetics.owned.length,3);await p.click('#treasury-equip');await p.click('#modal-close');await p.click('#rankings-nav');await p.until('document.querySelector(".rank-unavailable")!==null');await p.reachable('#rank-close');await p.click('#rank-close');
  await p.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await p.click('#rankings-nav');await p.until('document.querySelector("#commander-name")!==null');await p.reachable('#rank-close');await p.click('#rank-close');assert.deepEqual(p.errors,[]);
  console.log(`Community checks passed: 4 mobile/landscape/PC sizes, saved single-pull rewards, all 50 duplicate-free draws, safe equipment and faction colors, public nicknames, separate device/server W/L, idempotent online results, offline collection and ranking recovery${checkArt?', and all 50 artwork decodes':''}.`);
}finally{for(const socket of sockets)socket.close();edge.kill();}
