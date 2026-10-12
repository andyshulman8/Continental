/**
 * Card game logic - shared between iOS and Web versions
 */

export enum Suit {
  Hearts = 'hearts',
  Diamonds = 'diamonds',
  Clubs = 'clubs',
  Spades = 'spades'
}

export enum Rank {
  Ace = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
  Eight = 8,
  Nine = 9,
  Ten = 10,
  Jack = 11,
  Queen = 12,
  King = 13
}

export class Card {
  suit: Suit;
  rank: Rank;
  isJoker: boolean;

  constructor(suit: Suit, rank: Rank, isJoker: boolean = false) {
    this.suit = suit;
    this.rank = rank;
    this.isJoker = isJoker;
  }

  get suitSymbol(): string {
    switch (this.suit) {
      case Suit.Hearts: return '♥';
      case Suit.Diamonds: return '♦';
      case Suit.Clubs: return '♣';
      case Suit.Spades: return '♠';
    }
  }

  get rankName(): string {
    if (this.isJoker) return 'JO';
    switch (this.rank) {
      case Rank.Ace: return 'A';
      case Rank.Jack: return 'J';
      case Rank.Queen: return 'Q';
      case Rank.King: return 'K';
      default: return this.rank.toString();
    }
  }

  get isRed(): boolean {
    return this.suit === Suit.Hearts || this.suit === Suit.Diamonds;
  }

  get isBlack(): boolean {
    return this.suit === Suit.Clubs || this.suit === Suit.Spades;
  }

  pointValue(): number {
    if (this.isJoker) {
      return 10; // Jokers are 10 points (wild cards)
    }

    switch (this.rank) {
      case Rank.Ace:
        // Black aces are 15 points, red aces are 10 points (wild)
        return this.isBlack ? 15 : 10;
      case Rank.Two:
      case Rank.Three:
      case Rank.Four:
      case Rank.Five:
      case Rank.Six:
      case Rank.Seven:
      case Rank.Eight:
      case Rank.Nine:
        return this.rank;
      case Rank.Ten:
      case Rank.Jack:
      case Rank.Queen:
      case Rank.King:
        return 10;
    }
  }

  toString(): string {
    return `${this.rankName}${this.suitSymbol}`;
  }
}

export class Deck {
  cards: Card[] = [];

  constructor(numDecks: number = 1) {
    for (let d = 0; d < numDecks; d++) {
      for (const suit of Object.values(Suit)) {
        for (const rank of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
          this.cards.push(new Card(suit, rank as Rank));
        }
      }
      // Add jokers
      this.cards.push(new Card(Suit.Hearts, Rank.Ace, true));
      this.cards.push(new Card(Suit.Hearts, Rank.Ace, true));
    }
    this.shuffle();
  }

  shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  drawCard(): Card | undefined {
    return this.cards.pop();
  }

  cardsRemaining(): number {
    return this.cards.length;
  }
}

export enum MeldType {
  Set = 'set',        // 3+ cards of same rank
  Run = 'run'         // 3+ cards in sequence of same suit
}

export class Meld {
  cards: Card[];

  constructor(cards: Card[]) {
    this.cards = cards;
  }

  type(): MeldType | null {
    if (this.isSet()) return MeldType.Set;
    if (this.isRun()) return MeldType.Run;
    return null;
  }

  private isSet(): boolean {
    if (this.cards.length < 3) return false;
    
    const ranks = this.cards.map(c => c.rank).sort((a, b) => a - b);
    const firstRank = ranks[0];
    
    // All must be same rank (including wild cards)
    return ranks.every(r => r === firstRank || this.isWildCard(this.cards.find(c => c.rank === r)!));
  }

  private isRun(): boolean {
    if (this.cards.length < 3) return false;

    // All must be same suit
    const suit = this.cards[0].suit;
    if (!this.cards.every(c => c.suit === suit || c.isJoker)) return false;

    // Must be in sequence
    const ranks = this.cards
      .filter(c => !c.isJoker)
      .map(c => c.rank)
      .sort((a, b) => a - b);

    for (let i = 1; i < ranks.length; i++) {
      if (ranks[i] !== ranks[i - 1] + 1) return false;
    }

    return true;
  }

  private isWildCard(card: Card): boolean {
    return card.isJoker || (card.rank === Rank.Ace && card.isRed);
  }
}

export class Player {
  name: string;
  hand: Card[] = [];
  melds: Meld[] = [];
  hasGoneDown: boolean = false;
  hardModeEnabled: boolean = false;
  score: number = 0;
  totalScore: number = 0;

  constructor(name: string) {
    this.name = name;
  }

  addCard(card: Card): void {
    this.hand.push(card);
  }

  removeCard(card: Card): void {
    const index = this.hand.indexOf(card);
    if (index > -1) {
      this.hand.splice(index, 1);
    }
  }

  addMeld(meld: Meld): void {
    this.melds.push(meld);
  }

  addMeldCards(cards: Card[]): void {
    const meld = new Meld(cards);
    this.melds.push(meld);
  }

  toggleHardMode(): void {
    this.hardModeEnabled = !this.hardModeEnabled;
  }

  hasWonHand(): boolean {
    return this.hand.length === 0;
  }

  calculateScore(): number {
    let score = 0;
    for (const card of this.hand) {
      score += card.pointValue();
    }
    return score;
  }

  resetHand(): void {
    this.hand = [];
    this.melds = [];
    this.hasGoneDown = false;
    this.score = 0;
  }

  resetForNewGame(): void {
    this.hand = [];
    this.melds = [];
    this.hasGoneDown = false;
    this.hardModeEnabled = false;
    this.score = 0;
    this.totalScore = 0;
  }
}

export enum HandNumber {
  Hand1 = 1,    // Two Sets (6 cards)
  Hand2 = 2,    // One Set + One Run (7 cards)
  Hand3 = 3,    // Two Runs (8 cards)
  Hand5 = 5,    // Two Sets + One Run (9 cards)
  Hand6 = 6,    // Two Runs + One Set (10 cards)
  Hand4 = 4,    // Three Sets (9 cards)
  Hand7 = 7,    // Three Runs (11 cards)
  Hand8 = 8,    // Four Runs (13 cards) / OR Four Sets for 8-hand variant
  Hand8a = 81   // Two Sets + Two Runs (12 cards) - only in 9-hand variant
}

export class GameState {
  players: Player[] = [];
  numDecksNeeded: number;
  deck: Deck;
  discardPile: Card[] = [];
  currentPlayerIndex: number = 0;
  currentHandNumber: number = 1;
  dealerChipIndex: number = 0;
  totalHands: number = 8;

  constructor(playerCount: number = 2) {
    this.numDecksNeeded = Math.ceil((playerCount * 11 + 1) / 52) + 1;
    this.deck = new Deck(this.numDecksNeeded);

    // Create players
    const playerNames = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
    for (let i = 0; i < playerCount; i++) {
      this.players.push(new Player(playerNames[i]));
    }

    // 9 hands for 3 players, 8 for others
    this.totalHands = playerCount === 3 ? 9 : 8;
  }

  getCurrentPlayer(): Player {
    return this.players[this.currentPlayerIndex];
  }

  getCurrentHand(): HandNumber {
    if (this.players.length === 3) {
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

  getHandDescription(hand: HandNumber): string {
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

  nextPlayer(): void {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
  }

  dealCards(): void {
    for (const player of this.players) {
      player.resetHand();
    }

    this.deck = new Deck(this.numDecksNeeded);
    this.discardPile = [];

    // Deal 11 cards to each player (family rules)
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

    // Current player to play is the one after dealer
    this.currentPlayerIndex = (this.dealerChipIndex + 1) % this.players.length;
  }

  advanceDealerChip(): void {
    this.dealerChipIndex = (this.dealerChipIndex + 1) % this.players.length;
  }

  processDealerCut(cardsDealt: number): void {
    const dealer = this.players[this.dealerChipIndex];
    const expectedCards = 11 * this.players.length;
    const expectedWithDiscard = (11 * this.players.length) + 1;

    // Dealer gets -100 points if they cut correctly
    if (cardsDealt === expectedCards || cardsDealt === expectedWithDiscard) {
      dealer.totalScore -= 100;
    }
  }

  advanceHand(): void {
    if (this.currentHandNumber < this.totalHands) {
      this.currentHandNumber += 1;
      this.advanceDealerChip();
      this.dealCards();
    }
  }

  endCurrentHand(): void {
    // Calculate scores for all players
    for (const player of this.players) {
      const handScore = player.calculateScore();
      player.score = handScore;
      player.totalScore += handScore;
    }

    // Move to next hand or end game
    this.advanceHand();
  }

  isGameOver(): boolean {
    return this.currentHandNumber > this.totalHands;
  }

  getGameWinner(): Player | null {
    if (!this.isGameOver()) return null;
    
    let winner = this.players[0];
    for (const player of this.players) {
      if (player.totalScore < winner.totalScore) {
        winner = player;
      }
    }
    return winner;
  }
}
