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

enum CardLevel: CGFloat {
  case board = 10
  case moving = 100
  case enlarged = 200
}

class GameScene: SKScene {
  var gameState: GameState!
  var selectedCards: [Card] = []
  var currentPlayerHandView: SKNode!
  var meldsBoard: SKNode!
  var gameStatusLabel: SKLabelNode!
  var playerStatusLabel: SKLabelNode!
  var handRequirementLabel: SKLabelNode!
  var playerScoresLabel: SKLabelNode!
  var actionButtonsNode: SKNode!
  var hasDrawnThisTurn: Bool = false
  var gameOver: Bool = false
  var hardModeButton: SKSpriteNode!
  var dealerChipNode: SKSpriteNode!
  var gameStarted: Bool = false
  var dealerSelectionCards: [Card] = []
  var dealerSelectionView: SKNode!
  // Quick message UI
  var quickMessageButton: SKSpriteNode!
  var quickMessageMenuNode: SKNode!
  // Preset messages (developer can add more here)
  var presetMessages: [String] = ["¿Vas a ganar?", "¡Buena jugada!", "¡Suerte!", "¡Estás haciendo trampa!"]
  // Message manager (reuses MultiplayerSession API pattern)
  var messageManager: MultiplayerMessageManager!
  var lastMessageTimestamp: TimeInterval = 0
  
  override func didMove(to view: SKView) {
    backgroundColor = UIColor(red: 0.1, green: 0.6, blue: 0.1, alpha: 1.0)
    
    // Initialize game with 2 players (can be changed to 3 or 4)
    gameState = GameState(playerCount: 2)
    dealerSelectionView = SKNode()
    dealerSelectionView.zPosition = 150
    addChild(dealerSelectionView)
    
    // Initialize message manager (reuses MultiplayerSession API)
    let gameId = UUID().uuidString
    let playerId = UIDevice.current.identifierForVendor?.uuidString ?? "local_player"
    let playerName = "Player 1"  // TODO: Get from player selection screen
    messageManager = MultiplayerMessageManager(gameId: gameId, playerId: playerId, playerName: playerName)
    
    // Register listener for incoming messages
    messageManager.onMessageReceived { [weak self] message in
      self?.displayIncomingMessage(message)
    }
    
    // Start with dealer selection
    showDealerSelection()
    
    setupUI()
    displayCurrentPlayerHand()
    updateGameStatus()
  }
  
  func showDealerSelection() {
    // Create a temporary deck for dealer selection
    let selectionDeck = Deck(numDecks: 1)
    
    // Deal one card to each player for dealer selection
    dealerSelectionCards.removeAll()
    for _ in 0..<gameState.players.count {
      if let card = selectionDeck.drawCard() {
        dealerSelectionCards.append(card)
      }
    }
    
    dealerSelectionView.removeAllChildren()
    
    let titleLabel = SKLabelNode(fontNamed: "OpenSans-Bold")
    titleLabel.text = "Select a Card to Become Dealer"
    titleLabel.fontSize = 24
    titleLabel.fontColor = .white
    titleLabel.position = CGPoint(x: 0, y: 200)
    dealerSelectionView.addChild(titleLabel)
    
    let cardsPerRow = gameState.players.count
    let cardSpacing = 80.0
    let totalWidth = CGFloat(cardsPerRow - 1) * cardSpacing + 60
    let startX = (size.width - totalWidth) / 2
    
    for (index, card) in dealerSelectionCards.enumerated() {
      let xPos = startX + CGFloat(index) * cardSpacing
      card.position = CGPoint(x: xPos, y: size.height / 2)
      card.zPosition = 50
      card.name = "dealerCard_\(index)"
      dealerSelectionView.addChild(card)
      
      // Add player name below each card
      let playerNameLabel = SKLabelNode(fontNamed: "OpenSans")
      playerNameLabel.text = gameState.players[index].name
      playerNameLabel.fontSize = 12
      playerNameLabel.fontColor = .white
      playerNameLabel.position = CGPoint(x: xPos, y: size.height / 2 - 60)
      playerNameLabel.zPosition = 50
      dealerSelectionView.addChild(playerNameLabel)
    }
    
    let instructionLabel = SKLabelNode(fontNamed: "OpenSans")
    instructionLabel.text = "Highest card becomes dealer (Aces high)"
    instructionLabel.fontSize = 14
    instructionLabel.fontColor = .lightGray
    instructionLabel.position = CGPoint(x: 0, y: -100)
    dealerSelectionView.addChild(instructionLabel)

    // Add a quick "You're cheating" button during dealer selection
    let cheatButton = createButton(text: "¡Estás haciendo trampa!", position: CGPoint(x: size.width/2 - 120, y: -140), size: CGSize(width: 220, height: 40))
    cheatButton.name = "dealerCheat"
    dealerSelectionView.addChild(cheatButton)
  }
  
  func setupUI() {
    // Game status at top
    gameStatusLabel = SKLabelNode(fontNamed: "OpenSans-Bold")
    gameStatusLabel.fontSize = 20
    gameStatusLabel.fontColor = .white
    gameStatusLabel.position = CGPoint(x: size.width / 2, y: size.height - 40)
    gameStatusLabel.zPosition = 100
    addChild(gameStatusLabel)
    
    // Hand requirement
    handRequirementLabel = SKLabelNode(fontNamed: "OpenSans")
    handRequirementLabel.fontSize = 14
    handRequirementLabel.fontColor = .white
    handRequirementLabel.position = CGPoint(x: size.width / 2, y: size.height - 65)
    handRequirementLabel.zPosition = 100
    addChild(handRequirementLabel)
    
    // Player status
    playerStatusLabel = SKLabelNode(fontNamed: "OpenSans-Bold")
    playerStatusLabel.fontSize = 16
    playerStatusLabel.fontColor = .yellow
    playerStatusLabel.position = CGPoint(x: size.width / 2, y: size.height - 95)
    playerStatusLabel.zPosition = 100
    addChild(playerStatusLabel)
    
    // Player scores
    playerScoresLabel = SKLabelNode(fontNamed: "OpenSans")
    playerScoresLabel.fontSize = 12
    playerScoresLabel.fontColor = .white
    playerScoresLabel.numberOfLines = 4
    playerScoresLabel.position = CGPoint(x: 100, y: size.height - 40)
    playerScoresLabel.zPosition = 100
    addChild(playerScoresLabel)
    
    // Dealer chip
    dealerChipNode = SKSpriteNode(color: UIColor(red: 1.0, green: 0.84, blue: 0.0, alpha: 1), size: CGSize(width: 30, height: 30))
    dealerChipNode.position = CGPoint(x: 0, y: 0)
    dealerChipNode.zPosition = 100
    let dealerLabel = SKLabelNode(fontNamed: "OpenSans-Bold")
    dealerLabel.text = "D"
    dealerLabel.fontSize = 14
    dealerLabel.fontColor = .black
    dealerLabel.position = CGPoint.zero
    dealerChipNode.addChild(dealerLabel)
    addChild(dealerChipNode)
    
    // Melds display area
    meldsBoard = SKNode()
    meldsBoard.position = CGPoint(x: size.width / 2, y: size.height / 2 + 50)
    meldsBoard.zPosition = 50
    addChild(meldsBoard)
    
    let meldsLabel = SKLabelNode(fontNamed: "OpenSans")
    meldsLabel.text = "Melds on Table"
    meldsLabel.fontSize = 12
    meldsLabel.fontColor = .white
    meldsLabel.position = CGPoint(x: 0, y: 100)
    meldsLabel.zPosition = 100
    meldsBoard.addChild(meldsLabel)
    
    // Action buttons
    setupActionButtons()
    
    // Current player's hand view
    currentPlayerHandView = SKNode()
    currentPlayerHandView.zPosition = 50
    addChild(currentPlayerHandView)
  }
  
  func setupActionButtons() {
    actionButtonsNode = SKNode()
    actionButtonsNode.position = CGPoint(x: size.width - 150, y: 200)
    actionButtonsNode.zPosition = 100
    addChild(actionButtonsNode)
    
    let drawStockButton = createButton(text: "Draw Stock", position: CGPoint(x: 0, y: 0), size: CGSize(width: 120, height: 40))
    drawStockButton.name = "drawStock"
    actionButtonsNode.addChild(drawStockButton)
    
    let drawDiscardButton = createButton(text: "Draw Discard", position: CGPoint(x: 0, y: -50), size: CGSize(width: 120, height: 40))
    drawDiscardButton.name = "drawDiscard"
    actionButtonsNode.addChild(drawDiscardButton)
    
    let playMeldsButton = createButton(text: "Play Melds", position: CGPoint(x: 0, y: -100), size: CGSize(width: 120, height: 40))
    playMeldsButton.name = "playMelds"
    actionButtonsNode.addChild(playMeldsButton)
    
    let discardButton = createButton(text: "Discard", position: CGPoint(x: 0, y: -150), size: CGSize(width: 120, height: 40))
    discardButton.name = "discard"
    actionButtonsNode.addChild(discardButton)

    // Quick message button (open preset messages)
    quickMessageButton = createButton(text: "Mensajes", position: CGPoint(x: 0, y: -200), size: CGSize(width: 120, height: 40))
    quickMessageButton.name = "quickMessage"
    actionButtonsNode.addChild(quickMessageButton)
    
    // Hard mode toggle button (top left)
    hardModeButton = createButton(text: "Hard: OFF", position: CGPoint(x: 100, y: size.height - 150), size: CGSize(width: 100, height: 40))
    hardModeButton.name = "hardMode"
    hardModeButton.color = UIColor(red: 0.5, green: 0.2, blue: 0.2, alpha: 1)
    addChild(hardModeButton)
  }
  
  func createButton(text: String, position: CGPoint, size: CGSize) -> SKSpriteNode {
    let button = SKSpriteNode(color: UIColor(red: 0.2, green: 0.5, blue: 0.8, alpha: 1), size: size)
    button.position = position
    
    let label = SKLabelNode(fontNamed: "OpenSans-Bold")
    label.text = text
    label.fontSize = 12
    label.fontColor = .white
    label.position = CGPoint.zero
    button.addChild(label)
    
    return button
  }

  // Show a small menu with preset quick messages
  func showQuickMessageMenu() {
    quickMessageMenuNode?.removeFromParent()
    quickMessageMenuNode = SKNode()
    quickMessageMenuNode!.zPosition = 200

    let menuBg = SKSpriteNode(color: UIColor(white: 0.0, alpha: 0.6), size: CGSize(width: 240, height: CGFloat(presetMessages.count * 44 + 20)))
    menuBg.position = CGPoint(x: size.width - 150, y: 100)
    quickMessageMenuNode!.addChild(menuBg)

    for (index, msg) in presetMessages.enumerated() {
      let btn = createButton(text: msg, position: CGPoint(x: 0, y: CGFloat(menuBg.size.height / 2 - 30 - (index * 44))), size: CGSize(width: 220, height: 40))
      btn.name = "qm_\(index)"
      quickMessageMenuNode!.addChild(btn)
    }

    addChild(quickMessageMenuNode!)
  }

  func hideQuickMessageMenu() {
    quickMessageMenuNode?.removeFromParent()
    quickMessageMenuNode = nil
  }

  func sendQuickMessage(_ message: String) {
    // Send via message manager (reuses MultiplayerSession API)
    messageManager.sendMessage(message)
    
    // Local visual feedback of sent message
    let msgLabel = SKLabelNode(fontNamed: "OpenSans-Bold")
    msgLabel.text = "You: " + message
    msgLabel.fontSize = 16
    msgLabel.fontColor = .lightGray
    msgLabel.position = CGPoint(x: size.width / 2, y: size.height - 140)
    msgLabel.zPosition = 300
    addChild(msgLabel)

    let fade = SKAction.fadeOut(withDuration: 3.0)
    let remove = SKAction.removeFromParent()
    msgLabel.run(SKAction.sequence([SKAction.wait(forDuration: 0.1), fade, remove]))
  }

  func displayIncomingMessage(_ message: GameMessage) {
    // Skip if we already displayed this message
    if message.timestamp <= lastMessageTimestamp {
      return
    }
    lastMessageTimestamp = message.timestamp
    
    // Display incoming message from another player at top
    let msgLabel = SKLabelNode(fontNamed: "OpenSans-Bold")
    msgLabel.text = "\(message.fromName): \(message.text)"
    msgLabel.fontSize = 16
    msgLabel.fontColor = .yellow
    msgLabel.position = CGPoint(x: size.width / 2, y: size.height - 110)
    msgLabel.zPosition = 300
    addChild(msgLabel)

    let fade = SKAction.fadeOut(withDuration: 3.0)
    let remove = SKAction.removeFromParent()
    msgLabel.run(SKAction.sequence([SKAction.wait(forDuration: 2.0), fade, remove]))
  }
  
  func displayCurrentPlayerHand() {
    currentPlayerHandView.removeAllChildren()
    
    let player = gameState.getCurrentPlayer()
    let cards = player.hand
    let totalWidth = CGFloat(max(cards.count - 1, 0)) * 40 + 60
    let startX = (size.width - totalWidth) / 2
    let yPosition = 100.0
    
    for (index, card) in cards.enumerated() {
      let xPosition = startX + CGFloat(index) * 40
      card.position = CGPoint(x: xPosition, y: yPosition)
      card.zPosition = CardLevel.board.rawValue + CGFloat(index)
      if card.parent != currentPlayerHandView {
        currentPlayerHandView.addChild(card)
      }
    }
  }
  
  func updateGameStatus() {
    let hand = gameState.getCurrentHand()
    gameStatusLabel.text = "Hand \(gameState.currentHandNumber)/\(gameState.totalHands): \(hand.description)"
    handRequirementLabel.text = "Need \(hand.minCards) cards to open"
    
    let player = gameState.getCurrentPlayer()
    playerStatusLabel.text = "\(player.name)'s Turn (Hand: \(player.hand.count) cards)"
    
    var scores = ""
    for player in gameState.players {
      scores += "\(player.name): \(player.totalScore)\n"
    }
    playerScoresLabel.text = scores
    
    // Display melds on table
    displayMelds()
    updateHardModeDisplay()
  }
  
  func displayMelds() {
    meldsBoard.removeAllChildren()
    
    let label = SKLabelNode(fontNamed: "OpenSans")
    label.text = "Melds on Table"
    label.fontSize = 12
    label.fontColor = .white
    label.position = CGPoint(x: 0, y: 50)
    meldsBoard.addChild(label)
    
    var yOffset = 0.0
    for (playerIdx, player) in gameState.players.enumerated() {
      if !player.melds.isEmpty {
        let playerLabel = SKLabelNode(fontNamed: "OpenSans")
        playerLabel.text = "\(player.name):"
        playerLabel.fontSize = 10
        playerLabel.fontColor = .lightGray
        playerLabel.position = CGPoint(x: -100, y: yOffset)
        meldsBoard.addChild(playerLabel)
        yOffset -= 20
        
        for (meldIdx, meld) in player.melds.enumerated() {
          var meldStr = ""
          for card in meld {
            meldStr += card.isJoker ? "JO " : "\(card.rank.name)\(card.suit.symbol) "
          }
          let meldLabel = SKLabelNode(fontNamed: "OpenSans")
          meldLabel.text = meldStr
          meldLabel.fontSize = 8
          meldLabel.fontColor = .white
          meldLabel.position = CGPoint(x: -80, y: yOffset)
          meldsBoard.addChild(meldLabel)
          yOffset -= 15
        }
      }
    }
  }
  
  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    if gameOver { return }
    
    // If game hasn't started yet, we're in dealer selection mode
    if !gameStarted {
      for touch in touches {
        let location = touch.location(in: self)
        let touchedNode = atPoint(location)
        
        if let card = touchedNode as? Card, let cardName = card.name, cardName.hasPrefix("dealerCard_") {
          handleDealerCardSelection(card: card, cardName: cardName)
          return
        }
      }
      return
    }
    
    for touch in touches {
      let location = touch.location(in: self)
      let touchedNode = atPoint(location)
      
      // Check if we tapped a button
      var isButton = false
      if let button = touchedNode as? SKSpriteNode {
        if let name = button.name {
          if name == "drawStock" || name == "drawDiscard" || name == "playMelds" || name == "discard" || name == "hardMode" {
            handleButtonTap(button: button)
            isButton = true
          } else if name == "quickMessage" {
            // Only allow quick messages when it's NOT the player's turn
            if gameState.getCurrentPlayer().name != gameState.players[gameState.currentPlayerIndex].name || gameStarted == false {
              showQuickMessageMenu()
            } else {
              // If it's player's turn, still allow opening menu but could be disabled
              showQuickMessageMenu()
            }
            isButton = true
          } else if name.hasPrefix("qm_") {
            // Quick message item tapped
            let parts = name.components(separatedBy: "_")
            if parts.count == 2, let idx = Int(parts[1]), idx < presetMessages.count {
              sendQuickMessage(presetMessages[idx])
              hideQuickMessageMenu()
            }
            isButton = true
          } else if name == "dealerCheat" {
            sendQuickMessage("¡Estás haciendo trampa!")
            isButton = true
          }
        }
      }
      
      // Check if button label was tapped
      if !isButton, let parentButton = touchedNode.parent as? SKSpriteNode {
        if let pname = parentButton.name {
          if pname == "drawStock" || pname == "drawDiscard" || pname == "playMelds" || pname == "discard" || pname == "hardMode" {
            handleButtonTap(button: parentButton)
            isButton = true
          } else if pname == "quickMessage" {
            showQuickMessageMenu()
            isButton = true
          } else if pname.hasPrefix("qm_") {
            let parts = pname.components(separatedBy: "_")
            if parts.count == 2, let idx = Int(parts[1]), idx < presetMessages.count {
              sendQuickMessage(presetMessages[idx])
              hideQuickMessageMenu()
            }
            isButton = true
          } else if pname == "dealerCheat" {
            sendQuickMessage("¡Estás haciendo trampa!")
            isButton = true
          }
        }
      }
      
      // Handle card selection if not a button
      if !isButton {
        // If menu is visible and user tapped elsewhere, hide it
        hideQuickMessageMenu()
        if let card = touchedNode as? Card {
          toggleCardSelection(card: card)
        }
      }
    }
  }
  
  func handleDealerCardSelection(card: Card, cardName: String) {
    // Extract the player index from the card name
    let components = cardName.components(separatedBy: "_")
    guard components.count == 2, let selectedPlayerIdx = Int(components[1]) else { return }
    
    // Find the highest card value among all dealt cards
    var highestPlayerIdx = 0
    var highestValue = dealerSelectionCards[0].rank.pointValue(suit: dealerSelectionCards[0].suit)
    
    for (idx, selectedCard) in dealerSelectionCards.enumerated() {
      let cardValue = selectedCard.rank.pointValue(suit: selectedCard.suit)
      // Higher value wins (black aces 15 > red aces 10 > everything else)
      // In case of tie, first player (lower index) wins
      if cardValue > highestValue {
        highestValue = cardValue
        highestPlayerIdx = idx
      }
    }
    
    // Set the dealer chip to the player with the highest card
    gameState.dealerChipIndex = highestPlayerIdx
    
    // Clear the dealer selection view
    dealerSelectionView.removeAllChildren()
    
    // Position the dealer chip near the first dealer
    positionDealerChip()
    
    // Start the game
    gameStarted = true
    gameState.dealCards()
    
    // Show initial game state
    displayCurrentPlayerHand()
    displayMelds()
    updateGameStatus()
  }
  
  func positionDealerChip() {
    // Position dealer chip near the current dealer player
    let dealerPlayer = gameState.players[gameState.dealerChipIndex]
    // Position at the top area of the screen, above the game boards
    dealerChipNode.position = CGPoint(x: size.width / 2, y: size.height - 100)
    
    let playerLabel = SKLabelNode(fontNamed: "OpenSans-Bold")
    playerLabel.text = "Dealer: \(dealerPlayer.name)"
    playerLabel.fontSize = 18
    playerLabel.fontColor = .yellow
    playerLabel.position = CGPoint(x: 0, y: -30)
    dealerChipNode.removeAllChildren()
    dealerChipNode.addChild(playerLabel)
  }
  
  func handleButtonTap(button: SKSpriteNode) {
    let player = gameState.getCurrentPlayer()
    
    switch button.name {
    case "drawStock":
      if !hasDrawnThisTurn {
        if let card = gameState.deck.drawCard() {
          player.addCard(card)
          hasDrawnThisTurn = true
          displayCurrentPlayerHand()
          updateGameStatus()
        }
      }
    case "drawDiscard":
      if !hasDrawnThisTurn {
        if let card = gameState.discardPile.last {
          gameState.discardPile.removeLast()
          player.addCard(card)
          hasDrawnThisTurn = true
          displayCurrentPlayerHand()
          updateGameStatus()
        }
      }
    case "playMelds":
      if hasDrawnThisTurn && selectedCards.count > 0 {
        let meld = selectedCards
        if Meld(cards: meld).type() != nil {
          // Check if it satisfies hand requirements if player hasn't gone down
          if !player.hasGoneDown {
            if validateMeldForHand(meld) {
              player.hasGoneDown = true
              player.addMeld(meld)
              for card in selectedCards {
                player.removeCard(card)
              }
              selectedCards.removeAll()
              displayCurrentPlayerHand()
              displayMelds()
            }
          } else {
            // Can add any valid meld to existing melds
            player.addMeld(meld)
            for card in selectedCards {
              player.removeCard(card)
            }
            selectedCards.removeAll()
            displayCurrentPlayerHand()
            displayMelds()
          }
        }
      }
    case "discard":
      if hasDrawnThisTurn {
        if let lastCard = selectedCards.last ?? player.hand.last {
          if player.removeCard(lastCard) {
            gameState.discardPile.append(lastCard)
            selectedCards.removeAll()
            hasDrawnThisTurn = false
            gameState.nextPlayer()
            
            // Check if hand is over (any player has no cards left)
            if player.hand.isEmpty {
              gameState.endCurrentHand()
              if gameState.isGameOver() {
                gameOver = true
                showGameOverMessage()
              } else {
                // Update dealer chip position for new dealer
                positionDealerChip()
                resetHandUI()
              }
            } else {
              displayCurrentPlayerHand()
              updateGameStatus()
            }
          }
        }
      }
    case "hardMode":
      player.toggleHardMode()
      updateHardModeDisplay()
    default:
      break
    }
  }
  
  func validateMeldForHand(_ meld: [Card]) -> Bool {
    let meldObj = Meld(cards: meld)
    guard meldObj.type() != nil else { return false }
    return true
  }
  
  func canAddToMeld(_ card: Card, meld: [Card]) -> Bool {
    // Check if card can be added to existing meld (on player's turn, after they've gone down)
    let meldObj = Meld(cards: meld + [card])
    return meldObj.type() != nil
  }
  
  func resetHandUI() {
    selectedCards.removeAll()
    hasDrawnThisTurn = false
    displayCurrentPlayerHand()
    updateGameStatus()
    updateHardModeDisplay()
  }
  
  func updateHardModeDisplay() {
    let player = gameState.getCurrentPlayer()
    if player.hardModeEnabled {
      hardModeButton.color = UIColor(red: 1.0, green: 0.5, blue: 0.0, alpha: 1)
      if let label = hardModeButton.children.first as? SKLabelNode {
        label.text = "Hard: ON"
      }
    } else {
      hardModeButton.color = UIColor(red: 0.5, green: 0.2, blue: 0.2, alpha: 1)
      if let label = hardModeButton.children.first as? SKLabelNode {
        label.text = "Hard: OFF"
      }
    }
  }
  
  func showGameOverMessage() {
    let gameOverLabel = SKLabelNode(fontNamed: "OpenSans-Bold")
    gameOverLabel.fontSize = 32
    gameOverLabel.fontColor = .yellow
    gameOverLabel.position = CGPoint(x: size.width / 2, y: size.height / 2)
    gameOverLabel.zPosition = 200
    
    var winner = gameState.players[0]
    for player in gameState.players {
      if player.totalScore < winner.totalScore {
        winner = player
      }
    }
    
    gameOverLabel.text = "Game Over!\n\(winner.name) Wins!"
    addChild(gameOverLabel)
  }
  
  func toggleCardSelection(card: Card) {
    if selectedCards.contains(where: { $0 === card }) {
      selectedCards.removeAll { $0 === card }
      card.run(SKAction.scale(to: 1.0, duration: 0.1))
    } else {
      selectedCards.append(card)
      card.run(SKAction.scale(to: 1.2, duration: 0.1))
    }
  }
}
