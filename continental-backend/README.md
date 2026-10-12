# Continental Game Backend

A production-ready Go backend server for the Continental card game with WebSocket support for real-time multiplayer gameplay.

## Architecture

The backend follows a clean, modular architecture inspired by the Imperial game server:

### Core Packages

- **entities/**: Game data structures and models
  - Card, Meld, Player, GameState structures
  - Player action types
  - Game mode definitions
  - Scoring and validation logic

- **game/**: Game logic and state management
  - Game controller (Game struct)
  - Game phase management
  - Action handlers (Draw, PlayMelds, Discard, EndTurn)
  - State validation

- **server/**: HTTP and WebSocket server
  - Game handler for REST API endpoints
  - WebSocket connection management
  - Hub-based message broadcasting
  - Real-time game state synchronization

## Game Features

### Game Modes
- **2-Player**: 8 hands
- **3-Player**: 9 hands  
- **4-Player**: 8 hands

### Game Phases
1. **dealer_selection**: Selecting the dealer
2. **dealing**: Dealing cards to players
3. **playing**: Active gameplay
4. **hand_over**: Calculating scores for completed hand
5. **game_over**: Game finished, showing final scores

### Scoring
- Black Aces (♠ ♣): 15 points
- Red Aces (♥ ♦): 10 points
- Face cards (J, Q, K): 10 points
- Number cards (2-9): Face value
- 10s: 10 points
- Jokers: 10 points

### Player Actions
- **Draw**: Draw from stock pile or discard pile
- **PlayMelds**: Play valid sets/runs of cards
- **Discard**: Discard one card from hand
- **ToggleHardMode**: Enable/disable hard mode
- **EndTurn**: Complete turn

## API Endpoints

### Game Management
- `POST /api/game/create` - Create new game
- `GET /api/game/{gameId}` - Get game state
- `POST /api/game/{gameId}/join` - Join existing game
- `POST /api/game/{gameId}/start` - Start game

### WebSocket
- `WS /ws/game/{gameId}?playerId={playerId}` - Connect to game updates

### Lobby
- `GET /api/lobby/games` - List active games
- `GET /api/lobby/games/{gameId}/players` - Get game players

## Building and Running

### Prerequisites
- Go 1.17+
- Make (optional)

### Build
```bash
go build -o continental-server ./cmd/server
```

### Run
```bash
./continental-server -port 8080
```

### With environment variables
```bash
PORT=8080 ./continental-server
```

## WebSocket Message Format

### Client → Server

**Player Action:**
```json
{
  "type": "action",
  "actionType": "draw",
  "actionData": {
    "fromStock": true
  }
}
```

### Server → Client

**State Update:**
```json
{
  "type": "stateUpdate",
  "state": {
    "gameId": "uuid",
    "currentPlayerOrder": 0,
    "currentHandNumber": 1,
    "gamePhase": "playing",
    "playerStates": [...]
  }
}
```

**Error:**
```json
{
  "type": "error",
  "error": "error message"
}
```

## Testing

Run tests:
```bash
go test ./...
```

## Development

### Project Structure
```
continental-backend/
├── cmd/
│   └── server/
│       └── main.go           # Server entry point
├── entities/
│   └── entities.go           # Game data structures
├── game/
│   ├── game.go              # Game controller
│   └── actions.go           # Action handlers
├── server/
│   ├── server.go            # Server setup
│   ├── game_handler.go      # HTTP/WebSocket handlers
│   └── hub.go               # Connection hub
├── go.mod
└── README.md
```

### Adding Features
1. Add new action types to `PlayerAction*` structs in entities
2. Implement handler in `game/actions.go`
3. Add HTTP endpoint in `server/game_handler.go`
4. Add WebSocket message handling in `GameHandler.handlePlayerAction`

## Performance Considerations

- **Concurrency**: Uses goroutines and channels for real-time message broadcasting
- **Serialization**: Supports msgpack for binary efficiency
- **Connection Management**: Hub-based architecture allows efficient message routing
- **Scalability**: In-memory game storage (future: database support)

## Future Enhancements

- [ ] MongoDB persistence
- [ ] Database-backed game history
- [ ] Replay functionality
- [ ] Tournament support
- [ ] AI players
- [ ] Mobile app support
- [ ] Game analytics
- [ ] Spectator mode

## License

See LICENSE file in imperial folder
