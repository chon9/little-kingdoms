import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const base=process.env.KINGDOMS_TEST_URL||'http://127.0.0.1:4317',port=9337;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir('artifacts',{recursive:true});
const edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--remote-debugging-port='+port,'--user-data-dir='+path.resolve('artifacts/restart-profile'),'about:blank'
],{windowsHide:true,stdio:'ignore'});
const sockets=[];let id=0;
async function page(width,height){
  let target;for(let i=0;i<80;i++){try{target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();break;}catch{await wait(150);}}
  assert.ok(target,'Edge starts');
  const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),errors=[];
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});sockets.push(ws);
  ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<720});await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
  const until=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await wait(80);}throw new Error('Timed out: '+expression);};
  const reachable=async selector=>assert.equal(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;const b=e.getBoundingClientRect();const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return b.width>0&&b.height>=10&&b.top>=0&&b.bottom<=innerHeight+1&&b.left>=0&&b.right<=innerWidth+1&&e.contains(hit);})()`),true,`${selector} is immediately reachable at ${width}x${height}`);
  const click=async selector=>{await reachable(selector);const b=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...b,button:'left',clickCount:1});};
  const navigate=async()=>{await send('Page.navigate',{url:base+'/index.html'});await until('document.querySelectorAll("#board .cell").length===81');await wait(120);};
  const fixture=async(mode='local',reason='capture',win=2)=>{
    await evaluate(`(async()=>{const{newGame,play}=await import('/engine.js');let s={...newGame(),matchId:crypto.randomUUID()};
      if(${JSON.stringify(reason)}==='capture'){s.board[0]=3-${win};s.board[1]=${win};s.turn=${win};s.count=[0,1,1];s.ply=2;}
      else if(${JSON.stringify(reason)}==='territory'){s=play(s,'pass');}
      else if(${JSON.stringify(reason)}==='simultaneous'){s.board=Array(81).fill(2);for(let i=0;i<81;i++)if(i%9===0||Math.floor(i/9)>=6||(Math.floor(i/9)===5&&i%9<=6))s.board[i]=1;s.board[40]=3;s.board[1]=0;s.count=[0,39,40];s.turn=1;s.ply=79;}
      localStorage.setItem('little-kingdoms-save',JSON.stringify({schema:1,config:{mode:${JSON.stringify(mode)},level:10,humanColor:${win}},state:s,started:true,snapshots:[]}));sessionStorage.clear();localStorage.removeItem('little-kingdoms-room');})()`);await navigate();
  };
  return{send,evaluate,until,reachable,click,navigate,fixture,errors};
}
try{
  for(const [width,height]of[[320,568],[360,640],[390,844],[844,390],[1366,768]]){
    const p=await page(width,height);await p.navigate();await p.evaluate('localStorage.clear();sessionStorage.clear()');
    // Lose a real capture in pass & play, with no scrolling to the next match.
    await p.fixture('local','capture',2);await p.click('[data-index="9"]');await p.click('#deploy');
    await p.until('document.querySelector("#play-again")!==null');await p.reachable('#play-again');await p.reachable('#result-lobby');
    if(width===320||width===844){const shot=await p.send('Page.captureScreenshot',{format:'png'});await writeFile(`artifacts/restart-result-${width}.png`,Buffer.from(shot.data,'base64'));}
    await p.click('#modal-close');await p.reachable('#deploy');await p.reachable('#undo');await p.reachable('#pass');
    const previous=await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state.matchId');
    await p.click('#undo');await p.reachable('#play-again');await p.click('#play-again');
    const fresh=await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state');assert.equal(fresh.ply,0);assert.equal(fresh.winner,null);assert.notEqual(fresh.matchId,previous);
    // Active-match restart is direct; cancel preserves the game and confirmation resets it.
    await p.click('[data-index="30"]');await p.click('#deploy');await p.click('#battle-restart');await p.click('#cancel-restart');assert.equal(await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state.ply'),1);
    await p.click('#battle-restart');await p.click('#confirm-restart');assert.equal(await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state.ply'),0);
    // A closed result stays restartable after reloading an ended save.
    await p.click('#resign');await p.click('#confirm-resign');await p.click('#modal-close');await p.navigate();await p.reachable('#deploy');await p.click('#deploy');assert.equal(await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state.winner'),null);
    await p.fixture('local','territory');await p.click('#pass');await p.reachable('#play-again');await p.click('#result-lobby');assert.equal(await p.evaluate('document.body.dataset.screen'),'lobby');await p.click('#resume');await p.click('#deploy');
    assert.deepEqual(p.errors,[]);
  }
  const p=await page(390,844);await p.navigate();
  // Both a bot victory and a defeat have the same reachable next-battle action.
  await p.evaluate(`(async()=>{const{newGame,play}=await import('/engine.js');let s={...newGame(),matchId:crypto.randomUUID()};for(const m of[1,0,30,50])s=play(s,m);localStorage.setItem('little-kingdoms-save',JSON.stringify({schema:1,config:{mode:'bot',level:10,humanColor:1},state:s,started:true,snapshots:[]}));})()`);
  await p.navigate();await p.click('[data-index="9"]');await p.click('#deploy');await p.reachable('#play-again');
  const xp=await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-profile-v1")).xp');assert.ok(xp>0,'a completed match earns XP');
  await p.click('#modal-close');await p.click('#undo');assert.equal(await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-profile-v1")).xp'),xp,'reopening results cannot duplicate XP');await p.click('#play-again');
  assert.equal(await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-profile-v1")).xp'),xp,'replay preserves progress');
  await p.evaluate(`(async()=>{const{newGame}=await import('/engine.js');const s={...newGame(),matchId:crypto.randomUUID(),ply:4,count:[0,2,2]};s.board[0]=2;s.board[1]=1;s.board[30]=1;s.board[50]=2;localStorage.setItem('little-kingdoms-save',JSON.stringify({schema:1,config:{mode:'bot',level:10,humanColor:2},state:s,started:true,snapshots:[]}));})()`);
  await p.navigate();await p.until('document.querySelector("#play-again")!==null');await p.reachable('#play-again');assert.equal(await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state.reason'),'capture');await p.click('#play-again');
  await p.evaluate(`(async()=>{const{newGame}=await import('/engine.js');const s={...newGame(),matchId:crypto.randomUUID(),ply:2,count:[0,1,1]};s.board[0]=1;s.board[1]=2;localStorage.setItem('little-kingdoms-save',JSON.stringify({schema:1,config:{mode:'bot',level:10,humanColor:2},state:s,started:true,snapshots:[]}));})()`);
  await p.navigate();await p.until('document.querySelector("#turn-title").textContent.includes("plotting")');await p.click('#battle-restart');await p.click('#confirm-restart');await p.until('JSON.parse(localStorage.getItem("little-kingdoms-save")).state.ply===1');
  assert.equal(await p.evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state.count[1]'),1,'cancelled Worker cannot mutate the new match');
  await p.click('#resign');await p.click('#confirm-resign');await p.reachable('#play-again');await p.click('#play-again');
  await p.fixture('local','simultaneous');await p.click('[data-index="1"]');await p.click('#deploy');await p.reachable('#play-again');await p.click('#play-again');
  // Online new-duel flow creates a fresh invitation without resetting the other seat.
  await p.click('#battle-back');await p.click('#mode-online');await p.click('#create-room');await p.until('document.querySelector("#active-room-code").textContent.length===6');
  const code=await p.evaluate('document.querySelector("#active-room-code").textContent');
  const response=await fetch(base+`/api/rooms/${code}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({avatar:10})});const guest=await response.json();assert.equal(response.ok,true);
  await p.until('!document.querySelector("#resign").disabled');await p.click('#resign');await p.click('#confirm-resign');await p.until('document.querySelector("#play-again")!==null');await p.reachable('#play-again');await p.click('#play-again');
  assert.equal(await p.evaluate('document.body.dataset.screen'),'lobby');assert.equal(await p.evaluate('sessionStorage.getItem("little-kingdoms-room")'),null);await p.reachable('#create-room');await p.click('#create-room');await p.until(`document.querySelector("#active-room-code").textContent.length===6&&document.querySelector("#active-room-code").textContent!==${JSON.stringify(code)}`);
  const old=await(await fetch(base+`/api/rooms/${code}`,{headers:{Authorization:'Bearer '+guest.token}})).json();assert.equal(old.state.winner,guest.color,'old result remains available to the other player');
  assert.deepEqual(p.errors,[]);
  console.log('Restart checks passed: 5 phone/landscape/PC sizes; visible result actions, closed/reloaded results, win/loss/capture/resignation/scoring/simultaneous endings, active cancellation and restart during level-10 thinking, distinct match IDs, and fresh online rooms preserving the previous result.');
}finally{for(const ws of sockets)ws.close();edge.kill();}
