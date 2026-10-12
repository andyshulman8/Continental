// Continental (Family Rules) rules engine. Pure ES module: no DOM / Node APIs.
// State is plain JSON; every exported mutator returns a fresh state.

export const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
const MAX_LOG = 80;
const RUN_MAX = 13;

// ---------------------------------------------------------------- cards
export const isRedAce = (c) => !!c && c.rank === 1 && (c.suit === 'H' || c.suit === 'D');
export const isWild = (c) => !!c && (c.joker === true || isRedAce(c));

export function cardPoints(card) {
  if (card.joker) return 10;
  if (card.rank === 1) return card.suit === 'H' || card.suit === 'D' ? 10 : 15;
  if (card.rank >= 10) return 10;
  return card.rank;
}

export function cardLabel(c) {
  if (c.joker) return 'Joker';
  const r = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[c.rank] || String(c.rank);
  return r + SUIT_GLYPH[c.suit];
}

function makeDeck(decks) {
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) {
        cards.push({ id: `d${d}-${suit}-${rank}`, rank, suit, joker: false });
      }
    }
    for (let j = 1; j <= 2; j++) cards.push({ id: `d${d}-JK-${j}`, rank: 0, suit: null, joker: true });
  }
  return cards;
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const stripAs = (c) => {
  if (!('as' in c)) return c;
  const { as, ...rest } = c; // eslint-disable-line no-unused-vars
  return rest;
};

// ---------------------------------------------------------------- hands
export function HANDS(n) {
  const mk = (sets, runs) => [
    ...Array.from({ length: sets }, () => ({ kind: 'set' })),
    ...Array.from({ length: runs }, () => ({ kind: 'run' })),
  ];
  const list = [mk(2, 0), mk(1, 1), mk(0, 2), mk(3, 0), mk(2, 1), mk(1, 2)];
  if (n === 3) list.push(mk(2, 2));
  list.push(mk(0, 3), mk(0, 4));
  return list;
}

const kindOf = (e) => (typeof e === 'string' ? e : e.kind);
export function minCardsFor(contract) {
  return contract.reduce((t, e) => t + (kindOf(e) === 'set' ? 3 : 4), 0);
}
export function contractLabel(contract) {
  const s = contract.filter((e) => kindOf(e) === 'set').length;
  const r = contract.length - s;
  const parts = [];
  if (s) parts.push(`${s} set${s > 1 ? 's' : ''}`);
  if (r) parts.push(`${r} run${r > 1 ? 's' : ''}`);
  return parts.join(' + ');
}

// ---------------------------------------------------------------- RNG
function hashSeed(seed) {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 2166136261;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rnd(s) {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(arr, s) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------- melds: sets
function checkSet(cards, fixedRank = null) {
  if (cards.length < 3) return { ok: false, error: 'A set needs at least 3 cards.' };
  const raw = cards.map(stripAs);
  let cands;
  if (fixedRank) cands = [fixedRank];
  else {
    cands = [...new Set(raw.filter((c) => !isWild(c)).map((c) => c.rank))];
    if (raw.some(isRedAce) && !cands.includes(1)) cands.push(1);
  }
  let reason = 'A set needs 3 or more cards of the same rank.';
  for (const r of cands) {
    let nat = 0;
    let wild = 0;
    let ok = true;
    for (const c of raw) {
      if (c.joker) wild++;
      else if (c.rank === r) nat++;
      else if (isRedAce(c)) wild++;
      else ok = false;
    }
    if (!ok) continue;
    if (nat < 1) { reason = 'A set needs at least one natural card.'; continue; }
    if (wild > nat) { reason = 'Wild cards cannot outnumber natural cards in a meld.'; continue; }
    const ordered = raw.map((c) => (c.joker || (isRedAce(c) && r !== 1) ? { ...c, as: { rank: r, suit: null } } : c));
    return { ok: true, ordered, rank: r };
  }
  return { ok: false, error: reason };
}

// ---------------------------------------------------------------- melds: runs
// Place `cards` (unordered pool) on slots with ranks s..s+n-1 (14 = ace high).
function runSlots(cards, s, suit) {
  const slots = [];
  for (let i = 0; i < cards.length; i++) slots.push({ rank: s + i, nat: null });
  const natIds = new Set();
  const reds = [];
  for (const c of cards) {
    if (c.joker) continue;
    if (isRedAce(c)) { reds.push(c); continue; }
    if (c.suit !== suit) return null;
    const slot = slots.find((sl) => !sl.nat && (sl.rank === c.rank || (c.rank === 1 && sl.rank === 14)));
    if (!slot) return null;
    slot.nat = c;
    natIds.add(c.id);
  }
  for (const c of reds) {
    if (c.suit !== suit) continue;
    const slot = slots.find((sl) => !sl.nat && (sl.rank === 1 || sl.rank === 14));
    if (slot) { slot.nat = c; natIds.add(c.id); }
  }
  return { slots, natIds, filled: natIds.size };
}

// Build ordered cards for slots; wild cards are taken from `cards` in given order.
function buildRun(cards, res, suit) {
  const pool = cards.filter((c) => !res.natIds.has(c.id)).map(stripAs);
  let wi = 0;
  return res.slots.map((sl) => {
    if (sl.nat) return stripAs(sl.nat);
    const w = pool[wi++];
    return { ...w, as: { rank: sl.rank === 14 ? 1 : sl.rank, suit } };
  });
}

function checkRun(cards) {
  const n = cards.length;
  if (n < 4) return { ok: false, error: 'A run needs at least 4 cards.' };
  if (n > RUN_MAX) return { ok: false, error: 'A run can have at most 13 cards.' };
  const suits = [...new Set(cards.filter((c) => !isWild(c)).map((c) => c.suit))];
  if (suits.length === 0) return { ok: false, error: 'A run needs natural cards of one suit.' };
  if (suits.length > 1) return { ok: false, error: 'A run must be all one suit.' };
  const suit = suits[0];
  let loose = null;
  let reason = 'Those cards do not form a run in sequence.';
  for (let s = 1; s + n - 1 <= 14; s++) {
    const res = runSlots(cards, s, suit);
    if (!res) continue;
    if (n - res.filled > res.filled) { reason = 'Wild cards cannot outnumber natural cards in a meld.'; continue; }
    let strict = true;
    for (let i = 0; i < n && strict; i++) {
      const sl = res.slots[i];
      if (sl.nat ? cards[i].id !== sl.nat.id : res.natIds.has(cards[i].id)) strict = false;
    }
    const out = { ok: true, ordered: buildRun(cards, res, suit), suit, low: s };
    if (strict) return out;
    if (!loose) loose = out;
  }
  return loose || { ok: false, error: reason };
}

export function validateMeld(cards, kind) {
  if (!Array.isArray(cards)) return { ok: false, error: 'No cards given.' };
  if (kind === 'set') return checkSet(cards);
  if (kind === 'run') return checkRun(cards);
  return { ok: false, error: 'Unknown meld kind.' };
}

// Preview adding `cards` to an existing meld. position: 'start'|'end' (runs only; auto if omitted).
export function previewAdd(meld, cards, position) {
  if (!cards.length) return { ok: false, error: 'No cards selected.' };
  if (meld.kind === 'set') {
    const r = checkSet([...meld.cards, ...cards], meld.rank);
    if (!r.ok) return r;
    return { ok: true, cards: r.ordered, position: 'end', patch: {} };
  }
  const k = cards.length;
  const len = meld.cards.length;
  if (len + k > RUN_MAX) return { ok: false, error: 'A run can have at most 13 cards.' };
  const positions = position === 'start' || position === 'end' ? [position] : ['end', 'start'];
  const exWild = meld.cards.filter((c) => c.as).length;
  let err = 'Those cards do not extend this run.';
  for (const pos of positions) {
    const s = pos === 'end' ? meld.low + len : meld.low - k;
    if (s < 1 || s + k - 1 > 14) continue;
    const res = runSlots(cards, s, meld.suit);
    if (!res) continue;
    const nat = len - exWild + res.filled;
    const wild = exWild + k - res.filled;
    if (wild > nat) { err = 'Wild cards cannot outnumber natural cards in a meld.'; continue; }
    const built = buildRun(cards, res, meld.suit);
    return {
      ok: true,
      position: pos,
      cards: pos === 'end' ? [...meld.cards, ...built] : [...built, ...meld.cards],
      patch: { low: pos === 'end' ? meld.low : s },
    };
  }
  return { ok: false, error: err };
}

// ---------------------------------------------------------------- canGoDown
// Finds a layout of the contract's melds inside `hand` (minimal melds; leftovers stay in hand).
export function canGoDown(hand, contract) {
  const kinds = contract.map(kindOf);
  const nR = kinds.filter((k) => k === 'run').length;
  const nS = kinds.length - nR;
  if (hand.length < 3 * nS + 4 * nR) return { ok: false };

  const byKey = new Map();
  const jokers = [];
  for (const c of hand) {
    if (c.joker) { jokers.push(c); continue; }
    const k = c.suit + c.rank;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(c);
  }
  const cnt = (k) => (byKey.get(k) ? byKey.get(k).length : 0);
  const J = jokers.length;

  // ---- candidate generation
  const setCands = [];
  if (nS) {
    for (let r = 1; r <= 13; r++) {
      const keys = SUITS.map((s) => s + r).filter((k) => cnt(k) > 0);
      const rec = (start, need, chosen) => {
        if (need === 0) { out(chosen.slice()); return; }
        for (let i = start; i < keys.length; i++) {
          const used = chosen.filter((x) => x === keys[i]).length;
          if (used >= cnt(keys[i])) continue;
          chosen.push(keys[i]);
          rec(i, need - 1, chosen);
          chosen.pop();
        }
      };
      let wilds = 0;
      const out = (nat) => setCands.push({ kind: 'set', nat, wilds, slots: null });
      wilds = 0; rec(0, 3, []);
      wilds = 1; rec(0, 2, []);
    }
    setCands.sort((a, b) => a.wilds - b.wilds);
  }
  const runCands = [];
  if (nR) {
    for (const suit of SUITS) {
      for (let st = 1; st <= 11; st++) {
        for (let l = 4; l <= 5 && st + l - 1 <= 14; l++) {
          const slotKeys = [];
          for (let i = 0; i < l; i++) { const r = st + i; slotKeys.push(suit + (r === 14 ? 1 : r)); }
          for (let mask = 0; mask < 1 << l; mask++) {
            let nat = 0;
            let ok = true;
            for (let i = 0; i < l; i++) {
              if (mask & (1 << i)) { if (cnt(slotKeys[i]) === 0) { ok = false; break; } nat++; }
            }
            if (!ok) continue;
            const wilds = l - nat;
            if (wilds > nat) continue;
            if (l > 4 && (!(mask & 1) || !(mask & (1 << (l - 1))))) continue;
            runCands.push({
              kind: 'run', suit, nat: slotKeys.filter((_, i) => mask & (1 << i)),
              wilds, slots: slotKeys.map((k, i) => ((mask & (1 << i)) ? k : null)),
            });
          }
        }
      }
      runCands.sort((a, b) => a.wilds - b.wilds);
    }
    runCands.sort((a, b) => a.wilds - b.wilds);
  }

  // ---- DFS
  const order = [...kinds.filter((k) => k === 'run'), ...kinds.filter((k) => k === 'set')];
  const used = new Map();
  const chosen = [];
  let wildsUsed = 0;
  const wildCap = () => J + (cnt('H1') - (used.get('H1') || 0)) + (cnt('D1') - (used.get('D1') || 0));
  let steps = 0;
  let cardsUsed = 0;
  const minLeft = (j) => order.slice(j).reduce((t, k) => t + (k === 'run' ? 4 : 3), 0);
  function dfs(j, minIdx) {
    if (j === order.length) return true;
    const kind = order[j];
    const list = kind === 'run' ? runCands : setCands;
    const start = j > 0 && order[j - 1] === kind ? minIdx : 0;
    for (let i = start; i < list.length; i++) {
      if (++steps > 30000) return false;
      const cand = list[i];
      const size = cand.nat.length + cand.wilds;
      if (cardsUsed + size + minLeft(j + 1) > hand.length) continue;
      let ok = true;
      const added = [];
      for (const k of cand.nat) {
        const u = (used.get(k) || 0) + 1;
        if (u > cnt(k)) { ok = false; break; }
        used.set(k, u);
        added.push(k);
      }
      if (ok && wildsUsed + cand.wilds <= wildCap()) {
        wildsUsed += cand.wilds;
        cardsUsed += size;
        chosen.push(cand);
        if (dfs(j + 1, i)) return true;
        chosen.pop();
        cardsUsed -= size;
        wildsUsed -= cand.wilds;
      }
      for (const k of added) used.set(k, used.get(k) - 1);
    }
    return false;
  }
  if (!dfs(0, 0)) return { ok: false };

  // ---- materialise
  const queues = new Map([...byKey].map(([k, v]) => [k, v.slice()]));
  const take = (k) => queues.get(k).shift();
  const natCards = chosen.map((cand) => cand.slots
    ? cand.slots.map((k) => (k ? take(k) : null))
    : cand.nat.map((k) => take(k)));
  const jq = jokers.slice();
  const spare = () => {
    for (const k of ['H1', 'D1']) if (queues.get(k) && queues.get(k).length) return queues.get(k).shift();
    return null;
  };
  const melds = [];
  for (let i = 0; i < chosen.length; i++) {
    const cand = chosen[i];
    const cards = natCards[i].slice();
    if (cand.kind === 'run') {
      for (let s = 0; s < cards.length; s++) if (!cards[s]) cards[s] = jq.length ? jq.shift() : spare();
    } else {
      for (let w = 0; w < cand.wilds; w++) cards.push(jq.length ? jq.shift() : spare());
    }
    const v = validateMeld(cards, cand.kind);
    if (!v.ok) return { ok: false };
    melds.push({ kind: cand.kind, cardIds: v.ordered.map((c) => c.id), cards: v.ordered });
  }
  return { ok: true, melds };
}

// ---------------------------------------------------------------- state
export function newGame({ players, hard = false, seed, dealSize = 11, dealSizes, maxReshuffles } = {}) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
    throw new Error('Continental needs 2 to 4 players.');
  }
  const n = players.length;
  const s = {
    phase: 'playing',
    handIndex: 0,
    handCount: HANDS(n).length,
    contract: [],
    dealer: 0,
    turn: 0,
    step: 'draw',
    players: players.map((p, i) => ({
      id: p.id ?? `p${i}`,
      name: p.name ?? `Player ${i + 1}`,
      isBot: !!p.isBot,
      botLevel: p.botLevel ?? null,
      hand: [],
      down: false,
      score: 0,
      handScores: [],
    })),
    stock: [],
    discard: [],
    melds: [],
    hard: !!hard,
    log: [],
    decks: 2,
    dealSize,
    dealSizes: dealSizes || null,
    maxReshuffles: maxReshuffles ?? null,
    reshuffles: 0,
    turnCount: 0,
    meldSeq: 0,
    drawnCardId: null,
    handWinnerId: null,
    winnerId: null,
    seed: seed === undefined ? Math.floor(Math.random() * 4294967296) : seed,
    rng: 0,
  };
  s.rng = hashSeed(s.seed);
  s.dealer = Math.floor(rnd(s) * n);
  deal(s);
  return s;
}

function deal(s) {
  const n = s.players.length;
  s.contract = HANDS(n)[s.handIndex];
  const size = (s.dealSizes && s.dealSizes[s.handIndex]) || s.dealSize || 11;
  const deck = shuffle(makeDeck(s.decks), s);
  for (const p of s.players) { p.hand = []; p.down = false; }
  for (let i = 0; i < size; i++) for (const p of s.players) p.hand.push(deck.pop());
  s.discard = [deck.pop()];
  s.stock = deck;
  s.melds = [];
  s.turn = (s.dealer + 1) % n;
  s.step = 'draw';
  s.reshuffles = 0;
  s.turnCount = 0;
  s.drawnCardId = null;
  s.handWinnerId = null;
  s.winnerId = null;
  s.phase = 'playing';
  pushLog(s, null, 'hand', `Hand ${s.handIndex + 1} of ${s.handCount}: ${contractLabel(s.contract)}. ${s.players[s.turn].name} goes first.`);
}

function pushLog(s, playerId, type, text, extra) {
  s.log.push({ playerId, type, text, ...(extra || {}) });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}

export function nextHand(state) {
  if (state.phase !== 'handOver') return clone(state);
  const s = clone(state);
  s.handIndex += 1;
  s.dealer = (s.dealer + 1) % s.players.length;
  deal(s);
  return s;
}

export function viewFor(state, playerId) {
  const v = clone(state);
  delete v.rng;
  delete v.seed;
  v.viewer = playerId ?? null;
  v.stockCount = state.stock.length;
  v.stock = [];
  const reveal = v.phase !== 'playing';
  for (const p of v.players) {
    p.cardCount = p.hand.length;
    if (p.id !== playerId && !reveal) p.hand = [];
  }
  return v;
}

function endHand(s, winnerId, events, why) {
  const scores = {};
  for (const p of s.players) {
    const pts = p.id === winnerId ? 0 : p.hand.reduce((t, c) => t + cardPoints(c), 0);
    scores[p.id] = pts;
    p.handScores.push(pts);
    p.score += pts;
  }
  s.handWinnerId = winnerId;
  s.winnerId = winnerId;
  const totals = Object.fromEntries(s.players.map((p) => [p.id, p.score]));
  events.push({ type: 'handOver', winnerId, scores, totals, stalemate: winnerId === null });
  const w = s.players.find((p) => p.id === winnerId);
  pushLog(s, winnerId, 'handOver', winnerId ? `${w.name} went out and wins the hand!` : `Hand ended: ${why || 'stalemate'}.`);
  if (s.handIndex + 1 >= s.handCount) {
    s.phase = 'gameOver';
    const best = Math.min(...s.players.map((p) => p.score));
    const tied = s.players.filter((p) => p.score === best);
    const wins = (p) => p.handScores.filter((x) => x === 0).length;
    tied.sort((a, b) => wins(b) - wins(a));
    s.gameWinnerIds = tied.filter((p) => p.score === best && wins(p) === wins(tied[0])).map((p) => p.id);
    s.winnerId = tied[0].id;
    events.push({ type: 'gameOver', winnerId: s.winnerId, winnerIds: s.gameWinnerIds });
    pushLog(s, s.winnerId, 'gameOver', `${tied[0].name} wins the game!`);
  } else {
    s.phase = 'handOver';
  }
}

const fail = (error) => ({ ok: false, error });

function takeFromHand(p, ids) {
  const set = new Set(ids);
  const taken = [];
  p.hand = p.hand.filter((c) => { if (set.has(c.id)) { taken.push(c); return false; } return true; });
  const byId = new Map(taken.map((c) => [c.id, c]));
  return ids.map((id) => byId.get(id));
}

export function act(state, playerId, action) {
  try {
    return actInner(state, playerId, action);
  } catch (e) {
    return fail(`Invalid action (${e && e.message ? e.message : e}).`);
  }
}

function actInner(state, playerId, action) {
  if (!action || typeof action !== 'object') return fail('No action given.');
  if (state.phase !== 'playing') return fail('This hand is over.');
  const cur = state.players[state.turn];
  if (cur.id !== playerId) return fail("It's not your turn.");
  const s = clone(state);
  const p = s.players[s.turn];
  const events = [];
  const hasIds = (ids) => Array.isArray(ids) && ids.length > 0 && new Set(ids).size === ids.length
    && ids.every((id) => p.hand.some((c) => c.id === id));

  switch (action.type) {
    case 'draw': {
      if (s.step !== 'draw') return fail('You have already drawn this turn.');
      const from = action.from;
      if (from !== 'stock' && from !== 'discard') return fail('Draw from the stock or the discard pile.');
      let card;
      if (from === 'discard') {
        if (p.down) return fail('Once you are down you can only draw from the stock.');
        if (!s.discard.length) return fail('The discard pile is empty.');
        card = s.discard.pop();
      } else {
        if (s.stock.length === 0) {
          const cap = s.maxReshuffles ?? (minCardsFor(s.contract) > (s.hard ? 11 : 12) ? 0 : 2);
          if (s.discard.length <= 1 || s.reshuffles >= cap) {
            endHand(s, null, events, 'the stock ran out');
            return { ok: true, state: s, events };
          }
          const top = s.discard.pop();
          s.stock = shuffle(s.discard.map(stripAs), s);
          s.discard = [top];
          s.reshuffles += 1;
          pushLog(s, null, 'reshuffle', 'The discard pile was reshuffled into the stock.');
        }
        card = s.stock.pop();
      }
      p.hand.push(card);
      s.step = 'play';
      s.drawnCardId = card.id;
      events.push({ type: 'draw', playerId, from, ...(from === 'discard' ? { cardId: card.id } : {}) });
      pushLog(s, playerId, 'draw', from === 'discard' ? `${p.name} took ${cardLabel(card)} from the discard pile.` : `${p.name} drew from the stock.`, from === 'discard' ? { cardId: card.id } : undefined);
      return { ok: true, state: s, events };
    }

    case 'lay': {
      if (s.step !== 'play') return fail('Draw a card first.');
      if (p.down) return fail('You are already down.');
      const req = action.melds;
      if (!Array.isArray(req) || !req.length) return fail('Choose the melds to lay down.');
      const need = { set: 0, run: 0 };
      for (const e of s.contract) need[kindOf(e)]++;
      const got = { set: 0, run: 0 };
      const allIds = [];
      for (const m of req) {
        if (!m || (m.kind !== 'set' && m.kind !== 'run')) return fail('Unknown meld kind.');
        got[m.kind]++;
        if (!Array.isArray(m.cardIds)) return fail('Each meld needs cards.');
        allIds.push(...m.cardIds);
      }
      if (got.set !== need.set || got.run !== need.run) return fail(`This hand needs exactly ${contractLabel(s.contract)}.`);
      if (!hasIds(allIds)) return fail('Those cards are not all in your hand.');
      const built = [];
      for (const m of req) {
        const cards = m.cardIds.map((id) => p.hand.find((c) => c.id === id));
        const v = validateMeld(cards, m.kind);
        if (!v.ok) return fail(`Invalid ${m.kind}: ${v.error}`);
        built.push({ kind: m.kind, v });
      }
      takeFromHand(p, allIds);
      p.down = true;
      const ids = [];
      for (const b of built) {
        const id = `m${++s.meldSeq}`;
        ids.push(id);
        const meld = { id, kind: b.kind, ownerId: playerId, cards: b.v.ordered };
        if (b.kind === 'set') meld.rank = b.v.rank;
        else { meld.suit = b.v.suit; meld.low = b.v.low; }
        s.melds.push(meld);
      }
      if (s.hard && p.hand.length === 0) return fail('Hard mode: keep one card to discard to go out.');
      events.push({ type: 'lay', playerId, meldIds: ids });
      pushLog(s, playerId, 'lay', `${p.name} went down with ${contractLabel(s.contract)}.`);
      if (p.hand.length === 0) endHand(s, playerId, events);
      return { ok: true, state: s, events };
    }

    case 'add': {
      if (s.step !== 'play') return fail('Draw a card first.');
      if (!p.down) return fail('You must go down before adding to melds.');
      const meld = s.melds.find((m) => m.id === action.meldId);
      if (!meld) return fail('That meld does not exist.');
      if (!hasIds(action.cardIds)) return fail('Those cards are not all in your hand.');
      const cards = action.cardIds.map((id) => p.hand.find((c) => c.id === id));
      const r = previewAdd(meld, cards, action.position);
      if (!r.ok) return fail(r.error);
      takeFromHand(p, action.cardIds);
      meld.cards = r.cards;
      Object.assign(meld, r.patch);
      if (s.hard && p.hand.length === 0) return fail('Hard mode: keep one card to discard to go out.');
      events.push({ type: 'add', playerId, meldId: meld.id, n: cards.length, position: r.position });
      pushLog(s, playerId, 'add', `${p.name} added ${cards.map(cardLabel).join(' ')} to a ${meld.kind}.`);
      if (p.hand.length === 0) endHand(s, playerId, events);
      return { ok: true, state: s, events };
    }

    case 'discard': {
      if (s.step !== 'play') return fail('Draw a card first.');
      const card = p.hand.find((c) => c.id === action.cardId);
      if (!card) return fail('That card is not in your hand.');
      if (card.id === s.drawnCardId && p.hand.length > 1) return fail('You cannot discard the card you just drew.');
      p.hand = p.hand.filter((c) => c.id !== card.id);
      s.discard.push(card);
      events.push({ type: 'discard', playerId, cardId: card.id });
      pushLog(s, playerId, 'discard', `${p.name} discarded ${cardLabel(card)}.`, { cardId: card.id });
      if (p.hand.length === 0) {
        endHand(s, playerId, events);
      } else {
        s.turn = (s.turn + 1) % s.players.length;
        s.step = 'draw';
        s.drawnCardId = null;
        s.turnCount = (s.turnCount || 0) + 1;
        const feasible = minCardsFor(s.contract) <= (s.hard ? 11 : 12);
        const maxTurns = s.maxTurns ?? s.players.length * (feasible ? 60 : 14);
        if (s.turnCount >= maxTurns) {
          endHand(s, null, events, 'nobody could go out');
        }
      }
      return { ok: true, state: s, events };
    }

    default:
      return fail('Unknown action.');
  }
}
