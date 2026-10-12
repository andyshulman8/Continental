/**
 * Card game logic - shared between iOS and Web versions
 * This is the JavaScript version for browsers
 */

const Suit = {
  Hearts: 'hearts',
  Diamonds: 'diamonds',
  Clubs: 'clubs',
  Spades: 'spades'
};

const Rank = {
  Ace: 1,
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5,
  Six: 6,
  Seven: 7,
  Eight: 8,
  Nine: 9,
  Ten: 10,
  Jack: 11,
  Queen: 12,
  King: 13
};

class Card {
  constructor(suit, rank, isJoker = false) {
    this.suit = suit;
    this.rank = rank;
    this.isJoker = isJoker;
  }

  get suitSymbol() {
    switch (this.suit) {
      case Suit.Hearts: return '♥';
      case Suit.Diamonds: return '♦';
      case Suit.Clubs: return '♣';
      case Suit.Spades: return '♠';
    }
  }

  get rankName() {
    if (this.isJoker) return 'JO';
    switch (this.rank) {
      case Rank.Ace: return 'A';
      case Rank.Jack: return 'J';
      case Rank.Queen: return 'Q';
      case Rank.King: return 'K';
      default: return this.rank.toString();
    }
  }

  get isRed() {
    return this.suit === Suit.Hearts || this.suit === Suit.Diamonds;
  }

  get isBlack() {
    return this.suit === Suit.Clubs || this.suit === Suit.Spades;
  }

  pointValue() {
    if (this.isJoker) {
      return 10;
    }

    if (this.rank === Rank.Ace) {
      return this.isBlack ? 15 : 10;
    }
    if (this.rank >= Rank.Two && this.rank <= Rank.Nine) {
      return this.rank;
    }
    if (this.rank >= Rank.Ten && this.rank <= Rank.King) {
      return 10;
    }
  }

  toString() {
    return `${this.rankName}${this.suitSymbol}`;
  }
}

class Deck {
  constructor(numDecks = 1) {
    this.cards = [];

    for (let d = 0; d < numDecks; d++) {
      for (const suit of Object.values(Suit)) {
        for (let rank = 1; rank <= 13; rank++) {
          this.cards.push(new Card(suit, rank));
        }
      }
      // Add jokers
      this.cards.push(new Card(Suit.Hearts, Rank.Ace, true));
      this.cards.push(new Card(Suit.Hearts, Rank.Ace, true));
    }

    this.shuffle();
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  drawCard() {
    return this.cards.pop();
  }

  cardsRemaining() {
    return this.cards.length;
  }

  /**
   * Cut the deck at index (0-based). Top pile = cards[0..cutIndex], bottom = cards[cutIndex+1..end].
   * After cut: new order is bottom + top (bottom goes on top).
   */
  cut(cutIndex) {
    if (cutIndex < 0 || cutIndex >= this.cards.length - 1) return;
    const top = this.cards.slice(0, cutIndex + 1);
    const bottom = this.cards.slice(cutIndex + 1);
    this.cards = bottom.concat(top);
  }
}

const MeldType = {
  Set: 'set',
  Run: 'run'
};

class Meld {
  constructor(cards) {
    this.cards = cards;
  }

  type() {
    if (this.isSet()) return MeldType.Set;
    if (this.isRun()) return MeldType.Run;
    return null;
  }

  /**
   * Set: 3+ cards of the same rank. Wilds (jokers + red aces) can substitute,
   * but wilds cannot outnumber natural cards. A red ace in a set of aces
   * counts as a natural ace.
   */
  isSet() {
    if (this.cards.length < 3) return false;

    const nonJokers = this.cards.filter(c => !c.isJoker);
    if (nonJokers.length === 0) return false;

    // Target rank: prefer a non-wild card's rank; if only wilds+red aces, treat as an ace set
    const nonWild = nonJokers.filter(c => !this.isWildCard(c));
    const targetRank = nonWild.length > 0 ? nonWild[0].rank : Rank.Ace;

    let naturals = 0;
    let wilds = this.cards.length - nonJokers.length; // jokers
    for (const c of nonJokers) {
      if (c.rank === targetRank) {
        naturals++; // red ace matching an ace set counts as natural
      } else if (this.isWildCard(c)) {
        wilds++;
      } else {
        return false; // non-wild card of a different rank
      }
    }

    return wilds <= naturals;
  }

  /**
   * Run: 4+ cards of the same suit in sequence. Wilds (jokers + red aces)
   * can fill gaps or extend the ends, but cannot outnumber natural cards.
   */
  isRun() {
    if (this.cards.length < 4) return false;

    const naturals = this.cards.filter(c => !this.isWildCard(c));
    const wilds = this.cards.length - naturals.length;
    if (naturals.length === 0 || wilds > naturals.length) return false;

    const suit = naturals[0].suit;
    if (!naturals.every(c => c.suit === suit)) return false;

    const ranks = naturals.map(c => c.rank).sort((a, b) => a - b);

    // No duplicate ranks, and count wilds needed to fill internal gaps
    let gaps = 0;
    for (let i = 1; i < ranks.length; i++) {
      if (ranks[i] === ranks[i - 1]) return false;
      gaps += ranks[i] - ranks[i - 1] - 1;
    }
    if (gaps > wilds) return false;

    // Leftover wilds extend the ends; the whole run must fit within A..K
    const leftover = wilds - gaps;
    const span = (ranks[ranks.length - 1] - ranks[0] + 1) + leftover;
    return span <= 13;
  }

  isWildCard(card) {
    return card.isJoker || (card.rank === Rank.Ace && card.isRed);
  }

  /** Natural (non-wild) card count — used for the "wilds can't outnumber naturals" family rule */
  naturalCount() {
    return this.cards.filter(c => !this.isWildCard(c)).length;
  }
}

class Player {
  constructor(name) {
    this.name = name;
    this.hand = [];
    this.melds = [];
    this.hasGoneDown = false;
    this.hardModeEnabled = false;
    this.score = 0;
    this.totalScore = 0;
  }

  addCard(card) {
    this.hand.push(card);
  }

  removeCard(card) {
    const index = this.hand.indexOf(card);
    if (index > -1) {
      this.hand.splice(index, 1);
    }
  }

  addMeld(meld) {
    this.melds.push(meld);
  }

  toggleHardMode() {
    this.hardModeEnabled = !this.hardModeEnabled;
  }

  hasWonHand() {
    return this.hand.length === 0;
  }

  calculateScore() {
    let score = 0;
    for (const card of this.hand) {
      score += card.pointValue();
    }
    return score;
  }

  resetHand() {
    this.hand = [];
    this.melds = [];
    this.hasGoneDown = false;
    this.score = 0;
  }

  resetForNewGame() {
    this.hand = [];
    this.melds = [];
    this.hasGoneDown = false;
    this.hardModeEnabled = false;
    this.score = 0;
    this.totalScore = 0;
  }
}

const HandNumber = {
  Hand1: 1,
  Hand2: 2,
  Hand3: 3,
  Hand5: 5,
  Hand6: 6,
  Hand4: 4,
  Hand7: 7,
  Hand8: 8,
  Hand8a: 81
};

class GameState {
  constructor(playerCount = 2) {
    this.playerCount = playerCount;
    this.players = [];
    this.numDecksNeeded = Math.ceil((playerCount * 11 + 1) / 52) + 1;
    this.deck = new Deck(this.numDecksNeeded);
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.currentHandNumber = 1;
    this.dealerChipIndex = 0;
    this.totalHands = playerCount === 3 ? 9 : 8;
    /** Per-hand score history: handScores[handIndex] = { hand: [scoreP0,...], running: [totalP0,...] } for completed hands */
    this.handScores = [];

    const playerNames = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
    for (let i = 0; i < playerCount; i++) {
      this.players.push(new Player(playerNames[i]));
    }
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  getCurrentHand() {
    if (this.playerCount === 3) {
      // 9-hand game for 3 players
      switch (this.currentHandNumber) {
        case 1: return HandNumber.Hand1;
        case 2: return HandNumber.Hand2;
        case 3: return HandNumber.Hand3;
        case 4: return HandNumber.Hand5;
        case 5: return HandNumber.Hand6;
        case 6: return HandNumber.Hand4;
        case 7: return HandNumber.Hand8a;
        case 8: return HandNumber.Hand7;
        case 9: return HandNumber.Hand8;
        default: return HandNumber.Hand1;
      }
    } else {
      // 8-hand game for 2 or 4 players
      switch (this.currentHandNumber) {
        case 1: return HandNumber.Hand1;
        case 2: return HandNumber.Hand2;
        case 3: return HandNumber.Hand3;
        case 4: return HandNumber.Hand5;
        case 5: return HandNumber.Hand6;
        case 6: return HandNumber.Hand4;
        case 7: return HandNumber.Hand7;
        case 8: return HandNumber.Hand8;
        default: return HandNumber.Hand1;
      }
    }
  }

  /**
   * Meld requirement for going down in a given hand: { sets, runs }
   */
  getHandRequirement(hand) {
    switch (hand) {
      case HandNumber.Hand1: return { sets: 2, runs: 0 };
      case HandNumber.Hand2: return { sets: 1, runs: 1 };
      case HandNumber.Hand3: return { sets: 0, runs: 2 };
      case HandNumber.Hand4: return { sets: 3, runs: 0 };
      case HandNumber.Hand5: return { sets: 2, runs: 1 };
      case HandNumber.Hand6: return { sets: 1, runs: 2 };
      case HandNumber.Hand7: return { sets: 0, runs: 3 };
      case HandNumber.Hand8: return { sets: 0, runs: 4 };
      case HandNumber.Hand8a: return { sets: 2, runs: 2 };
      default: return { sets: 2, runs: 0 };
    }
  }

  getHandDescription(hand) {
    switch (hand) {
      case HandNumber.Hand1: return 'Two Sets';
      case HandNumber.Hand2: return 'One Set + One Run';
      case HandNumber.Hand3: return 'Two Runs';
      case HandNumber.Hand5: return 'Two Sets + One Run';
      case HandNumber.Hand6: return 'Two Runs + One Set';
      case HandNumber.Hand4: return 'Three Sets';
      case HandNumber.Hand7: return 'Three Runs';
      case HandNumber.Hand8: return 'Four Runs';
      case HandNumber.Hand8a: return 'Two Sets + Two Runs';
      default: return 'Unknown Hand';
    }
  }

  nextPlayer() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
  }

  dealCards() {
    for (const player of this.players) {
      player.resetHand();
    }

    if (this.preparedDeckForFirstHand) {
      this.deck = this.preparedDeckForFirstHand;
      this.preparedDeckForFirstHand = null;
    } else {
      this.deck = new Deck(this.numDecksNeeded);
    }
    this.discardPile = [];

    // Deal 11 cards to each player
    for (let i = 0; i < 11; i++) {
      for (const player of this.players) {
        const card = this.deck.drawCard();
        if (card) {
          player.addCard(card);
        }
      }
    }

    // Place initial discard card
    const discardCard = this.deck.drawCard();
    if (discardCard) {
      this.discardPile.push(discardCard);
    }

    this.currentPlayerIndex = (this.dealerChipIndex + 1) % this.players.length;
  }

  advanceDealerChip() {
    this.dealerChipIndex = (this.dealerChipIndex + 1) % this.players.length;
  }

  /**
   * Dealer gets -100 points if they cut so the top pile has exactly the deal count (11*players or 11*players+1).
   */
  processDealerCut(cardsInTopPile) {
    const dealer = this.players[this.dealerChipIndex];
    const expected = 11 * this.players.length;
    const expectedWithDiscard = expected + 1;
    if (cardsInTopPile === expected || cardsInTopPile === expectedWithDiscard) {
      dealer.totalScore -= 100;
    }
  }

  /**
   * Prepare deck for first hand with dealer cut. Returns { gotBonus, offBy, topPileSize, expected }.
   * Call before dealCards() for hand 1 only.
   */
  prepareFirstHandDeckWithCut(cutIndex) {
    const deck = new Deck(this.numDecksNeeded);
    const topPileSize = cutIndex + 1;
    deck.cut(cutIndex);
    this.preparedDeckForFirstHand = deck;
    this.processDealerCut(topPileSize);
    const expected = 11 * this.players.length;
    const expectedWithDiscard = expected + 1;
    const gotBonus = topPileSize === expected || topPileSize === expectedWithDiscard;
    const offBy = topPileSize - expectedWithDiscard;
    return { gotBonus, offBy, topPileSize, expected: expectedWithDiscard };
  }

  advanceHand() {
    if (this.currentHandNumber < this.totalHands) {
      this.currentHandNumber += 1;
      this.advanceDealerChip();
      this.dealCards();
    }
  }

  endCurrentHand() {
    for (const player of this.players) {
      const handScore = player.calculateScore();
      player.score = handScore;
      player.totalScore += handScore;
    }
    this.handScores.push({
      hand: this.players.map(p => p.score),
      running: this.players.map(p => p.totalScore)
    });
    this.advanceHand();
  }

  isGameOver() {
    return this.currentHandNumber > this.totalHands;
  }

  getGameWinner() {
    if (!this.isGameOver()) return null;

    let winner = this.players[0];
    for (const player of this.players) {
      if (player.totalScore < winner.totalScore) {
        winner = player;
      }
    }
    return winner;
  }

  /**
   * Full-state serialization for multiplayer sync. Every tab needs the
   * complete authoritative state (deck order included) so that the acting
   * player's moves can be applied everywhere. Hand privacy is handled by
   * the UI (each tab only renders its own hand).
   */
  serialize() {
    const c2o = (c) => ({ s: c.suit, r: c.rank, j: c.isJoker });
    return {
      playerCount: this.playerCount,
      currentPlayerIndex: this.currentPlayerIndex,
      currentHandNumber: this.currentHandNumber,
      dealerChipIndex: this.dealerChipIndex,
      totalHands: this.totalHands,
      deck: this.deck.cards.map(c2o),
      discardPile: this.discardPile.map(c2o),
      players: this.players.map(p => ({
        name: p.name,
        hand: p.hand.map(c2o),
        hasGoneDown: p.hasGoneDown,
        hardModeEnabled: p.hardModeEnabled,
        score: p.score,
        totalScore: p.totalScore,
        melds: p.melds.map(m => m.cards.map(c2o))
      })),
      handScores: this.handScores,
      timestamp: Date.now()
    };
  }

  /**
   * Rebuild a GameState from serialize() output.
   */
  static deserialize(data) {
    const o2c = (o) => new Card(o.s, o.r, o.j === true);
    const gs = new GameState(data.playerCount);
    gs.currentPlayerIndex = data.currentPlayerIndex;
    gs.currentHandNumber = data.currentHandNumber;
    gs.dealerChipIndex = data.dealerChipIndex;
    gs.totalHands = data.totalHands;
    gs.deck.cards = (data.deck || []).map(o2c);
    gs.discardPile = (data.discardPile || []).map(o2c);
    gs.handScores = data.handScores || [];
    gs.players = (data.players || []).map(pd => {
      const p = new Player(pd.name);
      p.hand = (pd.hand || []).map(o2c);
      p.hasGoneDown = pd.hasGoneDown === true;
      p.hardModeEnabled = pd.hardModeEnabled === true;
      p.score = pd.score || 0;
      p.totalScore = pd.totalScore || 0;
      p.melds = (pd.melds || []).map(cards => new Meld(cards.map(o2c)));
      return p;
    });
    return gs;
  }
}
