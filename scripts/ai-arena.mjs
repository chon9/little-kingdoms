import {newGame,play,legalMoves,groups,inspectMove,territories} from '../shared/engine.js';
import {chooseMove,BOT_CONFIG} from '../shared/ai.js';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const baseline=await import(pathToFileURL(path.resolve(process.argv[2]||'artifacts/legacy-ai.mjs')));
const budget=Number(process.argv[3]||100),pairs=Number(process.argv[4]||6);
const newBudget=BOT_CONFIG[9].ms,oldBudget=baseline.BOT_CONFIG[9].ms;
BOT_CONFIG[9].ms=budget;baseline.BOT_CONFIG[9].ms=budget;
let seed=92173;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const openings=[];
for(let pair=0;pair<pairs;pair++){
  let s=newGame();
  for(let p=0;p<6;p++){
    const safe=legalMoves(s).filter(i=>{
      const n=play(s,i),t=territories(n.board);return !n.winner&&!groups(n.board).some(g=>g.color===s.turn&&g.liberties.length===1&&inspectMove(n,g.liberties[0],t).winner===n.turn);
    });
    s=play(s,safe[Math.floor(rng()*safe.length)]);
  }
  openings.push(s);
}
const results=[];
try{
  for(let pair=0;pair<pairs;pair++)for(const newColor of [1,2]){
    let state=structuredClone(openings[pair]),newNodes=0,oldNodes=0,avoidableBlunders=0;
    for(let turn=0;turn<160&&!state.winner;turn++){
      const updated=state.turn===newColor,result=(updated?chooseMove:baseline.chooseMove)(state,10,()=>.5);
      const next=play(state,result.move);if(updated)newNodes+=result.nodes;else oldNodes+=result.nodes;
      if(updated&&!next.winner){const t=territories(next.board);if(groups(next.board).some(g=>g.color===newColor&&g.liberties.length===1&&inspectMove(next,g.liberties[0],t).winner===next.turn))avoidableBlunders++;}
      state=next;
    }
    const r={pair,newColor,winner:state.winner,result:state.winner===newColor?'new':state.winner?'old':'unfinished',plies:state.ply,reason:state.reason,newNodes,oldNodes,exposedCaptures:avoidableBlunders};results.push(r);console.log(JSON.stringify(r));
  }
  console.log(JSON.stringify({summary:true,budgetMs:budget,games:results.length,newWins:results.filter(r=>r.result==='new').length,oldWins:results.filter(r=>r.result==='old').length,unfinished:results.filter(r=>r.result==='unfinished').length,seed:92173}));
}finally{BOT_CONFIG[9].ms=newBudget;baseline.BOT_CONFIG[9].ms=oldBudget;}
