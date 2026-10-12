import Foundation

// MARK: - Deck Management
class Deck {
  var cards: [Card] = []
  
  init(numDecks: Int = 2) {
    createDecks(numDecks)
    shuffle()
  }
  
  private func createDecks(_ count: Int) {
    for _ in 0..<count {
      for suit in [Suit.hearts, .diamonds, .clubs, .spades] {
        for rank in [Rank.ace, .two, .three, .four, .five, .six, .seven, .eight, .nine, .ten, .jack, .queen, .king] {
          cards.append(Card(suit: suit, rank: rank))
        }
      }
      // Add 2 jokers per deck
      cards.append(Card(joker: true))
      cards.append(Card(joker: true))
    }
  }
  
  func shuffle() {
    cards.shuffle()
  }
  
  func drawCard() -> Card? {
    return cards.isEmpty ? nil : cards.removeFirst()
  }
  
  func drawCards(_ count: Int) -> [Card] {
    var drawn: [Card] = []
    for _ in 0..<count {
      if let card = drawCard() {
        drawn.append(card)
      }
    }
    return drawn
  }
  
  func cardsRemaining() -> Int {
    return cards.count
  }
}

// MARK: - Meld Validation
struct Meld {
  var cards: [Card]
  
  enum MeldType {
    case set  // 3 or more of same rank
    case run  // 4 or more in sequence of same suit
  }
  
  func type() -> MeldType? {
    guard !cards.isEmpty else { return nil }
    
    // Check if it's a set
    if isValidSet() {
      return .set
    }
    
    // Check if it's a run
    if isValidRun() {
      return .run
    }
    
    return nil
  }
  
  /// Wild cards are jokers and red aces (family rules)
  static func isWildCard(_ card: Card) -> Bool {
    return card.isJoker || (card.rank == .ace && (card.suit == .hearts || card.suit == .diamonds))
  }

  /// Set: 3+ cards of same rank. Wilds (jokers + red aces) can substitute but
  /// cannot outnumber naturals. A red ace in a set of aces counts as natural.
  /// (Mirrors web/src/gameLogic.js Meld.isSet)
  func isValidSet() -> Bool {
    guard cards.count >= 3 else { return false }

    let nonJokers = cards.filter { !$0.isJoker }
    guard !nonJokers.isEmpty else { return false }

    // Target rank: prefer a non-wild card's rank; if only wilds+red aces, treat as an ace set
    let nonWild = nonJokers.filter { !Meld.isWildCard($0) }
    let targetRank = nonWild.first?.rank ?? .ace

    var naturals = 0
    var wilds = cards.count - nonJokers.count // jokers
    for card in nonJokers {
      if card.rank == targetRank {
        naturals += 1 // red ace matching an ace set counts as natural
      } else if Meld.isWildCard(card) {
        wilds += 1
      } else {
        return false
      }
    }

    return wilds <= naturals
  }

  /// Run: 4+ same-suit cards in sequence. Wilds (jokers + red aces) can fill
  /// gaps or extend the ends, but cannot outnumber naturals.
  /// (Mirrors web/src/gameLogic.js Meld.isRun)
  func isValidRun() -> Bool {
    guard cards.count >= 4 else { return false }

    let naturals = cards.filter { !Meld.isWildCard($0) }
    let wilds = cards.count - naturals.count
    guard !naturals.isEmpty, wilds <= naturals.count else { return false }

    // All natural cards must be same suit
    let suit = naturals.first!.suit
    for card in naturals {
      if card.suit != suit {
        return false
      }
    }

    let sortedRanks = naturals.map { $0.rank.rawValue }.sorted()

    // No duplicate ranks; count wilds needed to fill internal gaps
    var gaps = 0
    for i in 1..<sortedRanks.count {
      if sortedRanks[i] == sortedRanks[i-1] { return false }
      gaps += sortedRanks[i] - sortedRanks[i-1] - 1
    }
    guard gaps <= wilds else { return false }

    // Leftover wilds extend the ends; the whole run must fit within A..K
    let leftover = wilds - gaps
    let span = (sortedRanks.last! - sortedRanks.first! + 1) + leftover
    return span <= 13
  }
}

// MARK: - Player
class Player {
  let id: Int
  let name: String
  var hand: [Card] = []
  var melds: [[Card]] = []  // Cards the player has laid down
  var hasGoneDown: Bool = false
  var hardModeEnabled: Bool = false
  var score: Int = 0
  var totalScore: Int = 0
  
  init(id: Int, name: String) {
    self.id = id
    self.name = name
  }
  
  func addCard(_ card: Card) {
    hand.append(card)
  }
  
  func removeCard(_ card: Card) -> Bool {
    if let index = hand.firstIndex(where: { $0 === card }) {
      hand.remove(at: index)
      return true
    }
    return false
  }
  
  func addMeld(_ cards: [Card]) {
    melds.append(cards)
  }
  
  func calculateScore() -> Int {
    var score = 0
    for card in hand {
      score += card.pointValue()
    }
    return score
  }
  
  func resetHand() {
    hand.removeAll()
    melds.removeAll()
    hasGoneDown = false
    hardModeEnabled = false
  }
  
  func toggleHardMode() {
    hardModeEnabled = !hardModeEnabled
  }
  
  func hasWonHand() -> Bool {
    // In hard mode, player must have empty hand to win
    // In normal mode, player wins when hand is empty
    return hand.isEmpty
  }
}

// MARK: - Game State
class GameState {
  enum HandNumber: Int {
    case hand1 = 1   // Two Sets (6 cards)
    case hand2 = 2   // One Set + One Run (7 cards)
    case hand3 = 3   // Two Runs (8 cards)
    case hand4 = 4   // Three Sets (9 cards)
    case hand5 = 5   // Two Sets + One Run (10 cards)
    case hand6 = 6   // Two Runs + One Set (11 cards)
    case hand7 = 7   // Three Runs (12 cards)
    case hand8a = 8  // Two Sets + Two Runs (for 9-hand variant)
    case hand8 = 8   // Four Runs
    
    var minCards: Int {
      switch self {
      case .hand1: return 6
      case .hand2: return 7
      case .hand3: return 8
      case .hand4: return 9
      case .hand5: return 10
      case .hand6: return 11
      case .hand7: return 12
      case .hand8a: return 12
      case .hand8: return 12
      }
    }
    
    var description: String {
      switch self {
      case .hand1: return "Two Sets"
      case .hand2: return "One Set & One Run"
      case .hand3: return "Two Runs"
      case .hand4: return "Three Sets"
      case .hand5: return "Two Sets & One Run"
      case .hand6: return "Two Runs & One Set"
      case .hand7: return "Three Runs"
      case .hand8a: return "Two Sets & Two Runs"
      case .hand8: return "Four Runs"
      }
    }
  }
  
  var players: [Player]
  var currentHandNumber: Int = 1
  var totalHands: Int
  var currentPlayerIndex: Int = 0
  var deck: Deck
  var discardPile: [Card] = []
  var dealerIndex: Int = 0
  var dealerChipIndex: Int = 0  // Tracks who has the dealer chip
  
  init(playerCount: Int) {
    self.players = (0..<playerCount).map { Player(id: $0, name: "Player \($0 + 1)") }
    self.totalHands = playerCount == 3 ? 9 : 8
    self.deck = Deck(numDecks: numDecksNeeded(playerCount))
  }
  
  private func numDecksNeeded(_ playerCount: Int) -> Int {
    return (playerCount + 1) / 2
  }
  
  func getCurrentHand() -> HandNumber {
    if totalHands == 9 {
      switch currentHandNumber {
      case 1: return .hand1
      case 2: return .hand2
      case 3: return .hand3
      case 4: return .hand5   // Two Sets & One Run
      case 5: return .hand6   // Two Runs & One Set
      case 6: return .hand4   // Three Sets (moved here)
      case 7: return .hand8a  // Two Sets & Two Runs
      case 8: return .hand7   // Three Runs
      case 9: return .hand8   // Four Runs
      default: return .hand1
      }
    } else {
      // 8-hand game (hand 4 comes before hand 7)
      switch currentHandNumber {
      case 1: return .hand1
      case 2: return .hand2
      case 3: return .hand3
      case 4: return .hand5   // Two Sets & One Run
      case 5: return .hand6   // Two Runs & One Set
      case 6: return .hand4   // Three Sets (moved here)
      case 7: return .hand7   // Three Runs
      case 8: return .hand8   // Four Runs
      default: return .hand1
      }
    }
  }
  
  func getCurrentPlayer() -> Player {
    return players[currentPlayerIndex]
  }
  
  func nextPlayer() {
    currentPlayerIndex = (currentPlayerIndex + 1) % players.count
  }
  
  func dealCards() {
    for player in players {
      player.resetHand()
    }
    
    deck = Deck(numDecks: numDecksNeeded(players.count))
    discardPile.removeAll()
    
    // Deal 11 cards to each player (family rules)
    for _ in 0..<11 {
      for player in players {
        if let card = deck.drawCard() {
          player.addCard(card)
        }
      }
    }
    
    // Place initial discard card
    if let card = deck.drawCard() {
      discardPile.append(card)
    }
    
    // Current player to play is the one after dealer
    currentPlayerIndex = (dealerChipIndex + 1) % players.count
  }
  
  func moveToDealerAction() {
    dealerIndex = (dealerIndex + 1) % players.count
    dealerChipIndex = dealerIndex
  }
  
  func advanceDealerChip() {
    dealerChipIndex = (dealerChipIndex + 1) % players.count
  }
  
  func processDealerCut(cardsDealt: Int) {
    let dealer = players[dealerChipIndex]
    let expectedCards = 11 * players.count  // Expected cards without discard
    let expectedWithDiscard = (11 * players.count) + 1
    
    // Dealer gets -100 points if they cut correctly
    if cardsDealt == expectedCards || cardsDealt == expectedWithDiscard {
      dealer.totalScore -= 100
    }
  }
  
  func advanceHand() {
    if currentHandNumber < totalHands {
      currentHandNumber += 1
      advanceDealerChip()  // Rotate dealer chip to next player
      dealCards()
    }
  }
  
  func endCurrentHand() {
    // Calculate scores for all players
    for player in players {
      let handScore = player.calculateScore()
      player.score = handScore
      player.totalScore += handScore
    }
    
    // Move to next hand or end game
    advanceHand()
  }
  
  func isGameOver() -> Bool {
    return currentHandNumber > totalHands
  }
  
  func validateMelds(_ melds: [[Card]]) -> Bool {
    let hand = getCurrentHand()
    
    // Validate melds for current hand
    switch hand {
    case .hand1:
      return melds.count == 2 && melds.allSatisfy { Meld(cards: $0).isValidSet() }
    case .hand2:
      return melds.count == 2 && 
        (Meld(cards: melds[0]).isValidSet() && Meld(cards: melds[1]).isValidRun() ||
         Meld(cards: melds[0]).isValidRun() && Meld(cards: melds[1]).isValidSet())
    case .hand3:
      return melds.count == 2 && melds.allSatisfy { Meld(cards: $0).isValidRun() }
    case .hand4:
      return melds.count == 3 && melds.allSatisfy { Meld(cards: $0).isValidSet() }
    case .hand5:
      let sets = melds.filter { Meld(cards: $0).isValidSet() }
      let runs = melds.filter { Meld(cards: $0).isValidRun() }
      return sets.count == 2 && runs.count == 1
    case .hand6:
      let sets = melds.filter { Meld(cards: $0).isValidSet() }
      let runs = melds.filter { Meld(cards: $0).isValidRun() }
      return sets.count == 1 && runs.count == 2
    case .hand7:
      return melds.count == 3 && melds.allSatisfy { Meld(cards: $0).isValidRun() }
    case .hand8a:
      let sets = melds.filter { Meld(cards: $0).isValidSet() }
      let runs = melds.filter { Meld(cards: $0).isValidRun() }
      return sets.count == 2 && runs.count == 2
    case .hand8:
      return melds.count == 4 && melds.allSatisfy { Meld(cards: $0).isValidRun() }
    }
  }
}
