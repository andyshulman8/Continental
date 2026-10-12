# Continental Backend Development Guide

## Quick Start

### Build
```bash
cd continental-backend
go build -o continental-server ./cmd/server
```

### Run
```bash
./continental-server -port 8080
# Server starts on http://localhost:8080
```

### Using the start script
```bash
./start.sh
```

## Testing the Backend

### Health Check
```bash
curl http://localhost:8080/health
```

### Create a Game
```bash
curl -X POST http://localhost:8080/api/game/create \
  -H "Content-Type: application/json" \
  -d '{
    "gameMode": "continental2",
    "players": [
      {"id": "player1", "username": "Alice"},
      {"id": "player2", "username": "Bob"}
    ]
  }'
```

Response:
```json
{
  "gameId": "uuid-here",
  "status": "created"
}
```

### Get Game State
```bash
curl http://localhost:8080/api/game/{gameId}
```

### Start a Game
```bash
curl -X POST http://localhost:8080/api/game/{gameId}/start
```

### Join a Game
```bash
curl -X POST http://localhost:8080/api/game/{gameId}/join \
  -H "Content-Type: application/json" \
  -d '{"playerId": "player1"}'
```

### Connect to WebSocket
```bash
wscat -c "ws://localhost:8080/ws/game/{gameId}?playerId=player1"
```

Then send actions:
```json
{
  "type": "action",
  "actionType": "draw",
  "actionData": {
    "fromStock": true
  }
}
```

## Project Structure

```
continental-backend/
├── cmd/
│   └── server/
│       └── main.go              # Entry point
├── entities/
│   └── entities.go              # Data structures
├── game/
│   ├── game.go                  # Game controller
│   └── actions.go               # Action handlers
├── server/
│   ├── server.go                # HTTP server setup
│   ├── game_handler.go          # HTTP & WebSocket handlers
│   └── hub.go                   # Connection hub
├── go.mod                       # Dependencies
├── go.sum                       # Dependency checksums
├── continental-server           # Built binary
└── README.md                    # Full documentation
```

## API Endpoints Reference

### Game Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/game/create` | Create new game |
| GET | `/api/game/{gameId}` | Get game state |
| POST | `/api/game/{gameId}/join` | Join game |
| POST | `/api/game/{gameId}/start` | Start game |

### Lobby
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/lobby/games` | List active games |
| GET | `/api/lobby/games/{gameId}/players` | List game players |

### WebSocket
| Endpoint | Description |
|----------|-------------|
| `WS /ws/game/{gameId}?playerId={playerId}` | Real-time game updates |

## WebSocket Message Formats

### Client → Server

**Draw Action:**
```json
{
  "type": "action",
  "actionType": "draw",
  "actionData": {
    "fromStock": true
  }
}
```

**Play Melds:**
```json
{
  "type": "action",
  "actionType": "playMelds",
  "actionData": {
    "cardIndices": [0, 1, 2]
  }
}
```

**Discard:**
```json
{
  "type": "action",
  "actionType": "discard",
  "actionData": {
    "cardIndex": 5
  }
}
```

**End Turn:**
```json
{
  "type": "action",
  "actionType": "endTurn",
  "actionData": {}
}
```

**Ping:**
```json
{
  "type": "ping"
}
```

### Server → Client

**Game Started:**
```json
{
  "type": "gameStarted",
  "state": { /* game state */ }
}
```

**State Update:**
```json
{
  "type": "stateUpdate",
  "state": { /* game state */ }
}
```

**Error:**
```json
{
  "type": "error",
  "error": "error message"
}
```

**Pong:**
```json
{
  "type": "pong"
}
```

## Game State Structure

```json
{
  "gameId": "uuid",
  "currentPlayerOrder": 0,
  "currentHandNumber": 1,
  "totalHands": 8,
  "dealerIndex": 0,
  "gamePhase": "playing",
  "status": "in_progress",
  "stockPileCount": 87,
  "discardPileCount": 1,
  "playerStates": [
    {
      "id": "player1",
      "username": "Alice",
      "order": 0,
      "handCount": 11,
      "meldCount": 0,
      "score": 0,
      "totalScore": 0,
      "hasGoneDown": false,
      "hardModeEnabled": false
    }
  ]
}
```

## Development Tips

### Running with debug logging
```bash
# Currently logs to stdout with [Module] prefix
./continental-server -port 8080
```

### Testing a full game flow

1. **Create game**
   ```bash
   GAME_ID=$(curl -s -X POST http://localhost:8080/api/game/create \
     -H "Content-Type: application/json" \
     -d '{
       "gameMode": "continental2",
       "players": [
         {"id": "p1", "username": "Alice"},
         {"id": "p2", "username": "Bob"}
       ]
     }' | jq -r '.gameId')
   ```

2. **Start game**
   ```bash
   curl -X POST http://localhost:8080/api/game/$GAME_ID/start
   ```

3. **Connect WebSocket and send actions**
   ```bash
   # Terminal 1 - Player 1
   wscat -c "ws://localhost:8080/ws/game/$GAME_ID?playerId=p1"
   
   # Terminal 2 - Player 2
   wscat -c "ws://localhost:8080/ws/game/$GAME_ID?playerId=p2"
   ```

4. **Send actions from either terminal**
   ```json
   {"type":"action","actionType":"draw","actionData":{"fromStock":true}}
   ```

## Future Enhancements

- [ ] Database persistence (MongoDB)
- [ ] Game replay functionality
- [ ] AI opponents
- [ ] Tournament support
- [ ] Game analytics
- [ ] Spectator mode
- [ ] Chat messaging

## Debugging

### Check if server is running
```bash
curl http://localhost:8080/health
```

### View active games
```bash
curl http://localhost:8080/api/lobby/games | jq
```

### Monitor WebSocket messages
Use tools like:
- `wscat` - Command line WebSocket client
- `websocat` - Rusty alternative to wscat
- Browser DevTools Network tab

### Common Issues

**Port already in use:**
```bash
lsof -i :8080
kill -9 <PID>
# Or use different port:
./continental-server -port 8081
```

**Module not found errors:**
```bash
go mod tidy
go mod download
```

**Build fails:**
```bash
go clean
go mod tidy
go build -o continental-server ./cmd/server
```
