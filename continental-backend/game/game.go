package game

import (
	"continental/entities"
	"fmt"
	"math/rand"
	"sync"
)

// Game represents a Continental game instance
type Game struct {
	GameId     string
	GameState  *entities.GameState
	Players    []*entities.Player
	
	// Synchronization
	mutex      sync.RWMutex
	conditions map[string]*sync.Cond
	
	// Game configuration
	GameMode   entities.GameMode
	
	// Timers and state tracking
	ActivePlayerTimeout int
	LastAction          map[string]int64 // Player ID -> timestamp
}

// NewGame creates a new Continental game
func NewGame(gameId string, players []*entities.Player, gameMode entities.GameMode) *Game {
	playerCount := len(players)
	gameState := entities.NewGameState(playerCount)
	
	game := &Game{
		GameId:    gameId,
		GameState: gameState,
		Players:   players,
		GameMode:  gameMode,
		conditions: make(map[string]*sync.Cond),
		LastAction: make(map[string]int64),
	}
	
	// Initialize player states
	for _, player := range players {
		gameState.AddPlayerState(player.GetPlayerState())
	}
	
	return game
}

// InitializeGame sets up the game with shuffled deck and initial deal
func (g *Game) InitializeGame() error {
	g.mutex.Lock()
	defer g.mutex.Unlock()
	
	// Create and shuffle deck
	g.CreateDeck()
	g.ShuffleDeck()
	
	g.GameState.GamePhase = "dealing"
	
	return nil
}

// CreateDeck creates a standard 54-card deck (2 decks + 2 jokers)
func (g *Game) CreateDeck() {
	g.GameState.Deck = make([]*entities.Card, 0, 108)
	
	suits := []string{"hearts", "diamonds", "clubs", "spades"}
	ranks := []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13}
	
	// Create 2 complete decks
	for d := 0; d < 2; d++ {
		for _, suit := range suits {
			for _, rank := range ranks {
				g.GameState.Deck = append(g.GameState.Deck, &entities.Card{
					Suit:    suit,
					Rank:    rank,
					IsJoker: false,
				})
			}
		}
		// Add 2 jokers per deck
		g.GameState.Deck = append(g.GameState.Deck, &entities.Card{
			Suit:    "joker",
			Rank:    0,
			IsJoker: true,
		})
		g.GameState.Deck = append(g.GameState.Deck, &entities.Card{
			Suit:    "joker",
			Rank:    0,
			IsJoker: true,
		})
	}
}

// ShuffleDeck shuffles the deck
func (g *Game) ShuffleDeck() {
	deck := g.GameState.Deck
	for i := len(deck) - 1; i > 0; i-- {
		j := rand.Intn(i + 1)
		deck[i], deck[j] = deck[j], deck[i]
	}
}

// DealCards deals 11 cards to each player
func (g *Game) DealCards() error {
	g.mutex.Lock()
	defer g.mutex.Unlock()
	
	// Reset player hands
	for _, player := range g.Players {
		player.ResetHand()
	}
	
	// Clear discard pile
	g.GameState.DiscardPile = make([]*entities.Card, 0)
	
	// Recreate and shuffle deck
	g.CreateDeck()
	g.ShuffleDeck()
	
	// Deal 11 cards to each player
	for i := 0; i < 11; i++ {
		for _, player := range g.Players {
			if len(g.GameState.Deck) > 0 {
				card := g.GameState.Deck[len(g.GameState.Deck)-1]
				g.GameState.Deck = g.GameState.Deck[:len(g.GameState.Deck)-1]
				player.AddCard(card)
			}
		}
	}
	
	// Place initial discard card
	if len(g.GameState.Deck) > 0 {
		card := g.GameState.Deck[len(g.GameState.Deck)-1]
		g.GameState.Deck = g.GameState.Deck[:len(g.GameState.Deck)-1]
		g.GameState.DiscardPile = append(g.GameState.DiscardPile, card)
	}
	
	g.GameState.UpdateTableState()
	g.GameState.CurrentPlayerOrder = (g.GameState.DealerIndex + 1) % uint16(len(g.Players))
	g.GameState.GamePhase = "playing"
	
	return nil
}

// DrawFromStock draws a card from the stock pile
func (g *Game) DrawFromStock(playerId string) error {
	g.mutex.Lock()
	defer g.mutex.Unlock()
	
	player := g.GetPlayerById(playerId)
	if player == nil {
		return fmt.Errorf("player not found")
	}
	
	if len(g.GameState.Deck) == 0 {
		return fmt.Errorf("no cards in stock pile")
	}
	
	card := g.GameState.Deck[len(g.GameState.Deck)-1]
	g.GameState.Deck = g.GameState.Deck[:len(g.GameState.Deck)-1]
	player.AddCard(card)
	
	g.GameState.UpdateTableState()
	
	return nil
}

// DrawFromDiscard draws from the discard pile
func (g *Game) DrawFromDiscard(playerId string) error {
	g.mutex.Lock()
	defer g.mutex.Unlock()
	
	player := g.GetPlayerById(playerId)
	if player == nil {
		return fmt.Errorf("player not found")
	}
	
	if len(g.GameState.DiscardPile) == 0 {
		return fmt.Errorf("no cards in discard pile")
	}
	
	card := g.GameState.DiscardPile[len(g.GameState.DiscardPile)-1]
	g.GameState.DiscardPile = g.GameState.DiscardPile[:len(g.GameState.DiscardPile)-1]
	player.AddCard(card)
	
	g.GameState.UpdateTableState()
	
	return nil
}

// PlayMelds plays melds from player's hand
func (g *Game) PlayMelds(playerId string, meldCardIndices []int) error {
	g.mutex.Lock()
	defer g.mutex.Unlock()
	
	player := g.GetPlayerById(playerId)
	if player == nil {
		return fmt.Errorf("player not found")
	}
	
	// Create a single meld from the card indices
	meld := &entities.Meld{
		Cards: make([]*entities.Card, 0),
	}
	
	// Collect cards in reverse order (to remove higher indices first)
	for i := len(meldCardIndices) - 1; i >= 0; i-- {
		idx := meldCardIndices[i]
		if idx < 0 || idx >= len(player.Hand) {
			return fmt.Errorf("invalid card index")
		}
		meld.Cards = append([]*entities.Card{player.Hand[idx]}, meld.Cards...)
	}
	
	// Remove cards from hand (in reverse order)
	for i := len(meldCardIndices) - 1; i >= 0; i-- {
		idx := meldCardIndices[i]
		player.Hand = append(player.Hand[:idx], player.Hand[idx+1:]...)
	}
	
	player.AddMeld(meld)
	player.HasGoneDown = true
	
	return nil
}

// DiscardCard discards a card from player's hand
func (g *Game) DiscardCard(playerId string, cardIndex int) error {
	g.mutex.Lock()
	defer g.mutex.Unlock()
	
	player := g.GetPlayerById(playerId)
	if player == nil {
		return fmt.Errorf("player not found")
	}
	
	if cardIndex < 0 || cardIndex >= len(player.Hand) {
		return fmt.Errorf("invalid card index")
	}
	
	card := player.Hand[cardIndex]
	player.Hand = append(player.Hand[:cardIndex], player.Hand[cardIndex+1:]...)
	g.GameState.DiscardPile = append(g.GameState.DiscardPile, card)
	
	g.GameState.UpdateTableState()
	
	return nil
}

// EndTurn moves to the next player
func (g *Game) EndTurn() error {
	g.mutex.Lock()
	defer g.mutex.Unlock()
	
	g.GameState.NextPlayer()
	
	return nil
}

// EndHand calculates scores and moves to next hand
func (g *Game) EndHand() error {
	g.mutex.Lock()
	defer g.mutex.Unlock()
	
	// Calculate scores for all players
	for _, player := range g.Players {
		handScore := player.CalculateScore()
		player.Score = handScore
		player.TotalScore += handScore
	}
	
	g.GameState.AdvanceHand()
	
	if g.GameState.IsGameOver() {
		g.GameState.GamePhase = "game_over"
	} else {
		g.GameState.GamePhase = "playing"
		g.DealCards()
	}
	
	return nil
}

// GetPlayerById gets a player by ID
func (g *Game) GetPlayerById(playerId string) *entities.Player {
	for _, player := range g.Players {
		if player.Id == playerId {
			return player
		}
	}
	return nil
}

// GetPlayerByOrder gets a player by their order
func (g *Game) GetPlayerByOrder(order uint16) *entities.Player {
	for _, player := range g.Players {
		if player.Order == order {
			return player
		}
	}
	return nil
}

// GetCurrentPlayer gets the current player
func (g *Game) GetCurrentPlayer() *entities.Player {
	return g.GetPlayerByOrder(g.GameState.CurrentPlayerOrder)
}

// GetGameStateForPlayer gets the game state as seen by a specific player
func (g *Game) GetGameStateForPlayer(playerId string) *entities.GameState {
	g.mutex.RLock()
	defer g.mutex.RUnlock()
	
	// Create a copy of game state with hidden information
	stateCopy := *g.GameState
	
	// Don't include stock pile details (count only)
	// Discard pile is visible
	
	return &stateCopy
}

// SerializeGameState serializes the game state for transmission
func (g *Game) SerializeGameState() interface{} {
	g.mutex.RLock()
	defer g.mutex.RUnlock()
	
	playerStates := make([]*entities.PlayerState, 0)
	for _, player := range g.Players {
		playerStates = append(playerStates, player.GetPlayerState())
	}
	
	return map[string]interface{}{
		"gameId":              g.GameId,
		"currentPlayerOrder":  g.GameState.CurrentPlayerOrder,
		"currentHandNumber":   g.GameState.CurrentHandNumber,
		"totalHands":          g.GameState.TotalHands,
		"dealerIndex":         g.GameState.DealerIndex,
		"gamePhase":           g.GameState.GamePhase,
		"status":              g.GameState.Status,
		"stockPileCount":      g.GameState.StockPileCount,
		"discardPileCount":    g.GameState.DiscardPileCount,
		"playerStates":        playerStates,
	}
}
