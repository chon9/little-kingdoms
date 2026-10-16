import {newGame} from '../shared/engine.js';
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

test('online server rejects sealed territory even for its owner and preserves room version',async()=>{for(const owner of [1,2])for(const actor of [1,2]){const store=memoryStore(),{host,guest}=await pair(store),row=store.map.get(host.code),s=newGame();for(const i of [2,10,18])s.board[i]=owner;s.count[owner]=3;s.turn=actor;row.state=JSON.stringify(s);const original=row.state,version=row.version,token=actor===1?host.token:guest.token;const bad=await call(store,`/api/rooms/${host.code}/move`,{action:0,version},token);assert.equal(bad.status,422);assert.match(bad.error,/locked for both players/);assert.equal(row.state,original);assert.equal(row.version,version);const good=await call(store,`/api/rooms/${host.code}/move`,{action:30,version},token);assert.equal(good.status,200);assert.equal(good.state.board[30],actor);}});


test('a hosted room stays waiting and rejects every game action until a rival joins',async()=>{
  for(const hostColor of [1,2]){const store=memoryStore(),host=await call(store,'/api/rooms',{hostColor,level:5});assert.equal(host.phase,'waiting');assert.equal(host.ready,false);assert.equal(host.hostColor,hostColor);for(const action of [0,'pass','resign'])assert.equal((await call(store,`/api/rooms/${host.code}/move`,{action,version:0},host.token)).status,409);const r=await call(store,`/api/rooms/${host.code}`,null,host.token);assert.equal(r.version,0);assert.equal(r.state.ply,0);assert.equal(r.state.winner,null);}
});
test('closing an empty room invalidates its invitation without a match result',async()=>{
  for(const hostColor of [1,2]){const store=memoryStore();let recorded=0;store.recordResults=async()=>{recorded++;};const host=await call(store,'/api/rooms',{hostColor,level:5}),path=`/api/rooms/${host.code}`;const closed=await call(store,path+'/leave',{version:0},host.token);assert.equal(closed.status,200);assert.equal(closed.phase,'closed');assert.equal(closed.ready,false);assert.equal(closed.state.winner,null);assert.equal(closed.state.ply,0);assert.equal(recorded,0);assert.equal((await call(store,path+'/join',{})).status,410);assert.equal((await call(store,path+'/move',{action:0,version:1},host.token)).status,410);const again=await call(store,path+'/leave',{version:0},host.token);assert.equal(again.phase,'closed');assert.equal(again.version,1);}
});
test('leaving a live duel resigns from either seat even before moves and outside its turn',async()=>{
  for(const color of [1,2]){const store=memoryStore(),{host,guest}=await pair(store),path=`/api/rooms/${host.code}`;const left=await call(store,path+'/leave',{version:guest.version},color===1?host.token:guest.token);assert.equal(left.status,200);assert.equal(left.phase,'finished');assert.equal(left.state.reason,'resignation');assert.equal(left.state.winner,3-color);const rival=await call(store,path,null,color===1?guest.token:host.token);assert.deepEqual(rival.state,left.state);const again=await call(store,path+'/leave',{version:left.version},color===1?host.token:guest.token);assert.equal(again.version,left.version);assert.equal((await call(store,path+'/move',{action:0,version:left.version},guest.token)).status,409);}
});
test('a rival joining while the host confirms closure requires a fresh leave decision',async()=>{
  const store=memoryStore(),{host,guest}=await pair(store),path=`/api/rooms/${host.code}`;const stale=await call(store,path+'/leave',{version:host.version},host.token);assert.equal(stale.status,409);const r=await call(store,path,null,host.token);assert.equal(r.phase,'playing');assert.equal(r.state.winner,null);assert.equal(r.version,guest.version);
});
test('concurrent join and close cannot leave a closed room with a live guest',async()=>{
  const store=memoryStore(),host=await call(store,'/api/rooms',{hostColor:1,level:5}),path=`/api/rooms/${host.code}`;const [closed,joined]=await Promise.all([call(store,path+'/leave',{version:0},host.token),call(store,path+'/join',{})]);assert.equal([closed,joined].filter(r=>r.status===200).length,1);const room=await call(store,path,null,host.token);assert.ok(room.phase==='closed'||room.phase==='playing');assert.equal(room.ready,room.phase==='playing');assert.equal(room.state.winner,null);
});
test('leaving requires the room seat token and a current version',async()=>{
 const store=memoryStore(),{host}=await pair(store),path=`/api/rooms/${host.code}/leave`;assert.equal((await call(store,path,{version:1})).status,401);assert.equal((await call(store,path,{version:1},'a'.repeat(64))).status,403);assert.equal((await call(store,path,{version:-1},host.token)).status,409);assert.equal((await call(store,`/api/rooms/${host.code}`,null,host.token)).state.winner,null);
});

async function finishedRoom(store){const {host,guest}=await pair(store),path=`/api/rooms/${host.code}`;let version=guest.version;for(const [action,token]of [[1,host.token],[0,guest.token],[30,host.token],[50,guest.token],[9,host.token]]){const n=await call(store,path+'/move',{action,version},token);assert.equal(n.status,200);version=n.version;}const ended=await call(store,path,null,host.token);assert.equal(ended.state.reason,'capture');return{host,guest,path,ended};}
async function offerRematch(store,path,state,version,token){return call(store,path+'/rematch',{action:'request',matchId:state.matchId,version},token);}
test('a rematch requires both distinct seats and preserves code, tokens, colors and cosmetics',async()=>{
 const store=memoryStore(),{host,guest,path,ended}=await finishedRoom(store),original=structuredClone(ended.state),hashes=[store.map.get(host.code).hostHash,store.map.get(host.code).guestHash];
 const request=await offerRematch(store,path,ended.state,ended.version,host.token);assert.equal(request.status,200);assert.equal(request.state.winner,original.winner);assert.deepEqual(request.state.board,original.board);assert.deepEqual(request.state.rematch.accepted,[1]);
 const duplicate=await offerRematch(store,path,ended.state,ended.version,host.token);assert.equal(duplicate.version,request.version);assert.equal(duplicate.state.matchId,original.matchId);
 const accept=await call(store,path+'/rematch',{action:'accept',matchId:original.matchId,offerId:request.state.rematch.id,version:request.version},guest.token);assert.equal(accept.status,200);assert.equal(accept.code,host.code);assert.equal(accept.state.winner,null);assert.notEqual(accept.state.matchId,original.matchId);assert.deepEqual(accept.state.board,newGame().board);assert.deepEqual(accept.state.count,[0,0,0]);assert.equal(accept.state.turn,1);assert.deepEqual(accept.state.players,original.players);assert.deepEqual(accept.state.history,[]);assert.equal(accept.state.ply,0);assert.equal(accept.state.rematch,undefined);assert.deepEqual([store.map.get(host.code).hostHash,store.map.get(host.code).guestHash],hashes);assert.equal((await call(store,path+'/move',{action:0,version:accept.version},host.token)).status,200);assert.equal((await call(store,path,null,guest.token)).state.board[0],1);
});
test('cancelled and declined offers retain the finished board and cannot be accepted later',async()=>{
 const store=memoryStore(),{host,guest,path,ended}=await finishedRoom(store);let version=ended.version;
 for(const action of ['cancel','decline']){const offered=await offerRematch(store,path,ended.state,version,host.token),id=offered.state.rematch.id;const decision=await call(store,path+'/rematch',{action,matchId:ended.state.matchId,offerId:id,version:offered.version},action==='cancel'?host.token:guest.token);assert.equal(decision.status,200);assert.equal(decision.state.rematch.status,action==='cancel'?'cancelled':'declined');assert.deepEqual(decision.state.board,ended.state.board);assert.equal(decision.state.matchId,ended.state.matchId);assert.equal((await call(store,path+'/rematch',{action:'accept',matchId:ended.state.matchId,offerId:id,version:decision.version},guest.token)).status,409);version=decision.version;}
});
test('rematch validates match, offer, version, seat and the finished phase',async()=>{
 const store=memoryStore(),{host,guest,path,ended}=await finishedRoom(store),request=await offerRematch(store,path,ended.state,ended.version,host.token),body={action:'accept',matchId:ended.state.matchId,offerId:request.state.rematch.id,version:request.version};
 assert.equal((await call(store,path+'/rematch',body)).status,401);assert.equal((await call(store,path+'/rematch',body,'a'.repeat(64))).status,403);
 for(const patch of [{matchId:'older-match'},{offerId:'cancelled-offer'},{version:ended.version},{action:'request'}])assert.equal((await call(store,path+'/rematch',{...body,...patch},guest.token)).status,409);
 assert.equal((await call(store,path+'/rematch',{...body,action:'cancel'},guest.token)).status,400);
 const started=await call(store,path+'/rematch',body,guest.token);assert.equal(started.status,200);assert.equal((await call(store,path+'/rematch',body,guest.token)).status,409);assert.equal((await call(store,path+'/move',{action:80,version:ended.version},host.token)).status,409);
});
test('simultaneous acceptance can start only one new match',async()=>{
 const store=memoryStore(),{host,guest,path,ended}=await finishedRoom(store),request=await offerRematch(store,path,ended.state,ended.version,host.token),body={action:'accept',matchId:ended.state.matchId,offerId:request.state.rematch.id,version:request.version};
 const all=await Promise.all([call(store,path+'/rematch',body,guest.token),call(store,path+'/rematch',body,guest.token)]);assert.equal(all.filter(r=>r.status===200).length,1);assert.equal(all.filter(r=>r.status===409).length,1);assert.equal((await call(store,path,null,host.token)).version,request.version+1);
});
test('a departed player cannot be silently put into another duel',async()=>{
 const store=memoryStore(),{host,guest,path,ended}=await finishedRoom(store),request=await offerRematch(store,path,ended.state,ended.version,host.token);const left=await call(store,path+'/leave',{version:request.version},guest.token);assert.equal(left.status,200);assert.deepEqual(left.state.roomDeparted,[2]);assert.equal(left.state.rematch,null);assert.equal(left.state.winner,ended.state.winner);assert.equal((await offerRematch(store,path,ended.state,left.version,host.token)).status,409);const unchanged=await call(store,path+'/leave',{version:left.version},guest.token);assert.equal(unchanged.version,left.version);
});
test('finished ranked results must save successfully before a rematch replaces them',async()=>{
 const store=memoryStore(),{host,guest,path,ended}=await finishedRoom(store),row=store.map.get(host.code),s=JSON.parse(row.state);s.players[1].commanderId='blue';s.players[2].commanderId='orange';row.state=JSON.stringify(s);const results=new Map();let fail=true;store.recordResults=async entries=>{if(fail)throw Error('Temporary result service outage');for(const r of entries)results.set(r.matchId+':'+r.commanderId,r);};
 const offered=await offerRematch(store,path,s,row.version,host.token),body={action:'accept',matchId:s.matchId,offerId:offered.state.rematch.id,version:offered.version},before=row.state;assert.equal((await call(store,path+'/rematch',body,guest.token)).status,503);assert.equal(row.state,before);assert.equal(row.version,offered.version);fail=false;const next=await call(store,path+'/rematch',body,guest.token);assert.equal(next.status,200);assert.equal(results.size,2);assert.ok([...results.values()].every(r=>r.matchId===ended.state.matchId));assert.equal(results.get(s.matchId+':blue').won,1);
});
test('waiting and ongoing rooms cannot be reset by rematch requests',async()=>{
 const store=memoryStore(),host=await call(store,'/api/rooms',{hostColor:2,level:1}),path=`/api/rooms/${host.code}`;assert.equal((await offerRematch(store,path,host.state,0,host.token)).status,409);const guest=await call(store,path+'/join',{});assert.equal((await offerRematch(store,path,guest.state,guest.version,host.token)).status,409);assert.equal((await call(store,path,null,guest.token)).state.ply,0);
});

test('retrying a move after a lost acknowledgement applies it exactly once',async()=>{
 const store=memoryStore(),{host,guest}=await pair(store),path=`/api/rooms/${host.code}`,body={action:0,version:guest.version,matchId:guest.state.matchId,moveId:crypto.randomUUID()};
 const first=await call(store,path+'/move',body,host.token);assert.equal(first.status,200);assert.equal(first.acknowledgedMove,body.moveId);const peer=await call(store,path+'/move',{action:50,version:first.version},guest.token);const retry=await call(store,path+'/move',body,host.token);assert.equal(retry.status,200);assert.equal(retry.version,peer.version);assert.equal(retry.state.ply,2);assert.equal(retry.state.count[1],1);assert.equal(retry.state.board[50],2);assert.equal(retry.state._moveReceipts,undefined);assert.equal((await call(store,path+'/move',{...body,action:1},host.token)).status,400);assert.equal((await call(store,path+'/move',body,guest.token)).status,400);
});
test('concurrent duplicate move requests share the same server acknowledgement',async()=>{
 const store=memoryStore(),{host,guest}=await pair(store),path=`/api/rooms/${host.code}/move`,body={action:0,version:guest.version,matchId:guest.state.matchId,moveId:crypto.randomUUID()};const all=await Promise.all([call(store,path,body,host.token),call(store,path,body,host.token)]);assert.ok(all.every(r=>r.status===200));assert.equal(all[0].version,all[1].version);assert.equal(all[1].state.ply,1);
});
test('a retry from the old match cannot deploy into an agreed rematch',async()=>{
 const store=memoryStore(),{host,guest}=await pair(store),path=`/api/rooms/${host.code}`,body={action:'resign',version:guest.version,matchId:guest.state.matchId,moveId:crypto.randomUUID()};const end=await call(store,path+'/move',body,host.token);assert.equal((await call(store,path+'/move',body,host.token)).status,200);const offer=await offerRematch(store,path,end.state,end.version,host.token);const next=await call(store,path+'/rematch',{action:'accept',version:offer.version,matchId:end.state.matchId,offerId:offer.state.rematch.id},guest.token);assert.equal((await call(store,path+'/move',body,host.token)).status,409);assert.equal(next.state.winner,null);
});
test('unchanged room polling is compact, authenticated and still reports new versions',async()=>{
 const store=memoryStore(),{host,guest}=await pair(store),path=`/api/rooms/${host.code}`;const same=await call(store,path+'?since='+guest.version,null,host.token);assert.equal(same.unchanged,true);assert.equal(same.state,undefined);assert.equal(same.version,guest.version);assert.equal((await call(store,path+'?since='+guest.version)).status,401);await call(store,path+'/move',{action:0,version:guest.version},host.token);const newer=await call(store,path+'?since='+guest.version,null,guest.token);assert.equal(newer.unchanged,undefined);assert.equal(newer.state.board[0],1);assert.equal((await call(store,path+'?since=invalid',null,guest.token)).state.board[0],1);
});
test('native requests expose timing without tokens or query text',async()=>{
 const store=memoryStore(),{host}=await pair(store),r=await handleAPI(new Request(`https://kingdom.test/api/rooms/${host.code}`,{headers:{Origin:'https://kingdoms.local',Authorization:'Bearer '+host.token}}),store);assert.match(r.headers.get('Server-Timing'),/api;dur=[\d.]+/);assert.equal(r.headers.get('Access-Control-Expose-Headers'),'Server-Timing');assert.ok(!r.headers.get('Server-Timing').includes(host.token));
});
