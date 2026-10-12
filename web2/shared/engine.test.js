import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, act, viewFor, currentActor, nextHand, validateMeld, canGoDown, cardPoints, HANDS, previewAdd,
} from './engine.js';
import { chooseAction } from './bots.js';

// ---- helpers
const C = (spec) => {
  // 'S7' | 'H1' | 'JK' ; optional deck suffix ':1'
  const [body, d = '0'] = spec.split(':');
  if (body.startsWith('JK')) return { id: `d${d}-JK-${body.slice(2) || 1}`, rank: 0, suit: null, joker: true };
  return { id: `d${d}-${body[0]}-${body.slice(1)}`, rank: Number(body.slice(1)), suit: body[0], joker: false };
};
const cs = (str) => str.trim().split(/\s+/).map(C);
const ids = (cards) => cards.map((c) => c.id);
const mkPlayers = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, ...extra }));

// Build a game and override pieces for deterministic scenarios.
function setup({ n = 2, hand = 0, hard = false, hands = {}, melds = [], step = 'play', turn = 0, seed = 1 } = {}) {
  const s = newGame({ players: mkPlayers(n), hard, seed });
  s.handIndex = hand;
  s.contract = HANDS(n)[hand];
  s.turn = turn;
  s.step = step;
  for (const [i, h] of Object.entries(hands)) s.players[i].hand = typeof h === 'string' ? cs(h) : h;
  s.melds = melds;
  s.liveCardId = s.discard[s.discard.length - 1].id;
  s.discarderId = null;
  return s;
}
const ok = (r) => { assert.equal(r.ok, true, r.error); return r.state; };

// ---------------------------------------------------------------- basics
test('cardPoints', () => {
  assert.equal(cardPoints(C('S1')), 15);
  assert.equal(cardPoints(C('C1')), 15);
  assert.equal(cardPoints(C('H1')), 10);
  assert.equal(cardPoints(C('D1')), 10);
  assert.equal(cardPoints(C('JK')), 10);
  assert.equal(cardPoints(C('S7')), 7);
  assert.equal(cardPoints(C('S10')), 10);
  assert.equal(cardPoints(C('S13')), 10);
});

test('HANDS schedules', () => {
  const lab = (c) => `${c.filter((x) => x.kind === 'set').length}S${c.filter((x) => x.kind === 'run').length}R`;
  assert.deepEqual(HANDS(2).map(lab), ['2S0R', '1S1R', '0S2R', '3S0R', '2S1R', '1S2R', '0S3R', '0S4R']);
  assert.deepEqual(HANDS(4).map(lab), HANDS(2).map(lab));
  assert.deepEqual(HANDS(3).map(lab), ['2S0R', '1S1R', '0S2R', '3S0R', '2S1R', '1S2R', '2S2R', '0S3R', '0S4R']);
});

test('newGame deals 11 cards, decks sized per player count, unique ids', () => {
  for (const [n, total] of [[2, 108], [3, 108], [4, 108]]) {
    const s = newGame({ players: mkPlayers(n), seed: 5 });
    assert.equal(s.handCount, n === 3 ? 9 : 8);
    s.players.forEach((p) => assert.equal(p.hand.length, 11));
    assert.equal(s.discard.length, 1);
    const all = [...s.stock, ...s.discard, ...s.players.flatMap((p) => p.hand)];
    assert.equal(all.length, total);
    assert.equal(new Set(ids(all)).size, total);
    assert.equal(s.turn, (s.dealer + 1) % n);
    assert.equal(s.step, 'draw');
    assert.equal(s.phase, 'playing');
  }
});

test('seed determinism', () => {
  const a = newGame({ players: mkPlayers(3), seed: 'abc' });
  const b = newGame({ players: mkPlayers(3), seed: 'abc' });
  const c = newGame({ players: mkPlayers(3), seed: 'abd' });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.players[0].hand, c.players[0].hand);
});

test('newGame rejects bad player counts', () => {
  assert.throws(() => newGame({ players: mkPlayers(1) }));
  assert.throws(() => newGame({ players: mkPlayers(5) }));
});

// ---------------------------------------------------------------- sets
test('sets: valid and invalid', () => {
  assert.ok(validateMeld(cs('S7 H7 D7'), 'set').ok);
  assert.ok(validateMeld(cs('S7 H7 D7 C7 S7:1'), 'set').ok);
  assert.equal(validateMeld(cs('S7 H7'), 'set').ok, false);
  assert.equal(validateMeld(cs('S7 H7 D8'), 'set').ok, false);
  // wild limits
  assert.ok(validateMeld(cs('S7 H7 JK'), 'set').ok);
  assert.ok(validateMeld(cs('S7 H7 JK1 JK2'), 'set').ok);
  assert.equal(validateMeld(cs('S7 JK1 JK2'), 'set').ok, false);
  assert.equal(validateMeld(cs('S7 H7 JK1 JK2 D1'), 'set').ok, false);
  assert.equal(validateMeld(cs('JK1 JK2 H1'), 'set').ok, false);
});

test('sets: red ace is wild in a non-ace set, natural in an ace set', () => {
  const r = validateMeld(cs('S7 H7 H1'), 'set');
  assert.ok(r.ok);
  assert.deepEqual(r.ordered[2].as, { rank: 7, suit: null });
  const a = validateMeld(cs('S1 C1 H1'), 'set');
  assert.ok(a.ok);
  assert.equal(a.ordered[2].as, undefined);
  // two red aces + one black ace: all natural aces
  assert.ok(validateMeld(cs('S1 H1 D1'), 'set').ok);
  // red aces as naturals plus a joker
  const b = validateMeld(cs('H1 D1 JK'), 'set');
  assert.ok(b.ok);
  assert.equal(b.ordered[0].as, undefined);
  assert.ok(b.ordered[2].as);
});

// ---------------------------------------------------------------- runs
test('runs: basic, ace low, ace high, no wrap', () => {
  assert.ok(validateMeld(cs('S5 S6 S7 S8'), 'run').ok);
  assert.ok(validateMeld(cs('S1 S2 S3 S4'), 'run').ok);
  assert.ok(validateMeld(cs('S11 S12 S13 S1'), 'run').ok);
  assert.equal(validateMeld(cs('S12 S13 S1 S2'), 'run').ok, false);
  assert.equal(validateMeld(cs('S13 S1 S2 S3'), 'run').ok, false);
  assert.equal(validateMeld(cs('S5 S6 S7'), 'run').ok, false);
  assert.equal(validateMeld(cs('S5 S6 H7 S8'), 'run').ok, false);
  assert.equal(validateMeld(cs('S5 S6 S6:1 S7'), 'run').ok, false);
});

test('runs: length 13 allowed, 14 not', () => {
  const full = Array.from({ length: 13 }, (_, i) => C(`S${i + 1}`));
  assert.ok(validateMeld(full, 'run').ok);
  assert.equal(validateMeld([...full, C('S1:1')], 'run').ok, false);
  assert.ok(validateMeld(Array.from({ length: 13 }, (_, i) => C(`S${i + 2 > 13 ? 1 : i + 2}`)), 'run').ok); // 2..K,A
});

test('runs: unordered input is arranged', () => {
  const r = validateMeld(cs('S8 S5 S7 S6'), 'run');
  assert.ok(r.ok);
  assert.deepEqual(r.ordered.map((c) => c.rank), [5, 6, 7, 8]);
});

test('runs: wild substitution inferred from position', () => {
  let r = validateMeld(cs('S5 JK S7 S8'), 'run');
  assert.ok(r.ok);
  assert.deepEqual(r.ordered[1].as, { rank: 6, suit: 'S' });
  r = validateMeld(cs('JK S6 S7 S8'), 'run');
  assert.deepEqual(r.ordered[0].as, { rank: 5, suit: 'S' });
  r = validateMeld(cs('S6 S7 S8 JK'), 'run');
  assert.deepEqual(r.ordered[3].as, { rank: 9, suit: 'S' });
  r = validateMeld(cs('S5 H1 S7 S8'), 'run'); // red ace as wild for the 6
  assert.ok(r.ok);
  assert.deepEqual(r.ordered[1].as, { rank: 6, suit: 'S' });
  // wild at the ace-high end
  r = validateMeld(cs('S10 S11 S12 JK1 JK2').slice(0, 4), 'run');
  assert.deepEqual(r.ordered[3].as, { rank: 13, suit: 'S' });
});

test('runs: wilds cannot outnumber naturals', () => {
  assert.ok(validateMeld(cs('S5 JK1 JK2 S8'), 'run').ok);
  assert.equal(validateMeld(cs('S5 JK1 JK2 JK3'), 'run').ok, false);
  assert.equal(validateMeld(cs('S5 S6 JK1 JK2 JK1:1'), 'run').ok, false);
  assert.ok(validateMeld(cs('S5 S6 S7 JK1 JK2 JK1:1'), 'run').ok); // 3 naturals, 3 wilds
});

test('runs: red ace natural only as ace of its suit', () => {
  let r = validateMeld(cs('H1 H2 H3 H4'), 'run');
  assert.ok(r.ok);
  assert.equal(r.ordered[0].as, undefined);
  r = validateMeld(cs('H10 H11 H12 H13 H1'), 'run');
  assert.ok(r.ok);
  assert.equal(r.ordered[4].as, undefined);
  // red ace of the wrong suit is wild
  r = validateMeld(cs('S2 S3 D1 S5'), 'run');
  assert.ok(r.ok);
  assert.deepEqual(r.ordered[2].as, { rank: 4, suit: 'S' });
  // red ace of the right suit used mid-run is wild
  r = validateMeld(cs('H2 H1:1 H4 H5'), 'run');
  assert.ok(r.ok);
  assert.deepEqual(r.ordered[1].as, { rank: 3, suit: 'H' });
  // red ace counts natural so wilds can equal naturals: H1 natural + 3 more
  assert.ok(validateMeld(cs('H1 H2 JK1 JK2'), 'run').ok); // 2 natural 2 wild
  assert.equal(validateMeld(cs('H2 D1 JK1 JK2'), 'run').ok, false); // D1 wild (wrong suit): 1 natural 3 wild
});

test('runs: strict order respected for wild placement', () => {
  // S5 S6 S7 + joker: joker goes at the end (8) when given last, start (4) when given first
  assert.deepEqual(validateMeld(cs('S5 S6 S7 JK'), 'run').ordered[3].as.rank, 8);
  assert.deepEqual(validateMeld(cs('JK S5 S6 S7'), 'run').ordered[0].as.rank, 4);
});

// ---------------------------------------------------------------- canGoDown
function checkLayout(hand, contract, r) {
  assert.ok(r.ok, 'expected layout');
  const used = r.melds.flatMap((m) => m.cardIds);
  assert.equal(new Set(used).size, used.length);
  used.forEach((id) => assert.ok(hand.some((c) => c.id === id)));
  const kinds = r.melds.map((m) => m.kind).sort();
  assert.deepEqual(kinds, contract.map((c) => c.kind).sort());
  for (const m of r.melds) {
    const cards = m.cardIds.map((id) => hand.find((c) => c.id === id));
    assert.ok(validateMeld(cards, m.kind).ok);
  }
}

test('canGoDown: two sets', () => {
  const hand = cs('S7 H7 D7 S9 H9 C9 S2 C12 D4 H5 C3');
  checkLayout(hand, HANDS(2)[0], canGoDown(hand, HANDS(2)[0]));
  const bad = cs('S7 H7 D8 S9 H9 C10 S2 C12 D4 H5 C3');
  assert.equal(canGoDown(bad, HANDS(2)[0]).ok, false);
});

test('canGoDown: set + run, uses wilds sensibly', () => {
  const hand = cs('S7 H7 JK S3 S4 S5 S6 C12 D4 H3 C13');
  checkLayout(hand, HANDS(2)[1], canGoDown(hand, HANDS(2)[1]));
});

test('canGoDown: 2 sets + 2 runs from 14 cards', () => {
  const hand = cs('S7 H7 D7 C9 D9 H9 C2 C3 C4 C5 H10 H11 H12 H13');
  const contract = HANDS(3)[6];
  checkLayout(hand, contract, canGoDown(hand, contract));
  // too few cards
  assert.equal(canGoDown(hand.slice(0, 11), contract).ok, false);
});

test('canGoDown: shares cards correctly between two same-suit runs', () => {
  const hand = cs('S2 S3 S4 S5 S6 S7 S8 S9 H1 H2 H3 H4');
  const contract = HANDS(2)[2];
  checkLayout(hand, contract, canGoDown(hand, contract));
  const short = cs('S2 S3 S4 S5 S6 S7 H9 D9 H1 C2 C3 D4');
  assert.equal(canGoDown(short, contract).ok, false);
});

test('canGoDown: wilds fill gaps but are limited; red aces can be natural', () => {
  const hand = cs('S2 S4 JK1 JK1:1 H5 H6 H7 H1 C9 D9 C13');
  const contract = HANDS(2)[2]; // two runs
  const r = canGoDown(hand, contract);
  checkLayout(hand, contract, r);
  // three runs of 4 from 12 cards
  const h12 = cs('S2 S3 S4 S5 H6 H7 H8 H9 C10 C11 C12 C13');
  checkLayout(h12, HANDS(2)[6], canGoDown(h12, HANDS(2)[6]));
  // not enough naturals
  const weak = cs('S2 JK1 JK1:1 JK2 JK2:1 H7 C9 D9 C13 D3 S11');
  assert.equal(canGoDown(weak, HANDS(2)[2]).ok, false);
});

test('canGoDown: 4 runs needs 16 cards', () => {
  const hand = cs('S2 S3 S4 S5 H6 H7 H8 H9 C10 C11 C12 C13 D2 D3 D4 D5');
  checkLayout(hand, HANDS(2)[7], canGoDown(hand, HANDS(2)[7]));
  assert.equal(canGoDown(hand.slice(0, 12), HANDS(2)[7]).ok, false);
});

test('canGoDown: randomized layouts are always valid', () => {
  const g = newGame({ players: mkPlayers(4), seed: 99 });
  const deck = [...g.stock, ...g.players.flatMap((p) => p.hand)];
  let found = 0;
  for (let t = 0; t < 400; t++) {
    const hand = Array.from({ length: 12 }, (_, i) => deck[(t * 37 + i * 11 + ((t * i) % 7) * 5) % deck.length]);
    if (new Set(ids(hand)).size !== 12) continue;
    for (const contract of [...HANDS(3)]) {
      const r = canGoDown(hand, contract);
      if (r.ok) { checkLayout(hand, contract, r); found++; }
    }
  }
  assert.ok(found > 0);
});

// ---------------------------------------------------------------- act: turn flow
test('draw then discard advances turn; wrong turn/step rejected', () => {
  let s = newGame({ players: mkPlayers(3), seed: 3 });
  const first = s.players[s.turn].id;
  const other = s.players[(s.turn + 1) % 3].id;
  assert.equal(act(s, other, { type: 'draw', from: 'stock' }).ok, false);
  assert.equal(act(s, first, { type: 'discard', cardId: s.players[s.turn].hand[0].id }).ok, false);
  const t = s.turn;
  const r = act(s, first, { type: 'draw', from: 'stock' });
  s = ok(r);
  while (s.pendingClaim) s = ok(act(s, s.pendingClaim.current, { type: 'pass' }));
  assert.equal(s.players[t].hand.length, 12);
  assert.equal(r.events[0].type, 'draw');
  assert.equal(act(s, first, { type: 'draw', from: 'stock' }).ok, false);
  s = ok(act(s, first, { type: 'discard', cardId: s.players[t].hand[0].id }));
  assert.equal(s.turn, (t + 1) % 3);
  assert.equal(s.step, 'draw');
  assert.equal(s.discard.length, 2);
});

test('act does not mutate input state', () => {
  const s = newGame({ players: mkPlayers(2), seed: 3 });
  const snap = JSON.stringify(s);
  act(s, s.players[s.turn].id, { type: 'draw', from: 'stock' });
  assert.equal(JSON.stringify(s), snap);
});

test('draw from discard takes the top card', () => {
  const s = newGame({ players: mkPlayers(2), seed: 4 });
  const top = s.discard[s.discard.length - 1];
  const r = ok(act(s, s.players[s.turn].id, { type: 'draw', from: 'discard' }));
  assert.ok(r.players[s.turn].hand.some((c) => c.id === top.id));
  assert.equal(r.discard.length, 0);
});

// ---------------------------------------------------------------- lay
test('lay: must match contract exactly; marks down; melds stored with owner', () => {
  const s0 = setup({ hands: { 0: 'S7 H7 D7 S9 H9 C9 S2 C12 D4 H5 C3 C4', 1: 'S2 S3' } });
  // wrong shape
  assert.equal(act(s0, 'p0', { type: 'lay', melds: [{ kind: 'set', cardIds: ['d0-S-7', 'd0-H-7', 'd0-D-7'] }] }).ok, false);
  assert.equal(act(s0, 'p0', { type: 'lay', melds: [{ kind: 'run', cardIds: ['d0-S-7', 'd0-H-7', 'd0-D-7'] }, { kind: 'set', cardIds: ['d0-S-9', 'd0-H-9', 'd0-C-9'] }] }).ok, false);
  const r = act(s0, 'p0', { type: 'lay', melds: [{ kind: 'set', cardIds: ['d0-S-7', 'd0-H-7', 'd0-D-7'] }, { kind: 'set', cardIds: ['d0-S-9', 'd0-H-9', 'd0-C-9'] }] });
  const s = ok(r);
  assert.equal(s.players[0].down, true);
  assert.equal(s.players[0].hand.length, 6);
  assert.equal(s.melds.length, 2);
  assert.equal(s.melds[0].ownerId, 'p0');
  assert.equal(r.events[0].type, 'lay');
  assert.equal(r.events[0].meldIds.length, 2);
  // cannot lay twice
  assert.equal(act(s, 'p0', { type: 'lay', melds: [] }).ok, false);
});

test('lay: invalid meld, cards not in hand, duplicate ids, before draw', () => {
  const s0 = setup({ hands: { 0: 'S7 H7 D8 S9 H9 C9 S2 C12 D4 H5 C3' } });
  assert.equal(act(s0, 'p0', { type: 'lay', melds: [{ kind: 'set', cardIds: ['d0-S-7', 'd0-H-7', 'd0-D-8'] }, { kind: 'set', cardIds: ['d0-S-9', 'd0-H-9', 'd0-C-9'] }] }).ok, false);
  assert.equal(act(s0, 'p0', { type: 'lay', melds: [{ kind: 'set', cardIds: ['d0-S-9', 'd0-H-9', 'd0-C-9'] }, { kind: 'set', cardIds: ['d0-S-9', 'd0-H-9', 'd0-C-9'] }] }).ok, false);
  assert.equal(act(s0, 'p0', { type: 'lay', melds: [{ kind: 'set', cardIds: ['x', 'y', 'z'] }, { kind: 'set', cardIds: ['d0-S-9', 'd0-H-9', 'd0-C-9'] }] }).ok, false);
  const s1 = setup({ step: 'draw', hands: { 0: 'S7 H7 D7 S9 H9 C9 S2 C12 D4 H5 C3' } });
  assert.equal(act(s1, 'p0', { type: 'lay', melds: [] }).ok, false);
});

test('lay: run with wilds; wild `as` inferred; run metadata', () => {
  const s0 = setup({ hand: 2, hands: { 0: 'S4 JK S6 S7 H9 H10 H11 H12 C2 C3 D5 D6' } });
  const s = ok(act(s0, 'p0', {
    type: 'lay',
    melds: [{ kind: 'run', cardIds: ['d0-S-4', 'd0-JK-1', 'd0-S-6', 'd0-S-7'] }, { kind: 'run', cardIds: ['d0-H-9', 'd0-H-10', 'd0-H-11', 'd0-H-12'] }],
  }));
  assert.deepEqual(s.melds[0].cards[1].as, { rank: 5, suit: 'S' });
  assert.equal(s.melds[0].suit, 'S');
  assert.equal(s.melds[0].low, 4);
});

test('lay with all cards ends the hand: winner scores 0, others penalty', () => {
  const s0 = setup({ hand: 6, hands: { 0: 'S2 S3 S4 S5 H6 H7 H8 H9 C10 C11 C12 C13', 1: 'S1 H1 JK S5 D13' } });
  const s = ok(act(s0, 'p0', {
    type: 'lay',
    melds: [
      { kind: 'run', cardIds: ids(cs('S2 S3 S4 S5')) },
      { kind: 'run', cardIds: ids(cs('H6 H7 H8 H9')) },
      { kind: 'run', cardIds: ids(cs('C10 C11 C12 C13')) },
    ],
  }));
  assert.equal(s.phase, 'handOver');
  assert.equal(s.players[0].handScores[0], 0);
  assert.equal(s.players[1].handScores[0], 15 + 10 + 10 + 5 + 10);
  assert.equal(s.players[1].score, 50);
  assert.equal(s.handWinnerId, 'p0');
  assert.equal(act(s, 'p1', { type: 'draw', from: 'stock' }).ok, false);
});

// ---------------------------------------------------------------- add
function downState(extra = {}) {
  // p0 is down with set of 7s and run S5..S8; p1 not down
  const s = setup({
    hands: { 0: 'S9 S4 H7 JK C1 D3', 1: 'S2 C5' },
    melds: [
      { id: 'm1', kind: 'set', ownerId: 'p0', rank: 7, cards: cs('S7 D7 C7') },
      { id: 'm2', kind: 'run', ownerId: 'p1', suit: 'S', low: 5, cards: cs('S5 S6 S7 S8') },
    ],
    ...extra,
  });
  s.players[0].down = true;
  return s;
}

test('add: runs at end/start, auto position, onto opponent meld', () => {
  let s = ok(act(downState(), 'p0', { type: 'add', meldId: 'm2', cardIds: ['d0-S-9'], position: 'end' }));
  assert.equal(s.melds[1].cards.length, 5);
  assert.equal(s.melds[1].low, 5);
  s = ok(act(s, 'p0', { type: 'add', meldId: 'm2', cardIds: ['d0-S-4'] })); // auto -> start
  assert.equal(s.melds[1].low, 4);
  assert.equal(s.melds[1].cards[0].rank, 4);
  // wrong position
  assert.equal(act(downState(), 'p0', { type: 'add', meldId: 'm2', cardIds: ['d0-S-9'], position: 'start' }).ok, false);
});

test('add: multiple cards incl. wild, wild not required to replace, ace high', () => {
  let s = downState();
  s.players[0].hand = cs('S9 JK S10 S11 S12 S13 S1');
  s = ok(act(s, 'p0', { type: 'add', meldId: 'm2', cardIds: ['d0-S-9', 'd0-JK-1', 'd0-S-11'], position: 'end' }));
  assert.deepEqual(s.melds[1].cards[5].as, { rank: 10, suit: 'S' });
  assert.equal(s.melds[1].cards.length, 7);
  s = ok(act(s, 'p0', { type: 'add', meldId: 'm2', cardIds: ['d0-S-12', 'd0-S-13', 'd0-S-1'], position: 'end' }));
  assert.equal(s.melds[1].cards.length, 10);
  assert.equal(act(s, 'p0', { type: 'add', meldId: 'm2', cardIds: ['d0-S-10'] }).ok, false);
});

test('add: ace low at start of run and cannot go past ace-high', () => {
  const s = downState();
  s.melds[1] = { id: 'm2', kind: 'run', ownerId: 'p1', suit: 'S', low: 2, cards: cs('S2 S3 S4 S5') };
  s.players[0].hand = cs('S1 H1 JK C9');
  const a = ok(act(s, 'p0', { type: 'add', meldId: 'm2', cardIds: ['d0-S-1'] }));
  assert.equal(a.melds[1].low, 1);
  // then nothing further at start
  assert.equal(act(a, 'p0', { type: 'add', meldId: 'm2', cardIds: ['d0-JK-1'], position: 'start' }).ok, false);
  // red ace of another suit as wild at start becomes ace-low wild
  const b = ok(act(s, 'p0', { type: 'add', meldId: 'm2', cardIds: ['d0-H-1'], position: 'start' }));
  assert.deepEqual(b.melds[1].cards[0].as, { rank: 1, suit: 'S' });
});

test('add: sets, wild limit, wrong rank, requires being down', () => {
  let s = downState();
  s.players[0].hand = cs('H7 JK1 JK2 S8 D1 C1');
  s = ok(act(s, 'p0', { type: 'add', meldId: 'm1', cardIds: ['d0-H-7'] }));
  s = ok(act(s, 'p0', { type: 'add', meldId: 'm1', cardIds: ['d0-JK-1'] }));
  s = ok(act(s, 'p0', { type: 'add', meldId: 'm1', cardIds: ['d0-JK-2'] }));
  // 4 natural 7s + 2 jokers; D1 would be a 3rd wild
  assert.equal(act(s, 'p0', { type: 'add', meldId: 'm1', cardIds: ['d0-D-1'] }).ok, true); // 3 wilds <= 4 naturals
  assert.equal(act(s, 'p0', { type: 'add', meldId: 'm1', cardIds: ['d0-S-8'] }).ok, false);
  const t = downState();
  t.players[1].down = false;
  t.turn = 1;
  assert.equal(act(t, 'p1', { type: 'add', meldId: 'm1', cardIds: ['d0-S-2'] }).ok, false);
  assert.equal(act({ ...t, turn: 0 }, 'p0', { type: 'add', meldId: 'nope', cardIds: ['d0-S-9'] }).ok, false);
});

test('add: set wild limit enforced (naturals 3 -> max 3 wilds)', () => {
  const s = downState();
  s.players[0].hand = cs('JK1 JK2 JK1:1 JK2:1 C9');
  let r = s;
  for (const id of ['d0-JK-1', 'd0-JK-2', 'd1-JK-1']) r = ok(act(r, 'p0', { type: 'add', meldId: 'm1', cardIds: [id] }));
  assert.equal(act(r, 'p0', { type: 'add', meldId: 'm1', cardIds: ['d1-JK-2'] }).ok, false);
});

test('add: previewAdd exported and consistent', () => {
  const m = { id: 'm', kind: 'run', suit: 'H', low: 3, cards: cs('H3 H4 H5 H6') };
  assert.ok(previewAdd(m, [C('H7')], 'end').ok);
  assert.ok(previewAdd(m, [C('H2')]).ok);
  assert.equal(previewAdd(m, [C('D7')]).ok, false);
});

// ---------------------------------------------------------------- discard / hard / going out
test('normal mode: lay leaving one card then discard it to go out', () => {
  const s0 = setup({ hands: { 0: 'S7 H7 D7 S9 H9 C9 C2', 1: 'S2 S3' } });
  let s = ok(act(s0, 'p0', { type: 'lay', melds: [{ kind: 'set', cardIds: ids(cs('S7 H7 D7')) }, { kind: 'set', cardIds: ids(cs('S9 H9 C9')) }] }));
  assert.equal(s.phase, 'playing');
  s = ok(act(s, 'p0', { type: 'discard', cardId: 'd0-C-2' }));
  assert.equal(s.phase, 'handOver');
  assert.equal(s.winnerId, 'p0');
});

test('hard mode: going down must leave at most 1 card; normal mode has no limit', () => {
  const lay = { type: 'lay', melds: [{ kind: 'set', cardIds: ids(cs('S7 H7 D7')) }, { kind: 'set', cardIds: ids(cs('S9 H9 C9')) }] };
  const h2 = setup({ hard: true, hands: { 0: 'S7 H7 D7 S9 H9 C9 C2 C3', 1: 'S2 S3' } });
  const r = act(h2, 'p0', lay);
  assert.equal(r.ok, false);
  assert.match(r.error, /at most 1 card/);
  const n2 = setup({ hard: false, hands: { 0: 'S7 H7 D7 S9 H9 C9 C2 C3', 1: 'S2 S3' } });
  assert.equal(ok(act(n2, 'p0', lay)).phase, 'playing');
  for (const hard of [true, false]) {
    const s0 = setup({ hard, hands: { 0: 'S7 H7 D7 S9 H9 C9', 1: 'S2 S3' } });
    const s = ok(act(s0, 'p0', lay));
    assert.equal(s.phase, 'handOver');
    assert.equal(s.handWinnerId, 'p0');
  }
  const s1 = setup({ hard: true, hands: { 0: 'S7 H7 D7 S9 H9 C9 C2', 1: 'S2 S3' } });
  let s = ok(act(s1, 'p0', lay));
  s = ok(act(s, 'p0', { type: 'discard', cardId: 'd0-C-2' }));
  assert.equal(s.handWinnerId, 'p0');
});

test('hard bot only lays when it can go out; extends melds to dump leftovers', () => {
  const s0 = setup({ hard: true, hands: { 0: 'S7 H7 D7 C7 S9 H9 C9 D9 C2', 1: 'S2 S3' } });
  const a = chooseAction(viewFor(s0, 'p0'), 'hard');
  assert.equal(a.type, 'lay');
  assert.ok(ok(act(s0, 'p0', a)).players[0].hand.length <= 1);
  const s1 = setup({ hard: true, hands: { 0: 'S7 H7 D7 S9 H9 C9 C2 C3 D12 H12 C13', 1: 'S2 S3' } });
  assert.notEqual(chooseAction(viewFor(s1, 'p0'), 'hard').type, 'lay');
  const c = canGoDown(cs('S7 H7 D7 C7 S9 H9 C9 D9'), HANDS(2)[0], { maxLeft: 0 });
  assert.ok(c.ok);
  assert.equal(c.melds.flatMap((m) => m.cardIds).length, 8);
});

test('discard of last card goes out in normal mode and rotates nothing', () => {
  const s0 = setup({ hands: { 0: 'S7', 1: 'S2 S3 H1' } });
  const s = ok(act(s0, 'p0', { type: 'discard', cardId: 'd0-S-7' }));
  assert.equal(s.phase, 'handOver');
  assert.equal(s.players[1].handScores[0], 2 + 3 + 10);
});

// ---------------------------------------------------------------- stock / reshuffle / stalemate
test('stock reshuffle keeps top discard', () => {
  const s0 = setup({ step: 'draw' });
  const pile = cs('S2 S3 S4 S5 S6');
  s0.stock = [];
  s0.discard = pile.slice();
  const s = ok(act(s0, 'p0', { type: 'draw', from: 'stock' }));
  assert.equal(s.discard.length, 1);
  assert.equal(s.discard[0].id, pile[4].id);
  assert.equal(s.stock.length, 3);
  assert.equal(s.reshuffles, 1);
  assert.equal(s.players[0].hand.length, s0.players[0].hand.length + 1);
});

test('stock exhaustion with nothing to reshuffle ends hand as stalemate', () => {
  const s0 = setup({ step: 'draw', hands: { 0: 'S2 S3', 1: 'S4 H1' } });
  s0.stock = [];
  s0.discard = cs('S9');
  const r = act(s0, 'p0', { type: 'draw', from: 'stock' });
  const s = ok(r);
  assert.equal(s.phase, 'handOver');
  assert.equal(s.handWinnerId, null);
  assert.equal(s.players[0].handScores[0], 5);
  assert.equal(r.events.at(-1).type, 'handOver');
});

test('infeasible contract ends via stalemate once stock runs out (no reshuffle)', () => {
  const s0 = setup({ n: 2, hand: 7, step: 'draw' });
  s0.stock = [];
  s0.discard = cs('S2 S3 S4');
  const s = ok(act(s0, 'p0', { type: 'draw', from: 'stock' }));
  assert.notEqual(s.phase, 'playing');
});

// ---------------------------------------------------------------- scoring / flow
test('nextHand rotates dealer, redeals, keeps scores; game ends after last hand', () => {
  let s = newGame({ players: mkPlayers(3), seed: 8 });
  const d0 = s.dealer;
  for (let h = 0; h < 9; h++) {
    assert.equal(s.handIndex, h);
    assert.deepEqual(s.contract, HANDS(3)[h]);
    assert.equal(s.dealer, (d0 + h) % 3);
    assert.equal(s.turn, (s.dealer + 1) % 3);
    s.players.forEach((p) => { assert.equal(p.hand.length, 11); assert.equal(p.down, false); });
    // p(turn) goes out by discarding last card
    const t = s.turn;
    const id = s.players[t].id;
    s.players[t].hand = [C('S2')];
    s.step = 'play';
    s = ok(act(s, id, { type: 'discard', cardId: 'd0-S-2' }));
    assert.equal(s.phase, h === 8 ? 'gameOver' : 'handOver');
    if (h < 8) s = nextHand(s);
  }
  assert.equal(s.players.every((p) => p.handScores.length === 9), true);
  assert.ok(s.winnerId);
  const best = Math.min(...s.players.map((p) => p.score));
  assert.equal(s.players.find((p) => p.id === s.winnerId).score, best);
  assert.equal(nextHand(s).phase, 'gameOver');
});

test('nextHand is a no-op while playing', () => {
  const s = newGame({ players: mkPlayers(2), seed: 1 });
  assert.deepEqual(nextHand(s), s);
});

test('8-hand game for 4 players', () => {
  const s = newGame({ players: mkPlayers(4), seed: 1 });
  assert.equal(s.handCount, 8);
});

// ---------------------------------------------------------------- viewFor
test('viewFor redacts other hands and stock but not own', () => {
  const s = newGame({ players: mkPlayers(3), seed: 2 });
  const v = viewFor(s, 'p1');
  assert.equal(v.players[1].hand.length, 11);
  assert.equal(v.players[0].hand.length, 0);
  assert.equal(v.players[0].cardCount, 11);
  assert.equal(v.stockCount, s.stock.length);
  assert.equal(v.stock.length, 0);
  assert.equal(v.rng, undefined);
  assert.equal(v.seed, undefined);
  assert.equal(JSON.stringify(v).includes(s.players[0].hand[0].id), v.discard.some((c) => c.id === s.players[0].hand[0].id));
  // original untouched
  assert.equal(s.players[0].hand.length, 11);
  // hand over reveals hands
  const o = { ...s, phase: 'handOver' };
  assert.equal(viewFor(o, 'p1').players[0].hand.length, 11);
});

// ---------------------------------------------------------------- bots
test('bots return legal actions in a fresh game at every level', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    const s = newGame({ players: mkPlayers(2), seed: 11 });
    const a = chooseAction(viewFor(s, s.players[s.turn].id), level);
    assert.ok(act(s, s.players[s.turn].id, a).ok);
  }
});

test('hard bot lays down when it can and adds to melds when down', () => {
  const s0 = setup({ hands: { 0: 'S7 H7 D7 S9 H9 C9 S2 C12 D4 H5 C3', 1: 'S2 S3' } });
  const a = chooseAction(viewFor(s0, 'p0'), 'hard');
  assert.equal(a.type, 'lay');
  const s = ok(act(s0, 'p0', a));
  s.players[0].hand.push(C('D7'));
  const b = chooseAction(viewFor(s, 'p0'), 'hard');
  assert.equal(b.type, 'add');
  assert.ok(act(s, 'p0', b).ok);
});

test('hard bot takes a discard that completes its contract and discards high dead cards', () => {
  const s0 = setup({ step: 'draw', hands: { 0: 'S7 H7 S9 H9 C9 S2 C13 D4 H5 C3 D12', 1: 'S2 S3' } });
  s0.discard = cs('D7');
  s0.liveCardId = 'd0-D-7';
  const a = chooseAction(viewFor(s0, 'p0'), 'hard');
  assert.deepEqual(a, { type: 'draw', from: 'discard' });
  const s1 = setup({ step: 'draw', hands: { 0: 'S7 H7 S9 H9 C9 S2 C13 D4 H5 C3 D12', 1: 'S2 S3' } });
  s1.discard = cs('C11');
  s1.liveCardId = 'd0-C-11';
  assert.deepEqual(chooseAction(viewFor(s1, 'p0'), 'hard'), { type: 'draw', from: 'stock' });
  const s2 = setup({ hands: { 0: 'S7 H7 D7 S9 H9 S2 C13 D4 H5 C3 D12 C8', 1: 'S2 S3' } });
  const d = chooseAction(viewFor(s2, 'p0'), 'hard');
  assert.equal(d.type, 'discard');
  assert.ok(['d0-C-13', 'd0-D-12'].includes(d.cardId), d.cardId);
});

// ---------------------------------------------------------------- fuzz
function playGame(n, seed, hard, levels) {
  let s = newGame({
    claimPenalty: seed % 5 === 0 ? 0 : 1,
    players: Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isBot: true, botLevel: levels[i % levels.length] })),
    hard,
    seed,
  });
  let steps = 0;
  const downs = [];
  while (s.phase !== 'gameOver') {
    if (s.phase === 'handOver') { s = nextHand(s); continue; }
    if (++steps > 40000) throw new Error(`infinite loop seed=${seed} n=${n}`);
    const p = s.players.find((q) => q.id === currentActor(s));
    const a = chooseAction(viewFor(s, p.id), p.botLevel);
    const r = act(s, p.id, a);
    if (!r.ok) throw new Error(`illegal action seed=${seed} n=${n} hard=${hard} level=${p.botLevel}: ${JSON.stringify(a)} -> ${r.error}`);
    if (a.type === 'lay') downs.push(s.handIndex);
    // invariants
    const total = r.state.stock.length + r.state.discard.length + r.state.players.reduce((t, q) => t + q.hand.length, 0)
      + r.state.melds.reduce((t, m) => t + m.cards.length, 0);
    assert.equal(total, 108);
    s = r.state;
  }
  return { s, downs };
}

test('fuzz: 200 bot-vs-bot games, no illegal actions or infinite loops', () => {
  const lvls = [['hard'], ['normal'], ['easy'], ['hard', 'normal', 'easy', 'hard']];
  let wins = 0;
  const downHands = new Set();
  for (let g = 0; g < 200; g++) {
    const n = 2 + (g % 3);
    const { s, downs } = playGame(n, g + 1000, g % 10 === 9, lvls[g % 4]);
    assert.equal(s.phase, 'gameOver');
    assert.equal(s.players[0].handScores.length, n === 3 ? 9 : 8);
    wins += s.players.reduce((t, p) => t + p.handScores.filter((x) => x === 0).length, 0);
    downs.forEach((h) => downHands.add(`${n}:${h}`));
  }
  assert.ok(wins > 100, `bots should go out reasonably often, got ${wins}`);
  assert.ok(downHands.size > 10);
});

test('hard bots beat easy bots most of the time (2 players)', () => {
  let hardWins = 0;
  const N = 20;
  for (let g = 0; g < N; g++) {
    const { s } = playGame(2, 5000 + g, false, ['hard', 'easy']);
    const [a, b] = s.players;
    if (a.score < b.score) hardWins++;
  }
  assert.ok(hardWins >= N * 0.6, `hard won ${hardWins}/${N}`);
});

test('once down, drawing from the discard pile is rejected', () => {
  const s = setup({ step: 'draw', hands: { 0: 'S7 H7', 1: 'S2 S3' } });
  s.players[0].down = true;
  const r = act(s, 'p0', { type: 'draw', from: 'discard' });
  assert.equal(r.ok, false);
  assert.match(r.error, /stock/);
  assert.equal(act(s, 'p0', { type: 'draw', from: 'stock' }).ok, true);
  assert.equal(chooseAction(viewFor(s, 'p0'), 'hard').from, 'stock');
});

test('cannot discard the card just drawn (unless it is the only card)', () => {
  const s0 = setup({ step: 'draw', hands: { 0: 'S7 H7', 1: 'S2 S3' } });
  s0.stock = cs('C9');
  const s = ok(act(s0, 'p0', { type: 'draw', from: 'stock' }));
  assert.equal(s.drawnCardId, 'd0-C-9');
  const r = act(s, 'p0', { type: 'discard', cardId: 'd0-C-9' });
  assert.equal(r.ok, false);
  assert.match(r.error, /just drew/);
  assert.equal(act(s, 'p0', { type: 'discard', cardId: 'd0-S-7' }).ok, true);
  // bot respects it
  const a = chooseAction(viewFor(s, 'p0'), 'hard');
  assert.notEqual(a.cardId, 'd0-C-9');
  // discard-draw too
  const t0 = setup({ step: 'draw', hands: { 0: 'S7 H7', 1: 'S2 S3' } });
  t0.discard = cs('D13');
  t0.liveCardId = 'd0-D-13';
  const t = ok(act(t0, 'p0', { type: 'draw', from: 'discard' }));
  assert.equal(act(t, 'p0', { type: 'discard', cardId: 'd0-D-13' }).ok, false);
  // only card in hand: allowed
  const u = setup({ hands: { 0: 'S7', 1: 'S2 S3' } });
  u.drawnCardId = 'd0-S-7';
  assert.equal(act(u, 'p0', { type: 'discard', cardId: 'd0-S-7' }).ok, true);
});

// ---------------------------------------------------------------- discard claims
function claimGame(n = 3, penalty = 1) {
  const s = newGame({ players: mkPlayers(n), seed: 21, claimPenalty: penalty });
  s.turn = 0; s.step = 'play';
  s.players.forEach((p, i) => { p.hand = cs('S2 S3 S5 S9 H9 C13'.split(' ').slice(0, 6).join(' ')).map((c, j) => ({ ...c, id: `x${i}-${j}` })); });
  return s;
}
function discardBy0(s, id = 'x0-5') {
  s.players[0].hand.push({ id, rank: 6, suit: 'D', joker: false });
  s.players[0].hand = s.players[0].hand.slice();
  return ok(act(s, 'p0', { type: 'discard', cardId: id }));
}

test('claim: next player draws live discard normally; discarder cannot; others cannot', () => {
  let s = discardBy0(claimGame());
  assert.equal(s.liveCardId, 'x0-5');
  assert.equal(s.discarderId, 'p0');
  assert.equal(currentActor(s), 'p1');
  assert.equal(act(s, 'p2', { type: 'draw', from: 'discard' }).ok, false);
  s = ok(act(s, 'p1', { type: 'draw', from: 'discard' }));
  assert.equal(s.pendingClaim, null);
  assert.equal(s.liveCardId, null);
});

test('claim: N1 draws stock -> N2 decides; claim gives penalty; N1 continues', () => {
  let s = discardBy0(claimGame());
  const stock0 = s.stock.length;
  const r = act(s, 'p1', { type: 'draw', from: 'stock' });
  s = ok(r);
  assert.equal(r.events.at(-1).type, 'claimOpen');
  assert.deepEqual(s.pendingClaim, { cardId: 'x0-5', fromId: 'p0', queue: [], current: 'p2' });
  assert.equal(currentActor(s), 'p2');
  assert.equal(viewFor(s, 'p2').pendingClaim.current, 'p2');
  assert.equal(act(s, 'p1', { type: 'discard', cardId: s.players[1].hand[0].id }).ok, false);
  assert.equal(act(s, 'p2', { type: 'draw', from: 'stock' }).ok, false);
  assert.equal(act(s, 'p1', { type: 'claim' }).ok, false);
  const c = act(s, 'p2', { type: 'claim' });
  s = ok(c);
  assert.deepEqual(c.events[0], { type: 'claim', playerId: 'p2', cardId: 'x0-5', penalty: 1 });
  assert.equal(s.players[2].hand.length, 8);
  assert.equal(s.stock.length, stock0 - 2);
  assert.equal(s.pendingClaim, null);
  assert.equal(s.liveCardId, null);
  assert.equal(currentActor(s), 'p1');
  assert.equal(s.step, 'play');
  // dead afterwards
  s = ok(act(s, 'p1', { type: 'discard', cardId: s.players[1].hand[0].id }));
  assert.equal(s.liveCardId, s.discard.at(-1).id);
});

test('claim: everyone passes -> card dead; zero penalty option', () => {
  let s = discardBy0(claimGame(4, 0));
  s = ok(act(s, 'p1', { type: 'draw', from: 'stock' }));
  assert.equal(s.pendingClaim.current, 'p2');
  s = ok(act(s, 'p2', { type: 'pass' }));
  assert.equal(s.pendingClaim.current, 'p3');
  const r = act(s, 'p3', { type: 'pass' });
  s = ok(r);
  assert.deepEqual(r.events.map((e) => e.type), ['pass', 'dead']);
  assert.equal(s.pendingClaim, null);
  assert.equal(s.liveCardId, null);
  // dead card cannot be drawn later
  s = ok(act(s, 'p1', { type: 'discard', cardId: s.players[1].hand[0].id }));
  s = ok(act(s, 'p2', { type: 'draw', from: 'stock' }));
  s = ok(act(s, 'p3', { type: 'pass' }));
  s = ok(act(s, 'p0', { type: 'pass' }));
  s = ok(act(s, 'p2', { type: 'discard', cardId: s.players[2].hand[0].id }));
  assert.equal(act(s, 'p3', { type: 'draw', from: 'discard' }).ok, true);
  const d = discardBy0(claimGame(4, 0));
  d.liveCardId = null;
  assert.match(act(d, 'p1', { type: 'draw', from: 'discard' }).error, /dead/);
});

test('claim: 2 players has no window; down players skipped; starter card is live', () => {
  let s = discardBy0(claimGame(2));
  const r = act(s, 'p1', { type: 'draw', from: 'stock' });
  assert.equal(r.state.pendingClaim, null);
  assert.equal(r.events.at(-1).type, 'dead');
  let t = discardBy0(claimGame(3));
  t.players[2].down = true;
  t = ok(act(t, 'p1', { type: 'draw', from: 'stock' }));
  assert.equal(t.pendingClaim, null);
  const g = newGame({ players: mkPlayers(3), seed: 2 });
  assert.equal(g.liveCardId, g.discard[0].id);
  const first = g.players[g.turn].id;
  const q = ok(act(g, first, { type: 'draw', from: 'stock' }));
  assert.equal(q.pendingClaim.queue.length, 1);
});

test('claim: bot answers claim windows legally', () => {
  let s = discardBy0(claimGame(3));
  s = ok(act(s, 'p1', { type: 'draw', from: 'stock' }));
  for (const lv of ['easy', 'normal', 'hard']) {
    const a = chooseAction(viewFor(s, 'p2'), lv);
    assert.ok(['claim', 'pass'].includes(a.type));
    assert.ok(act(s, 'p2', a).ok);
  }
  s.discard[s.discard.length - 1] = C('JK');
  s.liveCardId = 'd0-JK-1';
  assert.equal(chooseAction(viewFor(s, 'p2'), 'hard').type, 'claim');
});
