import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAPI } from '../server/api.js';

function memoryStore(){const map=new Map();return{map,async get(c){return map.has(c)?{...map.get(c)}:null;},async insert(r){if(map.has(r.code))return false;map.set(r.code,{...r});return true;},async join(c,v,h,s){const r=map.get(c);if(r.version!==v||r.guestHash)return false;r.guestHash=h;r.state=s;r.version++;return true;},async update(c,v,s){const r=map.get(c);if(r.version!==v)return false;r.state=s;r.version++;return true;}};}
async function call(store,path,body,token,origin){const response=await handleAPI(new Request('https://kingdom.test'+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})}),store);return{status:response.status,...await response.json()};}
async function pair(store){const host=await call(store,'/api/rooms',{hostColor:1,level:5});const guest=await call(store,`/api/rooms/${host.code}/join`,{});return{host,guest};}

test('rooms create, join, synchronize legal turns and keep player tokens private',async()=>{const store=memoryStore(),{host,guest}=await pair(store);assert.equal(host.status,201);assert.equal(host.ready,false);assert.match(host.code,/^[A-Z0-9]{6}$/);assert.equal(guest.color,2);assert.equal(guest.ready,true);assert.notEqual(host.token,guest.token);const moved=await call(store,`/api/rooms/${host.code}/move`,{action:0,version:1},host.token);assert.equal(moved.state.board[0],1);const viewed=await call(store,`/api/rooms/${host.code}`,null,guest.token);assert.equal(viewed.state.board[0],1);assert.equal(viewed.token,undefined);assert.equal(viewed.hostHash,undefined);assert.equal(store.map.get(host.code).hostHash.includes(host.token),false);});
test('rooms reject spectators, third players and out-of-turn moves',async()=>{const store=memoryStore(),{host,guest}=await pair(store);assert.equal((await call(store,`/api/rooms/${host.code}`)).status,401);assert.equal((await call(store,`/api/rooms/${host.code}/join`,{})).status,409);assert.equal((await call(store,`/api/rooms/${host.code}/move`,{action:0,version:1},guest.token)).status,409);assert.equal((await call(store,`/api/rooms/${host.code}`,null,'a'.repeat(64))).status,403);});
test('stale and simultaneous submissions cannot overwrite an accepted move',async()=>{const store=memoryStore(),{host}=await pair(store);const responses=await Promise.all([call(store,`/api/rooms/${host.code}/move`,{action:0,version:1},host.token),call(store,`/api/rooms/${host.code}/move`,{action:1,version:1},host.token)]);assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===409).length,1);assert.equal(JSON.parse(store.map.get(host.code).state).ply,1);});
test('host may command Wei while blue guest goes first',async()=>{const store=memoryStore(),host=await call(store,'/api/rooms',{hostColor:2,level:10}),guest=await call(store,`/api/rooms/${host.code}/join`,{});assert.equal(guest.color,1);const move=await call(store,`/api/rooms/${host.code}/move`,{action:0,version:1},guest.token);assert.equal(move.status,200);});
test('room pass/pass scoring uses confirmed literal rules',async()=>{const store=memoryStore(),{host,guest}=await pair(store);await call(store,`/api/rooms/${host.code}/move`,{action:'pass',version:1},host.token);const n=await call(store,`/api/rooms/${host.code}/move`,{action:'pass',version:2},guest.token);assert.equal(n.state.winner,2);assert.equal(n.state.reason,'territory');});
test('resignation belongs to the submitting player even when it is not their turn',async()=>{const store=memoryStore(),{host,guest}=await pair(store);const n=await call(store,`/api/rooms/${host.code}/move`,{action:'resign',version:1},guest.token);assert.equal(n.state.winner,1);});
test('expired room, invalid inputs, illegal moves and cross-origin requests fail safely',async()=>{const store=memoryStore(),{host}=await pair(store);assert.equal((await call(store,'/api/rooms',{hostColor:3,level:99})).status,400);assert.equal((await call(store,`/api/rooms/${host.code}/move`,{action:40,version:1},host.token)).status,422);assert.equal((await call(store,`/api/rooms/${host.code}/move`,{action:'0',version:1},host.token)).status,400);assert.equal((await call(store,'/api/rooms',{hostColor:1,level:1},null,'https://evil.test')).status,403);store.map.get(host.code).expires=0;assert.equal((await call(store,`/api/rooms/${host.code}`,null,host.token)).status,404);});

test('trusted installed clients get scoped CORS preflights and can play with browser clients',async()=>{
  for(const origin of ['https://localhost','http://localhost','capacitor://localhost','app://kingdoms','https://kingdoms.local']){
    const store=memoryStore(),preflight=await handleAPI(new Request('https://kingdom.test/api/rooms',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization, Content-Type'}}),store);
    assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/Authorization/);assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null);
    const host=await call(store,'/api/rooms',{hostColor:1,level:5},null,origin),guest=await call(store,`/api/rooms/${host.code}/join`,{});
    const move=await call(store,`/api/rooms/${host.code}/move`,{action:30,version:guest.version},host.token,origin);assert.equal(move.status,200);assert.equal(move.state.board[30],1);
    const read=await call(store,`/api/rooms/${host.code}`,null,guest.token);assert.equal(read.state.board[30],1);
  }
});
test('untrusted and opaque native origins are rejected including preflight and room reads',async()=>{
  const store=memoryStore();
  for(const origin of ['null','https://evil.test','https://localhost.evil.test','app://other'])for(const method of ['GET','OPTIONS']){
    const response=await handleAPI(new Request('https://kingdom.test/api/rooms/ABC123',{method,headers:{Origin:origin}}),store);assert.equal(response.status,403);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
  }
});

test('room avatars and match identity are shared, preserved through moves and validated',async()=>{
  const store=memoryStore(),host=await call(store,'/api/rooms',{hostColor:2,level:8,avatar:30});
  assert.equal(host.state.players[2].avatar,30);assert.ok(host.state.matchId);
  assert.equal((await call(store,`/api/rooms/${host.code}/join`,{avatar:40})).status,400);
  const guest=await call(store,`/api/rooms/${host.code}/join`,{avatar:25});
  assert.equal(guest.state.players[1].avatar,25);assert.equal(guest.state.players[2].avatar,30);
  const moved=await call(store,`/api/rooms/${host.code}/move`,{action:0,version:guest.version,avatar:999},guest.token);
  assert.deepEqual(moved.state.players,guest.state.players);assert.equal(moved.state.matchId,host.state.matchId);
  const seen=await call(store,`/api/rooms/${host.code}`,null,host.token);assert.deepEqual(seen.state.players,guest.state.players);
  for(const avatar of [-1,40,'20',{},null])assert.equal((await call(store,'/api/rooms',{hostColor:1,level:1,avatar})).status,400);
});
