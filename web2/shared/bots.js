// Continental bots. chooseAction(view, level) -> a legal action for the player whose turn it is.
import { act, currentActor, canGoDown, cardPoints, isWild, minCardsFor, previewAdd, SUITS } from './engine.js';

const kindOf = (e) => (typeof e === 'string' ? e : e.kind);

// ------------------------------------------------------------ heuristics
// Estimated number of cards still missing to complete the contract.
function deficit(hand, contract) {
  const nR = contract.filter((e) => kindOf(e) === 'run').length;
  const nS = contract.length - nR;
  const need = 4 * nR + 3 * nS;
  let W = 0;
  const cnt = {};
  for (const c of hand) {
    if (isWild(c)) { W++; continue; }
    const k = c.suit + c.rank;
    cnt[k] = (cnt[k] || 0) + 1;
  }
  // run window candidates
  const wins = [];
  if (nR) {
    for (const suit of SUITS) {
      for (let st = 1; st <= 11; st++) {
        const keys = [];
        for (let i = 0; i < 4; i++) { const r = st + i; keys.push(suit + (r === 14 ? 1 : r)); }
        const have = keys.filter((k) => cnt[k] > 0).length;
        if (have) wins.push({ keys, have });
      }
    }
    wins.sort((a, b) => b.have - a.have);
    wins.length = Math.min(wins.length, 6);
  }
  let best = -1;
  const used = {};
  const rt = new Array(14).fill(0);
  for (const k in cnt) rt[Number(k.slice(1))] += cnt[k];
  const free = (k) => (cnt[k] || 0) - (used[k] || 0);
  function setsValue() {
    if (!nS) return 0;
    const per = [];
    for (let r = 1; r <= 13; r++) per.push(rt[r] > 3 ? 3 : rt[r]);
    per.sort((a, b) => b - a);
    let t = 0;
    for (let i = 0; i < nS; i++) t += per[i] || 0;
    return t;
  }
  function rec(start, left, got) {
    if (left === 0) {
      const prog = got + setsValue();
      const eff = prog + Math.min(W, prog, need - prog);
      if (eff > best) best = eff;
      return;
    }
    for (let i = start; i < wins.length; i++) {
      const w = wins[i];
      const taken = [];
      let g = 0;
      for (const k of w.keys) if (free(k) > 0) { used[k] = (used[k] || 0) + 1; rt[Number(k.slice(1))]--; taken.push(k); g++; }
      rec(i, left - 1, got + g);
      for (const k of taken) { used[k]--; rt[Number(k.slice(1))]++; }
    }
  }
  if (nR && wins.length === 0) {
    const prog = setsValue();
    best = prog + Math.min(W, prog, need - prog);
  } else rec(0, nR, 0);
  return need - Math.max(0, best);
}

function connectivity(hand) {
  const nat = hand.filter((c) => !isWild(c));
  let t = 0;
  for (let i = 0; i < nat.length; i++) {
    for (let j = i + 1; j < nat.length; j++) {
      const a = nat[i];
      const b = nat[j];
      if (a.rank === b.rank) t += 1;
      if (a.suit === b.suit) {
        let d = Math.abs(a.rank - b.rank);
        if (a.rank === 1 || b.rank === 1) d = Math.min(d, Math.abs((a.rank === 1 ? 14 : a.rank) - (b.rank === 1 ? 14 : b.rank)));
        if (d === 1) t += 1;
        else if (d === 2) t += 0.5;
      }
    }
  }
  return t;
}

const points = (hand) => hand.reduce((t, c) => t + cardPoints(c), 0);

function handValue(hand, contract) {
  return -deficit(hand, contract) * 1000 + connectivity(hand) * 8 - points(hand);
}

// ------------------------------------------------------------ helpers
function findAdd(view, me, card) {
  for (const m of view.melds) {
    const positions = m.kind === 'run' ? ['end', 'start'] : [undefined];
    for (const position of positions) {
      if (previewAdd(m, [card], position).ok) {
        const action = { type: 'add', meldId: m.id, cardIds: [card.id] };
        if (position) action.position = position;
        return action;
      }
    }
  }
  return null;
}

function legal(view, me, action) {
  return act(view, me.id, action).ok;
}

function nextAdd(view, me) {
  const cards = [...me.hand].sort((a, b) => Number(isWild(a)) - Number(isWild(b)) || cardPoints(b) - cardPoints(a));
  for (const c of cards) {
    const a = findAdd(view, me, c);
    if (a && legal(view, me, a)) return a;
  }
  return null;
}

function fallbackDiscard(view, me) {
  const cards = [...me.hand].sort((a, b) => cardPoints(b) - cardPoints(a));
  for (const c of cards) {
    const a = { type: 'discard', cardId: c.id };
    if (legal(view, me, a)) return a;
  }
  return { type: 'discard', cardId: cards[0].id };
}

function chooseDiscard(view, me, level) {
  const hand = me.hand;
  const hard = view.hard;
  if (hand.length === 1 && hard) return fallbackDiscard(view, me);
  let bestCard = null;
  let bestScore = -Infinity;
  const anyDown = view.players.some((p) => p.down && p.id !== me.id);
  for (const c of hand) {
    if (c.id === view.drawnCardId && hand.length > 1) continue;
    let score;
    const rest = hand.filter((x) => x.id !== c.id);
    if (level === 'easy') {
      score = (isWild(c) ? -50 : 0) + Math.random() * 20;
    } else if (me.down) {
      score = cardPoints(c) + (isWild(c) ? -5 : 0);
      if (level === 'hard' && anyDown && findAdd(view, me, c)) score -= 30;
    } else if (level === 'normal') {
      let link = 0;
      for (const x of rest) {
        if (isWild(x) || isWild(c)) continue;
        if (x.rank === c.rank) link += 8;
        if (x.suit === c.suit && Math.abs(x.rank - c.rank) <= 2) link += 6;
      }
      score = cardPoints(c) - link + (isWild(c) ? -60 : 0);
    } else {
      score = handValue(rest, view.contract) + (isWild(c) ? -400 : 0);
      if (anyDown && findAdd(view, me, c)) score -= 30;
    }
    if (score > bestScore) { bestScore = score; bestCard = c; }
  }
  const a = { type: 'discard', cardId: bestCard.id };
  return legal(view, me, a) ? a : fallbackDiscard(view, me);
}

function chooseDraw(view, me, level) {
  const stockDead = view.stockCount === 0 && view.discard.length <= 1;
  const stock = { type: 'draw', from: 'stock' };
  const top = view.discard[view.discard.length - 1];
  if (!top || me.down || top.id !== view.liveCardId || view.discarderId === me.id) return stock;
  const take = { type: 'draw', from: 'discard' };
  if (level === 'easy') {
    return Math.random() < 0.15 || (isWild(top) && Math.random() < 0.6) ? take : stock;
  }
  if (stockDead) return take;
  if (me.down) return findAdd(view, me, top) ? take : stock;
  if (isWild(top)) return take;
  const min = minCardsFor(view.contract);
  const hand = me.hand;
  const withTop = [...hand, top];
  if (withTop.length >= min && canGoDown(withTop, view.contract).ok && !(hand.length >= min && canGoDown(hand, view.contract).ok)) return take;
  if (level === 'normal') {
    const pair = hand.some((c) => !isWild(c) && c.rank === top.rank && c.suit !== top.suit);
    const d0 = deficit(hand, view.contract);
    const d1 = deficit(withTop, view.contract);
    return (d1 < d0 || pair) && Math.random() < 0.7 ? take : stock;
  }
  return deficit(withTop, view.contract) < deficit(hand, view.contract) ? take : stock;
}

function choosePlay(view, me, level) {
  if (!me.down) {
    if (me.hand.length >= minCardsFor(view.contract)) {
      const g = view.hard ? canGoDown(me.hand, view.contract, { maxLeft: 1 }) : canGoDown(me.hand, view.contract);
      if (g.ok) {
        const action = { type: 'lay', melds: g.melds.map((m) => ({ kind: m.kind, cardIds: m.cardIds })) };
        if (legal(view, me, action)) return action;
      }
    }
  } else {
    const skip = level === 'easy' && Math.random() < 0.4;
    if (!skip) {
      const a = nextAdd(view, me);
      if (a) return a;
    }
  }
  return chooseDiscard(view, me, level);
}

function chooseClaim(view, me, level) {
  const top = view.discard[view.discard.length - 1];
  const yes = { type: 'claim' };
  const no = { type: 'pass' };
  if (!top || me.down) return no;
  if (level === 'easy') return Math.random() < 0.1 ? yes : no;
  if (isWild(top)) return yes;
  const min = minCardsFor(view.contract);
  const withTop = [...me.hand, top];
  if (withTop.length >= min && canGoDown(withTop, view.contract).ok && !(me.hand.length >= min && canGoDown(me.hand, view.contract).ok)) return yes;
  const better = deficit(withTop, view.contract) < deficit(me.hand, view.contract);
  if (level === 'normal') return better && Math.random() < 0.6 ? yes : no;
  return better ? yes : no;
}

// ------------------------------------------------------------ API
export function chooseAction(view, level = 'normal') {
  const lv = level === 'easy' || level === 'hard' ? level : 'normal';
  if (view.phase !== 'playing') return null;
  const actor = view.pendingClaim ? view.pendingClaim.current : view.players[view.turn].id;
  const me = view.players.find((p) => p.id === actor);
  if (!me) return null;
  try {
    if (view.pendingClaim) return chooseClaim(view, me, lv);
    if (view.step === 'draw') return chooseDraw(view, me, lv);
    return choosePlay(view, me, lv);
  } catch (e) {
    if (view.pendingClaim) return { type: 'pass' };
    if (view.step === 'draw') return { type: 'draw', from: 'stock' };
    return fallbackDiscard(view, me);
  }
}
