import {newGame,play,scoredWinner} from './engine.js';

// Seats are stable identities; colors alternate on a mutually accepted rematch.
// Blue always starts, including when the host's team commands Orange.
export const TEAM_SEATS=Object.freeze([1,2,3,4]);
export const teamColor=(state,seat)=>seat<=2?state.team1Color:3-state.team1Color;
export const teamOrder=state=>state.team1Color===1?[1,3,2,4]:[3,1,4,2];
export function newTeamGame(team1Color=1,teamPlayers={}){
  if(![1,2].includes(team1Color))throw new Error('Choose Blue or Orange.');
  const state={...newGame('literal'),mode:'teams',team1Color,teamPlayers,seatCounts:[0,0,0,0,0]};
  state.turnSeat=teamOrder(state)[0];state.players=teamRepresentatives(state);return state;
}
export function teamRepresentatives(state){
  const players={};for(const color of[1,2]){const seat=TEAM_SEATS.find(s=>teamColor(state,s)===color&&state.teamPlayers[s]);if(seat)players[color]=state.teamPlayers[seat];}return players;
}
export function playTeam(state,action,seat=state.turnSeat){
  if(!TEAM_SEATS.includes(seat))throw new Error('Choose a valid team seat.');
  if(state.winner)throw new Error('This battle has ended.');
  if(action!=='resign'&&seat!==state.turnSeat)throw new Error('Wait for your teammate’s turn to finish.');
  const color=teamColor(state,seat);
  let next;
  if(action==='pass'){
    next=play({...state,passes:0,turn:color},'pass');next.passes=state.passes+1;
    if(next.passes>=4){next.winner=scoredWinner(next).winner;next.reason='territory';}
  }else next=play({...state,turn:color},action);
  next.history=next.history.map((entry,index)=>index===next.history.length-1?{...entry,seat}:entry);
  next.seatCounts=state.seatCounts.slice();if(Number.isInteger(action))next.seatCounts[seat]++;
  if(action==='resign')next.resignedSeat=seat;
  const order=teamOrder(state);next.turnSeat=order[(order.indexOf(state.turnSeat)+1)%4];next.turn=teamColor(next,next.turnSeat);
  next.players=teamRepresentatives(next);return next;
}
export function rematchTeam(state){return newTeamGame(3-state.team1Color,structuredClone(state.teamPlayers));}
