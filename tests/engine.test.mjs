import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,play,groups,territories,inspectMove,scoredWinner,legalMoves,groupSafety} from '../shared/engine.js';
import {chooseMove,BOT_CONFIG} from '../shared/ai.js';

function position(blue=[],orange=[],turn=1){const s=newGame();blue.forEach(i=>s.board[i]=1);orange.forEach(i=>s.board[i]=2);s.count=[0,blue.length,orange.length];s.turn=turn;return s;}

test('setup is 9x9, one permanent neutral wall, blue to move and 40 castles each',()=>{const s=newGame();assert.equal(s.board.length,81);assert.equal(s.board[40],3);assert.equal(s.board.filter(Boolean).length,1);assert.equal(s.turn,1);assert.deepEqual(s.count,[0,0,0]);});
test('opening castle cannot claim the whole open board',()=>{for(const i of[0,1,10,30,41,70,80]){const s=play(newGame(),i);assert.equal(territories(s.board).scores[1],0);}});
test('alternating moves are immutable and occupied squares are illegal',()=>{const s=newGame(),n=play(s,0);assert.equal(s.board[0],0);assert.equal(n.board[0],1);assert.equal(n.turn,2);assert.equal(n.count[1],1);assert.throws(()=>play(n,0));assert.throws(()=>play(n,40));});
test('a single enclosed eye belongs to its surrounding castles',()=>{const s=position([10,18,20,28]);assert.equal(territories(s.board).owners[19],1);assert.equal(inspectMove({...s,turn:2},19).error,'This land is sealed by your opponent.');});

test('one protected eye stays safe even when it is a connected group’s last liberty',()=>{
  const blue=[10,11,12,19,21,28,29,30],orange=[1,2,3,9,13,18,22,27,31,37,38,39];
  for(const color of [1,2]){
    const s=color===1?position(blue,orange):position(orange,blue);
    const g=groupSafety(s).find(g=>g.color===color);assert.deepEqual(g.liberties,[20]);assert.equal(g.protected,true);assert.equal(g.threatened,false);
    assert.match(inspectMove({...s,turn:3-color},20).error,/sealed/);
    assert.match(inspectMove({...s,turn:color},20).error,/sacrifice/,'filling your last eye is still illegal self-capture');
  }
});

test('sealed regions larger than one square cannot be invaded, including with a claimed capture',()=>{
  const s=position([2,10,18],[],2),t=territories(s.board);
  for(const i of [0,1,9]){assert.equal(t.owners[i],1);assert.match(inspectMove(s,i).error,/sealed/);}
  assert.equal(groupSafety(s).filter(g=>g.color===1).every(g=>g.protected&&!g.threatened),true);
});

test('open or enemy-contested space is playable regardless of apparent enclosure size',()=>{
  const open=position([10,12,19,21,28,29,30],[],2);assert.equal(territories(open.board).owners[20],0);assert.equal(inspectMove(open,20).error,undefined);
  const contested=position([3,11,19,27],[0],2);assert.equal(territories(contested.board).owners[1],0);assert.equal(inspectMove(contested,1).error,undefined);
});

test('a danger marker requires a legal winning capture and respects the attacker’s supply',()=>{
  const s=position([0],[1]);let g=groupSafety(s).find(g=>g.color===1);assert.equal(g.threatened,true);assert.equal(g.capturePoint,9);
  s.count[2]=40;g=groupSafety(s).find(g=>g.color===1);assert.equal(g.threatened,false);
});

test('diagonal walls and the neutral shared wall also protect a one-square eye',()=>{
  const s=position([1,9],[10,18]);for(const g of groupSafety(s).filter(g=>g.color===1)){assert.ok(g.protectedLiberties.includes(0));assert.equal(g.threatened,false);}
  const center=position([22,30,32]);assert.equal(territories(center.board).owners[31],1);assert.match(inspectMove({...center,turn:2},31).error,/sealed/);
});
test('diagonal castle chain and two board edges enclose a corner',()=>{const s=position([2,10,18]);const t=territories(s.board);assert.deepEqual([t.owners[0],t.owners[1],t.owners[9]],[1,1,1]);assert.equal(t.scores[1],3);});
test('an enemy boundary invalidates a territory',()=>{const s=position([10,18,20],[28]);assert.equal(territories(s.board).owners[19],0);});
test('an enemy inside a claimed outline invalidates its empty region',()=>{const s=position([3,11,19,27],[0]);const t=territories(s.board);assert.equal(t.owners[1],0);assert.equal(t.owners[9],0);});
test('center neutral wall closes an eye and does not join castle groups',()=>{const s=position([30,32,22]);assert.equal(territories(s.board).owners[31],1);const g=groups(position([39,41]).board);assert.equal(g.length,2);});
test('orthogonal connections share liberties; diagonals do not',()=>{const s=position([0,1,10,20]);const g=groups(s.board);assert.equal(g.length,2);assert.equal(g[0].stones.length,3);assert.ok(g[0].liberties.includes(2));});
test('surrounding an isolated enemy castle wins immediately',()=>{const s=position([1],[0],1);const n=play(s,9);assert.equal(n.winner,1);assert.equal(n.reason,'capture');assert.throws(()=>play(n,80));});
test('a surrounded member of a connected group is not captured while the group has liberties',()=>{const s=position([1,10],[0,9,18]);const n=play(s,19);assert.equal(n.winner,null);assert.ok(groups(n.board).find(g=>g.color===2).liberties.includes(27));});
test('suicide without a capture is rejected',()=>{const s=position([1,9],[],2);assert.ok(inspectMove(s,0).error);});
test('filling the last liberty of both groups awards Wei the win',()=>{const s=newGame();s.board=Array(81).fill(2);for(let i=0;i<81;i++)if(i%9===0||Math.floor(i/9)>=6||(Math.floor(i/9)===5&&i%9<=6))s.board[i]=1;s.board[40]=3;s.board[1]=0;s.count=[0,39,40];s.turn=1;const result=inspectMove(s,1);assert.equal(result.winner,2);assert.equal(result.simultaneous,true);assert.equal(play(s,1).reason,'simultaneous');});
test('castle supply stops at 40 but passing remains possible',()=>{const s=newGame();s.count[1]=40;assert.match(inspectMove(s,0).error,/40/);assert.equal(play(s,'pass').turn,2);});
test('two consecutive passes score; a deployment resets the pass counter',()=>{const s=play(newGame(),'pass'),n=play(s,0);assert.equal(n.passes,0);assert.equal(play(play(n,'pass'),'pass').reason,'territory');});
test('empty board ends with Wei winning and Shu adjusted to -2',()=>{const s=play(play(newGame(),'pass'),'pass');assert.equal(s.winner,2);assert.deepEqual(scoredWinner(s).adjusted,[0,-2,0]);});
test('literal komi requires 5 raw territory advantage, not just 3',()=>{
  const three=position([2,10,18]);assert.equal(territories(three.board).scores[1],3);assert.equal(scoredWinner(three).winner,2);
  const six=position([3,11,19,27]);assert.equal(territories(six.board).scores[1],6);assert.equal(scoredWinner(six).winner,1);
  // Orange takes one corner point: Shu raw 6, Wei raw 1 => adjusted lead 3.
  six.board[71]=2;six.board[79]=2;assert.equal(territories(six.board).scores[2],1);assert.equal(scoredWinner(six).winner,1);
  six.board[70]=2;six.board[78]=2;six.board[79]=0;assert.equal(scoredWinner(six).winner,2);
});
test('resigning awards the opposing side the game',()=>{assert.equal(play(newGame(),'resign').winner,2);});
test('all ten bots take an available immediate win',()=>{for(let l=1;l<=10;l++){const s=position([1],[0]);assert.equal(chooseMove(s,l,()=>.5).move,9);}});
test('tactical bots block an immediate capture threat',()=>{for(let l=3;l<=10;l++){const s=position([0],[1]);const result=chooseMove(s,l,()=>.5);assert.equal(result.move,9,`level ${l} must save A9`);}});
test('bot strength configurations increase search budgets and depths',()=>{for(let i=1;i<10;i++){assert.ok(BOT_CONFIG[i].ms>BOT_CONFIG[i-1].ms);assert.ok(BOT_CONFIG[i].noise<BOT_CONFIG[i-1].noise);}assert.ok(BOT_CONFIG[9].depth>=8);assert.ok(BOT_CONFIG[9].extensions>=20);});
test('bots choose legal actions over a game and preserve the neutral wall',()=>{let s=newGame();for(let p=0;p<28&&!s.winner;p++){const result=chooseMove(s,3,()=>.5);if(result.move!=='pass')assert.ok(legalMoves(s).includes(result.move));s=play(s,result.move);assert.equal(s.board[40],3);}});
