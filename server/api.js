import { newGame, play } from '../shared/engine.js';

const ROOM_TTL = 12 * 60 * 60 * 1000;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function digest(token) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), n => n.toString(16).padStart(2, '0')).join(''); }
function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join(''); }
function randomCode() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(crypto.getRandomValues(new Uint8Array(6)), n => chars[n % 32]).join(''); }
function exposed(room, color, token) { return { code: room.code, state: JSON.parse(room.state), version: room.version, ready: !!room.guestHash, color, level: room.level, ...(token ? { token } : {}) }; }

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
    if (path === '/api/rooms' && isPost) {
      if (![1, 2].includes(body.hostColor) || !Number.isInteger(body.level) || body.level < 1 || body.level > 10) return json({ error: 'Choose a valid kingdom and level.' }, 400);
      if(body.avatar!==undefined&&(!Number.isInteger(body.avatar)||body.avatar<0||body.avatar>=40))return json({error:'Choose a valid general avatar.'},400);
      const token = randomToken(), hostHash = await digest(token);
      for (let i = 0; i < 4; i++) {
        const state={...newGame('literal'),matchId:crypto.randomUUID(),players:{[body.hostColor]:{avatar:body.avatar??(body.hostColor===1?0:10)}}};
        const room = { code: randomCode(), hostHash, guestHash: null, hostColor: body.hostColor, level: body.level, state: JSON.stringify(state), version: 0, expires: Date.now() + ROOM_TTL };
        if (await store.insert(room)) return json(exposed(room, room.hostColor, token), 201);
      }
      return json({ error: 'Could not create a room. Please try again.' }, 503);
    }
    const match = path.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(join|move))?$/);
    if (!match) return json({ error: 'Room endpoint not found.' }, 404);
    const [, code, command] = match, room = await store.get(code);
    if (!room || room.expires <= Date.now()) return json({ error: 'Room not found or expired. Check the code or create a new room.' }, 404);
    if (command === 'join' && isPost) {
      if (room.guestHash) return json({ error: 'This room already has two commanders.' }, 409);
      if(body.avatar!==undefined&&(!Number.isInteger(body.avatar)||body.avatar<0||body.avatar>=40))return json({error:'Choose a valid general avatar.'},400);
      const token = randomToken(), hash = await digest(token);
      const state=JSON.parse(room.state),color=3-room.hostColor;state.players={...state.players,[color]:{avatar:body.avatar??(color===1?0:10)}};const serialized=JSON.stringify(state);
      if (!await store.join(code, room.version, hash, serialized)) return json({ error: 'Another commander just took that seat. Create a fresh room.' }, 409);
      return json(exposed({ ...room, state:serialized, guestHash: hash, version: room.version + 1 }, color, token));
    }
    const bearer = request.headers.get('Authorization') || '';
    const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'Rejoin this room from your original tab.' }, 401);
    const hash = await digest(token), color = hash === room.hostHash ? room.hostColor : hash === room.guestHash ? 3 - room.hostColor : null;
    if (!color) return json({ error: 'You are not a commander in this room.' }, 403);
    if (!command && request.method === 'GET') return json(exposed(room, color));
    if (command !== 'move' || !isPost) return json({ error: 'Method not allowed.' }, 405);
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
    return json(exposed({ ...room, state: serialized, version: room.version + 1 }, color));
  } catch (error) {
    console.error('Room service error:', error?.message);
    return json({ error: 'The room service is temporarily unavailable. Your local modes are ready to play.' }, 503);
  }
}
