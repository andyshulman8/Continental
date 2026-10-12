package server

import (
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

// Server represents the Continental game server
type Server struct {
	router      *mux.Router
	port        string
	upgrader    websocket.Upgrader
	hubManager  *HubManager
	gameHandler *GameHandler
}

// NewServer creates a new server instance
func NewServer(port string) *Server {
	hubManager := NewHubManager()
	gameHandler := NewGameHandler(hubManager)
	
	server := &Server{
		router:     mux.NewRouter(),
		port:       port,
		hubManager: hubManager,
		gameHandler: gameHandler,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins for now
			},
		},
	}
	
	server.setupRoutes()
	return server
}

// setupRoutes configures all HTTP routes
func (s *Server) setupRoutes() {
	// Health check
	s.router.HandleFunc("/health", s.healthHandler).Methods("GET")
	
	// Game endpoints
	s.router.HandleFunc("/api/game/create", s.gameHandler.CreateGameHandler).Methods("POST")
	s.router.HandleFunc("/api/game/{gameId}", s.gameHandler.GetGameStateHandler).Methods("GET")
	s.router.HandleFunc("/api/game/{gameId}/join", s.gameHandler.JoinGameHandler).Methods("POST")
	s.router.HandleFunc("/api/game/{gameId}/start", s.gameHandler.StartGameHandler).Methods("POST")
	
	// WebSocket endpoints
	s.router.HandleFunc("/ws/game/{gameId}", s.gameHandler.WebSocketHandler)
	
	// Lobby endpoints
	s.router.HandleFunc("/api/lobby/games", s.gameHandler.ListGamesHandler).Methods("GET")
	s.router.HandleFunc("/api/lobby/games/{gameId}/players", s.gameHandler.GetGamePlayersHandler).Methods("GET")
}

// healthHandler handles health check requests
func (s *Server) healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

// Start starts the server
func (s *Server) Start() error {
	log.Printf("Starting Continental server on port %s", s.port)
	return http.ListenAndServe(":"+s.port, s.router)
}

// GetRouter returns the mux router for testing or middleware
func (s *Server) GetRouter() *mux.Router {
	return s.router
}

// GetHubManager returns the hub manager
func (s *Server) GetHubManager() *HubManager {
	return s.hubManager
}

// GetGameHandler returns the game handler
func (s *Server) GetGameHandler() *GameHandler {
	return s.gameHandler
}
