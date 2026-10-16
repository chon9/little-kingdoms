import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { handleAPI } from '../server/api.js';

await mkdir('data',{recursive:true});
let rooms = new Map();
try {rooms = new Map(JSON.parse(await readFile('data/rooms.json','utf8')));}catch{}
let commanders=new Map(),results=new Map();
try {const saved=JSON.parse(await readFile('data/community.json','utf8'));commanders=new Map(saved.commanders);results=new Map(saved.results);}catch{}
let writes=Promise.resolve();
function persist(){const content=JSON.stringify([...rooms]);writes=writes.catch(()=>{}).then(()=>writeFile('data/rooms.json',content));return writes;}
function persistCommunity(){const content=JSON.stringify({commanders:[...commanders],results:[...results]});writes=writes.catch(()=>{}).then(()=>writeFile('data/community.json',content));return writes;}
function withResults(row){if(!row)return null;const matches=[...results.values()].filter(r=>r.commanderId===row.id);return{...row,onlineWins:matches.filter(r=>r.won===1).length,onlineLosses:matches.filter(r=>r.won===0).length};}
const store={
  async get(code){const r=rooms.get(code);return r?{...r}:null;},
  async insert(room){if(rooms.has(room.code))return false;rooms.set(room.code,{...room});await persist();return true;},
  async join(code,version,hash,state){const r=rooms.get(code);if(!r||r.version!==version||r.guestHash||r.expires<=Date.now())return false;r.guestHash=hash;r.state=state;r.version++;await persist();return true;},
  async update(code,version,state){const r=rooms.get(code);if(!r||r.version!==version||r.expires<=Date.now())return false;r.state=state;r.version++;await persist();return true;},
  async markResultRecorded(code,version,matchId){const row=rooms.get(code);if(!row||row.version!==version)return;const state=JSON.parse(row.state);if(state.matchId!==matchId)return;state._resultSaved=matchId;row.state=JSON.stringify(state);await persist();},
  async commanderByHash(hash){return withResults([...commanders.values()].find(c=>c.tokenHash===hash));},
  async insertCommander(row){commanders.set(row.id,{...row});await persistCommunity();},
  async updateCommander(id,value){const row=commanders.get(id);Object.assign(row,{...value,xp:Math.max(row.xp,value.xp),matches:Math.max(row.matches,value.matches),wins:Math.max(row.wins,value.wins)});await persistCommunity();},
  async leaderboard(kind,limit){return [...commanders.values()].map(withResults).sort((a,b)=>(kind==='wins'?b.onlineWins-a.onlineWins||a.onlineLosses-b.onlineLosses:b.xp-a.xp||b.wins-a.wins)||a.created-b.created||a.id.localeCompare(b.id)).slice(0,limit);},
  async recordResults(entries){for(const row of entries){const key=row.matchId+':'+row.commanderId;if(!results.has(key))results.set(key,{...row});}await persistCommunity();}
};
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.mp3':'audio/mpeg','.pdf':'application/pdf','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const port=Number(process.env.PORT||4173);
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost:'+port);
    if(url.pathname.startsWith('/api/')){
      const parts=[];let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>2048){res.writeHead(413);res.end();return;}parts.push(chunk);}
      const host=req.headers.host||'localhost:'+port;
      const request=new Request('http://'+host+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(parts)})});
      const response=await handleAPI(request,store);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const requested=decodeURIComponent(url.pathname), root=path.resolve('public');
    const file=requested==='/engine.js'||requested==='/ai.js'?path.resolve('shared',requested.slice(1)):path.resolve(root,'.'+(requested==='/'?'/index.html':requested));
    if(!file.startsWith(root+path.sep)&&!['engine.js','ai.js'].some(n=>file===path.resolve('shared',n))){res.writeHead(403);res.end();return;}
    const content=await readFile(file);res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end(error.code==='ENOENT'?'Not found':'Server error');}
});
server.listen(port,'0.0.0.0',()=>console.log(`Little Kingdoms ready at http://localhost:${port}`));
