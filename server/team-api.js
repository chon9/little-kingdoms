import {seatSkill} from './seat-skill.js';
import {newTeamGame,playTeam,teamColor,TEAM_SEATS,teamRepresentatives,rematchTeam} from '../shared/teams.js';

const TEAM_TTL=12*60*60*1000;
const teamJSON=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const teamToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
const teamDigest=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');
const teamCode=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>chars[n%chars.length]).join('');};
function teamAppearance(body){
  const avatar=body.avatar===undefined?0:body.avatar,castle=body.castle===undefined?'classic':body.castle;
  if(!Number.isInteger(avatar)||avatar<0||avatar>=60||typeof castle!=='string'||! /^(classic|c(?:0[1-9]|[1-4]\d|50))$/.test(castle))throw new Error('Choose a valid general avatar and castle.');
  const name=typeof body.displayName==='string'?body.displayName.normalize('NFKC').replace(/[^\p{L}\p{N} ._'\-]/gu,'').trim().slice(0,20):'Commander';
  return{avatar,castle,displayName:name||'Commander',...seatSkill(body)};
}
function exposeTeam(room,seat,token){
  const state=JSON.parse(room.state);for(const key of Object.keys(state))if(key.startsWith('_'))delete state[key];
  return{code:room.code,seat,color:teamColor(state,seat),hostColor:state.team1Color,level:5,version:room.version,state,mode:'teams',ready:!!state.launched&&!state.roomClosed,phase:state.roomClosed?'closed':state.winner?'finished':state.launched?'playing':'waiting',...(token?{token}:{})};
}
export async function handleTeamRoom(request,url,body,store){
  const post=request.method==='POST';
  if(url.pathname==='/api/team-rooms'&&post){
    if(![1,2].includes(body.hostColor))return teamJSON({error:'Choose Blue or Orange.'},400);
    let player;try{player=teamAppearance(body);}catch(error){return teamJSON({error:error.message},400);}
    const token=teamToken(),hash=await teamDigest(token);
    for(let n=0;n<4;n++){const state={...newTeamGame(body.hostColor,{1:player}),matchId:crypto.randomUUID(),_seatHashes:{1:hash}};const room={code:teamCode(),hostHash:hash,guestHash:null,hostColor:body.hostColor,level:5,state:JSON.stringify(state),version:0,expires:Date.now()+TEAM_TTL};if(await store.insert(room))return teamJSON(exposeTeam(room,1,token),201);}
    return teamJSON({error:'Could not create a room. Please try again.'},503);
  }
  const match=url.pathname.match(/^\/api\/team-rooms\/([A-Z0-9]{6})(?:\/(join|move|leave|rematch))?$/);if(!match)return teamJSON({error:'Room endpoint not found.'},404);
  const[,code,command]=match,room=await store.get(code);if(!room||room.expires<=Date.now())return teamJSON({error:'Room not found or expired. Check the code or create a new room.'},404);
  const state=JSON.parse(room.state);if(state.mode!=='teams')return teamJSON({error:'This code belongs to a 1v1 duel. Choose Online duel to join it.'},409);
  if(command==='join'&&post){
    if(state.roomClosed)return teamJSON({error:'This room was closed by its host. Create or join another room.'},410);
    if(state.launched)return teamJSON({error:'This team battle has already started.'},409);
    const seat=body.seat??[2,3,4].find(s=>!state.teamPlayers[s]);if(![2,3,4].includes(seat)||state.teamPlayers[seat])return teamJSON({error:'That team seat is already occupied. Choose another seat.'},409);
    let player;try{player=teamAppearance(body);}catch(error){return teamJSON({error:error.message},400);}
    const token=teamToken(),hash=await teamDigest(token),next={...state,teamPlayers:{...state.teamPlayers,[seat]:player},_seatHashes:{...state._seatHashes,[seat]:hash}};next.players=teamRepresentatives(next);next.launched=TEAM_SEATS.every(s=>next.teamPlayers[s]);
    const serialized=JSON.stringify(next);if(!await store.update(code,room.version,serialized))return teamJSON({error:'The room changed. Try joining again.'},409);
    return teamJSON(exposeTeam({...room,state:serialized,version:room.version+1},seat,token));
  }
  const bearer=request.headers.get('Authorization')||'',token=bearer.startsWith('Bearer ')?bearer.slice(7):'';if(!/^[a-f0-9]{64}$/.test(token))return teamJSON({error:'Rejoin this room from your original tab.'},401);
  const hash=await teamDigest(token),seat=TEAM_SEATS.find(s=>state._seatHashes?.[s]===hash);if(!seat)return teamJSON({error:'You are not a commander in this room.'},403);
  if(!command&&request.method==='GET'){const data=exposeTeam(room,seat),since=url.searchParams.get('since');if(since!==null&&/^\d+$/.test(since)&&Number(since)===room.version){delete data.state;data.unchanged=true;}return teamJSON(data);}
  if(!post)return teamJSON({error:'Method not allowed.'},405);
  if(command==='move'&&typeof body.moveId==='string'){
    const receipt=state._moveReceipts?.find(r=>r.id===body.moveId&&r.matchId===body.matchId);
    if(receipt){if(receipt.seat!==seat||receipt.action!==body.action)return teamJSON({error:'Choose a valid move request.'},400);return teamJSON(exposeTeam(room,seat));}
  }
  if(body.version!==room.version)return teamJSON({error:'The battlefield changed. Retry your move.'},409);
  let next;
  if(command==='leave'){
    if(state.roomDeparted?.includes(seat)||state.roomClosed)return teamJSON(exposeTeam(room,seat));
    if(!state.launched){if(seat===1)next={...state,roomClosed:true};else{next=structuredClone(state);delete next.teamPlayers[seat];delete next._seatHashes[seat];next.players=teamRepresentatives(next);}}
    else next={...(state.winner?state:playTeam(state,'resign',seat)),roomDeparted:[...(state.roomDeparted||[]),seat],rematch:null};
  }else if(command==='move'){
    if(state.roomClosed)return teamJSON({error:'This room was closed by its host. Create or join another room.'},410);
    if(!state.launched)return teamJSON({error:'Wait for all four commanders to join.'},409);
    if(state.roomDeparted?.length)return teamJSON({error:'A commander left this room. Create a new room to play again.'},409);
    if(body.matchId!==state.matchId||typeof body.moveId!=='string'||! /^[0-9a-f-]{36}$/.test(body.moveId))return teamJSON({error:'Choose a valid move request.'},400);
    if(body.action!=='pass'&&body.action!=='resign'&&(!Number.isInteger(body.action)||body.action<0||body.action>80))return teamJSON({error:'Choose a square on the board.'},400);
    try{next=playTeam(state,body.action,seat);}catch(error){return teamJSON({error:error.message},seat!==state.turnSeat&&body.action!=='resign'?409:422);}
    next._moveReceipts=[...(state._moveReceipts||[]),{id:body.moveId,seat,matchId:state.matchId,action:body.action}].slice(-32);
  }else if(command==='rematch'){
    const offer=state.rematch;if(!state.launched||!state.winner)return teamJSON({error:'Finish the current duel before requesting a rematch.'},409);
    if(state.roomDeparted?.length||state.roomClosed)return teamJSON({error:'A commander left this room. Create a new room to play again.'},409);
    if(body.matchId!==state.matchId)return teamJSON({error:'This rematch belongs to an older duel. Refresh the room.'},409);
    if(['request','accept'].includes(body.action)){state._nextSkills={...state._nextSkills,[seat]:seatSkill(body)};}
    if(body.action==='request'){
      if(offer?.status==='pending')return teamJSON({error:'A rematch request is already open.'},409);
      next={...state,rematch:{id:crypto.randomUUID(),status:'pending',accepted:[seat]}};
    }else{
      if(offer?.status!=='pending'||offer.id!==body.offerId)return teamJSON({error:'This rematch request has changed.'},409);
      if(body.action==='accept'){
        const accepted=[...new Set([...offer.accepted,seat])];next=accepted.length===4?{...rematchTeam({...state,teamPlayers:Object.fromEntries(TEAM_SEATS.map(s=>[s,{...state.teamPlayers[s],...state._nextSkills?.[s]}]))}),matchId:crypto.randomUUID(),launched:true,_seatHashes:state._seatHashes}:{...state,rematch:{...offer,accepted}};
      }else if(body.action==='cancel'&&offer.accepted.includes(seat)||body.action==='decline'&&!offer.accepted.includes(seat))next={...state,rematch:{...offer,status:body.action==='cancel'?'cancelled':'declined',accepted:[],by:seat}};
      else return teamJSON({error:'Choose a valid rematch action.'},400);
    }
  }else return teamJSON({error:'Method not allowed.'},405);
  const serialized=JSON.stringify(next);if(!await store.update(code,room.version,serialized))return teamJSON({error:'The room changed. Try again.'},409);
  return teamJSON(exposeTeam({...room,state:serialized,version:room.version+1},seat));
}
