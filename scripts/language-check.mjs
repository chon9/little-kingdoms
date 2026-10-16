import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// This suite creates local guest records and deliberately uses local-only saved fixtures.
const base=process.env.KINGDOMS_TEST_URL||'http://127.0.0.1:4317',port=9339;
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'Language fixture checks require a local preview.');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const model=(await readFile('public/tutorial-model.js','utf8')).replace("from '/engine.js'",`from '${new URL('../shared/engine.js',import.meta.url).href}'`);
const {LESSONS}=await import('data:text/javascript;base64,'+Buffer.from(model).toString('base64'));
await mkdir('artifacts',{recursive:true});
const edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--remote-debugging-port='+port,'--user-data-dir='+path.resolve('artifacts/language-profile'),'about:blank'
],{windowsHide:true,stdio:'ignore'});
let ws,sequence=0;const leaks=[],errors=[];
try{
  let target;for(let n=0;n<100;n++){try{target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();break;}catch{}await wait(100);}
  assert.ok(target,'Edge starts');ws=new WebSocket(target.webSocketDebuggerUrl);const pending=new Map();
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timeout);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Browser did not respond to '+method));},15000);pending.set(id,{resolve,reject,timeout});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true,timeout:8000});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
  const until=async(expression,ms=12000)=>{const start=Date.now();while(Date.now()-start<ms){try{if(await evaluate(expression))return;}catch{}await wait(80);}throw new Error('Language check timed out: '+expression+'; '+errors.join('; '));};
  const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest',inline:'nearest'})`);const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw new Error('Unavailable '+${JSON.stringify(selector)});const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;return{x,y,w:b.width,h:b.height,hit:e.contains(document.elementFromPoint(x,y))};})()`);const v=await evaluate('({w:innerWidth,h:innerHeight})');assert.ok(point.w>0&&point.h>0&&point.x>=0&&point.x<v.w&&point.y>=0&&point.y<v.h&&point.hit,'Reachable '+selector+' '+JSON.stringify(point));for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',clickCount:1});await wait(50);};
  const navigate=async(url='/index.html',ready='document.querySelectorAll("#board .cell").length===81')=>{await send('Page.navigate',{url:base+url});await until(ready);await wait(200);};
  const switchLanguage=async language=>{await evaluate(`(async()=>{const i=await import('/i18n.js');await i.setLanguage(${JSON.stringify(language)});})()`);await until(`document.documentElement.lang===${JSON.stringify(language)}`);await wait(100);};
  const scan=async label=>{await wait(80);const result=await evaluate(`(()=>{
    const found=[],visible=e=>{if(!e||e.closest('script,style,svg,[hidden],[aria-hidden="true"],[data-user-content],[data-l10n-skip],.board-coordinates,.side-coordinates'))return false;const c=getComputedStyle(e);return c.display!=='none'&&c.visibility!=='hidden'&&e.getClientRects().length>0;};
    const english=s=>/[A-Za-z]{2,}/.test(s.replace(/\\b(?:XP|AI|PDF|MP3|WebView2|APK|F11|Alt|Enter|Escape|Ctrl|Shift|Tab|W|L|EN)\\b/g,''));
    const tree=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(tree.nextNode()){const n=tree.currentNode,e=n.parentElement,t=n.nodeValue.trim().replace(/\\s+/g,' ');let check=t;if(e.matches('.comic-board-label'))check=check.replace(/\\b[A-I]{2,9}\\b/g,'');if(e.matches('.comic-source a'))check=check.replace('Great Kingdom','');if(e.closest('.music-credit'))check=check.replace(/Tozan|CC0(?: 1\\.0)?/g,'');if(t&&visible(e)&&english(check))found.push({kind:'text',selector:e.id?'#'+e.id:e.className||e.tagName,text:t});}
    for(const e of document.querySelectorAll('[aria-label],[title],[placeholder]'))if(visible(e))for(const a of ['aria-label','title','placeholder']){const t=e.getAttribute(a),nickname=e.matches('.commander-card-top')?e.querySelector('.commander-summary-name strong')?.textContent:null,check=nickname?t?.split(nickname).join(''):t;if(check&&english(check))found.push({kind:a,selector:e.id?'#'+e.id:e.className||e.tagName,text:t});}
    return found;
  })()`);leaks.push({screen:label,items:result});return result;};
  const screenshot=async name=>{const s=await send('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/language-'+name+'.png',Buffer.from(s.data,'base64'));};
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate();await evaluate('localStorage.clear();sessionStorage.clear()');await navigate();
  assert.equal(await evaluate('document.documentElement.lang'),'en');
  await click('#settings-nav');
  // Exercise the actual settings control rather than changing storage behind the UI.
  const control=await evaluate(`(()=>{const e=document.querySelector('#language-select, #setting-language, select[data-language]');return e?.id||null;})()`);
  assert.ok(control,'A labeled language selector is available in Settings');
  await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(control)});e.value='zh-Hans';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await until('document.documentElement.lang==="zh-Hans"');await scan('settings');await click('#modal-close');
  await scan('lobby');await screenshot('lobby-phone');
  await click('#mode-local');await click('#begin');await click('[data-index="0"]');await click('#deploy');
  const state=await evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state');
  await scan('battle');await click('#language-switch');await until('document.documentElement.lang==="en"');assert.equal(await evaluate('document.querySelector("#battle-back").textContent.includes("Lobby")'),true);await click('#language-switch');await until('document.documentElement.lang==="zh-Hans"');
  assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state'),state,'Live language switching preserves the match');
  await screenshot('battle-phone');
  await click('#treasury-nav');await scan('treasury-summon');
  for(const [tab,count]of[['castle',30],['board',20]]){
    await click(`[data-treasury-tab="${tab}"]`);assert.equal(await evaluate('document.querySelectorAll("[data-preview]").length'),count);
    const names=await evaluate('Array.from(document.querySelectorAll("[data-preview] strong"),e=>e.textContent)');assert.equal(names.filter(n=>/[\u3400-\u9fff]/.test(n)).length,count,'Every '+tab+' artwork has a Chinese name');await scan('treasury-'+tab);
  }
  await click('[data-treasury-tab="summon"]');await click('#treasury-draw');await until('document.querySelector(".treasury-reveal.is-new")!==null');await scan('treasury-reveal');
  assert.match(await evaluate('document.querySelector(".treasury-reveal h3").textContent'),/[\u3400-\u9fff]/);await click('#treasury-equip');await scan('treasury-equipped');await click('#modal-close');
  await click('#rankings-nav');await until('document.querySelector("#commander-name")!==null');await scan('rankings-level');
  const name=await evaluate('document.querySelector(".commander-summary-name strong").textContent');await switchLanguage('en');await switchLanguage('zh-Hans');assert.equal(await evaluate('document.querySelector(".commander-summary-name strong").textContent'),name,'Public nicknames are never translated');
  await click('.commander-card-top');await scan('rankings-profile');await click('#rank-wins');await until('document.querySelector("#commander-name")!==null');await scan('rankings-online');await click('#rank-close');
  await click('#generals-nav');assert.equal(await evaluate('document.querySelectorAll(".avatar-card").length'),40);await scan('general-avatars');await click('#rival-tab');await scan('general-roster');await click('#modal-close');
  await click('#rules-nav');
  for(let n=0;n<12;n++){await until(`document.querySelector('.comic-book')?.dataset.comicPage==='${n}'`);await scan('comic-'+(n+1));for(const selector of await evaluate('Array.from(document.querySelectorAll("[data-rule-page]:not([hidden]) [data-rule-try]"),e=>`[data-rule-page]:not([hidden]) [data-rule-try="${e.dataset.ruleTry}"]`)')){await click(selector);await scan('comic-'+(n+1)+'-feedback');}if(n<11)await click('#comic-next');}
  await screenshot('comic-phone');await click('#modal-close');
  await navigate('/tutorial.html','document.querySelectorAll("#tutorial-board .cell").length===81');assert.equal(await evaluate('document.documentElement.lang'),'zh-Hans','Language persists between game and tutorial');
  for(const lesson of LESSONS){await evaluate(`(()=>{const e=document.querySelector('#tutorial-lesson');e.value=${JSON.stringify(lesson.id)};e.dispatchEvent(new Event('change'));})()`);for(let n=0;n<lesson.steps.length;n++){await scan('tutorial-'+lesson.id+'-step-'+n);const action=lesson.steps[n].action;if(action==='pass')await click('#tutorial-pass');else{await click(`[data-index="${action}"]`);await click('#tutorial-deploy');}await until('!document.querySelector("#tutorial-next").hidden');await scan('tutorial-'+lesson.id+'-review-'+n);await click('#tutorial-next');}}
  await scan('tutorial-complete');await screenshot('tutorial-phone');
  await navigate();assert.equal(await evaluate('document.documentElement.lang'),'zh-Hans','Language survives reload');assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state'),state,'Tutorial and language switching preserve the live battle');
  const fits=async(selectors,label)=>{for(const selector of selectors)assert.equal(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;})()`),true,selector+' fits '+label);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,label+' has no horizontal overflow');};
  for(const [w,h]of[[320,568],[390,844],[844,390],[1366,768]]){
    await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<900});await wait(150);const size=w+'x'+h;
    await fits(['#board','#deploy','#pass','#undo','#language-switch'],size+' battle');
    await click('#battle-back');await fits(['#begin','#resume','#language-switch'],size+' lobby');await click('#resume');
    await click('#settings-nav');await scan('settings-'+w);await fits(['#language-select','#modal-close'],size+' settings');await click('#modal-close');
    await click('#treasury-nav');await scan('treasury-'+w);await fits(['#treasury-draw','#modal-close'],size+' treasury');await click('#modal-close');
    await click('#rankings-nav');await until('document.querySelector("#commander-name")!==null');await fits(['#rank-close','#rank-refresh','#modal-close'],size+' rankings');await click('#rank-close');
    await navigate('/tutorial.html','document.querySelectorAll("#tutorial-board .cell").length===81');await evaluate(`(()=>{const e=document.querySelector('#tutorial-lesson');e.value='single-eye';e.dispatchEvent(new Event('change'));})()`);await fits(['#tutorial-board','#tutorial-deploy','#tutorial-pass','#tutorial-lesson','#language-switch'],size+' tutorial');await scan('tutorial-'+w);await navigate();
  }
  assert.deepEqual(errors,[],'No uncaught browser exceptions');
  // Check translations and the Chinese book from the offline installation cache.
  await evaluate('navigator.serviceWorker.ready');
  await until(`(async()=>{const c=await caches.open('little-kingdoms-v2.9.0');return !!(await c.match('/locales/zh-rules.js'))&&!!(await c.match('/assets/little-kingdoms-comic-rules-zh-Hans.pdf'));})()`);
  await send('Network.enable');await send('Network.clearBrowserCache');await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await navigate();assert.equal(await evaluate('document.documentElement.lang'),'zh-Hans');await scan('offline-battle');
  await switchLanguage('en');await switchLanguage('zh-Hans');assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem("little-kingdoms-save")).state'),state,'offline language switching preserves the match');
  await click('#rules-nav');await scan('offline-rules');await click('#modal-close');
  await navigate('/rulebook.html','document.querySelector(".comic-book")!==null');await scan('offline-comic-reader');assert.equal(await evaluate('document.querySelector("#download-comic").getAttribute("href")'),'/assets/little-kingdoms-comic-rules-zh-Hans.pdf');
  assert.equal(await evaluate(`fetch('/assets/little-kingdoms-comic-rules-zh-Hans.pdf').then(r=>r.text()).then(text=>text.startsWith('%PDF'))`),true,'Chinese PDF is available offline');
  await navigate('/tutorial.html','document.querySelectorAll("#tutorial-board .cell").length===81');await scan('offline-tutorial');
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await writeFile('artifacts/language-leaks.json',JSON.stringify(leaks,null,2));
  const remaining=leaks.flatMap(x=>x.items.map(item=>({...item,screen:x.screen})));console.log(JSON.stringify({screens:leaks.length,englishCandidates:remaining.length,report:'artifacts/language-leaks.json'}));
  assert.equal(remaining.length,0,'All inspected Chinese screens are localized; inspect artifacts/language-leaks.json for missing strings');
  console.log('Language browser checks passed: live EN/简体中文 switching, saved match preservation, all fifty artwork names, draw/equip, public nickname safety, rankings, forty avatars, twelve comic chapters and every playable tutorial step.');
}finally{await writeFile('artifacts/language-leaks.json',JSON.stringify(leaks,null,2));ws?.close();edge.kill();}


