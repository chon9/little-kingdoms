import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir('artifacts',{recursive:true});
const release=process.argv.includes('--release');
const lite=process.argv.includes('--lite');
const {version}=JSON.parse(await readFile('clients/package.json','utf8'));
const executable=lite?`clients/releases/LittleKingdoms-${version}-Windows/LittleKingdoms.exe`:release?`clients/releases/LittleKingdoms-${version}-win32-x64/LittleKingdoms.exe`:'clients/node_modules/electron/dist/electron.exe';
const child=spawn(path.resolve(executable),lite?[]:[...(release?[]:[path.resolve('clients')]),'--remote-debugging-port=9334','--user-data-dir='+path.resolve('artifacts/native-profile')],{env:{...process.env,KINGDOMS_QA:'1',KINGDOMS_QA_PROFILE:path.resolve('artifacts/native-lite-profile')},windowsHide:true,stdio:'ignore'});
let ws;
try{
  let target;
  for(let i=0;i<100;i++){try{const pages=await(await fetch('http://127.0.0.1:9334/json/list')).json();target=pages.find(p=>p.type==='page'&&p.url.startsWith(lite?'https://kingdoms.local':'app://kingdoms'));if(target)break;}catch{}await wait(150);}
  assert.ok(target,'native application must open its bundled page');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let id=0;const pending=new Map(),errors=[];
  ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
  const until=async(expression,ms=12000)=>{const started=Date.now();while(Date.now()-started<ms){try{if(await evaluate(expression))return;}catch{}await wait(100);}throw new Error('Native check timed out: '+expression+' '+errors.join('; '));};
  const click=async selector=>{
    const box=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x,y:box.y,button:'left',clickCount:1});
  };
  try{await until('document.querySelectorAll(".cell").length===81');}catch(error){console.log('NATIVE DIAGNOSTIC',await evaluate('({url:location.href,ready:document.readyState,body:document.body?.innerText.slice(0,1200),scripts:[...document.scripts].map(s=>s.src)})'));throw error;}
  assert.equal(await evaluate('typeof window.require'),'undefined','renderer cannot access Node');
  assert.equal(await evaluate('location.protocol'),lite?'https:':'app:');
  assert.equal(await evaluate('window.KINGDOMS_API_BASE'),'https://shu-wei-kingdoms.alexchon911.chatgpt.site');
  if(lite){
    assert.equal(await evaluate('window.kingdomsDesktop.platform'),'windows-webview2');
    const before=await evaluate('window.kingdomsDesktop.getDisplay()');assert.equal(before.fullscreen,false);
    await click('#fullscreen');let display=await evaluate('window.kingdomsDesktop.getDisplay()');assert.equal(display.fullscreen,true);assert.equal(display.borderless,true);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F11',code:'F11',windowsVirtualKeyCode:122});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'F11',code:'F11',windowsVirtualKeyCode:122});
    await until('window.kingdomsDesktop.getDisplay().then(s=>!s.fullscreen)');display=await evaluate('window.kingdomsDesktop.getDisplay()');assert.equal(display.width,before.width);assert.equal(display.height,before.height);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,modifiers:1});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,modifiers:1});
    await until('window.kingdomsDesktop.getDisplay().then(s=>s.fullscreen)');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until('window.kingdomsDesktop.getDisplay().then(s=>!s.fullscreen)');
  }
  await evaluate('localStorage.clear();sessionStorage.clear()');
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await send('Page.reload',{ignoreCache:true});await wait(300);await until('document.querySelectorAll(".cell").length===81');
  await click('#begin');await click('[data-index="30"]');await click('#deploy');
  await until('document.querySelectorAll(".cell.blue,.cell.orange").length===2 && !document.querySelector("#pass").disabled');
  if(lite){
    await until('document.querySelector("#game-music").currentTime>0.1');
    assert.equal(await evaluate('document.querySelector("#game-music").loop'),false,'bundled music rotates offline');
    for(const old of ['war-theme','creed-of-course','enemy-ship','asianoriental2'])await assert.rejects(readFile(path.join(path.dirname(executable),'www','assets',old+'.mp3')),{code:'ENOENT'},'retired track absent from native client '+old);
    const musicTracks=await evaluate("import('/music-library.js').then(m=>m.MUSIC_TRACKS)");
    for(const track of musicTracks){await evaluate(`import('/audio.js').then(m=>m.chooseMusic(${JSON.stringify(track.id)}))`);await until(`document.querySelector('#game-music').currentSrc.endsWith(${JSON.stringify(track.file)})&&document.querySelector('#game-music').currentTime>.1`);assert.ok(Math.abs(await evaluate('document.querySelector("#game-music").duration')-track.duration)<.2,'native complete offline soundtrack '+track.id);}
    await evaluate("import('/audio.js').then(m=>{m.chooseMusic('gq-11');m.setMusicMode('rotation');})");await until('document.querySelector("#game-music").currentSrc.endsWith("/assets/music/gq-11.mp3")&&document.querySelector("#game-music").currentTime>.1');await evaluate('document.querySelector("#game-music").playbackRate=16');await until('document.querySelector("#game-music").currentSrc.endsWith("/assets/music/gq-02.mp3")&&document.querySelector("#game-music").currentTime>.1');await evaluate('document.querySelector("#game-music").playbackRate=1');
    const savedMatch=await evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state');
    await click('#language-switch');await until('document.documentElement.lang==="zh-Hans"');assert.match(await evaluate('document.querySelector("#turn-title").textContent'),/[\u3400-\u9fff]/,'native Chinese battle UI');
    await click('#rules-nav');assert.match(await evaluate('document.querySelector(".comic-page h2").textContent'),/[\u3400-\u9fff]/,'native offline Chinese comic');await click('#modal-close');await click('#language-switch');
    assert.equal(await evaluate('document.documentElement.lang'),'en');assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state'),savedMatch,'native language changes preserve the match');
    const decoded=await evaluate(`(async()=>{const{COSMETICS}=await import('/cosmetics.js');return Promise.all(COSMETICS.map(async item=>{const image=new Image();image.src=item.image;await image.decode();return image.naturalWidth>0;}));})()`);assert.equal(decoded.filter(Boolean).length,50,'all collectible artwork is bundled in the native client');
    await click('#treasury-nav');await click('#treasury-draw');assert.equal(await evaluate('JSON.parse(localStorage.getItem("little-kingdoms-profile-v1")).cosmetics.owned.length'),1,'native offline pull saves before the reveal');
    await click('#treasury-equip');await click('#modal-close');await click('#treasury-nav');assert.equal(await evaluate('document.querySelector("#treasury-draw").disabled'),true,'native reload/reopen cannot spend the welcome pull twice');await click('#modal-close');
    await click('#profile-button');assert.equal(await evaluate('document.querySelectorAll(".avatar-card").length'),40);await click('#modal-close');
    await click('#rules-nav');assert.equal(await evaluate('document.querySelector(".comic-book").dataset.comicPage'),'0');
    await click('[data-comic-jump]');assert.equal(await evaluate('document.querySelector(".comic-book").dataset.comicPage'),'5');
    await click('[data-rule-try="eye"]');assert.equal(await evaluate('document.querySelector("#rule-feedback-eye").textContent.includes("BLOCKED")'),true,'offline comic uses the real engine');
    await click('#modal-close');
  }
  const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/windows-client.png',Buffer.from(screenshot.data,'base64'));
  await click('#undo');assert.equal(await evaluate('document.querySelectorAll(".cell.blue,.cell.orange").length'),0);
  const defense=await evaluate(`(async()=>{const{newGame,play}=await import('/engine.js');let s=newGame();for(const move of [9,10,36,1,'pass',19])s=play(s,move);const worker=new Worker('/ai-worker.js',{type:'module'});return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{worker.terminate();reject(new Error('Native bot timed out'));},10000);worker.onmessage=event=>{clearTimeout(timer);worker.terminate();resolve(event.data.move);};worker.onerror=error=>{clearTimeout(timer);worker.terminate();reject(new Error(error.message));};worker.postMessage({state:s,level:10});});})()`);
  assert.equal(defense,18,'packaged level 10 defends the edge trap offline');
  const settledPass=await evaluate(`(async()=>{const{newGame}=await import('/engine.js');const s=newGame();for(let i=0;i<81;i++)if(i!==40)s.board[i]=i%9<4?1:i%9===4?0:2;for(const i of [10,11,19,20,16,25])s.board[i]=0;s.count=[0,s.board.filter(c=>c===1).length,s.board.filter(c=>c===2).length];s.ply=s.count[1]+s.count[2];const worker=new Worker('/ai-worker.js',{type:'module'});return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{worker.terminate();reject(new Error('Endgame worker timed out'));},10000);worker.onmessage=event=>{clearTimeout(timer);worker.terminate();resolve(event.data.move);};worker.postMessage({state:s,level:10});});})()`);
  assert.equal(settledPass,'pass','packaged AI preserves owned territory and settled shared spaces');

  if(lite){
    await send('Page.navigate',{url:'https://kingdoms.local/tutorial.html?lesson=single-eye'});await until('document.querySelectorAll("#tutorial-board .cell").length===81');
    await click('[data-index="29"]');await click('#tutorial-deploy');
    assert.equal(await evaluate('document.querySelectorAll(".cell.blue.danger").length'),0);assert.equal(await evaluate('document.querySelectorAll(".cell.protected-castle").length'),0,'protected groups stay unmarked');
    await click('#tutorial-next');await click('[data-index="20"]');await click('#tutorial-deploy');assert.equal(await evaluate('document.querySelector("#tutorial-feedback").textContent.includes("sealed")'),true);
    await send('Page.navigate',{url:'https://kingdoms.local/index.html'});await until('document.querySelectorAll("#board .cell").length===81');
    assert.equal(await evaluate('document.querySelectorAll(".cell.blue,.cell.orange").length'),0,'returning from practice restores the saved real match');
  }
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  if(process.argv.includes('--online')){
    await click('#battle-back');await click('#mode-online');await click('#create-room');
    await until('document.querySelector("#active-room-code").textContent.length===6');
    const code=await evaluate('document.querySelector("#active-room-code").textContent'),base='https://shu-wei-kingdoms.alexchon911.chatgpt.site';
    async function api(route,body,token){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const data=await r.json();assert.equal(r.ok,true,data.error);return data;}
    const guest=await api('/api/rooms/'+code+'/join',{avatar:25});
    assert.equal(guest.state.players[2].avatar,25);
    await until('!document.querySelector("#room-status").textContent.includes("Waiting") && !document.querySelector("#pass").disabled');
    await until('document.querySelector("#orange-avatar").getAttribute("aria-label")==="Huang Yueying"');
    await click('[data-index="30"]');await click('#deploy');await until('document.querySelectorAll(".cell.blue:not(.ghost)").length===1');
    const seen=await api('/api/rooms/'+code,null,guest.token);assert.equal(seen.state.board[30],1);
    await api('/api/rooms/'+code+'/move',{action:50,version:seen.version},guest.token);await until('document.querySelectorAll(".cell.orange").length===1');
    await click('#resign');await click('#confirm-resign');await until('document.querySelector("#modal-content").textContent.includes("Wei rules")');
    assert.equal(await evaluate('(()=>{const b=document.querySelector("#play-again").getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;})()'),true,'next-duel action is visible without scrolling');
    await click('#modal-close');assert.equal(await evaluate('document.querySelector("#deploy").disabled'),false,'finished native board still offers a new duel');
    await click('#undo');await until('document.querySelector("#play-again")!==null');await click('#play-again');
    assert.equal(await evaluate('document.body.dataset.screen'),'lobby');assert.equal(await evaluate('document.querySelector("#create-room").hidden'),false,'native online replay opens fresh room setup');
  }
  assert.deepEqual(errors,[],'native renderer has no uncaught errors');
  console.log('Windows client checks passed: '+(lite?'WebView2 local virtual origin, native fullscreen button/F11/Alt+Enter/Escape, window bounds restoration, 40 avatars, offline music':'bundled app protocol')+', isolated renderer, offline launch, local bot, undo, level-10 defensive regression'+(process.argv.includes('--online')?', hosted cross-client PvP with bidirectional moves and shared avatars':'')+'.');
}finally{ws?.close();child.kill();}
