import {CASTLE_ARTS,BOARD_ARTS,COSMETICS,normalizeCosmetics,pullsAvailable,pullCosmetic,equipCosmetic,castleMarkup} from './cosmetics.js';

export function openCollection({modal,getProfile,onProfileChange,toast=()=>{},tone=()=>{}}){
  let tab='summon',selected=null,reward=null,drawing=false;
  const safeProfile=()=>{const p=getProfile();return{...p,cosmetics:normalizeCosmetics(p.cosmetics,p.xp)};};
  const art=(item,large=false)=>item.type==='castle'?`<div class="treasury-twins ${large?'large':''}"><span>${castleMarkup(item.id,1)}</span><span>${castleMarkup(item.id,2)}</span></div>`:`<div class="treasury-board ${large?'large':''}" style="background-image:url('${item.image}')"><i></i></div>`;
  function commit(next,item){onProfileChange(next,item);}
  function draw(){
    if(drawing)return;drawing=true;
    const entropy=new Uint32Array(1);crypto.getRandomValues(entropy);
    const result=pullCosmetic(safeProfile(),entropy[0]/4294967296);
    if(!result.item){drawing=false;toast('Reach your next commander level to earn a pull.');render();return;}
    // Save first: closing, navigating away or reloading during the reveal cannot lose a reward.
    commit(result.profile,result.item);reward=result.item;selected=null;tab='summon';tone('win');drawing=false;render();
  }
  function render(){
    const profile=safeProfile(),saved=profile.cosmetics,available=pullsAvailable(profile),remaining=COSMETICS.length-saved.owned.length;
    const item=reward||selected,owned=item?saved.owned.includes(item.id):false;
    const tabs=`<div class="treasury-tabs" role="tablist" aria-label="Treasury collection"><button role="tab" aria-selected="${tab==='summon'}" data-treasury-tab="summon">Summon <b>${available}</b></button><button role="tab" aria-selected="${tab==='castle'}" data-treasury-tab="castle">Castles <small>${saved.owned.filter(id=>id[0]==='c').length}/${CASTLE_ARTS.length}</small></button><button role="tab" aria-selected="${tab==='board'}" data-treasury-tab="board">Boards <small>${saved.owned.filter(id=>id[0]==='b').length}/${BOARD_ARTS.length}</small></button></div>`;
    let body;
    if(item){
      body=`<div class="treasury-reveal ${reward?'is-new':''}" role="status" aria-live="polite"><p class="eyebrow">${reward?'NEW TREASURE':owned?'YOUR COLLECTION':'COLLECTION PREVIEW'}</p>${art(item,true)}<h3>${item.name}</h3><p>${item.type==='castle'?'Castle appearance · Blue & Orange':'Board appearance · Your battlefield'}</p><small>${owned?'Cosmetic only. Your rules and strength stay the same.':'Unlock this artwork with a level-up pull.'}<br>${item.type==='castle'?'Castle changes apply to your next battle.':'Board changes apply to your screen.'}</small></div>`;
    }else if(tab==='summon'){
      body=`<div class="treasury-summon"><div class="treasury-chest" aria-hidden="true"><span>寶</span><i>✦</i></div><h3>${remaining?'A little luck. A new legend.':'Your treasury is complete!'}</h3><p>${remaining?'50 castle appearances · 40 board appearances':'All 90 artworks are yours.'}</p><div class="treasury-pull-count"><strong>${available}</strong><span>LEVEL-UP ${available===1?'PULL':'PULLS'} READY</span></div><small>One welcome pull + one per commander level gained.<br>No duplicates. Each remaining artwork has equal odds.</small><details class="treasury-odds"><summary>View draw odds</summary><p>${remaining?`Each of ${remaining} remaining artworks: 1/${remaining} (${(100/remaining).toFixed(2)}%). ${CASTLE_ARTS.filter(i=>!saved.owned.includes(i.id)).length} castles and ${BOARD_ARTS.filter(i=>!saved.owned.includes(i.id)).length} boards remain.`:'Collection complete. No more pulls are needed.'} No purchases or paid currency. Unlocks save on this device.</p></details></div>`;
    }else{
      const list=tab==='castle'?CASTLE_ARTS:BOARD_ARTS;
      body=`<div class="treasury-grid" role="tabpanel"><button class="treasury-card treasury-classic ${saved[tab]==='classic'?'equipped':''}" data-equip-classic="${tab}" aria-pressed="${saved[tab]==='classic'}"><div class="treasury-classic-art">${tab==='castle'?'<svg aria-hidden="true"><use href="#castle"/></svg>':'▦'}</div><strong>Kingdom original</strong><small>${saved[tab]==='classic'?'✓ EQUIPPED':'FREE · EQUIP'}</small></button>${list.map(i=>`<button class="treasury-card ${saved.owned.includes(i.id)?'owned':'locked'} ${saved[tab]===i.id?'equipped':''}" data-preview="${i.id}" aria-label="${i.name}, ${saved[tab]===i.id?'equipped':saved.owned.includes(i.id)?'unlocked':'locked, preview'}">${art(i)}<strong>${i.name}</strong><small>${saved[tab]===i.id?'✓ EQUIPPED':saved.owned.includes(i.id)?'OWNED · VIEW':'♢ LOCKED · PREVIEW'}</small></button>`).join('')}</div>`;
    }
    let actions;
    if(item)actions=`${owned?`<button class="primary-btn" id="treasury-equip">${saved[item.type]===item.id?'Equipped ✓':'Equip '+(item.type==='castle'?'castle':'board')}</button>`:'<button class="primary-btn" id="treasury-draw" '+(!available?'disabled':'')+'>Pull a treasure · 1 pull</button>'}<button class="secondary-btn" id="treasury-back">${reward&&available?'Draw again · '+available+' ready':'Back to collection'}</button>`;
    else if(tab==='summon')actions=`<button class="primary-btn" id="treasury-draw" ${!available||!remaining?'disabled':''}>${!remaining?'All treasures unlocked':available?'Pull a treasure · 1 pull':'Level up for your next pull'}</button><small>Owned ${saved.owned.length}/${COSMETICS.length} · Cosmetic rewards only</small>`;
    else actions=`<button class="primary-btn" data-treasury-tab="summon">${available?'Summon · '+available+' ready':'Earn pulls by leveling up'}</button>`;
    modal(`<section class="treasury" aria-label="Treasury"><header><p class="eyebrow">THE IMPERIAL TREASURY</p><h2>Find your signature.</h2></header>${tabs}<div class="treasury-body">${body}</div><footer class="treasury-actions">${actions}</footer></section>`);
    const root=document.getElementById('modal-content');
    root.querySelectorAll('[data-treasury-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.treasuryTab;selected=reward=null;render();});
    root.querySelectorAll('[data-preview]').forEach(button=>button.onclick=()=>{selected=COSMETICS.find(i=>i.id===button.dataset.preview);reward=null;render();});
    root.querySelectorAll('[data-equip-classic]').forEach(button=>button.onclick=()=>{commit(equipCosmetic(safeProfile(),'classic',button.dataset.equipClassic));render();toast(button.dataset.equipClassic==='castle'?'Original castles equipped for your next battle.':'Original board equipped on your screen.');});
    root.querySelector('#treasury-draw')?.addEventListener('click',draw,{once:true});
    root.querySelector('#treasury-equip')?.addEventListener('click',()=>{commit(equipCosmetic(safeProfile(),item.id));toast(item.name+(item.type==='castle'?' equipped for your next battle.':' equipped on your screen.'));render();},{once:true});
    root.querySelector('#treasury-back')?.addEventListener('click',()=>{if(reward&&available){reward=null;draw();}else{tab=item.type;selected=reward=null;render();}},{once:true});
  }
  render();
}
