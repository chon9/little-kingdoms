export const SIZE = 9;
export const BLUE = 1, ORANGE = 2, NEUTRAL = 3;
export const ADJ = Array.from({ length: 81 }, (_, i) => [i - 9, i + 9, i % 9 ? i - 1 : -1, i % 9 < 8 ? i + 1 : -1].filter(n => n >= 0 && n < 81));

export function newGame(scoring = 'literal') {
  const board = Array(81).fill(0); board[40] = NEUTRAL;
  return { board, turn: BLUE, passes: 0, count: [0, 0, 0], ply: 0, last: null, winner: null, reason: null, scoring, history: [] };
}

export function groups(board) {
  const seen = new Uint8Array(81), out = [];
  for (let i = 0; i < 81; i++) {
    if (seen[i] || (board[i] !== BLUE && board[i] !== ORANGE)) continue;
    const color = board[i], stones = [i], liberties = new Set(); seen[i] = 1;
    for (let k = 0; k < stones.length; k++) for (const n of ADJ[stones[k]]) {
      if (!board[n]) liberties.add(n);
      else if (board[n] === color && !seen[n]) { seen[n] = 1; stones.push(n); }
    }
    out.push({ color, stones, liberties: [...liberties] });
  }
  return out;
}

export function territories(board) {
  const owners = Array(81).fill(0), scores = [0, 0, 0], seen = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    if (board[i] || seen[i]) continue;
    const region = [i]; let colors = 0, edges = 0; seen[i] = 1;
    for (let k = 0; k < region.length; k++) {
      const p = region[k], x = p % 9, y = Math.floor(p / 9);
      if (!x) edges |= 1; if (x === 8) edges |= 2; if (!y) edges |= 4; if (y === 8) edges |= 8;
      for (const n of ADJ[p]) {
        if (!board[n] && !seen[n]) { seen[n] = 1; region.push(n); }
        else if (board[n] === BLUE) colors |= 1;
        else if (board[n] === ORANGE) colors |= 2;
      }
    }
    // A region still reaching all four board edges is the open field, not an enclosure.
    if ((colors === 1 || colors === 2) && edges !== 15) {
      for (const p of region) owners[p] = colors;
      scores[colors] += region.length;
    }
  }
  return { owners, scores };
}

export function scoredWinner(state) {
  const raw = territories(state.board).scores;
  const adjusted = [0, raw[1] - 2, raw[2]];
  const winner = state.scoring === 'standard' ? (adjusted[1] > adjusted[2] ? BLUE : ORANGE) : (adjusted[1] - adjusted[2] >= 3 ? BLUE : ORANGE);
  return { raw, adjusted, winner };
}

export function inspectMove(state, index, territory = territories(state.board)) {
  if (state.winner) return { error: 'This battle has ended.' };
  if (!Number.isInteger(index) || index < 0 || index > 80) return { error: 'Choose a square on the board.' };
  if (state.board[index]) return { error: 'There is already a castle here.' };
  const color = state.turn, enemy = 3 - color;
  if (state.count[color] >= 40) return { error: 'All 40 castles are deployed. Pass your turn.' };
  if (territory.owners[index] === enemy) return { error: 'This land is sealed by your opponent.' };
  const board = state.board.slice(); board[index] = color;
  const gs = groups(board), deadBlue = gs.some(g => g.color === BLUE && !g.liberties.length), deadOrange = gs.some(g => g.color === ORANGE && !g.liberties.length);
  const ownDead = color === BLUE ? deadBlue : deadOrange, enemyDead = color === BLUE ? deadOrange : deadBlue;
  if (ownDead && !enemyDead) return { error: 'No liberties. That placement would sacrifice your castle.' };
  const winner = deadBlue && deadOrange ? ORANGE : deadBlue ? ORANGE : deadOrange ? BLUE : null;
  return { board, winner, groups: gs, simultaneous: deadBlue && deadOrange };
}

// Hints must follow legal moves, not just the number of adjacent empty squares.
// A sealed liberty is protected at ANY region size in this game's territory rules.
export function groupSafety(state, territory = territories(state.board)) {
  return groups(state.board).map(group => {
    const protectedLiberties = group.liberties.filter(i => territory.owners[i] === group.color);
    const enemy = 3 - group.color, point = group.liberties[0];
    const capture = !state.winner && group.liberties.length === 1 && !protectedLiberties.length
      ? inspectMove({ ...state, turn: enemy }, point, territory) : null;
    const threatened = !!capture && !capture.error && capture.winner === enemy;
    return { ...group, protectedLiberties, protected: protectedLiberties.length > 0, threatened, capturePoint: threatened ? point : null };
  });
}

export function play(state, action) {
  if (state.winner) throw new Error('This battle has ended.');
  const color = state.turn;
  if (action === 'resign') return { ...state, winner: 3 - color, reason: 'resignation', ply: state.ply + 1, history: [...state.history, { color, index: 'resign' }] };
  if (action === 'pass') {
    const next = { ...state, passes: state.passes + 1, turn: 3 - color, ply: state.ply + 1, last: null, history: [...state.history, { color, index: 'pass' }] };
    if (next.passes >= 2) { next.winner = scoredWinner(next).winner; next.reason = 'territory'; }
    return next;
  }
  const result = inspectMove(state, action);
  if (result.error) throw new Error(result.error);
  const count = state.count.slice(); count[color]++;
  return { ...state, board: result.board, turn: 3 - color, count, passes: 0, ply: state.ply + 1, last: action, winner: result.winner, reason: result.winner ? (result.simultaneous ? 'simultaneous' : 'capture') : null, history: [...state.history, { color, index: action }] };
}

export function legalMoves(state) {
  const t = territories(state.board), moves = [];
  for (let i = 0; i < 81; i++) if (!state.board[i] && !inspectMove(state, i, t).error) moves.push(i);
  return moves;
}

export function positionName(i) { return typeof i === 'number' ? 'ABCDEFGHI'[i % 9] + (9 - Math.floor(i / 9)) : i; }
