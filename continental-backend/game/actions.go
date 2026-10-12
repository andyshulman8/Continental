package game

import (
	"continental/entities"
	"encoding/json"
	"fmt"
)

// HandlePlayerAction processes a player action
func (g *Game) HandlePlayerAction(playerId string, actionType string, actionData json.RawMessage) error {
	g.mutex.RLock()
	currentPlayer := g.GetCurrentPlayer()
	isCurrentPlayer := currentPlayer != nil && currentPlayer.Id == playerId
	g.mutex.RUnlock()
	
	if !isCurrentPlayer {
		return fmt.Errorf("not your turn")
	}
	
	switch actionType {
	case "draw":
		var drawAction entities.PlayerActionDraw
		if err := json.Unmarshal(actionData, &drawAction); err != nil {
			return err
		}
		return g.HandleDraw(playerId, drawAction)
		
	case "playMelds":
		var meldAction entities.PlayerActionMeld
		if err := json.Unmarshal(actionData, &meldAction); err != nil {
			return err
		}
		return g.HandlePlayMelds(playerId, meldAction)
		
	case "discard":
		var discardAction entities.PlayerActionDiscard
		if err := json.Unmarshal(actionData, &discardAction); err != nil {
			return err
		}
		return g.HandleDiscard(playerId, discardAction)
		
	case "toggleHardMode":
		var hardModeAction entities.PlayerActionToggleHardMode
		if err := json.Unmarshal(actionData, &hardModeAction); err != nil {
			return err
		}
		return g.HandleToggleHardMode(playerId, hardModeAction)
		
	case "endTurn":
		return g.HandleEndTurn(playerId)
		
	default:
		return fmt.Errorf("unknown action type: %s", actionType)
	}
}

// HandleDraw handles a draw action
func (g *Game) HandleDraw(playerId string, action entities.PlayerActionDraw) error {
	if action.FromStock {
		return g.DrawFromStock(playerId)
	} else {
		return g.DrawFromDiscard(playerId)
	}
}

// HandlePlayMelds handles playing melds
func (g *Game) HandlePlayMelds(playerId string, action entities.PlayerActionMeld) error {
	return g.PlayMelds(playerId, action.CardIndices)
}

// HandleDiscard handles a discard action
func (g *Game) HandleDiscard(playerId string, action entities.PlayerActionDiscard) error {
	return g.DiscardCard(playerId, action.CardIndex)
}

// HandleToggleHardMode handles hard mode toggle
func (g *Game) HandleToggleHardMode(playerId string, action entities.PlayerActionToggleHardMode) error {
	player := g.GetPlayerById(playerId)
	if player == nil {
		return fmt.Errorf("player not found")
	}
	
	player.HardModeEnabled = action.Enabled
	return nil
}

// HandleEndTurn handles end turn action
func (g *Game) HandleEndTurn(playerId string) error {
	// Check if player has discarded
	player := g.GetPlayerById(playerId)
	if player == nil {
		return fmt.Errorf("player not found")
	}
	
	if player.Hand == nil || len(player.Hand) != 0 {
		return fmt.Errorf("must discard before ending turn")
	}
	
	return g.EndTurn()
}

// ValidateAction checks if an action is valid for the current game state
func (g *Game) ValidateAction(playerId string, actionType string) (bool, string) {
	g.mutex.RLock()
	defer g.mutex.RUnlock()
	
	player := g.GetPlayerById(playerId)
	if player == nil {
		return false, "player not found"
	}
	
	currentPlayer := g.GetCurrentPlayer()
	if currentPlayer == nil || currentPlayer.Id != playerId {
		return false, "not your turn"
	}
	
	if g.GameState.GamePhase != "playing" {
		return false, "game not in playing phase"
	}
	
	// Check which actions are allowed
	// This would typically be more sophisticated
	switch actionType {
	case "draw":
		return true, ""
	case "playMelds":
		return true, ""
	case "discard":
		if len(player.Hand) == 0 {
			return false, "no cards to discard"
		}
		return true, ""
	case "endTurn":
		return true, ""
	default:
		return false, "unknown action"
	}
}

// GetAllowedActions returns the allowed actions for the current player
func (g *Game) GetAllowedActions() *entities.AllowedActionsMap {
	g.mutex.RLock()
	defer g.mutex.RUnlock()
	
	currentPlayer := g.GetCurrentPlayer()
	if currentPlayer == nil {
		return &entities.AllowedActionsMap{
			Draw:         false,
			PlayMelds:    false,
			Discard:      false,
			ToggleHardMode: false,
			EndTurn:      false,
		}
	}
	
	return &entities.AllowedActionsMap{
		Draw:            len(g.GameState.Deck) > 0 || len(g.GameState.DiscardPile) > 0,
		PlayMelds:       true,
		Discard:         len(currentPlayer.Hand) > 0,
		ToggleHardMode:  true,
		EndTurn:         len(currentPlayer.Hand) == 0,
	}
}
