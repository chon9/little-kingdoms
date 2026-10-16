import { AVATARS, levelForXP } from '/progression.js';

const IDENTITY_KEY='little-kingdoms-commander-v1';
let identity=null,creating=null;
try{const saved=JSON.parse(localStorage.getItem(IDENTITY_KEY));if(typeof saved?.id==='string'&&/^[a-f0-9]{64}$/.test(saved.token))identity=saved;}catch{}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function remember(value){identity=value;try{localStorage.setItem(IDENTITY_KEY,JSON.stringify(identity));}catch{}}
function progress(profile){return{avatar:profile.avatar,xp:profile.xp,matches:profile.matches,wins:Math.min(profile.matches,profile.wins)};}
export function commanderIdentity(){return identity;}
export async function ensureCommander({api,getProfile}){
  if(identity)return identity;
  if(creating)return creating;
  creating=(async()=>{const code=crypto.getRandomValues(new Uint16Array(1))[0].toString(16).toUpperCase().padStart(4,'0');const result=await api('/api/commanders',{displayName:'Commander '+code,avatar:getProfile().avatar});remember({...result.commander,token:result.token});return identity;})();
  try{return await creating;}finally{creating=null;}
}
export async function syncCommander({api,getProfile}){
  if(!identity)return null;
  async function update(current){
    const result=await api('/api/commanders/me',progress(getProfile()),current.token);
    // A slower response from a rejected identity must not replace its recovery.
    if(identity?.token===current.token)remember({...result.commander,token:current.token});
    return identity;
  }
  const current=identity;
  try{return await update(current);}catch(error){
    if(error.status!==401)throw error;
    // Concurrent callers share ensureCommander's creation promise. Only remove
    // the rejected identity; another caller may already have replaced it.
    if(identity?.token===current.token)remember(null);
    const replacement=await ensureCommander({api,getProfile});
    return update(replacement); // One retry only; another 401 is surfaced.
  }
}
export function openRankings({modal,api,getProfile,toast}){
  let tab='level',generation=0;
  const root=document.getElementById('modal-content');
  const isCurrent=n=>n===generation&&root.querySelector('.rankings');
  async function load(){
    const current=++generation,p=getProfile();
    modal(`<section class="rankings"><header class="rankings-heading"><p class="eyebrow">THE RIVERLANDS REMEMBER</p><h2>Hall of legends</h2></header><div class="rankings-scroll"><div id="commander-card" class="commander-card"><p>Connecting your commander…</p></div><div class="rankings-tabs" role="group" aria-label="Leaderboard"><button id="rank-level" class="${tab==='level'?'selected':''}">Commander levels</button><button id="rank-wins" class="${tab==='wins'?'selected':''}">Online wins</button></div><p class="rankings-note" id="rank-source">${tab==='level'?'Device progress · unranked. Includes AI and local battles.':'Server-recorded online results. Both players must deploy at least two castles.'}</p><div id="rank-list" aria-live="polite"><p>Gathering the banners…</p></div></div><footer class="rankings-footer"><button id="rank-refresh" class="secondary-btn">Refresh ↻</button><button id="rank-close" class="primary-btn">Back to game →</button></footer></section>`);
    root.querySelector('#rank-level').onclick=()=>{tab='level';load();};root.querySelector('#rank-wins').onclick=()=>{tab='wins';load();};root.querySelector('#rank-refresh').onclick=load;root.querySelector('#rank-close').onclick=()=>document.getElementById('modal').close();
    try{
      await ensureCommander({api,getProfile});await syncCommander({api,getProfile});
      if(!isCurrent(current))return;
      const me=identity;
      root.querySelector('#commander-card').innerHTML=`<details class="commander-details"><summary class="commander-card-top" aria-label="Your commander ${escape(me.displayName)}, level ${levelForXP(p.xp)}. Edit name and view record."><span class="commander-medal">${levelForXP(p.xp)}</span><span class="commander-summary-name"><small>YOUR COMMANDER · LV ${levelForXP(p.xp)}</small><strong>${escape(me.displayName)}</strong></span><span class="commander-edit">Edit name <i aria-hidden="true">⌄</i></span></summary><div class="commander-expanded"><div class="commander-record"><span><b>${p.wins}</b> wins <b>${Math.max(0,p.matches-p.wins)}</b> losses<small>Device progress</small></span><span><b>${me.onlineWins||0}</b> wins <b>${me.onlineLosses||0}</b> losses<small>Online record</small></span></div><form id="commander-name-form"><label for="commander-name">Public commander name</label><div><input id="commander-name" minlength="2" maxlength="20" autocomplete="off" value="${escape(me.displayName)}" required><button class="secondary-btn" type="submit">Save</button></div></form><small class="commander-identity-note">Your guest identity stays on this device. Use a nickname.</small></div></details>`;
      root.querySelector('#commander-name-form').onsubmit=async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;try{const result=await api('/api/commanders/me',{...progress(getProfile()),displayName:root.querySelector('#commander-name').value.trim()},identity.token);remember({...result.commander,token:identity.token});toast('Commander name saved.');load();}catch(error){toast(error.message);button.disabled=false;}};
      const result=await api('/api/leaderboard?kind='+tab+'&limit=50');if(!isCurrent(current))return;
      const entries=result.entries||[];
      root.querySelector('#rank-list').innerHTML=entries.length?`<table class="rank-table"><thead><tr><th>#</th><th>Commander</th><th>Level</th><th>W / L</th></tr></thead><tbody>${entries.map((entry,index)=>`<tr class="${entry.id===identity.id?'your-rank':''}"><td>${index+1}</td><td><div class="rank-player"><span class="portrait rank-portrait" data-rank-avatar="${entry.avatar}"></span><span>${escape(entry.displayName)}${entry.id===identity.id?'<small>YOU</small>':''}</span></div></td><td>${entry.level}</td><td>${tab==='wins'?entry.onlineWins:entry.localWins} / ${tab==='wins'?entry.onlineLosses:entry.localLosses}</td></tr>`).join('')}</tbody></table>`:'<div class="rank-empty"><span>⚑</span><h3>The first banner is yours.</h3><p>Complete an online duel with two castles each to begin the online record.</p></div>';
      root.querySelectorAll('[data-rank-avatar]').forEach(el=>{const a=AVATARS[Number(el.dataset.rankAvatar)]||AVATARS[0];el.style.backgroundImage=`url('/assets/${a.atlas}.webp')`;el.style.backgroundPosition=`${a.index%5*25}% ${Math.floor(a.index/5)*100/3}%`;});
    }catch(error){if(!isCurrent(current))return;root.querySelector('#rank-list').innerHTML='<p class="rank-unavailable">The hall is unavailable. Reconnect and tap Refresh.</p>';const card=root.querySelector('#commander-card');if(!card.querySelector('form'))card.innerHTML=`<strong>Your progress is saved on this device.</strong><p>Level ${levelForXP(p.xp)} · ${p.wins} wins · ${Math.max(0,p.matches-p.wins)} losses</p>`;}
  }
  load();
}
