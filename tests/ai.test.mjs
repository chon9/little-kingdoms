import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,play,legalMoves,groups,inspectMove,territories} from '../shared/engine.js';
import {chooseMove,BOT_CONFIG} from '../shared/ai.js';

function position(blue,orange,turn=1){const s=newGame();blue.forEach(i=>s.board[i]=1);orange.forEach(i=>s.board[i]=2);s.count=[0,blue.length,orange.length];s.turn=turn;s.ply=blue.length+orange.length;return s;}
function captures(s,color=s.turn){const t=territories(s.board),points=new Set();for(const g of groups(s.board))if(g.color!==color&&g.liberties.length===1){const i=g.liberties[0];if(inspectMove({...s,turn:color},i,t).winner===color)points.add(i);}return [...points];}
function quick(s,level=10,ms=140){const cfg=BOT_CONFIG[level-1],saved=cfg.ms;cfg.ms=ms;try{return chooseMove(s,level,()=>.5);}finally{cfg.ms=saved;}}
function transform(s,rotate,reflect){const result={...s,board:Array(81).fill(0)};const index=i=>{let x=i%9,y=Math.floor(i/9);if(reflect)x=8-x;for(let n=0;n<rotate;n++)[x,y]=[8-y,x];return y*9+x;};for(let i=0;i<81;i++)result.board[index(i)]=s.board[i];return {state:result,index};}
function settledPosition(shared=true){
  const s=newGame();
  for(let i=0;i<81;i++)if(i!==40)s.board[i]=i%9<4?1:shared&&i%9===4?0:2;
  for(const i of shared?[10,11,19,20,16,25]:[10,11,19,20,15,16,24,25,33,34])s.board[i]=0;
  s.count=[0,s.board.filter(c=>c===1).length,s.board.filter(c=>c===2).length];s.ply=s.count[1]+s.count[2];return s;
}

test('level 10 prevents the reproduced edge trap instead of expanding far away',()=>{
  let s=newGame();for(const move of [9,10,36,1,'pass',19])s=play(s,move);
  assert.equal(captures(s,2).length,0,'the threat is not an immediate one-move capture');
  const result=chooseMove(s,10,()=>.5);assert.equal(result.move,18,'A7 is required before the opponent cuts A7');assert.ok(result.extensions>0);
  // The former level-10 F4 move allows A9, forced A7, then capture at A6.
  const lost=play(play(play(play(s,50),0),18),27);assert.equal(lost.winner,2);
  const defended=play(s,result.move);const forced=play(play(defended,0),27);assert.equal(captures(forced,2).length,0);
  const counter=play(play(defended,27),28);assert.equal(counter.winner,1,'the other attack loses to a counter-capture');
});

test('edge defense survives every rotation, reflection and both colors',()=>{
  for(const color of [1,2])for(let rotation=0;rotation<4;rotation++)for(const reflection of [false,true]){
    let s=position([9,36],[1,10,19]);if(color===2){s.board=s.board.map(c=>c===1?2:c===2?1:c);s.count=[0,3,2];s.turn=2;}
    const p=transform(s,rotation,reflection),result=quick(p.state);
    assert.equal(result.move,p.index(18),`color ${color}, rotation ${rotation}, reflection ${reflection}`);
  }
});

test('a winning counter-capture takes priority over extending a threatened group',()=>{
  // Wei B9 has one liberty at C9; Shu A9 is also threatened at A8.
  const s=position([0,10],[1]);assert.deepEqual(captures(s),[2]);const move=quick(s).move;assert.equal(move,2);assert.equal(play(s,move).winner,1);
});

test('all tactical levels connect an endangered castle to its safe group',()=>{
  for(let level=3;level<=10;level++){const s=position([0,18],[1]);const move=quick(s,level).move;assert.equal(move,9);assert.equal(captures(play(s,move)).length,0);}
});

test('an enclosed eye is safe and is not filled as an unnecessary defense',()=>{
  const s=position([1,9],[70]);assert.equal(territories(s.board).owners[0],1);assert.equal(captures(s,2).length,0);
  assert.notEqual(quick(s).move,0);
});

test('all ten levels pass instead of spending scored, protected territory',()=>{
  for(let level=1;level<=10;level++)for(const color of [1,2]){
    const s=settledPosition(false);s.turn=color;const t=territories(s.board);
    assert.ok(legalMoves(s).some(i=>t.owners[i]===color),'owner entry remains legal for human players');
    const original=s.board.slice();assert.equal(quick(s,level,35).move,'pass',`level ${level}, color ${color}`);assert.deepEqual(s.board,original);
  }
});

test('all levels leave settled shared spaces empty in every orientation',()=>{
  for(let level=1;level<=10;level++)for(const color of [1,2])for(let rotation=0;rotation<4;rotation++){
    const s=settledPosition();s.turn=color;const p=transform(s,rotation,rotation%2===1).state;
    assert.equal(inspectMove(p,transform(s,rotation,rotation%2===1).index(4)).error,undefined,'shared point is legal');
    assert.equal(quick(p,level,35).move,'pass',`level ${level}, color ${color}, rotation ${rotation}`);
  }
});

test('two settled passes end normally and preserve every territory point and castle',()=>{
  const s=settledPosition(),before=territories(s.board).scores,first=play(s,quick(s).move);
  const end=play(first,quick(first).move);assert.equal(end.reason,'territory');assert.deepEqual(end.board,s.board);assert.deepEqual(end.count,s.count);assert.deepEqual(territories(end.board).scores,before);
});

test('deadline fallback and low-level randomness cannot fill owned land or settled shared space',()=>{
  for(let level=1;level<=10;level++)for(const value of [0,.999999]){
    const s=settledPosition();assert.equal(chooseMove(s,level,()=>value,(()=>{let n=0;return()=>n++*10000;})()).move,'pass');
  }
});

test('a mixed boundary point is still played when it seals useful contested territory',()=>{
  const s=settledPosition(false);s.board[0]=0;s.board[21]=0;s.count[1]-=2;s.ply-=2;
  for(const i of [46,47,55,56,64,65])s.board[i]=0;s.count[1]-=6;s.ply-=6;
  const before=territories(s.board);assert.equal(before.owners[20],0);assert.equal(before.owners[0],1);
  const move=quick(s).move;assert.equal(move,21);const after=territories(play(s,move).board);assert.equal(after.scores[1]-before.scores[1],4);
});

test('shared liberties remain available for mandatory defense',()=>{
  for(let level=3;level<=10;level++){
    const s=position([0,18],[1,10]);assert.equal(territories(s.board).owners[9],0);
    assert.equal(quick(s,level).move,9,`level ${level}`);
  }
});

test('mutual shared liberties are passed when every placement permits immediate capture',()=>{
  const s=newGame();for(let i=0;i<81;i++)if(i!==40)s.board[i]=i%9<4?1:2;
  for(const i of [4,13,22])s.board[i]=1;for(const i of [31,49])s.board[i]=0;
  s.count=[0,39,39];s.ply=78;
  for(const move of legalMoves(s))assert.ok(captures(play(s,move),2).length>0);
  for(let level=3;level<=10;level++)assert.equal(quick(s,level).move,'pass');
});

test('level 10 finds a double threat that no single reply can defend',()=>{
  const s=position([12,20,28],[21,29]);const move=quick(s).move;assert.equal(move,30);
  const attacked=play(s,move);assert.equal(captures(attacked,1).length,2);
  for(const reply of [...legalMoves(attacked),'pass']){
    const response=play(attacked,reply);assert.notEqual(response.winner,2);
    if(!response.winner)assert.ok(captures(response,1).length>0,'every enemy reply leaves a winning capture');
  }
});

test('Wei takes a simultaneous capture victory instead of treating it as suicide',()=>{
  const s=newGame();s.board=Array(81).fill(1);
  for(let i=0;i<81;i++)if(i%9===0||Math.floor(i/9)>=6||(Math.floor(i/9)===5&&i%9<=6))s.board[i]=2;
  s.board[40]=3;s.board[1]=0;s.count=[0,40,39];s.turn=2;
  assert.equal(quick(s).move,1);assert.equal(play(s,1).reason,'simultaneous');assert.equal(play(s,1).winner,2);
});

test('a winning second pass ends immediately even while a castle is threatened',()=>{
  const s=position([1],[0],2);s.passes=1;assert.equal(quick(s).move,'pass');assert.equal(play(s,'pass').winner,2);
});

test('the bot does not accept a losing second pass instead of saving its castle',()=>{
  const s=position([0,18],[1]);s.passes=1;const move=quick(s).move;assert.equal(move,9);assert.equal(play(s,move).winner,null);
});

test('exhausted castle supply produces a pass, not an illegal placement',()=>{const s=newGame();s.count[1]=40;assert.equal(quick(s).move,'pass');});

test('deadline fallback still answers an immediate threat legally',()=>{
  const s=position([0,18],[1]);const move=chooseMove(s,10,()=>.5,(()=>{let ticks=0;return()=>ticks++*10000;})()).move;
  assert.equal(move,9);assert.ok(legalMoves(s).includes(move));
});

test('seeded safe play never permits an avoidable one-move capture',()=>{
  let seed=27991;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let game=0;game<4;game++){
    let s=newGame();
    for(let ply=0;ply<35&&!s.winner;ply++){
      if(s.turn===1){
        const safe=legalMoves(s).filter(i=>{const n=play(s,i);return n.winner===1||(!n.winner&&!captures(n).length);});
        const move=quick(s,10,35).move,n=play(s,move);
        if(safe.length&&!n.winner)assert.equal(captures(n).length,0,`avoidable immediate loss in seeded game ${game} ply ${ply}`);
        s=n;
      }else{
        const choices=legalMoves(s);s=play(s,choices.length?choices[Math.floor(rng()*choices.length)]:'pass');
      }
    }
  }
});
