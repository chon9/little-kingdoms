// Cosmetic rewards are device-local. They never change a move, score or ranked result.
const castleNames = ['Ivory Rook','Jade Pagoda','Fox Shrine','Dragon Keep','Lantern Tower','Bamboo Fortress','Panda Sentinel','Tiger Citadel','Crane Spire','Lotus Palace','Guan Yu','Zhao Yun','Zhuge Liang','Cao Cao','Xiahou Dun','Sima Yi','Huang Yueying','Guan Yinping','Xingcai','Zhen Ji','Bao Sanniang','Wang Yi','Phoenix Empress','Moon Priestess','Dragon Princess','Celestial Rook','Cloud Qilin','Pearl Koi Guardian','Golden Phoenix Palace','Star Dragon Throne'];
const boardNames = ['Bamboo Grove','Peach Blossom','Jade Palace','Moon Lake','Autumn Maple','Snowy Pass','Red Cliffs','Lotus Pond','Ink Mountains','Lantern Festival','Golden Sands','Porcelain Blue','Celestial Clouds','Dragon Jade','Phoenix Vermilion','Wisteria Garden','Tea Pavilion','Star Observatory','Ocean Pearls','Imperial Gold'];
const create = (names,type,prefix) => names.map((name,index)=>Object.freeze({id:prefix+String(index+1).padStart(2,'0'),name,type,image:`/assets/cosmetics/${prefix}${String(index+1).padStart(2,'0')}.webp`}));
export const CASTLE_ARTS = Object.freeze(create(castleNames,'castle','c'));
export const BOARD_ARTS = Object.freeze(create(boardNames,'board','b'));
export const COSMETICS = Object.freeze([...CASTLE_ARTS,...BOARD_ARTS]);
const byId = new Map(COSMETICS.map(item=>[item.id,item]));
// Keep this threshold identical to progression.levelForXP without a circular import.
export function earnedPulls(xp=0){
  if(!Number.isSafeInteger(xp)||xp<0)xp=0;
  let level=1;while(level<50&&xp>=80*level+20*level**2)level++;
  return level; // One welcome pull, then one for every commander level gained.
}
export function normalizeCosmetics(value,xp=0){
  const owned=Array.isArray(value?.owned)?[...new Set(value.owned.filter(id=>byId.has(id)))].slice(0,earnedPulls(xp)):[];
  return {owned,spent:owned.length,castle:byId.get(value?.castle)?.type==='castle'&&owned.includes(value.castle)?value.castle:'classic',board:byId.get(value?.board)?.type==='board'&&owned.includes(value.board)?value.board:'classic'};
}
export function cosmeticFor(id,type){const item=byId.get(id);return item&&(!type||item.type===type)?item:null;}
export function pullsAvailable(profile){const saved=normalizeCosmetics(profile?.cosmetics,profile?.xp);return Math.max(0,Math.min(COSMETICS.length-saved.owned.length,earnedPulls(profile?.xp)-saved.spent));}
export function pullCosmetic(profile,unitRandom){
  const cosmetics=normalizeCosmetics(profile?.cosmetics,profile?.xp),remaining=COSMETICS.filter(item=>!cosmetics.owned.includes(item.id));
  if(!pullsAvailable(profile)||!remaining.length)return{profile,item:null};
  if(!Number.isFinite(unitRandom)||unitRandom<0||unitRandom>=1)throw new RangeError('Draw randomness must be a number from 0 up to, but not including, 1.');
  const item=remaining[Math.floor(unitRandom*remaining.length)];
  cosmetics.owned.push(item.id);cosmetics.spent=cosmetics.owned.length;
  return{profile:{...profile,cosmetics},item};
}
export function equipCosmetic(profile,id,type){
  const cosmetics=normalizeCosmetics(profile?.cosmetics,profile?.xp),item=byId.get(id);
  if(id==='classic'&&['castle','board'].includes(type))cosmetics[type]='classic';
  else if(item&&cosmetics.owned.includes(id)&&(!type||type===item.type))cosmetics[item.type]=id;
  return{...profile,cosmetics};
}
export function castleMarkup(id,color){
  const item=cosmeticFor(id,'castle');
  return item?`<span class="castle-art faction-${color===2?'orange':'blue'}" aria-hidden="true"><span class="castle-plinth"></span><img src="${item.image}" alt="" draggable="false"></span>`:'<svg aria-hidden="true"><use href="#castle"/></svg>';
}
