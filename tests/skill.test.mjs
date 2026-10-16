import test from 'node:test';
import assert from 'node:assert/strict';
import {SKILL_RANKS,normalizeSkill,skillRank,skillProgress,skillSnapshot,ratingChange,awardSkill,matchRatings} from '../public/skill.js';
import {freshProfile,normalizeProfile,awardMatch} from '../public/progression.js';
import {newGame,play} from '../shared/engine.js';
const end=(id='rank-1')=>{let s={...newGame(),matchId:id};for(const a of[1,0,30,50,9])s=play(s,a);return s;};
test('rank order is 20 kyu through 9 dan with increasing rating and experience requirements',()=>{
 assert.equal(SKILL_RANKS.length,29);assert.equal(skillRank(normalizeSkill()).label,'20 Kyu');
 for(let i=1;i<29;i++){assert.ok(SKILL_RANKS[i].rating>SKILL_RANKS[i-1].rating);assert.ok(SKILL_RANKS[i].games>SKILL_RANKS[i-1].games);}
 assert.equal(skillRank({rating:5000,games:0}).index,0);assert.equal(skillRank({rating:3360,games:580}).label,'9 Dan');
 assert.equal(skillRank({rating:3359.9,games:580}).label,'8 Dan');assert.equal(skillRank({rating:3360,games:579}).label,'8 Dan');
 assert.equal(skillProgress({schema:1,rating:1049.9,games:2}).ratingNeeded,.1);
});
test('opponent strength changes Elo gains and losses; higher ranks settle more slowly',()=>{
 assert.equal(ratingChange(1000,1000,true,0),24);assert.equal(ratingChange(1000,1000,false,0),-24);
 assert.ok(ratingChange(1000,1800,true)>ratingChange(1000,800,true));
 assert.ok(ratingChange(1800,800,false)<ratingChange(1800,1800,false));
 assert.equal(ratingChange(1000,1000,true),16);assert.equal(ratingChange(2100,2100,true),12);assert.equal(ratingChange(2800,2800,true),8);
 assert.equal(ratingChange(3360,800,true),0);
});
test('bot difficulty determines benchmark and a win/loss changes points independently of XP',()=>{
 const state=end();let a=awardMatch(freshProfile(),{state,mode:'bot',humanColor:1,botLevel:10});
 assert.ok(a.skillReceipt.delta>40);assert.equal(a.profile.skill.games,1);assert.equal(a.profile.skill.wins,1);assert.ok(a.xp>0);
 const b=awardMatch(a.profile,{state:{...end('rank-loss'),winner:2},mode:'bot',humanColor:1,botLevel:1});
 assert.ok(b.profile.skill.rating<a.profile.skill.rating);assert.ok(b.profile.xp>a.profile.xp);assert.equal(b.profile.skill.games,2);assert.equal(b.profile.skill.wins,1);
});
test('reopening results cannot rate twice, old claimed matches are not retroactively rated, recent history stays bounded',()=>{
 const state=end();const a=awardMatch(freshProfile(),{state,mode:'bot',humanColor:1});
 const b=awardMatch(JSON.parse(JSON.stringify(a.profile)),{state,mode:'bot',humanColor:1});assert.deepEqual(b.profile.skill,a.profile.skill);assert.equal(b.skillReceipt.id,state.matchId);
 assert.equal(awardMatch({...freshProfile(),claimed:[state.matchId]},{state,mode:'bot',humanColor:1}).profile.skill.games,0);
 let p=freshProfile();for(let i=0;i<30;i++)p=awardMatch(p,{state:end('recent-'+i),mode:'bot',humanColor:1}).profile;
 assert.equal(p.skill.recent.length,20);assert.equal(p.skill.games,30);assert.equal(awardMatch(p,{state:end('recent-0'),mode:'bot',humanColor:1}).profile.skill.games,30);
});
test('practice, unfinished, empty and interrupted Steam matches do not alter rank',()=>{
 for(const [state,mode]of[[end(),'local'],[{...end(),rated:false},'bot'],[{...end(),steamAborted:true},'online'],[newGame(),'bot'],[play(play({...newGame(),matchId:'empty'},'pass'),'pass'),'online']])assert.equal(awardSkill(null,{state,mode,humanColor:1}).receipt,null);
});
test('a started resignation costs points, even before personal deployment; an unplayed win grants none',()=>{
 let state=play({...newGame(),matchId:'retreat'},30);state=play(state,'resign');
 const loser=awardSkill(null,{state,mode:'online',humanColor:2});assert.ok(loser.receipt.delta<0);assert.equal(loser.skill.games,1);
 assert.equal(awardSkill(null,{state,mode:'online',humanColor:1}).receipt,null);
 assert.equal(awardSkill(null,{state:play({...newGame(),matchId:'empty-retreat'},'resign'),mode:'bot',humanColor:1}).receipt,null);
});
test('passing without deploying cannot avoid a defeat once a real battle has begun',()=>{
 const state={...end('passing-loss'),count:[0,3,0],winner:1,reason:'territory',history:[{color:1,index:1},{color:2,index:'pass'},{color:1,index:30}]};
 assert.ok(awardSkill(null,{state,mode:'online',humanColor:2}).receipt.delta<0);
 const team={...state,mode:'teams',team1Color:1,seatCounts:[0,3,0,0,0],history:[{color:2,index:'pass',seat:3}]};
 assert.ok(awardSkill(null,{state:team,mode:'online',humanColor:2,humanSeat:3}).receipt.delta<0);
 assert.equal(awardSkill(null,{state:team,mode:'online',humanColor:2,humanSeat:4}).receipt,null);
});
test('demotion lowers current rank while retaining best rank and all XP/cosmetics',()=>{
 const p=normalizeProfile({...freshProfile(),xp:1000,skill:{schema:1,rating:1051,games:20,wins:10,peak:1},cosmetics:{owned:['c01'],spent:1,castle:'c01'}});
 const r=awardMatch(p,{state:{...end(),winner:2,reason:'resignation'},mode:'bot',humanColor:1,botLevel:1});
 assert.equal(skillRank(r.profile.skill).index,0);assert.equal(r.profile.skill.peak,1);assert.equal(r.profile.xp,1000);assert.equal(r.profile.cosmetics.castle,'c01');
});
test('meeting the game requirement on a loss never awards a promotion',()=>{
 const value={schema:1,rating:2050,games:59,wins:50,peak:19};
 const lost=awardSkill(value,{state:{...end(),winner:2},mode:'bot',humanColor:1,botLevel:10});
 assert.equal(lost.skill.games,60);assert.equal(skillRank(lost.skill).label,'1 Kyu');
 const won=awardSkill(lost.skill,{state:end('promoting-win'),mode:'bot',humanColor:1,botLevel:10});assert.equal(skillRank(won.skill).label,'1 Dan');
});
test('2v2 uses team averages and only rates participating seats or the resigning seat',()=>{
 const state={...end(),mode:'teams',team1Color:1,teamPlayers:{1:{skillRating:1200},2:{skillRating:1800},3:{skillRating:1600},4:{skillRating:2000}},seatCounts:[0,2,0,1,1]};
 assert.deepEqual(matchRatings({rating:1200},{state,mode:'online',humanColor:1,humanSeat:1}),{own:1500,opponent:1800});
 assert.ok(awardSkill(null,{state,mode:'online',humanColor:1,humanSeat:1}).receipt);
 assert.equal(awardSkill(null,{state,mode:'online',humanColor:1,humanSeat:2}).receipt,null);
 assert.equal(awardSkill(null,{state:{...state,winner:2},mode:'online',humanColor:1,humanSeat:2}).receipt,null);
});
test('corrupt scores and profile fields normalize safely, preserving old profile progress',()=>{
 assert.equal(normalizeSkill({schema:1,rating:Infinity,games:-1}).rating,1000);assert.deepEqual(skillSnapshot({skillRating:'5000',skillGames:-1}),{skillRating:1000,skillGames:0});
 assert.equal(normalizeProfile({schema:1,xp:100,avatar:20,matches:4,wins:3}).skill.rating,1000);
 const s=normalizeSkill({schema:1,rating:2000,games:1,wins:999,peak:100,recent:[{id:'unsafe',before:1000,after:1024,delta:24,won:true,rank:0,previousRank:0,mode:'<img onerror=alert(1)>'}]});assert.equal(s.wins,1);assert.equal(s.peak,28);assert.equal(s.recent[0].mode,'PvP');
});
