import { newGame, play, groupSafety, territories, inspectMove, scoredWinner, positionName } from '/engine.js';
import { evaluate } from '/ai.js';
import { AVATARS, PROFILE_KEY, normalizeProfile, levelForXP, xpForLevel, awardMatch, avatarLine } from '/progression.js';
import { audioSettings, saveAudio, effect, speak, MUSIC_TRACKS, currentMusic, chooseMusic, setMusicMode, nextMusic } from '/audio.js';
import { comicMarkup, wireComic } from '/rulebook.js';
import { localize } from '/i18n.js';
import { castleMarkup, cosmeticFor, pullsAvailable } from '/cosmetics.js';
import { openCollection } from '/collection.js';
import { openRankings, ensureCommander, syncCommander, commanderIdentity } from '/rankings.js';

const $ = id => document.getElementById(id);
const API_BASE = window.KINGDOMS_API_BASE || '';
const PUBLIC_ORIGIN = API_BASE || location.origin;
const SHU = [
  ['Liu Shan','劉禪','The young heir','A little curious. A little clumsy. A good first rival.'],
  ['Mi Zhu','糜竺','The apprentice','A gentle scholar learning the art of the battlefield.'],
  ['Zhou Cang','周倉','The sentry','A loyal guard who knows how to protect his castles.'],
  ['Guan Ping','關平','The captain','A steady hand, with an eye for a promising flank.'],
  ['Ma Dai','馬岱','The tactician','Patient on defense. Quick to spot an opening.'],
  ['Huang Zhong','黃忠','The veteran','Experience is his sharpest weapon. Watch your liberties.'],
  ['Wei Yan','魏延','The challenger','Bold plans and relentless pressure. Leave nothing exposed.'],
  ['Ma Chao','馬超','The vanguard','A silver spear and a mind that is always racing ahead.'],
  ['Zhao Yun','趙雲','The dragon','Calm under pressure. Precise when it matters most.'],
  ['Zhuge Liang','諸葛亮','The sleeping dragon','A feather fan. A quiet smile. Several moves ahead.']
];
const WEI = [
  ['Cao Pi','曹丕','The young heir','A playful prince taking his first steps in strategy.'],
  ['Cao Hong','曹洪','The apprentice','Enthusiasm comes first. Grand plans come later.'],
  ['Li Dian','李典','The sentry','Cautious by nature. He will not overlook a direct threat.'],
  ['Yue Jin','樂進','The captain','A brave commander who probes for a weakness.'],
  ['Yu Jin','于禁','The tactician','A patient commander. Every castle has a purpose.'],
  ['Xu Chu','許褚','The veteran','A big heart, a bigger shield, and a stubborn defense.'],
  ['Xiahou Yuan','夏侯淵','The challenger','Quick to mobilize. Even quicker to punish a loose castle.'],
  ['Xiahou Dun','夏侯惇','The vanguard','One eye. Plenty of foresight. A formidable rival.'],
  ['Zhang Liao','張遼','The conqueror','Every advance has a purpose. Every retreat is a question.'],
  ['Cao Cao','曹操','The great strategist','The ambition of a king. The patience of a master.']
];
const TITLES = ['Rookie','Apprentice','Sentry','Captain','Tactician','Veteran','Challenger','Vanguard','Master','Legend'];
let config = { mode: 'bot', level: 5, humanColor: 1 }, state = newGame(), started = false;
let selected = null, snapshots = [], thinking = false, pending = false, botWorker = null, botTimer = null, emotionTimer = null, roomTimer = null;
let room = null, roomError = '', emotion = '', toastTimer, searchInfo = null, cutinTimer, cutinCooldown=0;
let profile=normalizeProfile(null);
try{profile=normalizeProfile(JSON.parse(localStorage.getItem(PROFILE_KEY)));}catch{}
const cells = [];
try {
  const saved = JSON.parse(localStorage.getItem('little-kingdoms-save') || 'null');
  if (saved?.schema === 1 && ['bot','local'].includes(saved.config.mode) && Array.isArray(saved.state.board) && saved.state.board.length === 81 && saved.state.board[40] === 3) {
    config = saved.config; state = saved.state; started = saved.started; snapshots = saved.snapshots || [];
  }
} catch { /* Storage is optional in private browsing. */ }
let screen=started?'battle':'lobby';
let installPrompt=null;
if(started&&!state.matchId){state.matchId=crypto.randomUUID();persist();}

function persist() {
  try {
    if (config.mode !== 'online') localStorage.setItem('little-kingdoms-save', JSON.stringify({ schema: 1, config, state, started, snapshots: snapshots.slice(-85) }));
  } catch { /* A full or unavailable browser store must not stop a game. */ }
}
function toast(message) { $('toast').textContent = message;localize($('toast')); $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3300); }
const tone=effect;
function saveProfile(){try{localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));}catch{toast('Device storage is unavailable. Progress lasts for this session.');}}
function showTreasury(){openCollection({modal,getProfile:()=>profile,onProfileChange:next=>{profile=normalizeProfile(next);saveProfile();render();},toast,tone});}
function showRankings(){openRankings({modal,api,getProfile:()=>profile,toast});}
function syncProgress(){if(commanderIdentity())syncCommander({api,getProfile:()=>profile}).catch(()=>{});}
function castleFor(color){return state.players?.[color]?.castle??(config.mode==='local'||color===config.humanColor?profile.cosmetics.castle:'classic');}
function avatarPortrait(el,id){const a=AVATARS[id]||AVATARS[0];el.style.backgroundImage=`url('/assets/${a.atlas}.webp')`;el.style.backgroundPosition=`${a.index%5*25}% ${Math.floor(a.index/5)*100/3}%`;el.setAttribute('aria-label',a.name);}
function avatarFor(color){return state.players?.[color]?.avatar??(color===config.humanColor?profile.avatar:color===1?0:10);}
function playerCutin(color,event,force=false){
  if(!audioSettings.cutins||screen!=='battle'||(!force&&Date.now()<cutinCooldown))return;
  cutinCooldown=Date.now()+8500;const id=avatarFor(color),a=AVATARS[id]||AVATARS[0];
  $('cutin').hidden=false;$('cutin').classList.remove('enter');void $('cutin').offsetWidth;$('cutin').classList.add('enter');
  $('cutin').dataset.color=color;avatarPortrait($('cutin-portrait'),a.id);$('cutin-name').textContent=a.name+' · '+a.han;
  const line=avatarLine(a.id,event);$('cutin-line').textContent='“'+line+'”';speak(line);
  clearTimeout(cutinTimer);cutinTimer=setTimeout(()=>$('cutin').hidden=true,2300);
}
function reactPlayer(before,after){
  if(config.mode==='local')return;
  const own=config.humanColor;
  if(after.winner){playerCutin(own,after.winner===own?'win':'loss',true);return;}
  const threatened=groupSafety(after).some(g=>g.color===own&&g.threatened);
  if(threatened){playerCutin(own,'threat');return;}
  const mover=before.turn;
  if(mover===own){const grew=territories(after.board).scores[own]>territories(before.board).scores[own];if(grew||after.count[own]===1||after.count[own]%5===0)playerCutin(own,grew?'territory':'move');}
}
function renderProfile(){
  const level=levelForXP(profile.xp),floor=xpForLevel(level),next=xpForLevel(level+1);
  avatarPortrait($('profile-avatar'),profile.avatar);$('profile-level').textContent='LV. '+level;$('profile-xp').textContent=level===50?'MAX LEVEL':`${profile.xp-floor} / ${next-floor} XP`;
  $('profile-fill').style.width=(level===50?100:(profile.xp-floor)/(next-floor)*100)+'%';$('profile-button').title=`${AVATARS[profile.avatar].name} · Choose avatar & view progress`;
  $('treasury-badge').textContent=pullsAvailable(profile);$('treasury-badge').hidden=pullsAvailable(profile)===0;
}
function portrait(el, color, level, mood = '') {
  const index = (color === 2 ? 10 : 0) + level - 1;
  el.style.backgroundPosition = `${(index % 5) * 25}% ${Math.floor(index / 5) * 100 / 3}%`;
  el.style.backgroundImage = `url('/assets/generals${mood ? '-' + mood : ''}.webp')`;
}
function general(color, level = config.level) { return (color === 1 ? SHU : WEI)[level - 1]; }
function colorName(c) { return c === 1 ? 'Shu' : 'Wei'; }
function ownTurn() { return started && !state.winner && !thinking && !pending && (config.mode === 'local' || (state.turn === config.humanColor && (config.mode !== 'online' || room?.ready))); }

for(let level=1;level<=10;level++){
  const button=document.createElement('button');button.className='level-node';button.type='button';button.textContent=level;button.dataset.level=level;button.setAttribute('aria-label',`Level ${level} · ${TITLES[level-1]}`);
  button.onclick=()=>{$('difficulty').value=level;$('difficulty').dispatchEvent(new Event('change'));};$('level-track').append(button);
}

for (let i=0;i<81;i++) {
  const cell = document.createElement('button'); cell.className='cell'; cell.type='button'; cell.dataset.index=i;
  cell.addEventListener('click',()=>selectCell(i));
  cell.addEventListener('keydown', e => {
    const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-9,ArrowDown:9};
    if (e.key in offsets) {e.preventDefault(); const n=i+offsets[e.key]; if(n>=0&&n<81&&(!(e.key==='ArrowLeft'||e.key==='ArrowRight')||Math.floor(n/9)===Math.floor(i/9))) cells[n].focus();}
  });
  $('board').append(cell); cells.push(cell);
}

function renderSetup() {
  renderProfile();
  for (const m of ['bot','local','online']) { $('mode-'+m).classList.toggle('selected',config.mode===m); $('mode-'+m).disabled=pending; }
  $('bot-setup').hidden=config.mode!=='bot'; $('pvp-setup').hidden=config.mode==='bot'; $('online-controls').hidden=config.mode!=='online';
  $('pvp-title').textContent=config.mode==='online'?'Rivals, from anywhere.':'A friendly rivalry.';
  $('pvp-desc').textContent=config.mode==='online'?'Create a private room or join a friend. Share the code and take your seats.':'Two kingdoms, one screen. Take turns and see who rules the riverlands.';
  const c=3-config.humanColor,g=general(c);
  portrait($('hero-portrait'),c,config.level,emotion);
  $('hero-portrait').classList.toggle('shock',emotion==='shock'); $('hero-portrait').classList.toggle('sad',emotion==='sad');
  $('hero-portrait').setAttribute('aria-label',`${g[0]}, ${colorName(c)} general level ${config.level}${emotion?', '+emotion:''}`);
  $('general-name').innerHTML=`${g[0]} <span>${g[1]}</span>`;
  $('general-desc').textContent=g[3]; $('hero-faction').textContent=c===1?'蜀 · KINGDOM OF SHU':'魏 · KINGDOM OF WEI';
  $('level-badge').textContent='LV. '+String(config.level).padStart(2,'0'); $('difficulty').value=config.level;
  $('difficulty').style.setProperty('--progress',`${(config.level-1)/9*100}%`); $('level-title').textContent=`${config.level} · ${TITLES[config.level-1]}`;
  $('difficulty').disabled=pending;
  for(const c of [1,2]) {const b=$(c===1?'choose-shu':'choose-wei');b.classList.toggle('selected',config.humanColor===c);b.setAttribute('aria-pressed',String(config.humanColor===c));}
  $('begin').hidden=config.mode==='online'; $('begin').innerHTML=(started?'New battle':'To battle')+' <svg><use href="#swords"/></svg>';
  $('resume').hidden=!started||config.mode==='online';$('resume').textContent=state.winner?'Return to finished battle →':'Resume current battle →';
  $('setup-note').textContent=config.mode==='online'?'A private room. A worthy rival.':'40 castles. One capture. A kingdom to win.';
  document.querySelectorAll('.level-node').forEach(b=>{b.classList.toggle('current',Number(b.dataset.level)===config.level);b.setAttribute('aria-pressed',String(Number(b.dataset.level)===config.level));b.disabled=pending;});
  $('room-details').hidden=!room; $('join-form').hidden=!!room; $('create-room').hidden=!!room; document.querySelector('.or-line').hidden=!!room;
  for(const [id,c] of [['host-blue',1],['host-orange',2]]){$(id).setAttribute('aria-pressed',String(config.humanColor===c));$(id).disabled=!!room||pending;}
  $('online-controls').classList.toggle('in-room',!!room);
  if(room) {$('active-room-code').textContent=room.code;$('room-status').textContent=roomError|| (room.ready?`Connected. You command ${colorName(config.humanColor)}.`:'Waiting for your opponent…');}
  document.querySelector('.emotion-label')?.remove();
  if(emotion&&config.mode==='bot') {const label=document.createElement('span');label.className='emotion-label';label.textContent=emotion==='shock'?'Wait… that was your plan?!':'My beautiful kingdom…';document.querySelector('.opponent-art-wrap').append(label);}
  $('sound').classList.toggle('on',!audioSettings.muted); $('sound').setAttribute('aria-label',audioSettings.muted?'Unmute music and effects':'Mute music and effects');
  $('battle-mode').textContent=config.mode==='bot'?`GENERAL CHALLENGE · LV ${config.level}`:config.mode==='local'?'PASS & PLAY':room?'ONLINE DUEL · '+room.code:'ONLINE DUEL';
  $('battle-emotion').hidden=!emotion||config.mode!=='bot';$('battle-emotion').textContent=emotion==='shock'?'Wait… that was your plan?!':'My beautiful kingdom…';
}

function render(pop = false) {
  document.body.classList.toggle('playing',started);
  document.body.dataset.screen=screen;$('lobby-screen').hidden=screen!=='lobby';$('battle-screen').hidden=screen!=='battle';$('room-screen').hidden=screen!=='room';renderRoomLobby();
  renderSetup();
  const boardArt=cosmeticFor(profile.cosmetics.board,'board'),boardSpace=document.querySelector('.board-space');
  boardSpace.classList.toggle('has-board-art',!!boardArt);boardSpace.style.setProperty('--board-art',boardArt?`url('/assets/cosmetics/${boardArt.id}.webp')`:'none');
  const t=territories(state.board), danger=new Set(), protectedStones=new Set(), hints=$('show-danger').checked, show=$('show-territory').checked;
  if(hints) for(const g of groupSafety(state,t)) {
    if(g.threatened)g.stones.forEach(i=>danger.add(i));
    if(g.protected)g.stones.forEach(i=>protectedStones.add(i));
  }
  for(let i=0;i<81;i++) {
    const c=state.board[i],isSelected=selected===i,cell=cells[i],ghost=isSelected&&!c&&!t.owners[i];
    cell.className='cell'+(c?' '+['','blue','orange','neutral'][c]:'')+(show&&t.owners[i]?' owned-'+(t.owners[i]===1?'blue':'orange'):'')+(isSelected?' selected':'')+(ghost?' ghost '+(state.turn===1?'blue':'orange'):'')+(state.last===i?' last':'')+(danger.has(i)?' danger':'')+(pop&&state.last===i?' pop':'');
    cell.innerHTML=c===3?'<svg aria-hidden="true"><use href="#castle"/></svg>':c||ghost?castleMarkup(castleFor(c||state.turn),c||state.turn):'';
    const desc=c===3?'Neutral shared wall':c?`${colorName(c)} castle${danger.has(i)?', danger: opponent has a legal winning capture':''}${protectedStones.has(i)?', protected by sealed territory':''}`:t.owners[i]?`${colorName(t.owners[i])} sealed territory: locked for both players`:'Empty';
    cell.setAttribute('aria-label',`${positionName(i)}: ${desc}${isSelected?', selected':''}`);
    cell.setAttribute('aria-pressed',String(isSelected));
    // Occupied squares stay focusable for keyboard inspection.
    cell.setAttribute('aria-disabled',String(!!c||!!t.owners[i]||!ownTurn()));
  }
  for(const c of [1,2]) {
    const prefix=c===1?'blue':'orange',isHuman=c===config.humanColor;
    $(prefix+'-territory').textContent=t.scores[c]; $(prefix+'-castles').textContent=40-state.count[c];
    $(prefix+'-supply').style.width=(40-state.count[c])/40*100+'%';
    const player=AVATARS[avatarFor(c)]||AVATARS[0];
    const name=config.mode==='bot'?(isHuman?player.name:general(c)[0]):(config.mode==='local'?colorName(c):state.players?.[c]?.displayName||player.name);
    $(prefix+'-name').toggleAttribute('data-user-content',config.mode==='online'&&!!state.players?.[c]?.displayName);$(prefix+'-name').textContent=name;const faction=document.createElement('span');faction.textContent=c===1?'蜀':'魏';$(prefix+'-name').append(' ',faction);
    if(config.mode==='bot'&&!isHuman)portrait($(prefix+'-avatar'),c,config.level,emotion);
    else avatarPortrait($(prefix+'-avatar'),player.id);
    $(prefix+'-player').classList.toggle('current',started&&!state.winner&&state.turn===c);
  }
  const score=scoredWinner(state),margin=score.adjusted[1]-score.adjusted[2];
  $('lead-label').textContent=margin===0?'Level · 0':(margin>0?'Blue Lead ':'Orange Lead ')+Math.abs(margin);
  $('lead-ribbon').dataset.leader=margin>0?'blue':margin<0?'orange':'even';
  $('lead-ribbon').title='Current sealed territory, including Blue’s −2 handicap. Blue needs an adjusted lead of 3 to win on points. A capture wins immediately.';
  let title='Your kingdom awaits',subtitle='Begin a battle, then choose your first square.';
  if(started) {
    if(state.winner) {title=`${colorName(state.winner)} rules the riverlands`;subtitle=state.reason==='territory'?'The land has been counted. A little history is made.':state.reason==='resignation'?'A graceful retreat. Another battle awaits.':'One capture. A kingdom won.';}
    else if(config.mode==='online'&&!room?.ready) {title='A seat for your rival';subtitle='Share your room code to begin the battle.';}
    else if(thinking) {title=`${general(state.turn)[0]} is plotting…`;subtitle='A quiet moment before the next move.';}
    else if(ownTurn()) {title=config.mode==='local'?`${colorName(state.turn)}’s turn`:'Your move, commander';subtitle=selected!==null?`Deploy at ${positionName(selected)}, or choose another square.`:state.passes?'Your rival passed. Pass to finish, or keep building.':'Tap a square, then deploy your castle.';}
    else {title=pending?'Sending your move…':'Your rival is planning';subtitle=pending?'Securing your castle on the battlefield.':'The next move will appear here automatically.';}
  }
  $('turn-title').textContent=title;$('turn-subtitle').textContent=subtitle;
  $('status-orb').classList.toggle('thinking',thinking);$('status-orb').style.background=state.winner?'#9aaa74':state.turn===1?'#6193a0':'#c98a58';
  $('move-counter').textContent='TURN '+String(state.ply).padStart(2,'0');
  const ended=started&&!!state.winner;
  $('deploy').disabled=pending||(!ended&&(started?(!ownTurn()||selected===null):config.mode==='online'));$('deploy').innerHTML=ended?(config.mode==='online'?'New duel <span>↗</span>':'Play again <span>↻</span>'):!started?'To battle <span>↗</span>':selected===null?'Tap a square <span>＋</span>':`Deploy ${positionName(selected)} <span>＋</span>`;
  $('pass').disabled=ended?pending:!ownTurn();$('pass').innerHTML=ended?'Lobby<span>→</span>':'Pass<span>→</span>';
  $('undo').disabled=ended?pending:!started||!snapshots.length||config.mode==='online'||pending;$('undo').innerHTML=ended?'Results':'<span>↶</span>Undo';
  $('battle-restart').hidden=!started||(config.mode==='online'&&!ended);$('battle-restart').disabled=pending;$('battle-restart').textContent=ended?(config.mode==='online'?'New duel ↗':'Play again ↻'):'Restart ↻';
  $('battle-leave').hidden=config.mode!=='online'||!room;$('battle-leave').disabled=pending;
  $('battle-back').querySelector('span').textContent=room?'Room':'Lobby';
  $('resign').disabled=!started||!!state.winner||pending||(config.mode==='online'&&!room?.ready);
  localize();
}

function selectCell(i) {
  if(!started) {toast('Begin a battle to take your first turn.');$('begin').focus();return;}
  if(!ownTurn()) {if(!state.winner) toast(thinking?'Your general is considering a move.':'Wait for your rival’s move.');return;}
  const result=inspectMove(state,i);
  if(result.error) {selected=null;render();toast(result.error);return;}
  if(selected===i) {act(i);return;}
  selected=i;render();
}

function stopBot() {clearTimeout(botTimer);botWorker?.terminate();botWorker=null;thinking=false;}
function resetEmotion() {clearTimeout(emotionTimer);emotion='';}
function reactToPressure(before, after) {
  if(config.mode!=='bot')return;
  const bot=3-config.humanColor, t=territories(after.board).scores;
  const shocked=groupSafety(after).some(g=>g.color===bot&&g.threatened)||evaluate(after,bot)<evaluate(before,bot)-28;
  const sad=t[config.humanColor]-t[bot]>=3||after.winner===config.humanColor;
  if(!shocked&&!sad)return;
  clearTimeout(emotionTimer);emotion=sad?'sad':'shock';
  emotionTimer=setTimeout(()=>{emotion='';render();},4800);
}

async function act(action) {
  if(!ownTurn()&&action!=='resign')return;
  if(config.mode==='online') {
    if(!room?.ready||state.winner||pending)return;
    pending=true;render();
    try {const result=await api(`/api/rooms/${room.code}/move`,{action,version:room.version},room.token);room.version=result.version;room.ready=result.ready;const before=state;state=result.state;selected=null;tone(action==='pass'?'pass':'place');render(true);reactPlayer(before,state);if(state.winner&&!before.winner)showResult();}
    catch(e){toast(e.message);await pollRoom();}
    finally{pending=false;render();}
    return;
  }
  const before=state;
  try {state=play(action==='resign'&&config.mode==='bot'?{...state,turn:config.humanColor}:state,action);snapshots.push(before);}
  catch(e){toast(e.message);return;}
  selected=null;searchInfo=null;tone(action==='pass'?'pass':'place');reactToPressure(before,state);persist();render(true);reactPlayer(before,state);
  if(state.winner)showResult();else queueBot();
}

function queueBot() {
  if(!started||state.winner||config.mode!=='bot'||state.turn===config.humanColor)return;
  stopBot();thinking=true;render();
  const currentPly=state.ply;
  botTimer=setTimeout(()=>{
    try{
      botWorker=new Worker('/ai-worker.js',{type:'module'});
      botWorker.onmessage=event=>{
        if(state.ply!==currentPly||!thinking)return;
        const result=event.data;
        if(result.error){stopBot();render();toast('The general lost their train of thought. Please retry the turn.');return;}
        const before=state;
        try{state=play(state,result.move);snapshots.push(before);searchInfo=result;}
        catch{stopBot();render();toast('The general could not complete a legal move. Undo and retry.');return;}
        stopBot();selected=null;persist();tone(result.move==='pass'?'pass':'place');render(true);reactPlayer(before,state);
        if(state.winner)showResult();
      };
      botWorker.onerror=()=>{stopBot();render();toast('The general could not load. Reload to retry the saved turn.');};
      botWorker.postMessage({state,level:config.level});
    }catch{stopBot();render();toast('This browser cannot start the bot worker. Try a current browser.');}
  },380);
}

function startBattle() {
  if(config.mode==='online'){screen=room?'room':'lobby';render();return;}
  stopBot();resetEmotion();clearTimeout(cutinTimer);$('cutin').hidden=true;cutinCooldown=0;state={...newGame('literal'),matchId:crypto.randomUUID(),players:{[config.humanColor]:{avatar:profile.avatar,castle:profile.cosmetics.castle},...(config.mode==='local'?{[3-config.humanColor]:{castle:profile.cosmetics.castle}}:{})}};snapshots=[];selected=null;searchInfo=null;started=true;screen='battle';persist();render();playerCutin(config.humanColor,'start',true);queueBot();
}
function modal(html) {$('modal-content').innerHTML=html;localize($('modal-content'));$('modal').scrollTop=0;if(!$('modal').open)$('modal').showModal();}
function replayBattle() {
  if(pending)return;
  if(config.mode==='online') {
    if(!state.winner)return;
    $('modal').close();stopRoom();resetEmotion();clearTimeout(cutinTimer);$('cutin').hidden=true;
    state=newGame();started=false;selected=null;snapshots=[];screen='lobby';render();
    toast('Create a new room and share its invitation, or join your friend’s new room.');return;
  }
  const restart=()=>{$('modal').close();startBattle();};
  if(!started||state.winner||!state.ply){restart();return;}
  modal('<p class="eyebrow">A FRESH BATTLEFIELD</p><h2>Restart this match?</h2><p>Start again with the same general, difficulty and kingdom. This unfinished match gives no XP.</p><div class="dialog-actions"><button class="secondary-btn" id="cancel-restart">Keep playing</button><button class="primary-btn" id="confirm-restart">Restart ↻</button></div>');
  $('cancel-restart').onclick=()=>$('modal').close();$('confirm-restart').onclick=restart;
}
function confirmChange(callback, title='A new chapter?') {
  if(config.mode==='online'&&room){requestLeaveRoom(callback);return;}
  if(!started||state.winner||(!state.ply&&config.mode!=='online')) {callback();return;}
  modal(`<p class="eyebrow">LEAVE THIS BATTLE</p><h2>${title}</h2><p>Your current battle will end on this device.${config.mode==='online'?' Your rival can still view the room.':''}</p><div class="dialog-actions"><button class="secondary-btn" id="cancel-change">Keep playing</button><button class="primary-btn" id="confirm-change">Continue →</button></div>`);
  $('cancel-change').onclick=()=>$('modal').close();$('confirm-change').onclick=()=>{$('modal').close();callback();};
}
function switchMode(mode) {
  if(config.mode===mode)return;
  confirmChange(()=>{stopBot();resetEmotion();stopRoom();config.mode=mode;started=false;screen='lobby';state=newGame();snapshots=[];selected=null;persist();render();});
}

function showRules(page=0) {
  if(!Number.isInteger(page))page=0;
  modal(comicMarkup({page}));wireComic($('modal-content'));
}
function showRivals() {
  const cards=(list,color)=>list.map((g,i)=>`<button class="roster-card" data-general="${color}:${i+1}" aria-label="Play against ${g[0]}, level ${i+1}"><div class="portrait" style="background-position:${i%5*25}% ${Math.floor(((color===2?10:0)+i)/5)*100/3}%"></div><strong>${g[0]}</strong><small>LV. ${i+1} · ${g[1]}</small></button>`).join('');
  modal(`<p class="eyebrow">TWENTY FACES. TEN LEVELS.</p><h2>Choose your worthy rival.</h2><p>Each kingdom has a general for every level. Pick a portrait to prepare a battle against them.</p><div class="roster-faction">蜀 · SHU GENERALS</div><div class="general-roster">${cards(SHU,1)}</div><div class="roster-faction">魏 · WEI GENERALS</div><div class="general-roster">${cards(WEI,2)}</div>`);
  document.querySelectorAll('[data-general]').forEach(b=>b.onclick=()=>{const [c,l]=b.dataset.general.split(':').map(Number);$('modal').close();confirmChange(()=>{stopBot();stopRoom();resetEmotion();config={mode:'bot',humanColor:3-c,level:l};state=newGame();started=false;screen='lobby';snapshots=[];selected=null;persist();render();toast(`${general(c)[0]} is ready. Begin your battle.`);});});
}
function showGenerals(){
  const level=levelForXP(profile.xp),next=AVATARS.find(a=>a.unlock>level);
  modal(`<p class="eyebrow">YOUR LEGEND BEGINS HERE</p><h2>Hall of generals</h2><div class="collection-tabs"><button class="selected" id="avatar-tab">Your avatars · 40</button><button id="rival-tab">Challenge rivals · 20</button></div><div class="commander-progress"><div class="portrait" id="collection-portrait"></div><div><strong>Commander level ${level}</strong><p>${profile.xp} total XP · ${profile.wins} wins · ${profile.matches} battles</p><div class="profile-meter"><i style="width:${level===50?100:(profile.xp-xpForLevel(level))/(xpForLevel(level+1)-xpForLevel(level))*100}%"></i></div><small>${level===50?'Maximum commander level':`${xpForLevel(level+1)-profile.xp} XP to level ${level+1}`}</small></div></div><p class="collection-note">${next?'Next unlocks: '+AVATARS.filter(a=>a.unlock===level+1).map(a=>a.name).join(' & ')+'.':'Every general is unlocked.'} Choose any unlocked general as your own avatar.</p><div class="avatar-grid">${AVATARS.map(a=>`<button class="avatar-card ${a.unlock>level?'locked':''} ${a.id===profile.avatar?'equipped':''}" data-avatar="${a.id}" aria-pressed="${a.id===profile.avatar}" aria-label="${a.name}, ${a.unlock>level?'locked until level '+a.unlock:a.id===profile.avatar?'equipped':'choose avatar'}"><div class="portrait"></div><strong>${a.name}</strong><small>${a.unlock>level?'🔒 LEVEL '+a.unlock:a.id===profile.avatar?'✓ EQUIPPED':a.han+' · SELECT'}</small></button>`).join('')}</div><div class="progression-guide"><h3>Every battle tells a story.</h3><p>AI victory: 60 + 12 × difficulty XP. First victory at each difficulty: 40 + 5 × difficulty bonus XP. AI defeat: 25 + 4 × difficulty XP. Online: 150 XP for a win, 60 for a defeat. Pass & play: 40 XP per battle.</p><p>Play at least 4 castles total, including 2 of your own. Resigning gives the resigning player no XP. Empty pass games give no XP. Avatar changes apply to your next battle. Progress saves on this device; it is unranked and does not sync between devices.</p></div>`);
  avatarPortrait($('collection-portrait'),profile.avatar);$('rival-tab').onclick=showRivals;
  document.querySelectorAll('[data-avatar]').forEach(b=>{const a=AVATARS[Number(b.dataset.avatar)];avatarPortrait(b.querySelector('.portrait'),a.id);b.onclick=()=>{if(a.unlock>level){toast(`${a.name} joins you at commander level ${a.unlock}.`);return;}profile.avatar=a.id;saveProfile();renderProfile();showGenerals();toast(`${a.name} selected${started&&!state.winner?' for your next battle':''}.`);};});
}
function showResult() {
  tone('win');
  try{profile=normalizeProfile(JSON.parse(localStorage.getItem(PROFILE_KEY))||profile);}catch{}
  const reward=awardMatch(profile,{state,mode:config.mode,humanColor:config.humanColor,botLevel:config.level});profile=reward.profile;saveProfile();renderProfile();
  syncProgress();
  const s=scoredWinner(state),win=state.winner;
  if(config.mode==='bot'&&win===config.humanColor){emotion='sad';clearTimeout(emotionTimer);emotionTimer=setTimeout(()=>{emotion='';render();},6000);render();}
  const reason=state.reason==='capture'?'An enemy group has no liberties. One capture, one kingdom.':state.reason==='simultaneous'?'Both sides lost their final liberties. The simultaneous capture rule awards the battle to Wei.':state.reason==='resignation'?'The opposing commander has laid down their banner.':'The final territories are sealed. The land has spoken.';
  modal(`<div class="result-view ${['capture','simultaneous'].includes(state.reason)?'capture-result':''}" data-winner="${win===1?'blue':'orange'}">${['capture','simultaneous'].includes(state.reason)?`<div class="capture-callout" role="status"><span class="capture-seal" aria-hidden="true">斬</span><div><small>${state.reason==='simultaneous'?'SIMULTANEOUS CAPTURE':'DECISIVE STRIKE'}</small><strong>CASTLE FALLS!</strong><b>${win===1?'BLUE WINS BY CAPTURE':'ORANGE WINS BY CAPTURE'}</b></div></div>`:''}<div class="result-heading"><div id="result-portrait" class="portrait"></div><div><p class="eyebrow">${config.mode==='local'?'BATTLE COMPLETE':win===config.humanColor?'VICTORY':'ANOTHER BATTLE AWAITS'}</p><h2>${colorName(win)} rules the riverlands.</h2></div></div><div class="result-body" tabindex="0" aria-label="Battle results and rewards"><p>${reason}</p><div class="reward-panel" id="match-reward"><strong>${reward.xp?'+'+reward.xp+' XP':reward.duplicate?'Progress already saved':'Practice complete · 0 XP'}</strong><span>${reward.firstVictory?'FIRST VICTORY BONUS · ':''}COMMANDER LEVEL ${levelForXP(profile.xp)}</span>${reward.level>reward.previousLevel?'<b class="level-up">LEVEL UP! '+reward.previousLevel+' → '+reward.level+'</b>':''}${reward.unlocked.length?'<p>Generals unlocked: '+reward.unlocked.map(a=>a.name).join(', ')+'</p>':''}${!reward.eligible&&!reward.duplicate?'<small>Play 4 castles total, including 2 of your own, to earn XP. Resigning earns no XP.</small>':''}</div><p class="character-result">“${avatarLine(avatarFor(config.humanColor),win===config.humanColor?'win':'loss')}”</p><div class="result-scores"><div><small>SHU · RAW ${s.raw[1]} − 2</small><strong>${s.adjusted[1]}</strong><small>adjusted territory</small></div><div><small>WEI · RAW ${s.raw[2]}</small><strong>${s.adjusted[2]}</strong><small>territory</small></div></div>${state.reason==='territory'?'<p>Shu needs an adjusted lead of 3.<br>A smaller lead or a tie belongs to Wei.</p>':''}${config.mode==='online'?'<p>For another duel, create a new room and invite your friend again.</p>':''}<button class="resume-btn" id="result-collection">View avatar collection →</button></div><div class="result-actions"><button class="primary-btn" id="play-again">${config.mode==='online'?'New online duel ↗':'Play again ↻'}</button><button class="secondary-btn" id="result-lobby">Battle lobby →</button></div></div>`);
  if(config.mode==='bot'&&win!==config.humanColor)portrait($('result-portrait'),win,config.level);else avatarPortrait($('result-portrait'),avatarFor(win));
  $('result-collection').onclick=showGenerals;$('play-again').onclick=replayBattle;$('result-lobby').onclick=()=>{$('modal').close();screen='lobby';render();};$('play-again').focus({preventScroll:true});
  if(reward.level>reward.previousLevel){const bonus=document.createElement('button');bonus.className='result-pulls';bonus.textContent=`✦ +${reward.level-reward.previousLevel} level-up pull${reward.level-reward.previousLevel===1?'':'s'} · Open Treasury →`;bonus.onclick=showTreasury;$('match-reward').append(bonus);}
}

async function api(path,body,token) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try {
    const res=await fetch(API_BASE+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:controller.signal});
    const data=await res.json();if(!res.ok){const error=new Error(data.error||'Could not reach the room.');error.status=res.status;throw error;}return data;
  }catch(e){if(e.name==='AbortError')throw new Error('Connection timed out. Your room is still saved; retry shortly.');throw e;}
  finally{clearTimeout(timer);}
}
function storeRoom() {try{const saved=JSON.stringify({...room,config});sessionStorage.setItem('little-kingdoms-room',saved);if(API_BASE)localStorage.setItem('little-kingdoms-room',saved);}catch{}}
function renderRoomLobby(){
  if(!room)return;
  $('lobby-room-code').textContent=room.code;$('room-count').textContent=room.ready?'2 / 2':'1 / 2';
  for(const c of [1,2]){
    const prefix=c===1?'blue':'orange',player=state.players?.[c],own=c===config.humanColor,present=!!player;
    $('room-'+prefix+'-seat').classList.toggle('empty',!present);
    const name=$('room-'+prefix+'-name');name.toggleAttribute('data-user-content',!!player?.displayName);
    name.textContent=player?.displayName||(present?(AVATARS[player.avatar]||AVATARS[0]).name:'Open seat');
    if(present)avatarPortrait($('room-'+prefix+'-avatar'),player.avatar);else $('room-'+prefix+'-avatar').removeAttribute('style');
    $('room-'+prefix+'-role').textContent=!present?'Waiting for rival':own?'You · Connected':'Rival · Connected';
  }
  $('room-wait-title').textContent=roomError?'Reconnecting…':room.version<0?'Reconnecting to your room…':!room.ready?'Waiting for your rival…':state.winner?'Duel complete':'Duel in progress';
  $('room-wait-description').textContent=roomError||(!room.ready?'The battle starts automatically when your rival joins.':state.winner?'The battle is over. Leave this room to host another duel.':'Both commanders are here. Return to the battlefield to continue.');
  $('room-enter-battle').hidden=!room.ready;$('room-enter-battle').textContent=state.winner?'View finished battle →':'Return to battlefield →';
  $('room-leave').textContent=pending?'Leaving room…':!room.ready?'Close room & leave':'Leave room';
  $('room-leave').disabled=pending||room.version<0;
  $('room-screen').classList.toggle('room-connected',room.ready);
}
function resetOnlineRoom(){stopRoom();stopBot();resetEmotion();clearTimeout(cutinTimer);$('cutin').hidden=true;state=newGame();started=false;selected=null;snapshots=[];screen='lobby';render();}
function requestLeaveRoom(onLeft=resetOnlineRoom){
  if(!room||pending)return;
  if(state.winner){resetOnlineRoom();if(onLeft!==resetOnlineRoom)onLeft();return;}
  const live=room.ready,{code,token,version}=room;
  modal(`<p class="eyebrow">${live?'LEAVE ONLINE DUEL':'CLOSE WAITING ROOM'}</p><h2>${live?'Resign and leave?':'Close this room?'}</h2><p>${live?'Leaving resigns this duel and awards your rival the win.':'Your invitation will stop working. No match or result will be recorded.'}</p><div class="dialog-actions"><button class="secondary-btn" id="cancel-leave-room">Stay in room</button><button class="primary-btn" id="confirm-leave-room">${live?'Resign & leave':'Close room & leave'}</button></div>`);
  $('cancel-leave-room').onclick=()=>$('modal').close();
  $('confirm-leave-room').onclick=async()=>{
    if(room?.code!==code||room.ready!==live||room.version!==version){$('modal').close();toast('The room changed. Check the lobby before leaving.');return;}
    pending=true;$('confirm-leave-room').disabled=true;$('cancel-leave-room').disabled=true;render();
    try{
      const data=await api(`/api/rooms/${code}/leave`,{version},token);
      if(room?.code!==code)return;
      if(data.state.winner){const reward=awardMatch(profile,{state:data.state,mode:'online',humanColor:config.humanColor,botLevel:config.level});profile=reward.profile;saveProfile();syncProgress();}
      $('modal').close();resetOnlineRoom();if(onLeft!==resetOnlineRoom)onLeft();
      toast(data.state.roomClosed?'Room closed. Your invitation is no longer active.':'You left the room.');
    }catch(e){pending=false;$('modal').close();await pollRoom();toast(e.message);}
    finally{pending=false;render();}
  };
}
function stopRoom(){roomError='';clearTimeout(roomTimer);roomTimer=null;room=null;try{localStorage.removeItem('little-kingdoms-room');sessionStorage.removeItem('little-kingdoms-room');}catch{}history.replaceState(null,'',location.pathname);}
function connectRoom(data) {
  stopBot();resetEmotion();config={mode:'online',humanColor:data.color,level:data.level};
  roomError='';room={code:data.code,token:data.token,version:data.version,ready:data.ready,hostColor:data.hostColor};state=data.state;started=data.ready;screen=data.ready?'battle':'room';snapshots=[];selected=null;
  history.replaceState(null,'',location.pathname+'?room='+room.code);storeRoom();render();if(data.ready)playerCutin(config.humanColor,'start',true);clearTimeout(roomTimer);roomTimer=setTimeout(pollRoom,1400);
}
let polling=false;
async function pollRoom(){
  if(!room||document.hidden)return;clearTimeout(roomTimer);if(polling){roomTimer=setTimeout(pollRoom,500);return;}polling=true;const code=room.code;
  try {
    const data=await api(`/api/rooms/${code}`,null,room.token);
    if(!room||room.code!==code)return;
    if(data.phase==='closed'||data.state.roomClosed){resetOnlineRoom();toast('This room was closed by its host. Create or join another room.');return;}
    roomError='';const wasReady=room.ready;const ended=!!state.winner;const changed=data.version!==room.version||data.ready!==room.ready;
    if(changed&&!pending){const before=state;room.version=data.version;room.ready=data.ready;room.hostColor=data.hostColor;state=data.state;started=data.ready;selected=null;if(!wasReady&&data.ready){screen='battle';playerCutin(config.humanColor,'start',true);}storeRoom();render(true);reactPlayer(before,state);if(state.winner&&!ended)showResult();else tone();}
    if($('room-status'))$('room-status').textContent=room.ready?`Connected. You command ${colorName(config.humanColor)}.`:'Waiting for your opponent…';
    renderRoomLobby();localize($('room-screen'));localize($('room-status'));
  }catch(e){if(room?.code===code){if([401,403,404,410].includes(e.status)){resetOnlineRoom();toast(e.message);}else{roomError=e.message+' Reconnecting…';render();}}}
  finally{polling=false;if(room?.code===code&&!document.hidden)roomTimer=setTimeout(pollRoom,1700);}
}

$('difficulty').addEventListener('input',()=>{const l=Number($('difficulty').value);$('level-title').textContent=`${l} · ${TITLES[l-1]}`;});
$('difficulty').addEventListener('change',()=>{const l=Number($('difficulty').value);if(l===config.level)return;renderSetup();confirmChange(()=>{stopBot();resetEmotion();config.level=l;state=newGame();started=false;screen='lobby';snapshots=[];selected=null;persist();render();});});
for(const [id,c]of[['choose-shu',1],['choose-wei',2]])$(id).onclick=()=>{if(config.humanColor===c)return;confirmChange(()=>{stopBot();resetEmotion();config.humanColor=c;state=newGame();started=false;screen='lobby';snapshots=[];persist();render();});};
for(const m of['bot','local','online'])$('mode-'+m).onclick=()=>switchMode(m);
$('begin').onclick=()=>confirmChange(startBattle);
$('lead-ribbon').onclick=()=>toast($('lead-ribbon').title);
$('deploy').onclick=()=>{if(state.winner){replayBattle();return;}if(!started){startBattle();return;}if(selected!==null)act(selected);};$('pass').onclick=()=>{if(state.winner){screen='lobby';render();}else act('pass');};$('battle-restart').onclick=replayBattle;
$('undo').onclick=()=>{
  if(state.winner){showResult();return;}
  if(!snapshots.length||config.mode==='online'||state.winner)return;
  stopBot();resetEmotion();state=snapshots.pop();
  if(config.mode==='bot'&&state.turn!==config.humanColor&&snapshots.length)state=snapshots.pop();
  selected=null;persist();render();queueBot();toast('A moment to rethink your strategy.');
};
$('resign').onclick=()=>{modal('<p class="eyebrow">LAY DOWN YOUR BANNER</p><h2>Retreat from this battle?</h2><p>Your opponent will win. Every strategist needs a fresh start sometimes.</p><div class="dialog-actions"><button class="secondary-btn" id="cancel-resign">Keep playing</button><button class="primary-btn" id="confirm-resign">Resign ⚑</button></div>');$('cancel-resign').onclick=()=>$('modal').close();$('confirm-resign').onclick=()=>{$('modal').close();stopBot();act('resign');};};
$('room-leave').onclick=()=>requestLeaveRoom();$('battle-leave').onclick=()=>requestLeaveRoom();$('room-enter-battle').onclick=()=>{if(room?.ready){screen='battle';render();}};
for(const [id,c]of[['host-blue',1],['host-orange',2]])$(id).onclick=()=>{if(room||pending)return;config.humanColor=c;render();};
$('room-copy-code').onclick=async()=>{if(!room)return;try{await navigator.clipboard.writeText(room.code);toast('Room code copied.');}catch{toast('Room code: '+room.code);}};
$('room-share-link').onclick=()=> $('copy-invite').click();
$('rules-nav').onclick=showRules;
$('generals-nav').onclick=showGenerals;$('play-nav').onclick=()=>{screen=room?(room.ready?'battle':'room'):started?'battle':'lobby';render();};
$('treasury-nav').onclick=showTreasury;$('rankings-nav').onclick=showRankings;
for(const id of['home','battle-back'])$(id).onclick=()=>{screen=room?'room':'lobby';render();};
$('resume').onclick=()=>{screen='battle';render();};$('return-to-room').onclick=()=>{screen='room';render();};
$('fullscreen').onclick=async()=>{try{if(window.kingdomsDesktop){await window.kingdomsDesktop.toggleFullscreen();return;}if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen unavailable on this display.');}};
function showSettings(){
  modal(`<p class="eyebrow">YOUR COMMAND TENT</p><h2>${screen==='battle'?'Battle menu':'Settings'}</h2><div class="settings-language-slot"></div><div class="audio-settings"><label>Music volume <output id="music-value">${Math.round(audioSettings.music*100)}%</output><input id="music-volume" type="range" min="0" max="100" value="${audioSettings.music*100}"></label><label>Battle effects <output id="effects-value">${Math.round(audioSettings.effects*100)}%</output><input id="effects-volume" type="range" min="0" max="100" value="${audioSettings.effects*100}"></label><div class="music-library"><label for="music-track">Soundtrack</label><select id="music-track">${MUSIC_TRACKS.map(t=>'<option value="'+t.id+'"'+(t.id===audioSettings.track?' selected':'')+'>'+t.title+'</option>').join('')}</select><label for="music-mode">Playback</label><select id="music-mode"><option value="rotation"${audioSettings.musicMode==='rotation'?' selected':''}>Rotate all tracks</option><option value="shuffle"${audioSettings.musicMode==='shuffle'?' selected':''}>Shuffle all tracks</option><option value="repeat"${audioSettings.musicMode==='repeat'?' selected':''}>Repeat this track</option></select><div class="music-current"><span>Now playing</span><strong id="music-now-playing">${currentMusic().title}</strong><small><span>By</span> <span id="music-author" data-l10n-skip>${currentMusic().author}</span></small><button class="secondary-btn" id="music-next">Next track ⏭</button></div><p id="music-status" role="status" hidden>Music unavailable. Try another track.</p><p class="music-credit"><span>Music is bundled for offline play. Each track has its own license.</span> <a id="music-source" href="${currentMusic().source}" target="_blank" rel="noopener">Source</a> · <a id="music-license" href="${currentMusic().licenseUrl}" target="_blank" rel="noopener" data-l10n-skip>${currentMusic().license}</a> · <a href="/assets/music-credits.txt" target="_blank" rel="noopener">Music credits</a></p></div></div><div class="settings-list"><button class="secondary-btn" id="setting-sound">Master audio <span>${audioSettings.muted?'Muted':'On ♫'}</span></button><button class="secondary-btn" id="setting-cutins">Anime cut-ins <span>${audioSettings.cutins?'On':'Off'}</span></button><button class="secondary-btn" id="setting-voice">Character voice <span>${audioSettings.voice?'On':'Off'}</span></button><button class="secondary-btn" id="setting-fullscreen">Fullscreen <span>${window.kingdomsDesktop?'F11 / Alt+Enter':'⛶'}</span></button><button class="secondary-btn" id="setting-home">${room?'Room lobby':'Battle lobby'} <span>→</span></button>${room?'<button class="secondary-btn" id="setting-room-leave">Leave room <span>↗</span></button>':''}${room?.ready&&!state.winner?'<button class="secondary-btn" id="setting-resign">Resign ⚑</button>':''}<button class="secondary-btn" id="setting-rules">How to play <span>→</span></button>${installPrompt?'<button class="primary-btn" id="install-game">Install game ↓</button>':''}</div><p class="settings-hint">Character voice uses your device’s available speech voice. Bots, music and pass & play work offline in the installed game. Online duels need internet. Levels and avatars save on this device.</p>`);
  $('music-track').onchange=e=>chooseMusic(e.target.value);$('music-mode').onchange=e=>setMusicMode(e.target.value);$('music-next').onclick=nextMusic;
  for(const key of ['music','effects'])$(key+'-volume').oninput=e=>{audioSettings[key]=Number(e.target.value)/100;audioSettings.muted=false;$(key+'-value').textContent=e.target.value+'%';saveAudio();renderSetup();};
  $('setting-sound').onclick=()=>{$('sound').click();showSettings();};$('setting-cutins').onclick=()=>{audioSettings.cutins=!audioSettings.cutins;if(!audioSettings.cutins)$('cutin').hidden=true;saveAudio();showSettings();};$('setting-voice').onclick=()=>{audioSettings.voice=!audioSettings.voice;saveAudio();if(audioSettings.voice)speak(avatarLine(profile.avatar,'start'));else if('speechSynthesis'in window)speechSynthesis.cancel();showSettings();};
  $('setting-fullscreen').onclick=()=>$('fullscreen').click();$('setting-home').onclick=()=>{$('modal').close();screen=room?'room':'lobby';render();};$('setting-rules').onclick=showRules;
  if($('setting-room-leave'))$('setting-room-leave').onclick=()=>requestLeaveRoom();if($('setting-resign'))$('setting-resign').onclick=()=>{$('modal').close();$('resign').click();};
  if($('install-game'))$('install-game').onclick=async()=>{await installPrompt.prompt();installPrompt=null;$('modal').close();};
}
window.addEventListener('kingdoms-musicchange',event=>{
  if(!$('music-track'))return;
  const track=currentMusic();$('music-track').value=track.id;$('music-mode').value=audioSettings.musicMode;
  $('music-now-playing').textContent=track.title;$('music-author').textContent=track.author;$('music-source').href=track.source;$('music-license').href=track.licenseUrl;$('music-license').textContent=track.license;$('music-status').hidden=!event.detail.unavailable;
  localize($('modal'));
});
$('settings-nav').onclick=showSettings;$('battle-menu').onclick=showSettings;
$('modal-close').onclick=()=>$('modal').close();$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('modal').close();}});
$('sound').onclick=()=>{audioSettings.muted=!audioSettings.muted;saveAudio();renderSetup();if(!audioSettings.muted)tone();};
$('profile-button').onclick=showGenerals;
$('show-territory').onchange=()=>render();$('show-danger').onchange=()=>render();
const dangerHelp=document.createElement('button');dangerHelp.className='danger-help';dangerHelp.type='button';dangerHelp.textContent='?';dangerHelp.setAttribute('aria-label','Explain protected eyes and danger markers');dangerHelp.title='Red !: a legal enemy capture. Safe groups have no flag.';dangerHelp.onclick=()=>showRules(5);$('show-danger').closest('label').after(dangerHelp);
$('create-room').onclick=async()=>{
  $('create-room').disabled=true;
  try{await ensureCommander({api,getProfile:()=>profile});const commander=await syncCommander({api,getProfile:()=>profile});const data=await api('/api/rooms',{level:config.level,hostColor:config.humanColor,avatar:profile.avatar,castle:profile.cosmetics.castle,commanderToken:commander.token});connectRoom(data);toast('Room created. Send the code to your rival.');}
  catch(e){toast(e.message);}finally{$('create-room').disabled=false;}
};
$('join-form').onsubmit=async e=>{
  e.preventDefault();const code=$('room-code').value.trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code)){toast('Enter the six-character room code.');return;}
  const b=$('join-form').querySelector('button');b.disabled=true;
  try{await ensureCommander({api,getProfile:()=>profile});const commander=await syncCommander({api,getProfile:()=>profile});const data=await api(`/api/rooms/${code}/join`,{avatar:profile.avatar,castle:profile.cosmetics.castle,commanderToken:commander.token});connectRoom(data);toast('Your rival awaits. Let the battle begin.');}
  catch(err){toast(err.message);}finally{b.disabled=false;}
};
$('copy-invite').onclick=async()=>{if(!room)return;const link=PUBLIC_ORIGIN+'/?room='+room.code;try{await navigator.clipboard.writeText(link);toast('Invite copied. Send it to your rival.');}catch{toast('Room code: '+room.code);}};
document.addEventListener('visibilitychange',()=>{if(room){clearTimeout(roomTimer);if(!document.hidden)pollRoom();}});
window.addEventListener('storage',e=>{if(e.key===PROFILE_KEY){try{profile=normalizeProfile(JSON.parse(e.newValue));renderProfile();}catch{}}});

render();
let restoredRoom=false;
try{const saved=JSON.parse(sessionStorage.getItem('little-kingdoms-room')||(API_BASE?localStorage.getItem('little-kingdoms-room'):null)||'null');if(saved?.code&&saved?.token){room={...saved,version:-1,ready:false};config=saved.config;state=newGame('literal');snapshots=[];selected=null;started=false;screen='room';restoredRoom=true;render();pollRoom();}}catch{}
if(!restoredRoom){
  const invite=new URLSearchParams(location.search).get('room');
  if(invite&&/^[A-Z0-9]{6}$/i.test(invite)){stopBot();config.mode='online';started=false;screen='lobby';render();$('room-code').value=invite.toUpperCase();toast('Your invitation is ready. Press Join to take your seat.');}
  else queueBot();
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
if('serviceWorker' in navigator&&!API_BASE&&['http:','https:'].includes(location.protocol))navigator.serviceWorker.register('/sw.js').catch(()=>{});
new ResizeObserver(()=>{const area=document.querySelector('.board-space');if(area.clientWidth&&area.clientHeight)document.querySelector('.board-surround').style.width=Math.max(90,Math.min(area.clientWidth,area.clientHeight-10,568))+'px';}).observe(document.querySelector('.board-space'));
