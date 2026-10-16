import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const key='little-kingdoms-commander-v1',oldToken='a'.repeat(64),newToken='b'.repeat(64);
const previous={id:'previous-commander',displayName:'Before',token:oldToken};
const replacement={id:'replacement-commander',displayName:'After',avatar:0,xp:0,matches:0,wins:0};
const profile={schema:1,xp:240,matches:6,wins:4,avatar:25,claimed:['finished-game'],cosmetics:{owned:['b01'],board:'b01',castle:'classic'}};
const httpError=status=>Object.assign(new Error('Service response '+status),{status});
let sequence=0;
async function harness(saved=previous){
  // Load the real browser module with isolated storage. Only its browser-absolute
  // presentation import is replaced; identity and sync functions run unchanged.
  const source=await readFile(new URL('../public/rankings.js',import.meta.url),'utf8');
  const prelude=`const AVATARS=[];const levelForXP=()=>1;const storage=new Map(${JSON.stringify(saved?[[key,JSON.stringify(saved)]]:[])});const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};export const storedIdentity=()=>JSON.parse(storage.get(${JSON.stringify(key)})||'null');`;
  return import('data:text/javascript;base64,'+Buffer.from(source.replace(/^import .*;\r?\n/,prelude+'\n')+'\n// isolated test '+sequence++).toString('base64'));
}
function context(api){const saved=structuredClone(profile);return{saved,getProfile:()=>saved,api};}

test('a cached commander rejected with 401 is recreated once and synced without changing local progress',async()=>{
  const rankings=await harness(),calls=[],ctx=context(async(path,body,token)=>{
    calls.push({path,body,token});
    if(path==='/api/commanders')return{commander:replacement,token:newToken};
    if(token===oldToken)throw httpError(401);
    assert.equal(token,newToken);return{commander:{...replacement,...body}};
  });
  const result=await rankings.syncCommander(ctx);
  assert.equal(result.id,replacement.id);assert.equal(result.token,newToken);assert.equal(result.xp,240);
  assert.deepEqual(calls.map(c=>c.path),['/api/commanders/me','/api/commanders','/api/commanders/me']);
  assert.deepEqual(calls[2].body,{avatar:25,xp:240,matches:6,wins:4});
  assert.equal(rankings.storedIdentity().id,replacement.id);assert.deepEqual(ctx.saved,profile);
  assert.equal((await rankings.ensureCommander(ctx)).token,newToken,'room creation can use the recovered identity');
});

test('concurrent 401 responses share one recovery registration and retain the replacement identity',async()=>{
  const rankings=await harness();let creates=0,oldRequests=0,newRequests=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  const ctx=context(async(path,body,token)=>{
    if(path==='/api/commanders'){creates++;await gate;return{commander:replacement,token:newToken};}
    if(token===oldToken){oldRequests++;throw httpError(401);}
    newRequests++;assert.equal(token,newToken);return{commander:{...replacement,...body}};
  });
  const requests=Array.from({length:8},()=>rankings.syncCommander(ctx));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(creates,1);assert.equal(oldRequests,8);
  release();const results=await Promise.all(requests);
  assert.equal(creates,1);assert.equal(newRequests,8);assert.ok(results.every(value=>value.id===replacement.id));
  assert.equal(rankings.storedIdentity().token,newToken);assert.deepEqual(ctx.saved,profile);
});

test('server outages and connection failures keep the cached identity and do not register another commander',async()=>{
  for(const failure of [httpError(503),new TypeError('Failed to fetch'),Object.assign(new Error('Timed out'),{name:'AbortError'})]){
    const rankings=await harness();let creates=0;
    const ctx=context(async(path)=>{if(path==='/api/commanders')creates++;throw failure;});
    await assert.rejects(rankings.syncCommander(ctx),error=>error===failure);
    assert.equal(creates,0);assert.deepEqual(rankings.storedIdentity(),previous);assert.deepEqual(ctx.saved,profile);
  }
});

test('a second 401 is surfaced after one retry and cannot recurse into endless registration',async()=>{
  const rankings=await harness();let creates=0,updates=0;
  const ctx=context(async path=>{if(path==='/api/commanders'){creates++;return{commander:replacement,token:newToken};}updates++;throw httpError(401);});
  await assert.rejects(rankings.syncCommander(ctx),error=>error.status===401);
  assert.equal(creates,1);assert.equal(updates,2);assert.equal(rankings.commanderIdentity().token,newToken);assert.deepEqual(ctx.saved,profile);
});

test('a late successful response from a rejected identity cannot overwrite its recovered replacement',async()=>{
  const rankings=await harness();let releaseOld,oldRequests=0;
  const oldResponse=new Promise(resolve=>{releaseOld=resolve;});
  const ctx=context(async(path,body,token)=>{
    if(path==='/api/commanders')return{commander:replacement,token:newToken};
    if(token===oldToken){if(++oldRequests===1)return oldResponse;throw httpError(401);}
    return{commander:{...replacement,...body}};
  });
  const delayed=rankings.syncCommander(ctx);await rankings.syncCommander(ctx);
  releaseOld({commander:{...previous,xp:0}});await delayed;
  assert.equal(rankings.commanderIdentity().id,replacement.id);assert.equal(rankings.storedIdentity().token,newToken);assert.deepEqual(ctx.saved,profile);
});
