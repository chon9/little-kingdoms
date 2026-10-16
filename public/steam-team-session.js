import {newTeamGame,playTeam,teamColor,rematchTeam} from './teams.js';

const steamTeamID=value=>typeof value==='string'&&/^\d{17,20}$/.test(value);
const steamTeamToken=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(value);
const steamTeamClone=value=>JSON.parse(JSON.stringify(value));
function steamTeamAppearance(value={}){if(!value||typeof value!=='object')value={};return{...(typeof value.skillRating==='number'&&Number.isFinite(value.skillRating)&&value.skillRating>=0&&value.skillRating<=5000&&Number.isSafeInteger(value.skillGames)&&value.skillGames>=0&&value.skillGames<=1000000?{skillRating:value.skillRating,skillGames:value.skillGames}:{}),avatar:Number.isInteger(value.avatar)&&value.avatar>=0&&value.avatar<60?value.avatar:0,castle:/^(classic|c(?:0[1-9]|[1-4]\d|50))$/.test(value.castle)?value.castle:'classic'};}
export class SteamTeamSession{
  constructor({bridge,identity,profile,onUpdate=()=>{},onError=()=>{},now=()=>Date.now(),uuid=()=>crypto.randomUUID(),autoTick=true}){
    Object.assign(this,{bridge,identity,onUpdate,onError,now,uuid});this.profile=steamTeamAppearance(profile);this.members=[];this.ids=[];this.profiles=new Map([[identity.id,this.profile]]);this.seen=new Map();this.commands=new Map();this.consents=new Set();this.receipts=[];this.seq=0;this.team1Color=1;this.ready=false;this.hostConnected=false;this.closed=false;this.error='';this.unsubscribe=bridge.on(e=>this.event(e));if(autoTick)this.timer=setInterval(()=>this.tick(),1500);
  }
  get isHost(){return this.host===this.identity.id;}
  get seat(){return this.ids.indexOf(this.identity.id)+1||1;}
  get color(){return this.seat<=2?this.team1Color:3-this.team1Color;}
  get connected(){return this.ready&&!this.error&&(this.isHost?this.ids.every(id=>id===this.identity.id||this.now()-(this.seen.get(id)||0)<=15000):this.hostConnected&&this.now()-(this.seen.get(this.host)||0)<=15000);}
  check(result){if(!result?.ok)throw new Error(result?.error||'Steam connection interrupted.');}
  async create(color=1){this.team1Color=color===2?2:1;this.expectLobby=true;this.check(await this.bridge.create({mode:'teams'}));}
  async join(id){if(!steamTeamID(id))throw new Error('Enter the complete numeric Steam lobby ID.');this.expectLobby=true;this.check(await this.bridge.join(id,'teams'));}
  update(){if(this.lobby)this.onUpdate({code:this.lobby,seat:this.seat,color:this.color,hostColor:this.team1Color,version:this.seq,ready:this.ready,connected:this.connected,error:this.error,mode:'teams',state:steamTeamClone(this.state||newTeamGame(this.team1Color))});}
  async send(to,kind,data={}){if(!to||this.closed)return;const payload=JSON.stringify({game:'little-kingdoms',format:'teams',v:2,lobby:this.lobby,kind,...data});if(new TextEncoder().encode(payload).length>24576)throw new Error('Steam game message exceeds its size limit.');this.check(await this.bridge.send(to,payload));}
  transmit(to,kind,data={}){this.send(to,kind,data).catch(()=>{if(!this.closed){this.error='Steam is reconnecting. Your confirmed castles are preserved.';this.update();}});}
  broadcast(kind,data={}){for(const member of this.members)if(member.id!==this.identity.id)this.transmit(member.id,kind,data);}
  event(event){
    if(this.closed)return;
    if(event.type==='error'){this.onError(event.error);return;}
    if(event.type==='connection'){this.seen.set(event.from,0);this.error='Steam is reconnecting. Your confirmed castles are preserved.';this.update();return;}
    if(event.type==='lobby'){
      if(!steamTeamID(event.lobby)||!steamTeamID(event.host)||!Array.isArray(event.members)||event.members.length>4||event.members.some(m=>!steamTeamID(m.id))||!event.members.some(m=>m.id===this.identity.id)||event.mode&&event.mode!=='teams')return;
      if(this.lobby&&this.lobby!==event.lobby||!this.lobby&&!this.expectLobby)return;
      this.lobby=event.lobby;this.host=event.host;this.members=event.members.map(m=>({id:m.id,name:String(m.name||'Steam commander').slice(0,40)}));
      if(event.hostPresent===false||this.ready&&this.ids.some(id=>!this.members.some(m=>m.id===id))){this.departed(this.ids.find(id=>!this.members.some(m=>m.id===id))||this.host);return;}
      if(this.isHost&&!this.ready)this.assignWaiting();else this.update();
      if(this.isHost)this.broadcast('hello',{profile:this.profile});else this.transmit(this.host,'hello',{profile:this.profile});return;
    }
    if(event.type!=='packet'||!this.members.some(m=>m.id===event.from)||typeof event.payload!=='string'||event.payload.length>24576)return;
    let message;try{message=JSON.parse(event.payload);}catch{return;}
    if(message?.game!=='little-kingdoms'||message.v!==2||message.format!=='teams'||message.lobby!==this.lobby)return;
    if(!this.isHost&&event.from!==this.host)return;
    this.seen.set(event.from,this.now());this.error='';
    try{
      if(message.kind==='hello'){
        if(this.isHost){if(!this.ready){this.profiles.set(event.from,steamTeamAppearance(message.profile));this.assignWaiting();}this.snapshot();}
        else this.transmit(this.host,'hello',{profile:this.profile});
      }else if(message.kind==='ping'){if(!this.isHost)this.transmit(this.host,'pong');}
      else if(message.kind==='sync'&&this.isHost)this.snapshot();
      else if(message.kind==='snapshot'&&!this.isHost)this.acceptSnapshot(message);
      else if(message.kind==='roster'&&!this.isHost&&!this.ready)this.acceptRoster(message);
      else if(message.kind==='command'&&this.isHost)this.handleCommand(message.command,this.ids.indexOf(event.from)+1);
      else if(message.kind==='reject'&&!this.isHost){const pending=this.commands.get(message.id);if(pending){this.commands.delete(message.id);pending.reject(new Error(String(message.error||'Steam command rejected.').slice(0,180)));}}
      else if(message.kind==='bye'){if(this.isHost)this.broadcast('bye',{left:event.from});this.departed(message.left||event.from);return;}
      this.update();
    }catch(error){this.error=error instanceof TypeError?'Invalid Steam game message. Leave and create a new room.':error.message;this.update();this.onError(this.error);}
  }
  assignWaiting(){
    this.ids=[this.host,...this.members.filter(m=>m.id!==this.host).map(m=>m.id)];const players={};for(let i=0;i<this.ids.length;i++){const id=this.ids[i],profile=this.profiles.get(id);if(profile)players[i+1]={...profile,displayName:this.members.find(m=>m.id===id)?.name||'Steam commander'};}
    const id=this.state?.matchId||this.uuid();this.state={...newTeamGame(this.team1Color,players),matchId:id};this.seq++;if(this.ids.length===4&&this.ids.every(id=>this.profiles.has(id))){this.ready=true;this.state.launched=true;this.snapshot();}else this.broadcast('roster',{seq:this.seq,matchId:id,team1Color:this.team1Color,ids:this.ids,players});this.update();
  }
  acceptRoster(message){
    if(!Number.isSafeInteger(message.seq)||message.seq<this.seq||!steamTeamToken(message.matchId)||![1,2].includes(message.team1Color)||!Array.isArray(message.ids)||message.ids.length>4||new Set(message.ids).size!==message.ids.length||message.ids[0]!==this.host||!message.ids.includes(this.identity.id)||message.ids.some(id=>!this.members.some(m=>m.id===id)))return;
    const players={};for(let i=0;i<message.ids.length;i++){const profile=message.players?.[i+1];if(profile&&typeof profile.displayName==='string')players[i+1]={...steamTeamAppearance(profile),displayName:profile.displayName.slice(0,40)};}
    this.ids=message.ids;this.team1Color=message.team1Color;this.seq=message.seq;this.state={...newTeamGame(this.team1Color,players),matchId:message.matchId};
  }
  snapshot(){if(!this.isHost||!this.ready)return;this.broadcast('snapshot',{seq:this.seq,matchId:this.state.matchId,team1Color:this.team1Color,ids:this.ids,players:this.state.teamPlayers,actions:this.state.history,rematch:this.state.rematch||null,acks:this.receipts,proof:this.proof||null,connected:this.ids.every(id=>id===this.identity.id||this.now()-(this.seen.get(id)||0)<=15000)});}
  acceptSnapshot(message){
    if(!Number.isSafeInteger(message.seq)||message.seq<this.seq||!steamTeamToken(message.matchId)||![1,2].includes(message.team1Color)||!Array.isArray(message.ids)||message.ids.length!==4||new Set(message.ids).size!==4||message.ids[0]!==this.host||message.ids.some(id=>!this.members.some(m=>m.id===id))||!Array.isArray(message.actions)||message.actions.length>400)return;
    const same=this.state?.matchId===message.matchId;
    if(this.ready&&JSON.stringify(this.ids)!==JSON.stringify(message.ids))throw new Error('Steam team seats changed. Create a new room.');
    if(this.ready&&!same){const p=message.proof;if(!this.state.winner||message.team1Color!==3-this.team1Color||p?.matchId!==this.state.matchId||!this.consents.has(p.offerId)||!Array.isArray(p.accepted)||p.accepted.join(',')!=='1,2,3,4')throw new Error('A team rematch requires all four commanders to accept.');}
    if(same&&(this.team1Color!==message.team1Color||message.actions.length<this.state.history.length||JSON.stringify(message.actions.slice(0,this.state.history.length))!==JSON.stringify(this.state.history)))throw new Error('Steam history mismatch. Leave and create a new room.');
    const players={};for(const seat of[1,2,3,4]){const profile=message.players?.[seat];if(!profile||typeof profile.displayName!=='string')return;players[seat]={...steamTeamAppearance(profile),displayName:profile.displayName.slice(0,40)};}
    let next=newTeamGame(message.team1Color,players);for(const entry of message.actions){if(!entry||typeof entry!=='object')return;next=playTeam(next,entry.index,entry.seat);}
    const offer=message.rematch;if(offer){if(!next.winner||!steamTeamToken(offer.id)||!['pending','cancelled','declined'].includes(offer.status)||!Array.isArray(offer.accepted)||offer.accepted.some(s=>![1,2,3,4].includes(s)))return;const own=message.ids.indexOf(this.identity.id)+1;if(offer.accepted.includes(own)&&!this.consents.has(offer.id))throw new Error('Your Steam rematch consent was not recorded.');}
    this.ids=message.ids;this.team1Color=message.team1Color;this.state={...next,matchId:message.matchId,launched:true,...(offer?{rematch:steamTeamClone(offer)}:{})};this.seq=message.seq;this.ready=true;this.hostConnected=message.connected===true;
    for(const id of Array.isArray(message.acks)?message.acks:[]){const pending=this.commands.get(id);if(pending){this.commands.delete(id);pending.resolve();}}
  }
  handleCommand(command,seat){
    if(!command||!steamTeamToken(command.id)||![1,2,3,4].includes(seat)||!this.connected)return;
    if(this.receipts.includes(command.id)){this.snapshot();return;}
    try{
      if(command.matchId!==this.state.matchId)throw new Error('This Steam match has already changed.');
      if(command.kind==='move'){if(command.ply!==this.state.ply)throw new Error('The battlefield changed. Retry your move.');this.state=playTeam(this.state,command.action,seat);}
      else if(command.kind==='rematch')this.applyRematch(command,seat);else throw new Error('Unknown Steam game command.');
      this.receipts=[...this.receipts,command.id].slice(-40);this.seq++;this.update();this.snapshot();
    }catch(error){if(seat===1)throw error;this.transmit(this.ids[seat-1],'reject',{id:command.id,error:error.message});this.snapshot();}
  }
  applyRematch(command,seat){
    if(!this.state.winner||this.state.roomDeparted?.length)throw new Error('Finish this duel before requesting a rematch.');const offer=this.state.rematch;
    if(command.profile&&['request','accept'].includes(command.action))this.nextProfiles={...this.nextProfiles,[seat]:steamTeamAppearance(command.profile)};
    if(command.action==='request'){if(offer?.status==='pending'||!steamTeamToken(command.offerId))throw new Error('A rematch request is already open.');this.state={...this.state,rematch:{id:command.offerId,status:'pending',accepted:[seat]}};}
    else{if(offer?.status!=='pending'||offer.id!==command.offerId)throw new Error('This rematch request has changed.');
      if(command.action==='accept'){const accepted=[...new Set([...offer.accepted,seat])].sort();if(accepted.length===4){this.proof={matchId:this.state.matchId,offerId:offer.id,accepted};this.state={...rematchTeam({...this.state,teamPlayers:Object.fromEntries([1,2,3,4].map(s=>[s,{...this.state.teamPlayers[s],...this.nextProfiles?.[s]}]))}),matchId:this.uuid(),launched:true};this.team1Color=this.state.team1Color;this.receipts=[];this.nextProfiles={};}else this.state={...this.state,rematch:{...offer,accepted}};}
      else if(command.action==='cancel'&&offer.accepted.includes(seat)||command.action==='decline'&&!offer.accepted.includes(seat))this.state={...this.state,rematch:{...offer,status:command.action==='cancel'?'cancelled':'declined',accepted:[],by:seat}};else throw new Error('Choose a valid rematch action.');
    }
  }
  async command(data){if(!this.connected||this.closed||this.state?.roomDeparted?.length)throw new Error('Wait for all four Steam commanders to connect.');if(this.commands.size)throw new Error('Wait for Steam to confirm your previous action.');const command={...data,id:this.uuid(),matchId:this.state.matchId,ply:this.state.ply};if(this.isHost){this.handleCommand(command,1);return;}return new Promise((resolve,reject)=>{this.commands.set(command.id,{command,resolve,reject,at:this.now(),sent:this.now()});this.transmit(this.host,'command',{command});});}
  act(action){return this.command({kind:'move',action});}
  rematch(action){const offerId=action==='request'?this.uuid():this.state?.rematch?.id;if(action==='request'||action==='accept')this.consents.add(offerId);return this.command({kind:'rematch',action,offerId,profile:this.profile});}
  tick(){
    if(this.closed||!this.lobby||this.state?.roomDeparted?.length)return;
    if(!this.ready){if(!this.isHost)this.transmit(this.host,'hello',{profile:this.profile});return;}
    if(this.isHost){this.broadcast('ping');this.snapshot();}else{this.transmit(this.host,'sync');this.transmit(this.host,'pong');}
    this.update();for(const[id,pending]of this.commands){if(this.now()-pending.at>20000){this.commands.delete(id);pending.reject(new Error('Steam has not confirmed your action. Check the battlefield before retrying.'));}else if(this.now()-pending.sent>1500){pending.sent=this.now();this.transmit(this.host,'command',{command:pending.command});}}
  }
  departed(id){if(this.ready&&!this.state.winner){const seat=this.ids.indexOf(id)+1||([1,2,3,4].find(s=>s!==this.seat)||1);this.state={...playTeam(this.state,'resign',seat),steamAborted:true,roomDeparted:[seat]};}else if(this.state)this.state={...this.state,roomDeparted:[this.ids.indexOf(id)+1||1]};this.error='A Steam commander left. Create a new team room.';for(const pending of this.commands.values())pending.reject(new Error('The Steam room closed.'));this.commands.clear();this.update();}
  async leave(){if(this.closed)return;try{if(this.isHost)await Promise.all(this.members.filter(m=>m.id!==this.identity.id).map(m=>this.send(m.id,'bye')));else await this.send(this.host,'bye');}catch{}this.closed=true;clearInterval(this.timer);this.unsubscribe?.();for(const pending of this.commands.values())pending.reject(new Error('The Steam room closed.'));this.commands.clear();try{await this.bridge.leave();}catch{}}
}
