import test from 'node:test';
import assert from 'node:assert/strict';
import {CASTLE_ARTS,BOARD_ARTS,COSMETICS,earnedPulls,normalizeCosmetics,pullsAvailable,pullCosmetic,equipCosmetic,cosmeticFor,castleMarkup} from '../public/cosmetics.js';
import {levelForXP,xpForLevel,normalizeProfile,awardMatch} from '../public/progression.js';
test('the reward pool contains exactly 50 castles and 40 boards with distinct shipped-art paths',()=>{
  assert.equal(CASTLE_ARTS.length,50);assert.equal(BOARD_ARTS.length,40);assert.equal(COSMETICS.length,90);assert.equal(new Set(COSMETICS.map(i=>i.id)).size,90);assert.equal(new Set(COSMETICS.map(i=>i.name)).size,90);
  for(const [type,count,prefix]of [['castle',50,'c'],['board',40,'b']])for(let n=1;n<=count;n++){const id=prefix+String(n).padStart(2,'0'),item=cosmeticFor(id,type);assert.ok(item);assert.equal(item.image,`/assets/cosmetics/${id}.webp`);}
  assert.equal(cosmeticFor('c01','board'),null);assert.equal(cosmeticFor('classic'),null);
});
test('welcome and retroactive level-up pulls use the real progression thresholds',()=>{
  assert.equal(pullsAvailable({xp:0}),1);assert.equal(pullsAvailable({xp:99}),1);assert.equal(pullsAvailable({xp:100}),2);
  for(let level=1;level<=90;level++){const xp=xpForLevel(level);assert.equal(earnedPulls(xp),levelForXP(xp));if(level>1)assert.equal(earnedPulls(xp-1),level-1);}
  assert.equal(earnedPulls(Number.MAX_SAFE_INTEGER),90);assert.equal(earnedPulls(Infinity),1);
});
test('all ninety pulls have no duplicates and a full collection cannot spend again',()=>{
  let p={xp:xpForLevel(90),wins:4,cosmetics:{owned:[]}};const seen=new Set();
  for(let n=0;n<90;n++){assert.equal(pullsAvailable(p),90-n);const {profile,item}=pullCosmetic(p,((n*17)%90)/90);assert.ok(item);assert.equal(seen.has(item.id),false);seen.add(item.id);assert.equal(profile.xp,p.xp);assert.equal(profile.wins,4);assert.equal(profile.cosmetics.spent,n+1);p=JSON.parse(JSON.stringify(profile));}
  assert.equal(pullsAvailable(p),0);const blocked=pullCosmetic(p,0);assert.equal(blocked.item,null);assert.equal(blocked.profile,p);
});
test('a pull selects uniformly from remaining items and never mutates its input',()=>{
  const p={xp:100,cosmetics:{owned:['c01'],spent:1,castle:'classic',board:'classic'}};const saved=JSON.stringify(p);
  assert.equal(pullCosmetic(p,0).item.id,'c02');assert.equal(pullCosmetic(p,1-Number.EPSILON).item.id,'b40');assert.equal(JSON.stringify(p),saved);
  for(const bad of [NaN,-.01,1,Infinity,undefined])assert.throws(()=>pullCosmetic(p,bad),RangeError);
});
test('corrupt saves cannot create draws, duplicate ownership, cross-type equipment or overspend',()=>{
  const value={owned:['c01','c01',null,'b01','evil'],spent:-20,castle:'b01',board:'c01'};
  assert.deepEqual(normalizeCosmetics(value,100),{owned:['c01','b01'],spent:2,castle:'classic',board:'classic'});
  assert.equal(normalizeCosmetics(value,0).owned.length,1);assert.equal(pullsAvailable({xp:0,cosmetics:value}),0);
  assert.deepEqual(normalizeCosmetics(null,0),{owned:[],spent:0,castle:'classic',board:'classic'});
});
test('only owned cosmetics can be equipped and originals remain free',()=>{
  const p={xp:100,avatar:7,cosmetics:{owned:['c01','b01'],castle:'classic',board:'classic'}};
  let q=equipCosmetic(p,'c01');assert.equal(q.cosmetics.castle,'c01');q=equipCosmetic(q,'b01');assert.equal(q.cosmetics.board,'b01');
  assert.equal(equipCosmetic(q,'c02').cosmetics.castle,'c01');assert.equal(equipCosmetic(q,'b01','castle').cosmetics.castle,'c01');assert.equal(equipCosmetic(q,'<script>').cosmetics.board,'b01');
  q=equipCosmetic(q,'classic','castle');assert.equal(q.cosmetics.castle,'classic');assert.equal(q.cosmetics.board,'b01');assert.equal(q.avatar,7);assert.equal(q.xp,100);assert.equal(p.cosmetics.castle,'classic');
});
test('XP awards and save normalization preserve spent pulls and equipped rewards',()=>{
  let profile=normalizeProfile({schema:1,xp:99});profile=pullCosmetic(profile,0).profile;profile=equipCosmetic(profile,'c01');
  const state={matchId:'cosmetic-level-up',winner:1,reason:'capture',count:[0,2,2]};
  const reward=awardMatch(profile,{state,mode:'bot',humanColor:1,botLevel:1});
  assert.equal(reward.level,2);assert.equal(reward.profile.cosmetics.spent,1);assert.equal(reward.profile.cosmetics.castle,'c01');assert.equal(pullsAvailable(reward.profile),1);
  const restored=normalizeProfile(JSON.parse(JSON.stringify(reward.profile)));assert.deepEqual(restored.cosmetics,reward.profile.cosmetics);assert.equal(pullsAvailable(awardMatch(restored,{state,mode:'bot',humanColor:1,botLevel:1}).profile),1);
});
test('castle markup always keeps faction coloring outside the collectible illustration',()=>{
  assert.match(castleMarkup('classic',1),/<use href="#castle"/);assert.match(castleMarkup('c01',1),/faction-blue/);assert.match(castleMarkup('c01',2),/faction-orange/);assert.match(castleMarkup('c01',2),/castle-plinth/);assert.doesNotMatch(castleMarkup('<script>',1),/<script>/);
});
