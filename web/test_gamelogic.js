// Test harness for Continental web/src/gameLogic.js (browser global script)
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
eval(src + '\n;globalThis.__G = { Suit, Rank, Card, Deck, Meld, MeldType, Player, HandNumber, GameState };');
const { Suit, Rank, Card, Deck, Meld, MeldType, Player, HandNumber, GameState } = globalThis.__G;

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
}
const C = (suit, rank, j = false) => new Card(suit, rank, j);
const H = Suit.Hearts, D = Suit.Diamonds, S = Suit.Spades, Cl = Suit.Clubs;
const JO = () => C(H, 1, true);

// ---- Sets ----
t('natural set of 3', new Meld([C(H,7),C(D,7),C(S,7)]).isSet());
t('set with joker (was broken)', new Meld([C(H,7),C(D,7),JO()]).isSet());
t('set with red-ace wild', new Meld([C(S,9),C(Cl,9),C(H,1)]).isSet());
t('set: wilds cannot outnumber naturals', !new Meld([C(H,7),JO(),JO()]).isSet());
t('set: mixed ranks rejected', !new Meld([C(H,7),C(D,8),C(S,7)]).isSet());
t('set of aces: red aces natural', new Meld([C(S,1),C(H,1),C(D,1)]).isSet());
t('set: 2 cards rejected', !new Meld([C(H,7),C(D,7)]).isSet());

// ---- Runs ----
t('natural run of 4', new Meld([C(S,5),C(S,6),C(S,7),C(S,8)]).isRun());
t('run of 3 rejected (family rule: 4+)', !new Meld([C(S,5),C(S,6),C(S,7)]).isRun());
t('joker fills gap in run', new Meld([C(S,5),C(S,6),JO(),C(S,8)]).isRun());
t('red ace as wild fills gap', new Meld([C(S,5),C(S,6),C(D,1),C(S,8)]).isRun());
t('wild extends end of run', new Meld([C(S,5),C(S,6),C(S,7),JO()]).isRun());
t('run: wilds equal to naturals allowed', new Meld([C(S,5),C(S,6),JO(),JO()]).isRun());
t('run: wilds cannot outnumber naturals', !new Meld([C(S,5),JO(),JO(),JO()]).isRun());
t('run: mixed suits rejected', !new Meld([C(S,5),C(H,6),C(S,7),C(S,8)]).isRun());
t('run: duplicate ranks rejected', !new Meld([C(S,5),C(S,5),C(S,6),C(S,7)]).isRun());
t('run: J-Q-K + joker valid (joker plays the 10)', new Meld([C(S,11),C(S,12),C(S,13),JO()]).isRun());
t('run: cannot exceed A..K span', !new Meld([2,3,4,5,6,7,8,9,10,11,12,13].map(r => C(S,r)).concat([JO(),JO()])).isRun());
t('run: can extend below at low end', new Meld([JO(),C(S,2),C(S,3),C(S,4)]).isRun());
t('run: too-big internal gap rejected', !new Meld([C(S,2),JO(),C(S,6),C(S,7)]).isRun());

// ---- Hand requirements ----
const gs2 = new GameState(2);
t('hand1 = 2 sets', JSON.stringify(gs2.getHandRequirement(HandNumber.Hand1)) === '{"sets":2,"runs":0}');
t('hand2 = 1 set 1 run', JSON.stringify(gs2.getHandRequirement(HandNumber.Hand2)) === '{"sets":1,"runs":1}');
t('hand8 = 4 runs', JSON.stringify(gs2.getHandRequirement(HandNumber.Hand8)) === '{"sets":0,"runs":4}');
t('hand8a = 2 sets 2 runs', JSON.stringify(gs2.getHandRequirement(HandNumber.Hand8a)) === '{"sets":2,"runs":2}');

// ---- Serialize / deserialize round trip ----
const gs = new GameState(3);
gs.dealCards();
gs.players[0].hasGoneDown = true;
gs.players[0].addMeld(new Meld([C(H,7),C(D,7),C(S,7)]));
gs.players[1].totalScore = 42;
gs.currentPlayerIndex = 2;
const data = gs.serialize();
const rt = GameState.deserialize(JSON.parse(JSON.stringify(data)));
t('roundtrip: playerCount', rt.playerCount === 3);
t('roundtrip: totalHands (9 for 3p)', rt.totalHands === 9);
t('roundtrip: currentPlayerIndex', rt.currentPlayerIndex === 2);
t('roundtrip: deck size preserved', rt.deck.cardsRemaining() === gs.deck.cardsRemaining());
t('roundtrip: deck order preserved', rt.deck.cards.every((c, i) =>
  c.suit === gs.deck.cards[i].suit && c.rank === gs.deck.cards[i].rank && c.isJoker === gs.deck.cards[i].isJoker));
t('roundtrip: hands preserved', rt.players.every((p, i) =>
  p.hand.length === gs.players[i].hand.length &&
  p.hand.every((c, k) => c.suit === gs.players[i].hand[k].suit && c.rank === gs.players[i].hand[k].rank)));
t('roundtrip: melds are Meld instances', rt.players[0].melds[0] instanceof Meld && rt.players[0].melds[0].isSet());
t('roundtrip: hasGoneDown/scores', rt.players[0].hasGoneDown === true && rt.players[1].totalScore === 42);

// ---- Turn simulation across two "tabs" via serialize/deserialize ----
const tabA = new GameState(2);
tabA.dealCards();
const p = tabA.getCurrentPlayer();
const drawn = tabA.deck.drawCard();
p.addCard(drawn);
const disc = p.hand[0];
p.removeCard(disc);
tabA.discardPile.push(disc);
tabA.nextPlayer();
const tabB = GameState.deserialize(JSON.parse(JSON.stringify(tabA.serialize())));
t('sync: tab B sees the discard', tabB.discardPile.length === 2);
t('sync: tab B sees turn advance', tabB.currentPlayerIndex === tabA.currentPlayerIndex);
t('sync: tab B hand counts match', tabB.players.every((pl, i) => pl.hand.length === tabA.players[i].hand.length));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
