import {newGame, play} from './engine.js';

// No HTTP or database calls: this protocol runs exclusively over the native
// SteamNetworkingMessages bridge. The host orders commands; both peers replay
// the shared rules engine instead of accepting a remote board or score.
export const STEAM_PROTOCOL=1;
const validID=value=>typeof value==='string'&&/^\d{17,20}$/.test(value);
const token=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(value);
const clone=value=>JSON.parse(JSON.stringify(value));
function appearance(value={}){if(!value||typeof value!=='object')value={};return{avatar:Number.isInteger(value.avatar)&&value.avatar>=0&&value.avatar<40?value.avatar:0,castle:/^(classic|c(?:0[1-9]|[12]\d|30))$/.test(value.castle)?value.castle:'classic'};}
function advance(state,action,color){
  if(![1,2].includes(color)||action!=='resign'&&state.turn!==color)throw new Error('Wait for your turn.');
  if(action!=='pass'&&action!=='resign'&&(!Number.isInteger(action)||action<0||action>80))throw new Error('Choose a square on the board.');
  return play(action==='resign'?{...state,turn:color}:state,action);
}
export class SteamSession {
  constructor({bridge,identity,profile,onUpdate=()=>{},onError=()=>{},now=()=>Date.now(),uuid=()=>crypto.randomUUID(),autoTick=true}){
    this.bridge=bridge;this.identity=identity;this.profile=appearance(profile);this.onUpdate=onUpdate;this.onError=onError;this.now=now;this.uuid=uuid;
    this.hostColor=1;this.lobby=null;this.peer=null;this.host=null;this.members=[];this.state=null;this.seq=0;this.connected=false;this.ready=false;this.commands=new Map();this.receipts=[];this.consents=new Set();this.lastSeen=now();this.lastHello=0;this.error='';this.closed=false;
    this.unsubscribe=bridge.on(event=>this.event(event));
    if(autoTick)this.timer=setInterval(()=>this.tick(),1500);
  }
  get isHost(){return this.host===this.identity.id;}
  get color(){return this.isHost?this.hostColor:3-this.hostColor;}
  async create(color=1){this.hostColor=color===2?2:1;this.expectLobby=true;this.check(await this.bridge.create());}
  async join(id){if(!validID(id))throw new Error('Enter the complete numeric Steam lobby ID.');this.expectLobby=true;this.check(await this.bridge.join(id));}
  check(result){if(!result?.ok)throw new Error(result?.error||'Steam connection interrupted.');return result;}
  update(){if(this.lobby)this.onUpdate({code:this.lobby,color:this.color,version:this.seq,ready:this.ready,connected:this.connected,state:clone(this.state||newGame()),hostColor:this.hostColor,error:this.error});}
  async send(kind,data={}){
    if(!this.peer||this.closed)return;
    const payload=JSON.stringify({game:'little-kingdoms',v:STEAM_PROTOCOL,lobby:this.lobby,kind,...data});
    if(new TextEncoder().encode(payload).length>24576)throw new Error('Steam game message exceeds its size limit.');
    this.check(await this.bridge.send(this.peer,payload));
  }
  transmit(kind,data={}){this.send(kind,data).catch(()=>{if(!this.closed){this.error='Steam is reconnecting. Your confirmed castles are preserved.';this.connected=false;this.update();}});}
  event(event){
    if(this.closed)return;
    if(event.type==='error'){this.expectLobby=false;this.onError(event.error);return;}
    if(event.type==='connection'){this.connected=false;this.error='Steam is reconnecting. Your confirmed castles are preserved.';this.update();return;}
    if(event.type==='lobby'){
      if(!validID(event.lobby)||!validID(event.host)||!Array.isArray(event.members)||event.members.length>2||!event.members.some(m=>m.id===this.identity.id))return;
      if(this.lobby&&this.lobby!==event.lobby||!this.lobby&&!this.expectLobby)return;
      const previousPeer=this.peer;this.lobby=event.lobby;this.host=event.host;this.members=event.members.map(m=>({id:m.id,name:String(m.name||'Steam commander').slice(0,40)}));this.peer=this.members.find(m=>m.id!==this.identity.id)?.id||null;
      if(!this.state&&this.isHost)this.freshMatch();
      if(this.ready&&(previousPeer&&!this.peer||event.hostPresent===false)){this.departed();return;}
      this.update();if(this.peer)this.hello();return;
    }
    if(event.type!=='packet'||event.from!==this.peer||typeof event.payload!=='string'||event.payload.length>24576)return;
    let message;try{message=JSON.parse(event.payload);}catch{return;}
    if(message?.game!=='little-kingdoms'||message.v!==STEAM_PROTOCOL||message.lobby!==this.lobby)return;
    this.lastSeen=this.now();const recovered=!this.connected;this.connected=true;this.error='';
    try{
      if(message.kind==='hello'){
        if(this.isHost){if(!this.ready){const guest=appearance(message.profile),name=this.members.find(m=>m.id===this.peer)?.name||'Steam commander';this.state.players[3-this.hostColor]={...guest,displayName:name};this.ready=true;this.seq++;this.update();}this.snapshot();}
        else this.transmit('sync');
      }else if(message.kind==='sync'&&this.isHost)this.snapshot();
      else if(message.kind==='ping')this.transmit('pong');
      else if(message.kind==='snapshot'&&!this.isHost)this.acceptSnapshot(message);
      else if(message.kind==='command'&&this.isHost)this.handleCommand(message.command,3-this.hostColor);
      else if(message.kind==='reject'&&!this.isHost){const pending=this.commands.get(message.id);if(pending){this.commands.delete(message.id);pending.reject(new Error(String(message.error||'Steam command rejected.').slice(0,180)));}}
      else if(message.kind==='bye'){this.departed();return;}
      if(recovered)this.update();
    }catch(error){this.connected=false;this.error=error instanceof TypeError?'Invalid Steam game message. Leave and create a new room.':error.message;this.update();this.onError(this.error);}
  }
  hello(){this.lastHello=this.now();this.transmit('hello',{profile:this.profile});}
  freshMatch(proof=null){
    this.state={...newGame('literal'),matchId:this.uuid(),players:{[this.hostColor]:{...this.profile,displayName:this.identity.name||'Steam commander'},...(this.state?.players?.[3-this.hostColor]?{[3-this.hostColor]:this.state.players[3-this.hostColor]}:{})}};
    this.startProof=proof;this.receipts=[];
  }
  snapshot(){if(this.ready)this.transmit('snapshot',{seq:this.seq,matchId:this.state.matchId,hostColor:this.hostColor,players:this.state.players,actions:this.state.history,rematch:this.state.rematch||null,acks:this.receipts.map(r=>r.id),startProof:this.startProof});}
  acceptSnapshot(message){
    if(!Number.isSafeInteger(message.seq)||message.seq<this.seq||!token(message.matchId)||![1,2].includes(message.hostColor)||!Array.isArray(message.actions)||message.actions.length>256)return;
    const same=this.state?.matchId===message.matchId;
    if(this.ready&&message.hostColor!==this.hostColor)throw new Error('Steam kingdoms changed unexpectedly. Leave and create a new room.');
    if(this.ready&&!same){const proof=message.startProof;if(!this.state.winner||proof?.matchId!==this.state.matchId||!this.consents.has(proof.offerId)||!Array.isArray(proof.accepted)||proof.accepted.join(',')!=='1,2')throw new Error('A Steam rematch requires both commanders to accept.');}
    if(same&&(message.actions.length<this.state.history.length||JSON.stringify(message.actions.slice(0,this.state.history.length))!==JSON.stringify(this.state.history)))throw new Error('Steam history mismatch. Leave and create a new room.');
    let next=newGame('literal');for(const entry of message.actions){if(!entry||typeof entry!=='object')throw new Error('Invalid Steam game message. Leave and create a new room.');next=advance(next,entry.index,entry.color);}
    const players={};for(const c of [1,2]){const p=message.players?.[c];if(!p||typeof p.displayName!=='string')return;players[c]={...appearance(p),displayName:p.displayName.slice(0,40)};}
    const rematch=message.rematch;if(rematch){if(!next.winner||!token(rematch.id)||!['pending','declined','cancelled'].includes(rematch.status)||!Array.isArray(rematch.accepted)||rematch.accepted.length>2||rematch.accepted.some(c=>![1,2].includes(c)))return;if(rematch.accepted.includes(3-message.hostColor)&&!this.consents.has(rematch.id))throw new Error('Your Steam rematch consent was not recorded.');}
    this.hostColor=message.hostColor;this.state={...next,matchId:message.matchId,players,...(rematch?{rematch:clone(rematch)}:{})};this.ready=true;this.seq=message.seq;
    for(const id of Array.isArray(message.acks)?message.acks:[]){const pending=this.commands.get(id);if(pending){this.commands.delete(id);pending.resolve();}}
    this.update();
  }
  handleCommand(command,color){
    if(!command||!token(command.id)||!this.ready||!this.connected)return;
    if(this.receipts.some(r=>r.id===command.id)){this.snapshot();return;}
    try{
      if(command.matchId!==this.state.matchId)throw new Error('This Steam match has already changed.');
      if(command.kind==='move'){
        if(command.ply!==this.state.ply)throw new Error('The battlefield changed. Retry your move.');
        this.state=advance(this.state,command.action,color);
      }else if(command.kind==='rematch')this.applyRematch(command,color);
      else throw new Error('Unknown Steam game command.');
      this.receipts.push({id:command.id});this.receipts=this.receipts.slice(-32);this.seq++;this.update();this.snapshot();
    }catch(error){if(color===this.hostColor)throw error;this.transmit('reject',{id:command.id,error:error.message});this.snapshot();}
  }
  applyRematch(command,color){
    if(!this.state.winner||this.state.roomDeparted?.length)throw new Error('Finish this duel before requesting a rematch.');
    const current=this.state.rematch;
    if(command.action==='request'){
      if(current?.status==='pending')throw new Error('A rematch request is already open.');
      if(!token(command.offerId))throw new Error('Invalid rematch request.');
      this.state={...this.state,rematch:{id:command.offerId,status:'pending',accepted:[color]}};
    }else{
      if(current?.status!=='pending'||current.id!==command.offerId)throw new Error('This rematch request has changed.');
      if(command.action==='accept'){
        const accepted=[...new Set([...current.accepted,color])].sort();this.state={...this.state,rematch:{...current,accepted}};
        if(accepted.length===2)this.freshMatch({matchId:this.state.matchId,offerId:current.id,accepted});
      }else if(command.action==='cancel'&&current.accepted.includes(color)||command.action==='decline'&&!current.accepted.includes(color))this.state={...this.state,rematch:{...current,status:command.action==='cancel'?'cancelled':'declined',by:color}};
      else throw new Error('This rematch action is unavailable.');
    }
  }
  async command(data){
    if(!this.ready||!this.connected||this.closed||this.state.roomDeparted?.length)throw new Error('Wait for your Steam rival to connect.');
    if(this.commands.size)throw new Error('Wait for Steam to confirm your previous action.');
    const command={...data,id:this.uuid(),matchId:this.state.matchId,ply:this.state.ply};
    if(this.isHost){this.handleCommand(command,this.color);return;}
    return new Promise((resolve,reject)=>{this.commands.set(command.id,{command,resolve,reject,at:this.now(),sent:this.now()});this.transmit('command',{command});});
  }
  act(action){return this.command({kind:'move',action});}
  rematch(action){
    const offerId=action==='request'?this.uuid():this.state?.rematch?.id;
    if(action==='request'||action==='accept')this.consents.add(offerId);
    return this.command({kind:'rematch',action,offerId});
  }
  tick(){
    if(this.closed||!this.peer||this.state?.roomDeparted?.length)return;
    if(this.now()-this.lastSeen>15000&&this.connected){this.connected=false;this.error='Steam is reconnecting. Your confirmed castles are preserved.';this.update();}
    if(!this.ready)this.hello();else this.transmit('ping');
    if(this.isHost)this.snapshot();else if(this.ready)this.transmit('sync');
    for(const [id,pending] of this.commands){if(this.now()-pending.at>20000){this.commands.delete(id);pending.reject(new Error('Steam has not confirmed your action. Check the battlefield before retrying.'));}else if(this.now()-pending.sent>1500){pending.sent=this.now();this.transmit('command',{command:pending.command});}}
  }
  departed(){
    this.connected=false;this.error='Your Steam rival left. Leave this room to start a new duel.';
    if(this.ready&&!this.state.winner)this.state={...advance(this.state,'resign',3-this.color),steamAborted:true};
    if(this.state)this.state={...this.state,roomDeparted:[3-this.color]};
    this.rejectPending();this.update();
  }
  rejectPending(){for(const pending of this.commands.values())pending.reject(new Error('The Steam room closed.'));this.commands.clear();}
  async leave(){if(this.closed)return;try{await this.send('bye');}catch{}this.closed=true;clearInterval(this.timer);this.unsubscribe?.();this.rejectPending();try{await this.bridge.leave();}catch{}}
}
