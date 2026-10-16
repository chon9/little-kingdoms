import { ADJ, groups, territories, inspectMove, scoredWinner } from './engine.js';

// Search runs in the existing browser Worker. Strength comes from tactical reading,
// not an LLM call or an artificial delay. Levels 3+ never discard a required reply.
export const BOT_CONFIG = [
  { depth: 1, width: 4, ms: 35, noise: 120, tactical: false, extensions: 0 },
  { depth: 1, width: 5, ms: 60, noise: 80, tactical: false, extensions: 0 },
  { depth: 2, width: 5, ms: 100, noise: 45, tactical: true, extensions: 4 },
  { depth: 3, width: 6, ms: 180, noise: 28, tactical: true, extensions: 6 },
  { depth: 4, width: 7, ms: 320, noise: 15, tactical: true, extensions: 8 },
  { depth: 5, width: 8, ms: 550, noise: 8, tactical: true, extensions: 12 },
  { depth: 6, width: 10, ms: 900, noise: 4, tactical: true, extensions: 16 },
  { depth: 7, width: 12, ms: 1500, noise: 2, tactical: true, extensions: 20 },
  { depth: 8, width: 14, ms: 2400, noise: .8, tactical: true, extensions: 24 },
  { depth: 10, width: 18, ms: 3600, noise: 0, tactical: true, extensions: 28 }
];

const MATE = 1000000, TIMEOUT = Symbol('search deadline');

function risk(group, territory) {
  // In this variant a single protected eye suffices: the enemy may not enter it.
  if (group.liberties.some(i => territory.owners[i] === group.color)) return 0;
  const n = group.liberties.length;
  return n <= 1 ? 20000 : n === 2 ? 2600 : n === 3 ? 450 : n === 4 ? 80 : 0;
}

function influence(board, territory) {
  const distances = [null, new Uint8Array(81).fill(99), new Uint8Array(81).fill(99)];
  for (let color = 1; color <= 2; color++) {
    const queue = [], d = distances[color];
    for (let i = 0; i < 81; i++) if (board[i] === color) { d[i] = 0; queue.push(i); }
    for (let k = 0; k < queue.length; k++) {
      const p = queue[k];
      for (const n of ADJ[p]) if (!board[n] && d[n] === 99 && territory.owners[n] !== 3 - color) { d[n] = d[p] + 1; queue.push(n); }
    }
  }
  let value = 0;
  for (let i = 0; i < 81; i++) if (!board[i] && !territory.owners[i]) {
    const a = distances[1][i], b = distances[2][i];
    if (a !== b) value += (a < b ? 1 : -1) * Math.min(2.5, Math.abs(a - b) * .55);
  }
  return value;
}

function staticValue(board, gs, territory) {
  const risks = [[], [], []]; let value = (territory.scores[1] - territory.scores[2] - 4.5) * 12;
  for (const g of gs) {
    const sign = g.color === 1 ? 1 : -1, r = risk(g, territory);
    risks[g.color].push(r);
    value += sign * (Math.min(g.liberties.length, 8) * 3 + g.stones.length * .35 + (r === 0 && g.liberties.some(i => territory.owners[i] === g.color) ? 180 : 0));
  }
  // Sudden death makes the weakest group decisive; a large safe army cannot
  // compensate for one castle about to be captured.
  for (let c = 1; c <= 2; c++) {
    risks[c].sort((a,b) => b-a);
    const penalty = (risks[c][0] || 0) + risks[c].slice(1).reduce((sum,r) => sum+r*.2, 0);
    value += c === 1 ? -penalty : penalty;
  }
  return value + influence(board, territory);
}

export function evaluate(state, color) {
  if (state.winner) return state.winner === color ? MATE : -MATE;
  const value = staticValue(state.board, groups(state.board), territories(state.board));
  return color === 1 ? value : -value;
}

function childState(state, index, result) {
  if (index === 'pass') {
    const child = { ...state, turn: 3-state.turn, passes: state.passes+1, ply: state.ply+1, last: null };
    if (child.passes === 2) child.winner = scoredWinner(child).winner;
    return child;
  }
  const count=state.count.slice(); count[state.turn]++;
  return { ...state, board:result.board, count, turn:3-state.turn, passes:0, ply:state.ply+1, last:index, winner:result.winner };
}

export function chooseMove(state, level=5, rng=Math.random, now=()=>performance.now()) {
  const cfg=BOT_CONFIG[Math.max(0,Math.min(9,level-1))], start=now(), deadline=start+cfg.ms;
  const analysisCache=new Map(), transpositions=new Map(); let nodes=0, analyzed=0, completedDepth=0, extensions=0;
  const checkTime=()=>{if(now()>=deadline)throw TIMEOUT;};
  const keyOf=s=>s.board.join('')+s.turn+Math.min(s.passes,2);

  function analyze(s, knownGroups) {
    const key=keyOf(s); const cached=analysisCache.get(key); if(cached)return cached;
    const gs=knownGroups||groups(s.board), territory=territories(s.board), wins=[[],[],[]];
    // A capture must fill an enemy group's sole liberty. Enumerating these
    // points is complete, unlike looking only at the highest-ranked replies.
    for(let color=1;color<=2;color++) if(s.count[color]<40) {
      const tested=new Set();
      for(const g of gs) if(g.color!==color&&g.liberties.length===1) {
        const i=g.liberties[0]; if(tested.has(i))continue; tested.add(i);
        if(territory.owners[i]===3-color)continue;
        if(inspectMove({...s,turn:color},i,territory).winner===color)wins[color].push(i);
      }
    }
    const a={key,groups:gs,territory,wins,value:staticValue(s.board,gs,territory)}; analyzed++;
    if(analysisCache.size>=8000)analysisCache.clear();analysisCache.set(key,a);return a;
  }

  function terminal(s, distance) {return s.winner===s.turn?MATE-distance:-MATE+distance;}

  function generate(s,a,{forcing=false,root=false,pv=null,timed=true}={}) {
    const color=s.turn, enemy=3-color, replies=a.wins[enemy], critical=new Set(), attack=new Set();
    for(const g of a.groups) {
      if(g.color===color&&risk(g,a.territory)>0&&g.liberties.length<=3) {
        for(const i of g.liberties) {
          critical.add(i);
          // A jump ahead of a chase can be the only defense. Keep these
          // connections even when a static territory heuristic ranks them low.
          for(const n of ADJ[i])if(!s.board[n])critical.add(n);
        }
      } else if(g.color===enemy&&g.liberties.length===2&&risk(g,a.territory)>0)g.liberties.forEach(i=>attack.add(i));
    }
    let indices;
    if(cfg.tactical&&replies.length)indices=[...new Set(replies)];
    else if(forcing)indices=[...attack];
    else indices=Array.from({length:81},(_,i)=>i).filter(i=>!s.board[i]);
    const candidates=[];
    for(const index of indices) {
      if(timed&&(analyzed&31)===0)checkTime();
      const result=inspectMove(s,index,a.territory);if(result.error)continue;
      const next=childState(s,index,result);
      if(next.winner) {
        candidates.push({index,next,analysis:null,losing:next.winner!==color,forcing:true,critical:true,rank:next.winner===color?MATE:-MATE});continue;
      }
      const na=analyze(next,result.groups), losing=na.wins[enemy].length>0, forcingMove=na.wins[color].length>0;
      let rank=(color===1?na.value:-na.value)+(forcingMove?1400:0)-(a.territory.owners[index]===color?70:0);
      if(index===pv)rank+=MATE*2;
      if(root&&cfg.noise)rank+=(rng()-.5)*cfg.noise;
      candidates.push({index,next,analysis:na,losing,forcing:forcingMove,critical:critical.has(index),rank});
    }
    if(!forcing) {
      const next=childState(s,'pass');
      const losing=next.winner?next.winner!==color:a.wins[enemy].length>0;
      let rank=next.winner?(losing?-MATE:MATE):(color===1?a.value:-a.value)-30;
      if(pv==='pass')rank+=MATE*2;
      candidates.push({index:'pass',next,analysis:next.winner?null:analyze(next,a.groups),losing,forcing:false,critical:replies.length>0,rank});
    }
    const safe=cfg.tactical?candidates.filter(m=>!m.losing):candidates;
    const list=safe.length?safe:candidates;list.sort((x,y)=>y.rank-x.rank);
    if(forcing||replies.length)return list;
    // Only quiet strategic moves are beam-limited. Required defenses,
    // short connections and forcing attacks survive at every search ply.
    let quiet=0;return list.filter(m=>m.critical||m.forcing||m.index===pv||quiet++<(root?cfg.width+6:cfg.width));
  }

  function quiescence(s,a,alpha,beta,left,distance) {
    nodes++; if((nodes&63)===0)checkTime();
    if(s.winner)return terminal(s,distance);
    if(a.wins[s.turn].length)return MATE-distance-1;
    const enemy=3-s.turn, checked=a.wins[enemy].length>0;
    if(s.passes===1&&scoredWinner(s).winner===s.turn)return MATE-distance-1;
    if(checked&&a.wins[enemy].length>1)return -MATE+distance+2;
    const stand=(s.turn===1?a.value:-a.value);
    if(left<=0)return stand;
    let best=checked?-Infinity:stand;
    if(!checked){if(best>=beta)return best;alpha=Math.max(alpha,best);}
    const list=generate(s,a,{forcing:!checked});
    if(checked&&(!list.length||list.every(m=>m.losing)))return -MATE+distance+2;
    for(const m of list) {
      extensions++;
      const value=m.next.winner?-terminal(m.next,distance+1):-quiescence(m.next,m.analysis,-beta,-alpha,left-1,distance+1);
      best=Math.max(best,value);alpha=Math.max(alpha,value);if(alpha>=beta)break;
    }
    return best===-Infinity?stand:best;
  }

  function search(s,a,depth,alpha,beta,distance) {
    nodes++;if((nodes&63)===0)checkTime();
    if(s.winner)return terminal(s,distance);
    if(a.wins[s.turn].length)return MATE-distance-1;
    if(s.passes===1&&scoredWinner(s).winner===s.turn)return MATE-distance-1;
    if(cfg.tactical&&a.wins[3-s.turn].length>1)return -MATE+distance+2;
    if(depth<=0)return quiescence(s,a,alpha,beta,cfg.extensions,distance);
    const entry=transpositions.get(a.key);
    if(entry&&entry.depth>=depth) {
      if(entry.bound==='exact')return entry.value;
      if(entry.bound==='lower')alpha=Math.max(alpha,entry.value);else beta=Math.min(beta,entry.value);
      if(alpha>=beta)return entry.value;
    }
    const originalAlpha=alpha, originalBeta=beta;
    const list=generate(s,a,{pv:entry?.move});
    if(cfg.tactical&&a.wins[3-s.turn].length&&list.every(m=>m.losing))return -MATE+distance+2;
    let best=-Infinity,move=list[0]?.index;
    for(const m of list) {
      const value=m.next.winner?-terminal(m.next,distance+1):-search(m.next,m.analysis,depth-1,-beta,-alpha,distance+1);
      if(value>best){best=value;move=m.index;}
      alpha=Math.max(alpha,value);if(alpha>=beta)break;
    }
    if(best===-Infinity)best=s.turn===1?a.value:-a.value;
    // Mate scores include distance from this root; a transposition can occur at
    // a different depth through passing, so keep only non-mate values in the TT.
    if(Math.abs(best)<MATE-1000) {
      if(transpositions.size>=30000)transpositions.clear();
      transpositions.set(a.key,{depth,value:best,move,bound:best<=originalAlpha?'upper':best>=originalBeta?'lower':'exact'});
    }
    return best;
  }

  if(state.winner)return {move:'pass',nodes:0,depth:0,ms:0};
  const a=analyze(state);
  if(a.wins[state.turn].length)return {move:a.wins[state.turn][0],nodes:1,depth:1,ms:Math.round(now()-start),extensions:0};
  if(state.passes===1&&scoredWinner(state).winner===state.turn)return {move:'pass',nodes:1,depth:1,ms:Math.round(now()-start),extensions:0};
  // Always finish the bounded 81-square enumeration so a slow device still
  // receives a legal, immediately safe fallback before the timed search.
  const initial=generate(state,a,{root:true,timed:false});
  let best=initial[0]?.index??'pass', rootList=initial;
  // Finish one root pass in order, retaining improvements even if a later
  // sibling times out. Deeper unfinished iterations never replace a completed one.
  for(let depth=1;depth<=cfg.depth;depth++) {
    let iterationBest=best,score=-Infinity,alpha=-Infinity;
    try {
      checkTime();
      for(const m of rootList) {
        checkTime();
        let value=m.next.winner?-terminal(m.next,1):-search(m.next,m.analysis,depth-1,-Infinity,-alpha,1);
        if(cfg.noise&&Math.abs(value)<MATE-1000)value+=(rng()-.5)*cfg.noise;
        m.searchValue=value;
        if(value>score){score=value;iterationBest=m.index;}
        alpha=Math.max(alpha,value);
        if(depth===1)best=iterationBest;
        if(value>=MATE-1000)break;
      }
      best=iterationBest;completedDepth=depth;
      rootList.sort((x,y)=>(y.index===best?1:0)-(x.index===best?1:0)||(y.searchValue??-Infinity)-(x.searchValue??-Infinity)||y.rank-x.rank);
      if(Math.abs(score)>=MATE-1000)break;
    }catch(error){if(error!==TIMEOUT)throw error;break;}
  }
  return {move:best,nodes,depth:completedDepth,ms:Math.round(now()-start),extensions,positions:analyzed};
}
