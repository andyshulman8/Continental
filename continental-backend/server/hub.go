package server

import (
	"continental/game"
	"sync"
)

// Hub represents a central connection hub for a game
type Hub struct {
	GameId      string
	clients     map[*Client]bool
	broadcast   chan interface{}
	register    chan *Client
	unregister  chan *Client
	mutex       sync.RWMutex
	Game        *game.Game
}

// Client represents a connected client
type Client struct {
	Hub      *Hub
	conn     interface{} // *websocket.Conn
	send     chan interface{}
	PlayerId string
	UserId   string
}

// NewHub creates a new hub for a game
func NewHub(gameId string) *Hub {
	return &Hub{
		GameId:     gameId,
		clients:    make(map[*Client]bool),
		broadcast:  make(chan interface{}, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run starts the hub's event loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mutex.Lock()
			h.clients[client] = true
			h.mutex.Unlock()
			
		case client := <-h.unregister:
			h.mutex.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mutex.Unlock()
			
		case message := <-h.broadcast:
			h.mutex.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					// Client's send channel is full, skip
				}
			}
			h.mutex.RUnlock()
		}
	}
}

// Broadcast sends a message to all connected clients
func (h *Hub) Broadcast(message interface{}) {
	h.broadcast <- message
}

// BroadcastToPlayer sends a message to a specific player
func (h *Hub) BroadcastToPlayer(playerId string, message interface{}) {
	h.mutex.RLock()
	defer h.mutex.RUnlock()
	
	for client := range h.clients {
		if client.PlayerId == playerId {
			select {
			case client.send <- message:
			default:
			}
		}
	}
}

// GetConnectedPlayers returns list of connected player IDs
func (h *Hub) GetConnectedPlayers() []string {
	h.mutex.RLock()
	defer h.mutex.RUnlock()
	
	players := make([]string, 0)
	for client := range h.clients {
		if client.PlayerId != "" {
			players = append(players, client.PlayerId)
		}
	}
	return players
}

// HubManager manages all game hubs
type HubManager struct {
	hubs  map[string]*Hub
	mutex sync.RWMutex
}

// NewHubManager creates a new hub manager
func NewHubManager() *HubManager {
	return &HubManager{
		hubs: make(map[string]*Hub),
	}
}

// GetOrCreateHub gets an existing hub or creates a new one
func (hm *HubManager) GetOrCreateHub(gameId string) *Hub {
	hm.mutex.Lock()
	defer hm.mutex.Unlock()
	
	if hub, exists := hm.hubs[gameId]; exists {
		return hub
	}
	
	hub := NewHub(gameId)
	hm.hubs[gameId] = hub
	go hub.Run()
	
	return hub
}

// GetHub gets an existing hub
func (hm *HubManager) GetHub(gameId string) *Hub {
	hm.mutex.RLock()
	defer hm.mutex.RUnlock()
	
	return hm.hubs[gameId]
}

// DeleteHub removes a hub
func (hm *HubManager) DeleteHub(gameId string) {
	hm.mutex.Lock()
	defer hm.mutex.Unlock()
	
	delete(hm.hubs, gameId)
}

// GetAllHubs returns all hubs
func (hm *HubManager) GetAllHubs() []*Hub {
	hm.mutex.RLock()
	defer hm.mutex.RUnlock()
	
	hubs := make([]*Hub, 0)
	for _, hub := range hm.hubs {
		hubs = append(hubs, hub)
	}
	return hubs
}
