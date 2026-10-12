/**
 * Copyright (c) 2016 Razeware LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import SpriteKit

enum Suit: Int {
  case hearts = 0
  case diamonds = 1
  case clubs = 2
  case spades = 3
  
  var symbol: String {
    switch self {
    case .hearts: return "♥"
    case .diamonds: return "♦"
    case .clubs: return "♣"
    case .spades: return "♠"
    }
  }
}

enum Rank: Int {
  case ace = 1
  case two = 2
  case three = 3
  case four = 4
  case five = 5
  case six = 6
  case seven = 7
  case eight = 8
  case nine = 9
  case ten = 10
  case jack = 11
  case queen = 12
  case king = 13
  
  var name: String {
    switch self {
    case .ace: return "A"
    case .jack: return "J"
    case .queen: return "Q"
    case .king: return "K"
    default: return String(self.rawValue)
    }
  }
  
  func valueFor(suit: Suit) -> Int {
    switch self {
    case .ace:
      // Black aces are 15 points, red aces are 10 points (wild)
      return (suit == .clubs || suit == .spades) ? 15 : 10
    case .two...nine: return rawValue
    case .ten, .jack, .queen, .king: return 10
    }
  }
}

class Card: SKSpriteNode {
  let suit: Suit
  let rank: Rank
  let isJoker: Bool
  var faceUp = true
  var enlarged = false
  var savedPosition = CGPoint.zero
  let textLabel: SKLabelNode
  
  required init?(coder aDecoder: NSCoder) {
    fatalError("NSCoding not supported")
  }
  
  init(suit: Suit, rank: Rank) {
    self.suit = suit
    self.rank = rank
    self.isJoker = false
    
    textLabel = SKLabelNode(fontNamed: "OpenSans-Bold")
    textLabel.name = "textLabel"
    textLabel.fontSize = 14
    textLabel.zPosition = 1
    
    super.init(texture: nil, color: .white, size: CGSize(width: 60, height: 90))
    
    updateDisplay()
    addChild(textLabel)
  }
  
  init(joker: Bool) {
    self.suit = .hearts
    self.rank = .ace
    self.isJoker = true
    
    textLabel = SKLabelNode(fontNamed: "OpenSans-Bold")
    textLabel.name = "textLabel"
    textLabel.fontSize = 14
    textLabel.zPosition = 1
    
    super.init(texture: nil, color: UIColor(red: 0.2, green: 0.2, blue: 0.2, alpha: 1), size: CGSize(width: 60, height: 90))
    
    updateDisplay()
    addChild(textLabel)
  }
  
  func updateDisplay() {
    let rankName = isJoker ? "JO" : rank.name
    let suitSymbol = isJoker ? "🃏" : suit.symbol
    
    textLabel.text = "\(rankName)\n\(suitSymbol)"
    textLabel.numberOfLines = 2
    
    if isJoker {
      color = UIColor(red: 0.2, green: 0.2, blue: 0.2, alpha: 1)
      textLabel.fontColor = .yellow
    } else if suit == .hearts || suit == .diamonds {
      color = .white
      textLabel.fontColor = .red
    } else {
      color = .white
      textLabel.fontColor = .black
    }
  }
  
  func flip() {
    faceUp = !faceUp
    if faceUp {
      color = .white
      textLabel.isHidden = false
    } else {
      color = UIColor(red: 0.2, green: 0.2, blue: 0.2, alpha: 1)
      textLabel.isHidden = true
    }
  }
  
  func pointValue() -> Int {
    if isJoker {
      return 10  // Jokers are 10 points (wild cards)
    }
    return rank.valueFor(suit: suit)
  }
}
