import test from 'node:test';import assert from 'node:assert/strict';import {handleAPI} from '../server/api.js';
const store=()=>{const map=new Map();return{async get(k){return structuredClone(map.get(k));},async insert(r){map.set(r.code,structuredClone(r));return true;},async join(k,v,h,s){const r=map.get(k);if(r.version!==v||r.guestHash)return false;Object.assign(r,{guestHash:h,state:s,version:v+1});return true;},async update(k,v,s){const r=map.get(k);if(r.version!==v)return false;Object.assign(r,{state:s,version:v+1});return true;}};};
async function call(db,path,body,token){const r=await handleAPI(new Request('https://game.test'+path,{method:body?'POST':'GET',headers:token?{Authorization:'Bearer '+token}:{},...(body?{body:JSON.stringify(body)}:{})}),db);const data=await r.json();assert.ok(r.ok,data.error);return data;}
test('online opponents retain original ratings until rematch, then receive both updated estimates after color swap',async()=>{
 const db=store(),host=await call(db,'/api/rooms',{hostColor:1,level:5,skillRating:2000,skillGames:60}),path='/api/rooms/'+host.code,guest=await call(db,path+'/join',{skillRating:900,skillGames:20});let s=guest;
 for(const[a,token]of[[1,host.token],[0,guest.token],[30,host.token],[50,guest.token],[9,host.token]])s=await call(db,path+'/move',{action:a,version:s.version},token);
 s=await call(db,path+'/rematch',{action:'request',version:s.version,matchId:s.state.matchId,skillRating:2020,skillGames:61},host.token);
 assert.equal(s.state.players[1].skillRating,2000);assert.equal(s.state._nextSkills,undefined);
 s=await call(db,path+'/rematch',{action:'accept',version:s.version,matchId:s.state.matchId,offerId:s.state.rematch.id,skillRating:880,skillGames:21},guest.token);
 assert.equal(s.state.players[1].skillRating,880);assert.equal(s.state.players[2].skillRating,2020);assert.equal(s.state._nextSkills,undefined);
});
test('2v2 preserves four initial estimates until all consent, then refreshes each stable seat',async()=>{
 const db=store(),h=await call(db,'/api/team-rooms',{hostColor:1,skillRating:1000,skillGames:0}),path='/api/team-rooms/'+h.code,peers={1:h};let s=h;
 for(const seat of[2,3,4])peers[seat]=s=await call(db,path+'/join',{seat,skillRating:1000+seat*100,skillGames:seat*10});
 s=await call(db,path+'/move',{action:'resign',version:s.version,matchId:s.state.matchId,moveId:crypto.randomUUID()},h.token);
 s=await call(db,path+'/rematch',{action:'request',version:s.version,matchId:s.state.matchId,skillRating:999,skillGames:1},h.token);
 assert.equal(s.state.teamPlayers[1].skillRating,1000);assert.equal(s.state._nextSkills,undefined);
 for(const seat of[2,3,4])s=await call(db,path+'/rematch',{action:'accept',version:s.version,matchId:s.state.matchId,offerId:s.state.rematch.id,skillRating:1100+seat*100,skillGames:seat*10+1},peers[seat].token);
 assert.equal(s.state.team1Color,2);assert.equal(s.state.teamPlayers[1].skillRating,999);for(const seat of[2,3,4])assert.equal(s.state.teamPlayers[seat].skillRating,1100+seat*100);
});
