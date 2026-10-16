import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const artifactDir = path.resolve('artifacts');await mkdir(artifactDir,{recursive:true});
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--remote-debugging-port=9361','--user-data-dir='+path.join(artifactDir,'steam-ui-v290-profile'),'about:blank'
],{windowsHide:true,stdio:'ignore'});
const sockets=[];
let nextID=0;
async function page(width=1440,height=1080){
  let target;
  for(let i=0;i<80;i++){try{target=await(await fetch('http://127.0.0.1:9361/json/new?about:blank',{method:'PUT'})).json();break;}catch{await wait(150);}}
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

// Explicitly a simulated native bridge: exercises the real UI/session protocol,
// never claims to exercise Valve's service or two signed-in Steam accounts.
async function install(p,id,name){
  await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const self={id:${JSON.stringify(id)},name:${JSON.stringify(name)}},channel=new BroadcastChannel('little-kingdoms-steam-ui-test'),listeners=new Set(),lobby='109775240000000001';let host=null,members=[];
    const emit=event=>listeners.forEach(fn=>fn(event)),status=()=>({type:'lobby',lobby,host,hostPresent:members.some(m=>m.id===host),members});
    channel.onmessage=({data:m})=>{if(m.type==='join'&&self.id===host){members=[self,m.self];emit(status());channel.postMessage(status());}else if(m.type==='lobby'){host=m.host;members=m.members;emit(m);}else if(m.type==='packet'&&m.to===self.id)emit(m);else if(m.type==='leave'){members=members.filter(x=>x.id!==m.id);emit(status());}};
    window.__steamQAPackets=[];window.__steamQAHTTP=[];window.__steamFail=false;window.__steamQAEmit=emit;
    const realFetch=window.fetch;window.fetch=(url,...rest)=>{if(String(url).includes('/api/rooms')){window.__steamQAHTTP.push(String(url));throw new Error('Steam mode must not call HTTP room APIs');}return realFetch(url,...rest);};
    Object.defineProperty(window,'kingdomsSteam',{value:Object.freeze({init:async()=>window.__steamFail?{ok:false,error:'Start Steam and sign in, then retry. This test build uses Spacewar (AppID 480).'}:{ok:true,...self,appId:480},create:async()=>{host=self.id;members=[self];setTimeout(()=>emit(status()),20);return{ok:true};},join:async()=>{channel.postMessage({type:'join',self});return{ok:true};},send:async(peer,payload)=>{window.__steamQAPackets.push(JSON.parse(payload));channel.postMessage({type:'packet',from:self.id,to:peer,payload});return{ok:true};},leave:async()=>{channel.postMessage({type:'leave',id:self.id});return{ok:true};},friends:async()=>({ok:true,friends:[{id:'76561198000000002',name:'QA Steam friend'}]}),invite:async()=>({ok:true}),on:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}})});
  })();`});
}
try{
  const host=await page(1440,900);await install(host,'76561198000000001','Steam Host');await host.navigate();await host.evaluate('localStorage.clear();sessionStorage.clear()');await host.navigate();
  await host.click('#mode-steam');await host.evaluate('window.__steamFail=true');await host.click('#steam-connect');await host.until('document.querySelector("#toast").textContent.includes("Start Steam")');assert.equal(await host.evaluate('document.querySelector("#steam-create").disabled'),true);
  await host.evaluate('window.__steamFail=false');await host.click('#steam-connect');await host.until('!document.querySelector("#steam-create").disabled');await host.click('#steam-orange');await host.click('#steam-create');await host.until('document.body.dataset.screen==="room"');assert.equal(await host.evaluate('document.querySelector("#room-count").textContent'),'1 / 2');assert.equal(await host.evaluate('document.querySelector("#battle-screen").hidden'),true);assert.equal(await host.evaluate('document.querySelector("#lobby-room-code").textContent'),'109775240000000001');
  await host.click('#steam-friends');assert.equal(await host.evaluate('document.querySelector("#steam-friend-list button").textContent'),'QA Steam friend');await host.click('#steam-friend-list button');
  for(const [width,height]of[[320,568],[390,844],[844,390],[1440,900]]){await host.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<720});await wait(80);assert.equal(await host.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await host.screenshot('steam-waiting-'+width+'-v290');}
  await host.evaluate("import('/i18n.js').then(m=>m.setLanguage('zh-Hans'))");await host.until('document.documentElement.lang==="zh-Hans"');assert.equal(await host.evaluate('document.querySelector(".room-invitation>.eyebrow").textContent'),'Steam 大厅编号');assert.equal(await host.evaluate('document.querySelector("#steam-friends").textContent'),'邀请 Steam 好友');await host.screenshot('steam-waiting-zh-v290');await host.evaluate("import('/i18n.js').then(m=>m.setLanguage('en'))");
  const guest=await page(1440,900);await install(guest,'76561198000000002','Steam Guest');await guest.navigate();await guest.click('#mode-steam');await guest.click('#steam-connect');await guest.until('!document.querySelector("#steam-lobby-id").disabled');await guest.evaluate('document.querySelector("#steam-lobby-id").value="109775240000000001"');await guest.click('#steam-join-form button');await host.until('document.body.dataset.screen==="battle"');await guest.until('document.body.dataset.screen==="battle"');assert.equal(await host.evaluate('document.querySelector("#pass").disabled'),true,'orange host waits');
  for(const [p,index]of[[guest,30],[host,50],[guest,31],[host,51]]){await p.until('!document.querySelector("#pass").disabled');await p.click('[data-index="'+index+'"]');await p.click('#deploy');const other=p===host?guest:host;await other.until('document.querySelector("[data-index=\\"'+index+'\\"]").classList.contains("'+(p===guest?'blue':'orange')+'")');}
  await host.screenshot('steam-battle-v290');await guest.click('#pass');await host.until('!document.querySelector("#pass").disabled');await host.click('#pass');await host.until('!!document.querySelector(".result-view")');await guest.until('!!document.querySelector(".result-view")');const rewards=await Promise.all([host,guest].map(p=>p.evaluate('document.querySelector("#match-reward").textContent')));assert.ok(rewards.some(t=>t.includes('40 XP')),'casual Steam XP is 40; both QA pages share one local storage profile');
  await guest.click('#play-again');await host.until('document.querySelector("#play-again").textContent.includes("Accept")');await host.click('#play-again');await host.until('!document.querySelector("#modal").open');await guest.until('!document.querySelector("#modal").open');assert.equal(await host.evaluate('document.querySelectorAll(".cell.blue,.cell.orange").length'),0);await host.click('#battle-back');assert.equal(await host.evaluate('document.querySelector("#lobby-room-code").textContent'),'109775240000000001');await host.click('#room-enter-battle');
  await guest.click('#resign');await guest.click('#confirm-resign');await host.until('!!document.querySelector(".result-view")');await guest.until('!!document.querySelector(".result-view")');await guest.click('#result-lobby');await guest.click('#room-leave');await guest.until('document.body.dataset.screen==="lobby"');await host.until('document.querySelector("#play-again").disabled');
  assert.deepEqual(await host.evaluate('window.__steamQAHTTP'),[]);assert.deepEqual(await guest.evaluate('window.__steamQAHTTP'),[]);assert.ok(await host.evaluate('window.__steamQAPackets.some(m=>m.kind==="snapshot")'));assert.ok(await guest.evaluate('window.__steamQAPackets.some(m=>m.kind==="command")'));assert.deepEqual(host.errors,[]);assert.deepEqual(guest.errors,[]);
  console.log('Steam UI simulation passed: init failure/retry, host Orange, join-gated lobby, large ID, Steam friends, 4 sizes, Chinese, two-peer moves/capture engine, pass scoring, local casual XP, mutual same-room rematch, resignation/leave, zero HTTP room traffic. Real Steam service is not simulated by this check.');
}finally{for(const ws of sockets)ws.close();edge.kill();}
