import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../public/steam-session.js',import.meta.url),'utf8')).replace("from './engine.js'",`from '${new URL('../shared/engine.js',import.meta.url).href}'`);
const {SteamSession}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const HOST='76561198000000001',GUEST='76561198000000002',LOBBY='109775240000000001';
function pair(hostColor=1){
  let clock=1000,next=0;const events=new Map(),queue=[],errors=[],updates=[[],[]],packets=[],quickCalls=[];
  const bridge=id=>({on:fn=>{events.set(id,fn);return()=>events.delete(id);},quick:async()=>{quickCalls.push(id);return{ok:true};},create:async()=>({ok:true}),join:async()=>({ok:true}),leave:async()=>({ok:true}),send:async(peer,payload)=>{packets.push({id,peer,payload});queue.push(()=>events.get(peer)?.({type:'packet',from:id,payload}));return{ok:true};}});
  const make=(id,n)=>new SteamSession({bridge:bridge(id),identity:{id,name:n?'Guest':'Host'},profile:{avatar:n?10:0,castle:n?'c30':'c01'},onUpdate:d=>updates[n].push(d),onError:e=>errors.push(e),now:()=>clock,uuid:()=>`test-command-${++next}`,autoTick:false});
  const host=make(HOST,0),guest=make(GUEST,1);
  const drain=()=>{let n=0;while(queue.length){assert.ok(++n<1000,'transport should settle');queue.shift()();}};
  const members=[{id:HOST,name:'Host'},{id:GUEST,name:'Guest'}];
  const event=(id,membersOverride=members,hostPresent=true)=>events.get(id)?.({type:'lobby',lobby:LOBBY,host:HOST,hostPresent,members:membersOverride});
  async function start(){await host.create(hostColor);event(HOST,[members[0]]);assert.equal(host.ready,false);await guest.join(LOBBY);event(HOST);event(GUEST);drain();await Promise.resolve();drain();assert.equal(host.ready,true);assert.equal(guest.ready,true);}
  return{host,guest,events,queue,packets,errors,updates,start,drain,event,quickCalls,advance:ms=>clock+=ms};
}
async function act(p,who,action){const promise=who.act(action);p.drain();await promise;p.drain();assert.deepEqual(p.host.state,p.guest.state);}
async function finish(p){for(let i=0;i<2;i++)await act(p,p.host.color===p.host.state.turn?p.host:p.guest,'pass');}
test('Steam lobby waits for the second peer, preserves chosen kingdoms and cosmetics',async()=>{
  const p=pair(2);await p.start();assert.equal(p.host.color,2);assert.equal(p.guest.color,1);assert.equal(p.guest.state.board[40],3);assert.equal(p.guest.state.players[2].castle,'c01');assert.equal(p.guest.state.players[1].castle,'c30');assert.deepEqual(p.host.state,p.guest.state);assert.ok(p.packets.every(p=>JSON.parse(p.payload).lobby===LOBBY));
});
test('real move commands, passes, capture and off-turn resignation replay through the engine',async()=>{
  const p=pair();await p.start();for(const [who,action]of[[p.host,1],[p.guest,0],[p.host,30],[p.guest,50],[p.host,9]])await act(p,who,action);assert.equal(p.guest.state.winner,1);assert.equal(p.guest.state.reason,'capture');
  const q=pair();await q.start();await act(q,q.guest,'resign');assert.equal(q.host.state.winner,1);
});
test('illegal moves, wrong turns and occupied neutral square do not change a Steam game',async()=>{
  const p=pair();await p.start();const before=JSON.stringify(p.host.state);const wrong=p.guest.act(30);p.drain();await assert.rejects(wrong,/turn/);await assert.rejects(p.host.act(40),/already a castle/);assert.equal(JSON.stringify(p.host.state),before);assert.deepEqual(p.host.state,p.guest.state);
});
test('both players must explicitly accept a rematch; lobby stays fixed and kingdoms swap',async()=>{
  const p=pair(2);await p.start();await finish(p);const match=p.host.state.matchId;
  let request=p.guest.rematch('request');p.drain();await request;assert.equal(p.host.state.matchId,match);assert.equal(p.host.state.rematch.accepted.length,1);
  request=p.host.rematch('accept');p.drain();await request;assert.notEqual(p.host.state.matchId,match);assert.deepEqual(p.host.state,p.guest.state);assert.equal(p.guest.state.ply,0);assert.equal(p.host.lobby,LOBBY);assert.equal(p.host.color,1);assert.equal(p.guest.color,2);assert.equal(p.host.state.turn,1);assert.equal(p.errors.length,0);
});
test('host request and guest acceptance, decline/cancel and stale offers are handled',async()=>{
  const p=pair();await p.start();await finish(p);let action=p.host.rematch('request');p.drain();await action;const stale=p.host.state.rematch.id;
  action=p.guest.rematch('decline');p.drain();await action;assert.equal(p.host.state.rematch.status,'declined');action=p.host.rematch('request');p.drain();await action;assert.notEqual(p.host.state.rematch.id,stale);
  p.host.handleCommand({id:'stale-command',kind:'rematch',action:'accept',offerId:stale,matchId:p.host.state.matchId},2);p.drain();assert.ok(p.host.state.winner);
  action=p.host.rematch('cancel');p.drain();await action;assert.equal(p.guest.state.rematch.status,'cancelled');action=p.host.rematch('request');p.drain();await action;action=p.guest.rematch('accept');p.drain();await action;assert.equal(p.host.state.winner,null);assert.deepEqual(p.host.state,p.guest.state);assert.equal(p.errors.length,0);
});
test('lost acknowledgement and duplicate reliable packet never place a castle twice',async()=>{
  const p=pair();await p.start();await act(p,p.host,30);const pending=p.guest.act(50);const packet=p.packets.at(-1);p.queue.shift()();p.queue.length=0;await Promise.resolve();p.advance(2000);p.guest.tick();p.drain();await pending;assert.equal(p.host.state.ply,2);assert.deepEqual(p.host.state,p.guest.state);
  p.events.get(HOST)({type:'packet',from:GUEST,payload:packet.payload});p.drain();assert.equal(p.host.state.ply,2);
});
test('unknown peers, other Spacewar games, lobbies, malformed JSON and protocol versions are ignored',async()=>{
  const p=pair();await p.start();const state=JSON.stringify(p.host.state),event=p.events.get(HOST);
  for(const packet of [{from:HOST,payload:'{}'},{from:GUEST,payload:'{'},{from:GUEST,payload:JSON.stringify({game:'other',v:1,lobby:LOBBY,kind:'bye'})},{from:GUEST,payload:JSON.stringify({game:'little-kingdoms',v:999,lobby:LOBBY,kind:'bye'})},{from:GUEST,payload:JSON.stringify({game:'little-kingdoms',v:1,lobby:'109775240000000002',kind:'bye'})}])event({type:'packet',...packet});
  assert.equal(JSON.stringify(p.host.state),state);
});
test('guest rejects history rewrites and unilateral host rematches',async()=>{
  const p=pair();await p.start();await act(p,p.host,30);const message={seq:p.guest.seq+1,matchId:p.guest.state.matchId,hostColor:1,players:p.guest.state.players,actions:[{color:1,index:31}]};assert.throws(()=>p.guest.acceptSnapshot(message),/history mismatch/);
  await finish(p);assert.throws(()=>p.guest.acceptSnapshot({...message,seq:p.guest.seq+1,matchId:'unapproved-match',actions:[],startProof:{matchId:p.guest.state.matchId,offerId:'unapproved-offer',accepted:[1,2]}}),/both commanders/);
});
test('temporary outage pauses input and heartbeat recovery retains confirmed castles',async()=>{
  const p=pair();await p.start();await act(p,p.host,30);p.advance(16000);p.guest.tick();assert.equal(p.guest.connected,false);await assert.rejects(p.guest.act(50),/connect/);p.drain();assert.equal(p.guest.connected,true);await act(p,p.guest,50);
});
test('either peer departure ends a casual game and prevents rematches',async()=>{
  for(const side of ['host','guest']){const p=pair();await p.start();const id=side==='host'?HOST:GUEST;p.event(id,[{id,name:side}],side==='host');assert.ok(p[side].state.winner);assert.equal(p[side].state.steamAborted,true);assert.ok(p[side].state.roomDeparted.length);await assert.rejects(p[side].rematch('request'),/connect/);}
});
test('closing a session removes native listeners and rejects pending commands',async()=>{
  const p=pair();await p.start();await act(p,p.host,30);const action=p.guest.act(50);const rejection=assert.rejects(action,/closed/);await p.guest.leave();await rejection;assert.equal(p.events.has(GUEST),false);
});

test('Quick Match migration forgets the abandoned lobby and accepts the lower-ID host',async()=>{
  const p=pair();await p.host.quick();p.event(HOST,[{id:HOST,name:'Host'}]);assert.equal(p.host.lobby,LOBBY);
  p.events.get(HOST)({type:'matchmaking',phase:'searching'});assert.equal(p.host.lobby,null);assert.equal(p.host.state,null);
  const lower='109775240000000000';p.events.get(HOST)({type:'lobby',lobby:lower,host:GUEST,hostPresent:true,quick:true,members:[{id:GUEST},{id:HOST}]});
  assert.equal(p.host.lobby,lower);assert.equal(p.host.isHost,false);assert.equal(p.host.peer,GUEST);assert.deepEqual(p.quickCalls,[HOST]);
});

test('an unready Quick Match guest requeues after the original owner disappears',async()=>{
  const p=pair();await p.guest.quick();p.events.get(GUEST)({type:'lobby',lobby:LOBBY,host:HOST,hostPresent:false,quick:true,members:[{id:GUEST}]});
  await Promise.resolve();await Promise.resolve();assert.deepEqual(p.quickCalls,[GUEST,GUEST]);assert.equal(p.guest.lobby,null);assert.equal(p.guest.expectLobby,true);
});
test('Steam rematches refresh both rating estimates without rewriting the finished match',async()=>{
 const p=pair();await p.start();await finish(p);Object.assign(p.host.profile,{skillRating:1800,skillGames:50});Object.assign(p.guest.profile,{skillRating:1400,skillGames:40});
 let r=p.host.rematch('request');p.drain();await r;assert.equal(p.host.state.players[1].skillRating,undefined);
 r=p.guest.rematch('accept');p.drain();await r;assert.equal(p.host.state.players[2].skillRating,1800);assert.equal(p.host.state.players[1].skillRating,1400);assert.deepEqual(p.host.state,p.guest.state);
});
