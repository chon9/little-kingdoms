import { newGame, play } from '../shared/engine.js';

const ROOM_TTL = 12 * 60 * 60 * 1000;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function digest(token) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), n => n.toString(16).padStart(2, '0')).join(''); }
function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join(''); }
function randomCode() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(crypto.getRandomValues(new Uint8Array(6)), n => chars[n % 32]).join(''); }
function exposed(room, color, token) { const state=JSON.parse(room.state);return { code: room.code, state, version: room.version, ready: !!room.guestHash&&!state.roomClosed, phase:state.roomClosed?'closed':state.winner?'finished':room.guestHash?'playing':'waiting', hostColor:room.hostColor, color, level: room.level, ...(token ? { token } : {}) }; }
function commanderLevel(xp) { let level=1;while(level<50&&xp>=80*level+20*level**2)level++;return level; }
function publicCommander(row) { return {id:row.id,displayName:row.displayName,avatar:row.avatar,xp:row.xp,level:commanderLevel(row.xp),matches:row.matches,wins:row.wins,localWins:row.wins,localLosses:row.matches-row.wins,onlineWins:Number(row.onlineWins||0),onlineLosses:Number(row.onlineLosses||0)}; }
const validAvatar=value=>Number.isInteger(value)&&value>=0&&value<40;
const validCastle=value=>value===undefined||value==='classic'||typeof value==='string'&&/^c(?:0[1-9]|[12][0-9]|30)$/.test(value);
function cleanName(value) { if(typeof value!=='string')return null;const name=value.normalize('NFKC').replace(/[^\p{L}\p{N} ._'\-]/gu,'').replace(/\s+/g,' ').trim();return Array.from(name).length>=2&&Array.from(name).length<=20?name:null; }
function commanderBearer(request) { const value=request.headers.get('Authorization')||'';return value.startsWith('Bearer ')?value.slice(7):''; }
async function commanderForToken(store, token) { return typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)?store.commanderByHash(await digest(token)):null; }
const commanderCounts = "SELECT c.*, (SELECT COUNT(*) FROM online_results r WHERE r.commanderId=c.id AND r.won=1) AS onlineWins, (SELECT COUNT(*) FROM online_results r WHERE r.commanderId=c.id AND r.won=0) AS onlineLosses FROM commanders c";

// An accepted move must remain successful even when the result service is briefly
// unavailable. Subsequent authenticated room reads reconcile the append-only rows.
async function reconcileResult(store, state) {
  if(!state.winner||!store.recordResults||state.count[1]<2||state.count[2]<2)return;
  const blue=state.players?.[1]?.commanderId,orange=state.players?.[2]?.commanderId;
  if(!blue||!orange||blue===orange||!state.matchId)return;
  try { await store.recordResults([1,2].map(color=>({matchId:state.matchId,commanderId:state.players[color].commanderId,won:state.winner===color?1:0,completed:Date.now()}))); }
  catch { console.error('Leaderboard result recording deferred.'); }
}

export class D1Store {
  constructor(db) { this.db = db; }
  get(code) { return this.db.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first(); }
  async insert(room) {
    const r = await this.db.prepare('INSERT OR IGNORE INTO rooms (code, hostHash, guestHash, hostColor, level, state, version, expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(room.code, room.hostHash, null, room.hostColor, room.level, room.state, room.version, room.expires).run();
    return r.meta.changes === 1;
  }
  async join(code, version, hash, state) {
    const r = await this.db.prepare('UPDATE rooms SET guestHash = ?, state = ?, version = version + 1 WHERE code = ? AND version = ? AND guestHash IS NULL AND expires > ?').bind(hash, state, code, version, Date.now()).run();
    return r.meta.changes === 1;
  }
  async update(code, version, state) {
    const r = await this.db.prepare('UPDATE rooms SET state = ?, version = version + 1 WHERE code = ? AND version = ? AND expires > ?').bind(state, code, version, Date.now()).run();
    return r.meta.changes === 1;
  }
  commanderByHash(hash) { return this.db.prepare(commanderCounts+' WHERE c.tokenHash=?').bind(hash).first(); }
  async insertCommander(row) {
    await this.db.prepare('INSERT INTO commanders (id,tokenHash,displayName,avatar,xp,matches,wins,created) VALUES (?,?,?,?,0,0,0,?)').bind(row.id,row.tokenHash,row.displayName,row.avatar,row.created).run();
  }
  async updateCommander(id, value) {
    // Each input and stored row satisfies wins <= matches. Taking MAX for both
    // preserves that invariant, including updates racing from multiple tabs.
    await this.db.prepare('UPDATE commanders SET displayName=?,avatar=?,xp=MAX(xp,?),matches=MAX(matches,?),wins=MAX(wins,?) WHERE id=?').bind(value.displayName,value.avatar,value.xp,value.matches,value.wins,id).run();
  }
  async leaderboard(kind, limit) {
    const order=kind==='wins'?'onlineWins DESC,onlineLosses ASC,c.created ASC,c.id ASC':'c.xp DESC,c.wins DESC,c.created ASC,c.id ASC';
    const rows=await this.db.prepare(commanderCounts+' ORDER BY '+order+' LIMIT ?').bind(limit).all();return rows.results;
  }
  recordResults(results) { return this.db.batch(results.map(r=>this.db.prepare('INSERT OR IGNORE INTO online_results (matchId,commanderId,won,completed) VALUES (?,?,?,?)').bind(r.matchId,r.commanderId,r.won,r.completed))); }
}

const NATIVE_ORIGINS = new Set(['https://localhost','http://localhost','capacitor://localhost','app://kingdoms','https://kingdoms.local']);
export async function handleAPI(request, store) {
  const origin=request.headers.get('Origin'),sameOrigin=!origin||origin===new URL(request.url).origin,nativeOrigin=NATIVE_ORIGINS.has(origin);
  if(!sameOrigin&&!nativeOrigin)return json({error:'This client origin is not allowed.'},403);
  let response;
  if(request.method==='OPTIONS')response=new Response(null,{status:204});
  else response=await processAPI(request,store);
  if(nativeOrigin){
    const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type, Authorization');headers.set('Access-Control-Max-Age','600');headers.set('Vary','Origin');
    return new Response(response.body,{status:response.status,headers});
  }
  return response;
}

async function processAPI(request, store) {
  try {
    const url = new URL(request.url), path = url.pathname;
    if (!store) return json({ error: 'Online rooms are not configured on this host. Local PvP and bot battles are available.' }, 503);
    const isPost = request.method === 'POST';
    if (!isPost && request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    let body = {};
    if (isPost) {
      if (Number(request.headers.get('Content-Length')) > 2048) return json({ error: 'Request too large.' }, 413);
      const text = await request.text(); if (text.length > 2048) return json({ error: 'Request too large.' }, 413);
      try { body = JSON.parse(text || '{}'); } catch { return json({ error: 'Invalid request.' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request.' }, 400);
    }
    if(path==='/api/commanders'&&isPost){
      const displayName=cleanName(body.displayName);
      if(!displayName||!validAvatar(body.avatar===undefined?0:body.avatar))return json({error:'Use a name of 2–20 letters or numbers and a valid avatar.'},400);
      const token=randomToken(),row={id:crypto.randomUUID(),tokenHash:await digest(token),displayName,avatar:body.avatar??0,xp:0,matches:0,wins:0,created:Date.now()};
      await store.insertCommander(row);return json({commander:publicCommander(row),token},201);
    }
    if(path==='/api/commanders/me'){
      const current=await commanderForToken(store,commanderBearer(request));
      if(!current)return json({error:'Your commander identity is missing. Create a commander on this device.'},401);
      if(isPost){
        const value=Object.fromEntries(['displayName','avatar','xp','matches','wins'].map(key=>[key,body[key]===undefined?current[key]:body[key]]));value.displayName=cleanName(value.displayName);
        if(!value.displayName||!validAvatar(value.avatar)||!Number.isSafeInteger(value.xp)||value.xp<0||value.xp>10000000||!Number.isSafeInteger(value.matches)||value.matches<0||value.matches>1000000||!Number.isSafeInteger(value.wins)||value.wins<0||value.wins>value.matches)return json({error:'Choose valid commander details and progress totals.'},400);
        await store.updateCommander(current.id,value);
        return json({commander:publicCommander(await commanderForToken(store,commanderBearer(request)))});
      }
      return json({commander:publicCommander(current)});
    }
    if(path==='/api/leaderboard'&&!isPost){
      const kind=url.searchParams.get('kind')||'level',rawLimit=url.searchParams.get('limit'),limit=rawLimit===null?50:Number(rawLimit);
      if(!['level','wins'].includes(kind)||!Number.isInteger(limit)||limit<1||limit>100)return json({error:'Choose level or wins and a limit from 1 to 100.'},400);
      return json({kind,source:kind==='level'?'device-reported':'server-recorded',entries:(await store.leaderboard(kind,limit)).map(publicCommander)});
    }
    if (path === '/api/rooms' && isPost) {
      if (![1, 2].includes(body.hostColor) || !Number.isInteger(body.level) || body.level < 1 || body.level > 10) return json({ error: 'Choose a valid kingdom and level.' }, 400);
      if(body.avatar!==undefined&&!validAvatar(body.avatar)||!validCastle(body.castle))return json({error:'Choose a valid general avatar and castle.'},400);
      const commander=body.commanderToken===undefined?null:await commanderForToken(store,body.commanderToken);
      if(body.commanderToken!==undefined&&!commander)return json({error:'Your commander identity could not be verified.'},401);
      const token = randomToken(), hostHash = await digest(token);
      for (let i = 0; i < 4; i++) {
        const state={...newGame('literal'),matchId:crypto.randomUUID(),players:{[body.hostColor]:{avatar:body.avatar??commander?.avatar??(body.hostColor===1?0:10),castle:body.castle??'classic',...(commander?{commanderId:commander.id,displayName:commander.displayName}:{})}}};
        const room = { code: randomCode(), hostHash, guestHash: null, hostColor: body.hostColor, level: body.level, state: JSON.stringify(state), version: 0, expires: Date.now() + ROOM_TTL };
        if (await store.insert(room)) return json(exposed(room, room.hostColor, token), 201);
      }
      return json({ error: 'Could not create a room. Please try again.' }, 503);
    }
    const match = path.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(join|move|leave))?$/);
    if (!match) return json({ error: 'Room endpoint not found.' }, 404);
    const [, code, command] = match, room = await store.get(code);
    if (!room || room.expires <= Date.now()) return json({ error: 'Room not found or expired. Check the code or create a new room.' }, 404);
    if (command === 'join' && isPost) {
      if (JSON.parse(room.state).roomClosed) return json({error:'This room was closed by its host. Create or join another room.'},410);
      if (room.guestHash) return json({ error: 'This room already has two commanders.' }, 409);
      if(body.avatar!==undefined&&!validAvatar(body.avatar)||!validCastle(body.castle))return json({error:'Choose a valid general avatar and castle.'},400);
      const commander=body.commanderToken===undefined?null:await commanderForToken(store,body.commanderToken);
      if(body.commanderToken!==undefined&&!commander)return json({error:'Your commander identity could not be verified.'},401);
      const token = randomToken(), hash = await digest(token);
      const state=JSON.parse(room.state),color=3-room.hostColor;state.players={...state.players,[color]:{avatar:body.avatar??commander?.avatar??(color===1?0:10),castle:body.castle??'classic',...(commander?{commanderId:commander.id,displayName:commander.displayName}:{})}};const serialized=JSON.stringify(state);
      if (!await store.join(code, room.version, hash, serialized)) return json({ error: 'Another commander just took that seat. Create a fresh room.' }, 409);
      return json(exposed({ ...room, state:serialized, guestHash: hash, version: room.version + 1 }, color, token));
    }
    const bearer = request.headers.get('Authorization') || '';
    const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'Rejoin this room from your original tab.' }, 401);
    const hash = await digest(token), color = hash === room.hostHash ? room.hostColor : hash === room.guestHash ? 3 - room.hostColor : null;
    if (!color) return json({ error: 'You are not a commander in this room.' }, 403);
    if (!command && request.method === 'GET') { await reconcileResult(store,JSON.parse(room.state));return json(exposed(room, color)); }
    if (command === 'leave' && isPost) {
      const state=JSON.parse(room.state);
      if(state.winner||state.roomClosed)return json(exposed(room,color));
      if(!Number.isInteger(body.version)||body.version!==room.version)return json({error:'The room changed. Check the lobby before leaving.'},409);
      // Cancelling a waiting room earns no winner or rewards. A live departure
      // is a resignation, even before the first move or on the rival's turn.
      const next=room.guestHash?play({...state,turn:color},'resign'):{...state,roomClosed:true};
      const serialized=JSON.stringify(next);
      if(!await store.update(code,room.version,serialized))return json({error:'The room changed. Check the lobby before leaving.'},409);
      await reconcileResult(store,next);
      return json(exposed({...room,state:serialized,version:room.version+1},color));
    }
    if (command !== 'move' || !isPost) return json({ error: 'Method not allowed.' }, 405);
    if (JSON.parse(room.state).roomClosed) return json({error:'This room was closed by its host. Create or join another room.'},410);
    if (!room.guestHash) return json({ error: 'Wait for your rival to join.' }, 409);
    if (!Number.isInteger(body.version) || body.version !== room.version) return json({ error: 'The board changed. Refreshing your battlefield.' }, 409);
    if (body.action !== 'pass' && body.action !== 'resign' && (!Number.isInteger(body.action) || body.action < 0 || body.action > 80)) return json({ error: 'Choose a valid move.' }, 400);
    const state = JSON.parse(room.state);
    if (state.winner) return json({ error: 'This battle has ended.' }, 409);
    if (body.action !== 'resign' && state.turn !== color) return json({ error: 'Wait for your turn.' }, 409);
    let next;
    try { next = play(body.action === 'resign' ? { ...state, turn: color } : state, body.action); }
    catch (e) { return json({ error: e.message }, 422); }
    const serialized = JSON.stringify(next);
    if (!await store.update(code, room.version, serialized)) return json({ error: 'A move arrived first. Refreshing your battlefield.' }, 409);
    await reconcileResult(store,next);
    return json(exposed({ ...room, state: serialized, version: room.version + 1 }, color));
  } catch (error) {
    console.error('Room service error:', error?.message);
    return json({ error: 'The room service is temporarily unavailable. Your local modes are ready to play.' }, 503);
  }
}
