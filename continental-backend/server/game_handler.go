package server

import (
	"continental/entities"
	"continental/game"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

// GameHandler handles all game-related HTTP and WebSocket requests
type GameHandler struct {
	hubManager  *HubManager
	games       map[string]*game.Game
	gameMutex   sync.RWMutex
	upgrader    websocket.Upgrader
}

// NewGameHandler creates a new game handler
func NewGameHandler(hubManager *HubManager) *GameHandler {
	return &GameHandler{
		hubManager: hubManager,
		games:      make(map[string]*game.Game),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

// CreateGameHandler handles game creation
func (gh *GameHandler) CreateGameHandler(w http.ResponseWriter, r *http.Request) {
	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	var req struct {
		GameMode string `json:"gameMode"`
		Players  []struct {
			Id       string `json:"id"`
			Username string `json:"username"`
		} `json:"players"`
	}

	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Create game
	gameId := uuid.New().String()
	
	// Create player entities
	var players []*entities.Player
	for i, p := range req.Players {
		player := entities.NewPlayer(p.Id, p.Username, uint16(i))
		players = append(players, player)
	}

	// Determine game mode based on player count
	playerCount := len(players)
	var gameMode entities.GameMode
	
	modes := entities.GetGameModes()
	found := false
	
	for _, mode := range modes {
		if mode.MinPlayers == playerCount && mode.MaxPlayers == playerCount {
			gameMode = mode
			found = true
			break
		}
	}
	
	if !found {
		http.Error(w, "Invalid player count. Supported: 2, 3, or 4 players", http.StatusBadRequest)
		return
	}

	g := game.NewGame(gameId, players, gameMode)

	gh.gameMutex.Lock()
	gh.games[gameId] = g
	gh.gameMutex.Unlock()

	gh.hubManager.GetOrCreateHub(gameId).Game = g

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"gameId": gameId,
		"status": "created",
	})
}

// GetGameStateHandler returns the current game state
func (gh *GameHandler) GetGameStateHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	gameId := vars["gameId"]

	gh.gameMutex.RLock()
	g, exists := gh.games[gameId]
	gh.gameMutex.RUnlock()

	if !exists {
		http.Error(w, "Game not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(g.SerializeGameState())
}

// JoinGameHandler handles a player joining a game
func (gh *GameHandler) JoinGameHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	gameId := vars["gameId"]

	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	var req struct {
		PlayerId string `json:"playerId"`
	}

	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	gh.gameMutex.RLock()
	g, exists := gh.games[gameId]
	gh.gameMutex.RUnlock()

	if !exists {
		http.Error(w, "Game not found", http.StatusNotFound)
		return
	}

	player := g.GetPlayerById(req.PlayerId)
	if player == nil {
		http.Error(w, "Player not found in game", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"gameId":   gameId,
		"playerId": req.PlayerId,
		"status":   "joined",
	})
}

// StartGameHandler starts a game
func (gh *GameHandler) StartGameHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	gameId := vars["gameId"]

	gh.gameMutex.RLock()
	g, exists := gh.games[gameId]
	gh.gameMutex.RUnlock()

	if !exists {
		http.Error(w, "Game not found", http.StatusNotFound)
		return
	}

	if err := g.InitializeGame(); err != nil {
		http.Error(w, fmt.Sprintf("Failed to initialize game: %v", err), http.StatusInternalServerError)
		return
	}

	if err := g.DealCards(); err != nil {
		http.Error(w, fmt.Sprintf("Failed to deal cards: %v", err), http.StatusInternalServerError)
		return
	}

	hub := gh.hubManager.GetHub(gameId)
	if hub != nil {
		hub.Broadcast(map[string]interface{}{
			"type":  "gameStarted",
			"state": g.SerializeGameState(),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "started",
	})
}

// WebSocketHandler handles WebSocket connections
func (gh *GameHandler) WebSocketHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	gameId := vars["gameId"]

	playerId := r.URL.Query().Get("playerId")
	if playerId == "" {
		http.Error(w, "playerId query parameter required", http.StatusBadRequest)
		return
	}

	gh.gameMutex.RLock()
	g, exists := gh.games[gameId]
	gh.gameMutex.RUnlock()

	if !exists {
		http.Error(w, "Game not found", http.StatusNotFound)
		return
	}

	hub := gh.hubManager.GetOrCreateHub(gameId)

	conn, err := gh.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &Client{
		Hub:      hub,
		conn:     conn,
		send:     make(chan interface{}, 256),
		PlayerId: playerId,
	}

	hub.register <- client

	// Start client reader and writer
	go gh.clientReader(client, g)
	go gh.clientWriter(client)
}

// clientReader reads messages from WebSocket client
func (gh *GameHandler) clientReader(client *Client, g *game.Game) {
	conn := client.conn.(*websocket.Conn)
	defer func() {
		client.Hub.unregister <- client
		conn.Close()
	}()

	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		var message map[string]interface{}
		err := conn.ReadJSON(&message)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Handle different message types
		if msgType, ok := message["type"].(string); ok {
			switch msgType {
			case "action":
				gh.handlePlayerAction(client, g, message)
			case "ping":
				client.send <- map[string]interface{}{"type": "pong"}
			}
		}
	}
}

// clientWriter writes messages to WebSocket client
func (gh *GameHandler) clientWriter(client *Client) {
	conn := client.conn.(*websocket.Conn)
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.send:
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			json.NewEncoder(w).Encode(message)
			w.Close()

		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handlePlayerAction processes player actions
func (gh *GameHandler) handlePlayerAction(client *Client, g *game.Game, message map[string]interface{}) {
	actionType, ok := message["actionType"].(string)
	if !ok {
		client.send <- map[string]interface{}{
			"type":  "error",
			"error": "missing actionType",
		}
		return
	}

	actionData, _ := json.Marshal(message["actionData"])

	if err := g.HandlePlayerAction(client.PlayerId, actionType, actionData); err != nil {
		client.send <- map[string]interface{}{
			"type":  "error",
			"error": err.Error(),
		}
		return
	}

	// Broadcast updated game state
	hub := gh.hubManager.GetHub(g.GameId)
	if hub != nil {
		hub.Broadcast(map[string]interface{}{
			"type":  "stateUpdate",
			"state": g.SerializeGameState(),
		})
	}
}

// ListGamesHandler returns list of active games
func (gh *GameHandler) ListGamesHandler(w http.ResponseWriter, r *http.Request) {
	gh.gameMutex.RLock()
	defer gh.gameMutex.RUnlock()

	games := make([]map[string]interface{}, 0)
	for gameId, g := range gh.games {
		games = append(games, map[string]interface{}{
			"gameId": gameId,
			"state":  g.SerializeGameState(),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(games)
}

// GetGamePlayersHandler returns players in a game
func (gh *GameHandler) GetGamePlayersHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	gameId := vars["gameId"]

	gh.gameMutex.RLock()
	g, exists := gh.games[gameId]
	gh.gameMutex.RUnlock()

	if !exists {
		http.Error(w, "Game not found", http.StatusNotFound)
		return
	}

	players := make([]*entities.PlayerState, 0)
	for _, p := range g.Players {
		players = append(players, p.GetPlayerState())
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(players)
}
