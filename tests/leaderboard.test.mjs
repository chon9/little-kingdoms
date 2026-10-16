import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { D1Store, handleAPI } from '../server/api.js';

function memoryStore(){
  const rooms=new Map(),commanders=new Map(),results=new Map();
  const counts=row=>{if(!row)return null;const rs=[...results.values()].filter(r=>r.commanderId===row.id);return{...row,onlineWins:rs.filter(r=>r.won===1).length,onlineLosses:rs.filter(r=>r.won===0).length};};
  return {rooms,commanders,results,
    async get(code){const row=rooms.get(code);return row?{...row}:null;},
    async insert(room){if(rooms.has(room.code))return false;rooms.set(room.code,{...room});return true;},
    async join(code,version,hash,state){const row=rooms.get(code);if(row.version!==version||row.guestHash)return false;Object.assign(row,{guestHash:hash,state,version:version+1});return true;},
    async update(code,version,state){const row=rooms.get(code);if(row.version!==version)return false;Object.assign(row,{state,version:version+1});return true;},
    async commanderByHash(hash){return counts([...commanders.values()].find(c=>c.tokenHash===hash));},
    async insertCommander(row){commanders.set(row.id,{...row});},
    async updateCommander(id,value){const row=commanders.get(id);Object.assign(row,{...value,xp:Math.max(row.xp,value.xp),matches:Math.max(row.matches,value.matches),wins:Math.max(row.wins,value.wins)});},
    async leaderboard(kind,limit){return [...commanders.values()].map(counts).sort((a,b)=>(kind==='wins'?b.onlineWins-a.onlineWins||a.onlineLosses-b.onlineLosses:b.xp-a.xp||b.wins-a.wins)||a.created-b.created||a.id.localeCompare(b.id)).slice(0,limit);},
    async recordResults(rows){for(const row of rows){const key=row.matchId+':'+row.commanderId;if(!results.has(key))results.set(key,{...row});}}
  };
}
async function call(store,path,body,token){const response=await handleAPI(new Request('https://kingdom.test'+path,{method:body===undefined?'GET':'POST',headers:token?{Authorization:'Bearer '+token}:{},...(body===undefined?{}:{body:JSON.stringify(body)})}),store);return{status:response.status,...await response.json()};}
async function identity(store,name){const result=await call(store,'/api/commanders',{displayName:name,avatar:25});assert.equal(result.status,201);return result;}
async function duel(store,{same=false,legacy=false}={}){
  const a=await identity(store,'Blue Commander'),b=same?a:await identity(store,'Orange Commander');
  const host=await call(store,'/api/rooms',{hostColor:1,level:5,commanderToken:a.token,castle:'c01'});
  const guest=await call(store,`/api/rooms/${host.code}/join`,legacy?{}:{commanderToken:b.token,castle:'c30'});
  assert.equal(guest.status,200);return{a,b,host,guest};
}
async function deployFour(store,host,guest){let version=guest.version;for(const [action,token]of [[0,host.token],[80,guest.token],[1,host.token],[79,guest.token]]){const next=await call(store,`/api/rooms/${host.code}/move`,{action,version},token);assert.equal(next.status,200);version=next.version;}return version;}

test('guest commander identity is secret, names are safe, XP levels are derived, and public entries disclose only public fields',async()=>{
  const store=memoryStore(),a=await identity(store,'劉備 <The King>');
  assert.match(a.token,/^[a-f0-9]{64}$/);assert.equal(a.commander.displayName,'劉備 The King');assert.equal(a.commander.level,1);
  assert.equal((await call(store,'/api/commanders/me')).status,401);
  assert.equal((await call(store,'/api/commanders/me',undefined,'f'.repeat(64))).status,401);
  const updated=await call(store,'/api/commanders/me',{xp:100,matches:6,wins:4,displayName:'River Queen',avatar:33,onlineWins:999,onlineLosses:999,id:'spoof'},a.token);
  assert.equal(updated.commander.level,2);assert.equal(updated.commander.localWins,4);assert.equal(updated.commander.localLosses,2);assert.equal(updated.commander.onlineWins,0);assert.equal(updated.commander.id,a.commander.id);
  const board=await call(store,'/api/leaderboard?kind=level&limit=1');assert.equal(board.source,'device-reported');assert.equal(board.entries.length,1);assert.equal(board.entries[0].displayName,'River Queen');
  for(const row of [a.commander,updated.commander,board.entries[0]])for(const field of ['token','tokenHash','created','hostHash','guestHash'])assert.equal(row[field],undefined);
  assert.ok(!JSON.stringify(board).includes(a.token));assert.notEqual([...store.commanders.values()][0].tokenHash,a.token);
  const lower=await call(store,'/api/commanders/me',{xp:0,matches:0,wins:0},a.token);assert.equal(lower.commander.xp,100);assert.equal(lower.commander.matches,6);
});

test('commander and leaderboard input bounds reject invalid data and token spoofing',async()=>{
  const store=memoryStore(),a=await identity(store,'Valid Name');
  for(const displayName of ['', 'a', 'x'.repeat(21),{},null,'👑'])assert.equal((await call(store,'/api/commanders',{displayName})).status,400);
  for(const avatar of [-1,40,'2',null])assert.equal((await call(store,'/api/commanders',{displayName:'Okay Name',avatar})).status,400);
  for(const fields of [{xp:-1},{xp:10000001},{xp:1.5},{xp:null},{matches:1000001},{wins:1,matches:0},{avatar:40},{displayName:'x'}])assert.equal((await call(store,'/api/commanders/me',fields,a.token)).status,400);
  for(const query of ['kind=hack','limit=0','limit=101','limit=2.5','limit=NaN'])assert.equal((await call(store,'/api/leaderboard?'+query)).status,400);
  assert.equal((await call(store,'/api/rooms',{hostColor:1,level:5,commanderToken:'f'.repeat(64)})).status,401);
  for(const castle of ['c00','c31','c1',{},['c01'],null])assert.equal((await call(store,'/api/rooms',{hostColor:1,level:5,castle})).status,400);
  const host=await call(store,'/api/rooms',{hostColor:1,level:5,commanderId:a.commander.id});assert.equal(host.state.players[1].commanderId,undefined);
});

test('server records eligible online surrender exactly once and local progress cannot fabricate online wins',async()=>{
  const store=memoryStore(),{a,b,host,guest}=await duel(store),version=await deployFour(store,host,guest);
  assert.equal(host.state.players[1].commanderId,a.commander.id);assert.equal(guest.state.players[2].castle,'c30');assert.equal(guest.state.players[2].displayName,'Orange Commander');
  assert.ok(!JSON.stringify(guest.state).includes(a.token));assert.ok(!JSON.stringify(guest.state).includes(b.token));
  const finished=await call(store,`/api/rooms/${host.code}/move`,{action:'resign',version,commanderId:b.commander.id,onlineWins:500},host.token);assert.equal(finished.status,200);assert.equal(finished.state.winner,2);
  await Promise.all(Array.from({length:10},()=>call(store,`/api/rooms/${host.code}`,undefined,host.token)));
  const stale=await call(store,`/api/rooms/${host.code}/move`,{action:'resign',version},host.token);assert.equal(stale.status,409);assert.equal(store.results.size,2);
  const board=await call(store,'/api/leaderboard?kind=wins');assert.equal(board.source,'server-recorded');assert.equal(board.entries[0].id,b.commander.id);assert.equal(board.entries[0].onlineWins,1);
  const loser=await call(store,'/api/commanders/me',undefined,a.token);assert.equal(loser.commander.onlineLosses,1);assert.equal(loser.commander.onlineWins,0);
  const fake=await call(store,'/api/commanders/me',{xp:10000000,matches:999999,wins:999999,onlineWins:999999},a.token);assert.equal(fake.commander.onlineWins,0);assert.equal(fake.commander.level,50);
});

test('empty pass games, self play, one-castle games, and legacy anonymous opponents do not farm records',async()=>{
  for(const scenario of ['empty','short','self','legacy']){
    const store=memoryStore(),{host,guest}=await duel(store,{same:scenario==='self',legacy:scenario==='legacy'});
    let version=guest.version;
    if(scenario==='self'||scenario==='legacy')version=await deployFour(store,host,guest);
    if(scenario==='short'){const moved=await call(store,`/api/rooms/${host.code}/move`,{action:0,version},host.token);version=moved.version;}
    if(scenario==='empty'){const passed=await call(store,`/api/rooms/${host.code}/move`,{action:'pass',version},host.token);const end=await call(store,`/api/rooms/${host.code}/move`,{action:'pass',version:passed.version},guest.token);assert.equal(end.state.winner,2);}
    else assert.equal((await call(store,`/api/rooms/${host.code}/move`,{action:'resign',version},host.token)).status,200);
    assert.equal(store.results.size,0,scenario);
  }
});

test('a temporary result-write failure never rejects an accepted move and the next room read repairs it',async()=>{
  const store=memoryStore(),{host,guest,b}=await duel(store),version=await deployFour(store,host,guest),write=store.recordResults;
  let failed=false;store.recordResults=async rows=>{if(!failed){failed=true;throw new Error('temporary');}return write(rows);};
  const finished=await call(store,`/api/rooms/${host.code}/move`,{action:'resign',version},host.token);assert.equal(finished.status,200);assert.equal(finished.state.winner,2);assert.equal(store.results.size,0);
  const read=await call(store,`/api/rooms/${host.code}`,undefined,guest.token);assert.equal(read.state.winner,2);assert.equal(store.results.size,2);
  assert.equal((await call(store,'/api/commanders/me',undefined,b.token)).commander.onlineWins,1);
});

let DatabaseSync;try{({DatabaseSync}=await import('node:sqlite'));}catch{}
test('generated migrations preserve rooms and D1 SQL records atomic idempotent wins on actual SQLite',{skip:!DatabaseSync},async()=>{
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(await readFile(new URL('../drizzle/0000_tiresome_omega_flight.sql',import.meta.url),'utf8'));
  sqlite.prepare('INSERT INTO rooms (code,hostHash,hostColor,level,state,version,expires) VALUES (?,?,?,?,?,?,?)').run('ABC123','private',1,5,'{}',0,Date.now()+100000);
  sqlite.exec(await readFile(new URL('../drizzle/0001_commander_leaderboards.sql',import.meta.url),'utf8'));
  sqlite.exec(await readFile(new URL('../drizzle/0002_polite_gorilla_man.sql',import.meta.url),'utf8'));
  assert.equal(sqlite.prepare('SELECT code FROM rooms WHERE code=?').get('ABC123').code,'ABC123');
  const plan=sqlite.prepare('EXPLAIN QUERY PLAN SELECT COUNT(*) FROM online_results WHERE commanderId=? AND won=?').all('public-id',1);
  assert.ok(plan.some(row=>row.detail.includes('COVERING INDEX online_results_commander_won')),JSON.stringify(plan));
  function statement(sql,args=[]){return{bind(...values){return statement(sql,values);},first(){return sqlite.prepare(sql).get(...args)||null;},all(){return{results:sqlite.prepare(sql).all(...args)};},run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};}
  let resultBatches=0;const db={prepare:statement,async batch(statements){resultBatches++;sqlite.exec('BEGIN');try{const result=statements.map(s=>s.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}},store=new D1Store(db);
  const {host,guest,a,b}=await duel(store),version=await deployFour(store,host,guest);
  await assert.rejects(store.recordResults([
    {matchId:'rollback-proof',commanderId:a.commander.id,won:1,completed:Date.now()},
    {matchId:'rollback-proof',commanderId:'missing-commander',won:0,completed:Date.now()}
  ]));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM online_results WHERE matchId=?').get('rollback-proof').n,0,'both result rows must roll back on failure');
  const pass=await call(store,`/api/rooms/${host.code}/move`,{action:'pass',version},host.token);
  const end=await call(store,`/api/rooms/${host.code}/move`,{action:'pass',version:pass.version},guest.token);assert.equal(end.status,200);assert.equal(end.state.winner,2);
  const batchesAfterFinish=resultBatches;assert.equal(JSON.parse((await store.get(host.code)).state)._resultSaved,end.state.matchId);assert.equal(end.state._resultSaved,undefined);
  await Promise.all(Array.from({length:10},()=>call(store,`/api/rooms/${host.code}`,undefined,guest.token)));
  assert.equal(resultBatches,batchesAfterFinish,'completed polls do not repeat result write batches');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM online_results').get().n,2);
  assert.equal((await call(store,'/api/commanders/me',undefined,a.token)).commander.onlineLosses,1);
  assert.equal((await call(store,'/api/commanders/me',undefined,b.token)).commander.onlineWins,1);
  const updates=await Promise.all([
    call(store,'/api/commanders/me',{xp:1000,matches:10,wins:1},a.token),
    call(store,'/api/commanders/me',{xp:100,matches:2,wins:2},a.token)
  ]);
  assert.ok(updates.every(row=>row.status===200));
  const merged=(await call(store,'/api/commanders/me',undefined,a.token)).commander;
  assert.equal(merged.xp,1000);assert.equal(merged.matches,10);assert.equal(merged.wins,2);assert.ok(merged.wins<=merged.matches);
  assert.equal((await call(store,'/api/leaderboard?kind=level')).entries[0].id,a.commander.id);
  assert.equal((await call(store,'/api/leaderboard?kind=wins')).entries[0].id,b.commander.id);
  sqlite.close();
});
