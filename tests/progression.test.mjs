import test from 'node:test';
import assert from 'node:assert/strict';
import {AVATARS,freshProfile,normalizeProfile,awardMatch,xpForLevel,levelForXP,avatarLine} from '../public/progression.js';
import {newGame,play} from '../shared/engine.js';
const finished=(id='match-1')=>{let s={...newGame(),matchId:id};for(const move of [1,0,30,50,9])s=play(s,move);assert.equal(s.winner,1);return s;};
test('XP thresholds and corrupt/locked saved avatars normalize safely',()=>{
  assert.equal(levelForXP(99),1);assert.equal(levelForXP(100),2);assert.equal(levelForXP(xpForLevel(21)),21);
  assert.deepEqual(normalizeProfile({schema:2,xp:900}),freshProfile());
  assert.equal(normalizeProfile({...freshProfile(),avatar:39}).avatar,0);
  assert.equal(normalizeProfile({...freshProfile(),xp:100,avatar:20}).avatar,20);
  assert.equal(normalizeProfile({...freshProfile(),xp:-8,claimed:['x','x',null],defeated:[1,1,11]}).xp,0);
});
test('a real capture awards a first-win bonus, unlocks generals and cannot be claimed again after reload',()=>{
  const state=finished(),result=awardMatch(freshProfile(),{state,mode:'bot',humanColor:1,botLevel:1});
  assert.equal(result.xp,117);assert.equal(result.level,2);assert.equal(result.firstVictory,true);assert.ok(result.unlocked.some(a=>a.name==='Guan Yu'));
  const restored=JSON.parse(JSON.stringify(result.profile));assert.equal(awardMatch(restored,{state,mode:'bot',humanColor:1,botLevel:1}).xp,0);
  const second=awardMatch(restored,{state:finished('match-2'),mode:'bot',humanColor:1,botLevel:1});assert.equal(second.xp,72);assert.equal(second.firstVictory,false);assert.equal(second.profile.wins,2);
});
test('pass farming, incomplete games and resignation cannot earn XP for the resigning player',()=>{
  let state={...newGame(),matchId:'empty'};state=play(play(state,'pass'),'pass');
  assert.equal(awardMatch(freshProfile(),{state,mode:'online',humanColor:2}).xp,0);
  assert.equal(awardMatch(freshProfile(),{state:newGame(),mode:'bot',humanColor:1}).xp,0);
  state={...finished(),matchId:'resign',reason:'resignation',winner:2};
  assert.equal(awardMatch(freshProfile(),{state,mode:'bot',humanColor:1}).xp,0);
});
test('online win and loss, local play and normal AI losses award the documented XP',()=>{
  const state=finished();
  for(const [mode,humanColor,botLevel,xp]of [['online',1,1,150],['online',2,1,60],['local',1,1,40],['bot',2,10,65]])assert.equal(awardMatch(freshProfile(),{state,mode,humanColor,botLevel}).xp,xp);
});
test('a played surrender counts as a loss without XP and empty endings do not inflate records',()=>{
  const state={...finished(),matchId:'recorded-retreat',reason:'resignation',winner:2};
  const result=awardMatch(freshProfile(),{state,mode:'bot',humanColor:1});assert.equal(result.xp,0);assert.equal(result.profile.matches,1);assert.equal(result.profile.wins,0);
  assert.equal(awardMatch(result.profile,{state,mode:'bot',humanColor:1}).profile.matches,1);
  const empty=play(play({...newGame(),matchId:'empty-record'},'pass'),'pass');assert.equal(awardMatch(freshProfile(),{state:empty,mode:'local',humanColor:1}).profile.matches,0);
  assert.equal(normalizeProfile({schema:1,matches:2,wins:99}).wins,2);
});
test('forty distinct avatars include twenty new portraits, level locks and first-person lines',()=>{
  assert.equal(AVATARS.length,40);assert.equal(new Set(AVATARS.map(a=>a.name)).size,40);assert.equal(AVATARS.filter(a=>a.unlock===1).length,2);
  assert.equal(AVATARS.filter(a=>a.atlas==='generals-unlock').length,20);
  for(const a of AVATARS)for(const event of ['start','move','territory','threat','win','loss'])assert.match(avatarLine(a.id,event),/\bI\b|\bMy\b/);
});
