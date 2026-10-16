import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const artifactDir = path.resolve('artifacts');await mkdir(artifactDir,{recursive:true});
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--remote-debugging-port=9363','--user-data-dir='+path.join(artifactDir,'team-ui-v300-profile'),'about:blank'
],{windowsHide:true,stdio:'ignore'});
const sockets=[];
let nextID=0;
async function page(width=1440,height=1080){
  let target;
  for(let i=0;i<80;i++){try{target=await(await fetch('http://127.0.0.1:9363/json/new?about:blank',{method:'PUT'})).json();break;}catch{await wait(150);}}
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

async function installSteam(p,id){
  await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const self={id:'7656119800000000${id}',name:'Steam P${id}'},channel=new BroadcastChannel('lk-four-peer-qa'),listeners=new Set(),lobby='109775240000000004';let host=null,members=[];
    const emit=e=>listeners.forEach(fn=>fn(e)),status=()=>({type:'lobby',lobby,host,mode:'teams',hostPresent:members.some(m=>m.id===host),members});
    channel.onmessage=({data:m})=>{if(m.type==='join'&&self.id===host){members=[...members.filter(x=>x.id!==m.self.id),m.self];emit(status());channel.postMessage(status());}else if(m.type==='lobby'){host=m.host;members=m.members;emit(m);}else if(m.type==='packet'&&m.to===self.id)emit(m);else if(m.type==='leave'){members=members.filter(x=>x.id!==m.id);emit(status());}};
    const original=window.fetch;window.__roomRequests=[];window.fetch=(url,...args)=>{if(/\\/api\\/(?:team-)?rooms/.test(String(url))){window.__roomRequests.push(String(url));throw new Error('Steam must use native packets');}return original(url,...args);};
    Object.defineProperty(window,'kingdomsSteam',{value:{init:async()=>({ok:true,...self,appId:480}),create:async()=>{host=self.id;members=[self];setTimeout(()=>emit(status()),10);return{ok:true};},join:async()=>{channel.postMessage({type:'join',self});return{ok:true};},send:async(to,payload)=>{channel.postMessage({type:'packet',from:self.id,to,payload});return{ok:true};},leave:async()=>{channel.postMessage({type:'leave',id:self.id});return{ok:true};},on:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}}});
  })();`});
}
async function move(p,index){await p.until('!document.querySelector("#pass").disabled');await p.click('[data-index="'+index+'"]');await p.click('#deploy');await p.until('!document.querySelector("#deploy").textContent.includes("Sending")');}
async function rematch(players,order){
  for(const seat of order){const p=players[seat-1];await p.until('!document.querySelector("#pass").disabled');await p.click('#pass');}
  for(const p of players)await p.until('!!document.querySelector(".result-view")');
  await players[0].click('#play-again');
  for(const p of players.slice(1)){await p.until('document.querySelector("#play-again").textContent.includes("Accept")');await p.click('#play-again');}
  for(const p of players)await p.until('!document.querySelector("#modal").open&&document.querySelectorAll(".cell.blue:not(.ghost),.cell.orange:not(.ghost)").length===0');
}
try{
  const host=await page(390,844);await host.navigate();await host.evaluate('localStorage.clear();sessionStorage.clear()');await host.navigate();await host.click('#mode-online');await host.click('#format-teams');await host.click('#host-orange');await host.click('#create-room');await host.until('document.body.dataset.screen==="room"');
  const code=await host.evaluate('document.querySelector("#lobby-room-code").textContent');assert.equal(await host.evaluate('document.querySelector("#room-count").textContent'),'1 / 4');
  const peers=[host];for(let id=2;id<=4;id++){const p=await page(390,844);await p.navigate('http://127.0.0.1:4317/?room='+code+'&format=teams');await p.evaluate('document.querySelector("#join-form").requestSubmit()');peers.push(p);if(id<4){await host.until('document.querySelector("#room-count").textContent==="'+id+' / 4"');assert.equal(await host.evaluate('document.body.dataset.screen'),'room');}}
  for(const p of peers)await p.until('document.body.dataset.screen==="battle"');
  assert.equal(await host.evaluate('document.querySelector("#pass").disabled'),true);await move(peers[2],30);await move(peers[0],50);await move(peers[3],31);await move(peers[1],51);
  for(const p of peers){await p.until('document.querySelectorAll(".cell.blue:not(.ghost),.cell.orange:not(.ghost)").length===4');assert.equal(await p.evaluate('document.querySelectorAll("#team-battle-seats .team-mini-seat").length'),4);}
  await host.screenshot('teams-online-battle-v300');await rematch(peers,[3,1,4,2]);await host.until('!document.querySelector("#pass").disabled');assert.equal(await peers[2].evaluate('document.querySelector("#pass").disabled'),true);
  await host.click('#battle-back');assert.equal(await host.evaluate('document.querySelector("#lobby-room-code").textContent'),code);assert.equal(await host.evaluate('document.querySelector("#room-count").textContent'),'4 / 4');
  for(const [w,h]of[[320,568],[390,844],[844,390],[1440,900]]){await host.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<720});await wait(80);assert.equal(await host.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await host.screenshot('teams-room-'+w+'-v300');}
  await host.evaluate("import('/i18n.js').then(m=>m.setLanguage('zh-Hans'))");await host.until('document.documentElement.lang==="zh-Hans"');assert.match(await host.evaluate('document.querySelector("#room-wait-description").textContent'),/四名主公/);await host.screenshot('teams-room-zh-v300');await host.evaluate("import('/i18n.js').then(m=>m.setLanguage('en'))");
  for(const p of peers)assert.deepEqual(p.errors,[]);
  const steamPeers=[];for(let id=1;id<=4;id++){const p=await page(1440,900);await installSteam(p,id);await p.navigate();await p.evaluate('sessionStorage.clear()');await p.navigate();await p.click('#mode-steam');await p.click('#format-teams');await p.click('#steam-connect');await p.until('!document.querySelector("#steam-create").disabled');steamPeers.push(p);if(id===1){await p.click('#steam-create');await p.until('document.body.dataset.screen==="room"');}else{await p.evaluate('document.querySelector("#steam-lobby-id").value="109775240000000004"');await p.click('#steam-join-form button');}if(id<4)assert.equal(await steamPeers[0].evaluate('document.body.dataset.screen'),'room');}
  for(const p of steamPeers)await p.until('document.body.dataset.screen==="battle"');
  await move(steamPeers[0],30);await move(steamPeers[2],50);await move(steamPeers[1],31);await move(steamPeers[3],51);await rematch(steamPeers,[1,3,2,4]);
  await steamPeers[2].until('!document.querySelector("#pass").disabled');assert.equal(await steamPeers[0].evaluate('document.querySelector("#pass").disabled'),true);
  for(const p of steamPeers){assert.deepEqual(await p.evaluate('window.__roomRequests'),[]);assert.deepEqual(p.errors,[]);assert.equal(await p.evaluate('document.body.textContent.toLowerCase().includes("spacewar")'),false);}
  await steamPeers[0].screenshot('teams-steam-rematch-v300');
  console.log('2v2 UI passed: four web seats wait/start, Blue first with Orange host, teammate order, four passes and consents, same-room color swap, four sizes, Chinese, four-peer Steam simulation with zero HTTP room requests.');
}finally{for(const ws of sockets)ws.close();edge.kill();}

