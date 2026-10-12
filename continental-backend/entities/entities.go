package entities

// Card represents a single playing card
type Card struct {
	Suit   string `msgpack:"s"`
	Rank   int    `msgpack:"r"`
	IsJoker bool  `msgpack:"j"`
}

// Meld represents a group of cards laid down by a player
type Meld struct {
	Cards []*Card `msgpack:"c"`
	Type  string  `msgpack:"t"` // "set" or "run"
}

// Player represents a player in the Continental game
type Player struct {
	Id               string         `msgpack:"-"`
	Username         string         `msgpack:"u"`
	Order            uint16         `msgpack:"o"`
	Color            string         `msgpack:"c"`
	Initialized      bool           `msgpack:"-"`
	
	// Hand management
	Hand             []*Card        `msgpack:"-"` // Hidden from opponents
	Melds            []*Meld        `msgpack:"m"` // Publicly visible melds
	HasGoneDown      bool           `msgpack:"hgd"` // Whether player has laid down initial melds
	
	// Scoring
	Score            int            `msgpack:"sc"`
	TotalScore       int            `msgpack:"ts"`
	
	// Game state
	HardModeEnabled  bool           `msgpack:"hm"`
	TimeLeft         int            `msgpack:"tl"`
	IsBot            int32          `msgpack:"-"`
	InactiveSeconds  int32          `msgpack:"-"`
	IsSpectator      bool           `msgpack:"-"`
	
	// Communication
	PendingAction    *PlayerAction  `msgpack:"-"`
	MessageChannel   chan []byte    `msgpack:"-"`
	Expect           chan interface{} `msgpack:"-"`
}

// PlayerState is the public state of a player (what others see)
type PlayerState struct {
	Id               string   `msgpack:"id"`
	Username         string   `msgpack:"u"`
	Order            uint16   `msgpack:"o"`
	Color            string   `msgpack:"c"`
	Current          bool     `msgpack:"t"`
	HasPendingAction bool     `msgpack:"a"`
	Score            int      `msgpack:"sc"`
	TotalScore       int      `msgpack:"ts"`
	HandSize         int      `msgpack:"hs"`
	HasGoneDown      bool     `msgpack:"hgd"`
	MeldCount        int      `msgpack:"mc"`
	TimeLeft         int      `msgpack:"tl"`
	HardModeEnabled  bool     `msgpack:"hm"`
	IsBot            bool     `msgpack:"b,omitempty"`
}

// GameState represents the complete state of a Continental game
type GameState struct {
	CurrentPlayerOrder uint16        `msgpack:"c"`
	CurrentHandNumber  int           `msgpack:"h"` // 1-8 (or 1-9 for 3 players)
	TotalHands         int           `msgpack:"th"`
	DealerIndex        uint16        `msgpack:"d"`
	
	Deck               []*Card       `msgpack:"-"` // Hidden
	DiscardPile        []*Card       `msgpack:"dp"`
	
	PlayerStates       []*PlayerState `msgpack:"ps"`
	
	GamePhase          string        `msgpack:"gp"` // "dealer_selection", "dealing", "playing", "hand_over", "game_over"
	Status             string        `msgpack:"st"`
	
	// Table state
	StockPileCount     int           `msgpack:"sp"`
	DiscardPileCount   int           `msgpack:"dc"`
}

// LobbyPlayerState is player state in the lobby
type LobbyPlayerState struct {
	Username     string `msgpack:"u"`
	Color        string `msgpack:"c"`
	Order        uint16 `msgpack:"o"`
	Ready        bool   `msgpack:"r"`
	GamesStarted int32  `msgpack:"s"`
	GamesFinished int32 `msgpack:"f"`
}

// PlayerAction represents an action a player wants to take
type PlayerAction struct {
	Type string      `msgpack:"t"`
	Data interface{} `msgpack:"d"`
}

// Actions
type PlayerActionDraw struct {
	FromStock bool `msgpack:"fs"`
}

type PlayerActionMeld struct {
	CardIndices []int `msgpack:"ci"`
}

type PlayerActionDiscard struct {
	CardIndex int `msgpack:"ci"`
}

type PlayerActionToggleHardMode struct {
	Enabled bool `msgpack:"e"`
}

// AllowedActionsMap defines what actions a player can take
type AllowedActionsMap struct {
	Draw           bool `msgpack:"dr,omitempty"`
	PlayMelds      bool `msgpack:"pm,omitempty"`
	Discard        bool `msgpack:"dc,omitempty"`
	ToggleHardMode bool `msgpack:"hm,omitempty"`
	EndTurn        bool `msgpack:"et,omitempty"`
}

// GameMode defines game configuration
type GameMode struct {
	Id          string
	Name        string
	Description string
	MinPlayers  int
	MaxPlayers  int
	MinGames    int
}

// Get predefined game modes
func GetGameModes() []GameMode {
	return []GameMode{
		{
			Id:          "continental2",
			Name:        "Continental (2 Players)",
			Description: "2-player game, 8 hands",
			MinPlayers:  2,
			MaxPlayers:  2,
			MinGames:    1,
		},
		{
			Id:          "continental3",
			Name:        "Continental (3 Players)",
			Description: "3-player game, 9 hands",
			MinPlayers:  3,
			MaxPlayers:  3,
			MinGames:    1,
		},
		{
			Id:          "continental4",
			Name:        "Continental (4 Players)",
			Description: "4-player game, 8 hands",
			MinPlayers:  4,
			MaxPlayers:  4,
			MinGames:    1,
		},
	}
}

// Player helper methods

func NewPlayer(id, username string, order uint16) *Player {
	return &Player{
		Id:            id,
		Username:      username,
		Order:         order,
		Initialized:   true,
		Hand:          make([]*Card, 0),
		Melds:         make([]*Meld, 0),
		HasGoneDown:   false,
		Score:         0,
		TotalScore:    0,
		HardModeEnabled: false,
		MessageChannel: make(chan []byte, 1024),
		Expect:        make(chan interface{}, 4),
	}
}

func (p *Player) GetPlayerState() *PlayerState {
	return &PlayerState{
		Id:               p.Id,
		Username:         p.Username,
		Order:            p.Order,
		Color:            p.Color,
		Score:            p.Score,
		TotalScore:       p.TotalScore,
		HandSize:         len(p.Hand),
		HasGoneDown:      p.HasGoneDown,
		MeldCount:        len(p.Melds),
		TimeLeft:         p.TimeLeft,
		HardModeEnabled:  p.HardModeEnabled,
	}
}

func (p *Player) AddCard(card *Card) {
	p.Hand = append(p.Hand, card)
}

func (p *Player) RemoveCard(index int) *Card {
	if index < 0 || index >= len(p.Hand) {
		return nil
	}
	card := p.Hand[index]
	p.Hand = append(p.Hand[:index], p.Hand[index+1:]...)
	return card
}

func (p *Player) AddMeld(meld *Meld) {
	p.Melds = append(p.Melds, meld)
}

func (p *Player) CalculateScore() int {
	total := 0
	for _, card := range p.Hand {
		if card.IsJoker {
			total += 10
		} else {
			switch card.Rank {
			case 1: // Ace
				// Black aces are 15, red aces are 10
				if card.Suit == "clubs" || card.Suit == "spades" {
					total += 15
				} else {
					total += 10
				}
			case 2, 3, 4, 5, 6, 7, 8, 9:
				total += card.Rank
			default: // 10-13 (10, J, Q, K)
				total += 10
			}
		}
	}
	return total
}

func (p *Player) ResetHand() {
	p.Hand = make([]*Card, 0)
	p.Melds = make([]*Meld, 0)
	p.HasGoneDown = false
	p.Score = 0
}

func (p *Player) SendAction(action *PlayerAction) {
	p.PendingAction = action
}

// GameState helper methods

func NewGameState(playerCount int) *GameState {
	gs := &GameState{
		CurrentPlayerOrder: 0,
		CurrentHandNumber:  1,
		TotalHands:         8, // Default to 8 hands
		DealerIndex:        0,
		PlayerStates:       make([]*PlayerState, playerCount),
		Deck:               make([]*Card, 0),
		DiscardPile:        make([]*Card, 0),
		GamePhase:          "dealer_selection",
		Status:             "waiting",
	}
	
	if playerCount == 3 {
		gs.TotalHands = 9
	}
	
	return gs
}

func (gs *GameState) AddPlayerState(ps *PlayerState) {
	if ps.Order < uint16(len(gs.PlayerStates)) {
		gs.PlayerStates[ps.Order] = ps
	}
}

func (gs *GameState) NextPlayer() {
	gs.CurrentPlayerOrder = (gs.CurrentPlayerOrder + 1) % uint16(len(gs.PlayerStates))
}

func (gs *GameState) AdvanceDealerChip() {
	gs.DealerIndex = (gs.DealerIndex + 1) % uint16(len(gs.PlayerStates))
}

func (gs *GameState) AdvanceHand() {
	if gs.CurrentHandNumber < gs.TotalHands {
		gs.CurrentHandNumber += 1
		gs.AdvanceDealerChip()
	}
}

func (gs *GameState) IsGameOver() bool {
	return gs.CurrentHandNumber > gs.TotalHands
}

func (gs *GameState) UpdateTableState() {
	gs.StockPileCount = len(gs.Deck)
	gs.DiscardPileCount = len(gs.DiscardPile)
}
