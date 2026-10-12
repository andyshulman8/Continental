# Continental Game - Error Handling & Recovery

## Overview
Comprehensive error handling and graceful rerouting has been implemented throughout the web version of Continental to handle black screen issues and other error states.

## Key Error Handlers Added

### 1. **GameScene.init() - Scene Initialization**
   - Validates `data` parameter exists and is not null
   - Validates `gameState` has players
   - Safely initializes multiplayer session listeners with try-catch
   - Falls back to default GameState(2) on error
   - Logs all errors to console

**Error States Handled:**
- Missing/null data parameter
- Null or empty gameState
- Invalid players array
- Session listener errors

### 2. **GameScene.create() - Scene Creation**
   - Validates gameState and players before proceeding
   - Validates myPlayerIndex is within bounds
   - Gracefully calls `returnToLobbyWithError()` if validation fails
   - Returns early to prevent further execution

**Error States Handled:**
- Missing gameState
- No players in gameState
- Invalid player index (out of bounds)

### 3. **GameScene.returnToLobbyWithError() - Error Display & Recovery**
   - Displays error overlay with red error icon
   - Shows error message to user
   - Auto-redirects to lobby after 3 seconds
   - Preserves game instance cleanup

**Features:**
- Semi-transparent black overlay
- Clear error messaging
- User-friendly countdown ("Returning to lobby...")
- Automatic page reload to clean state

### 4. **GameScene.updateDisplay() - Display Sync**
   - Validates gameState structure before rendering
   - Safe session data retrieval with try-catch
   - Index bounds checking (currentPlayerIndex, dealerChipIndex)
   - Null/undefined card validation when reconstructing from session data
   - Validates all UI elements exist before calling setText()
   - Falls back to gameState if session data is invalid
   - Final validation of players array before rendering

**Error States Handled:**
- Invalid gameState
- Missing/corrupted session data
- Out-of-bounds player indices
- Null/undefined cards in melds or hand
- Missing/null players
- Invalid card properties (suit, rank)
- UI elements not yet created

### 5. **GameScene.drawPokerSeatsAndMelds() - Meld Rendering**
   - Validates players array exists
   - Player index bounds checking
   - Null player validation
   - Null meld validation before iteration
   - Null card validation in melds
   - Try-catch wrapper for entire method

**Error States Handled:**
- Invalid player indices
- Null/missing players
- Invalid meld structure
- Null cards in melds

### 6. **GameScene.displayHand() - Hand Display**
   - Validates players array and myPlayerIndex
   - Null player validation
   - Hand array type checking
   - Null card skipping with continue
   - Card property fallbacks (`card.rankName || '?'`)
   - Try-catch wrapper for entire method

**Error States Handled:**
- Invalid player index
- Null player
- Invalid hand structure
- Null cards
- Missing card properties

### 7. **GameScene.setupUI() - UI Element Creation**
   - Try-catch wrapper around all UI setup
   - Calls `returnToLobbyWithError()` on failure

**Error States Handled:**
- Graphics creation failures
- Text element creation failures
- Button setup errors

### 8. **main.initGame() - Game Initialization**
   - Validates playerCount (2-4)
   - Validates GameState creation
   - Validates sessionPlayers array
   - Try-catch around Phaser instance creation
   - Try-catch around scene start
   - Proper cleanup (destroy gameInstance) on failure
   - User-friendly error messages via showStatus()

**Error States Handled:**
- Invalid playerCount
- GameState creation failure
- Invalid sessionPlayers
- Phaser instance creation failure
- Scene start failure
- Renderer initialization failure

## Error Flow Diagram

```
User clicks "Start Game"
  ↓
initGame(playerCount, session, sessionPlayers)
  ├─ Validate inputs ──→ [Error] → showStatus() → Return
  ├─ Create GameState ──→ [Error] → showStatus() → Return
  ├─ Create Phaser ──→ [Error] → showStatus() + cleanup → Return
  └─ Start GameScene ──→ [Error] → showStatus() + cleanup → Return

GameScene.init(data)
  ├─ Validate data ──→ [Error] → Use defaults
  ├─ Validate gameState ──→ [Error] → Use defaults
  └─ Setup listeners ──→ [Error] → Log & continue

GameScene.create()
  ├─ Validate gameState ──→ [Error] → returnToLobbyWithError() → 3s delay → Reload
  ├─ Validate myPlayerIndex ──→ [Warning] → Correct & continue
  ├─ setupUI() ──→ [Error] → returnToLobbyWithError()
  └─ showDealerSelection() or updateDisplay()

GameScene.updateDisplay()
  ├─ Validate gameState ──→ [Error] → returnToLobbyWithError()
  ├─ Get session data ──→ [Error] → [Warning] → Use gameState
  ├─ Validate indices ──→ [Warning] → Correct & continue
  ├─ Reconstruct players ──→ [Error] → [Warning] → Use gameState
  ├─ Validate final state ──→ [Error] → returnToLobbyWithError()
  └─ Update UI elements (with null checks)
```

## Console Logging

All error handlers include descriptive console logs with prefixes for easy debugging:
- `[GameScene.init]`
- `[GameScene.create]`
- `[GameScene.returnToLobbyWithError]`
- `[updateDisplay]`
- `[drawPokerSeatsAndMelds]`
- `[displayHand]`
- `[setupUI]`
- `[initGame]`

Example console output:
```
[initGame] Invalid playerCount: 5
[updateDisplay] Invalid gameState
[GameScene.create] Invalid myPlayerIndex: 2, player count: 2
[drawPokerSeatsAndMelds] Invalid playerIndex: 3
```

## User Experience

### Scenario 1: Corrupted Session Data
1. Player clicks "Start Game"
2. Game initializes but session data is malformed
3. `updateDisplay()` catches error, validates state
4. Falls back to local gameState
5. Game continues normally

### Scenario 2: Invalid Game State
1. Player clicks "Start Game"
2. GameState creation fails or has no players
3. `create()` detects error
4. Calls `returnToLobbyWithError()`
5. Error screen displayed for 3 seconds
6. Page reloads automatically
7. Player returned to clean lobby state

### Scenario 3: Phaser Renderer Failure
1. Player clicks "Start Game"
2. Phaser fails to initialize (browser issue, etc.)
3. `initGame()` catches error
4. Shows user-friendly message: "Failed to initialize game renderer"
5. Cleans up game instance
6. Player can try again or join different game

## Testing Checklist

- [ ] Normal game flow (no errors)
- [ ] Missing player names in session
- [ ] Corrupted meld data in session
- [ ] Invalid playerCount (0, 1, 5, -1)
- [ ] Game start with 2 players
- [ ] Game start with 3 players
- [ ] Game start with 4 players
- [ ] Reload during game
- [ ] Multiple tabs/players joining
- [ ] Session storage corruption
- [ ] Manual gameState console manipulation
- [ ] Browser devtools throttling (slow renderer init)

## Future Improvements

1. **Persistent Error Logging**: Send errors to server for monitoring
2. **Recovery State**: Save game state before errors for recovery
3. **User Feedback**: More detailed error messages for users
4. **Validation Schema**: JSON schema validation for gameState
5. **Timeout Handling**: Detect hung Phaser initialization and timeout
6. **Offline Mode**: Detect connection loss and handle gracefully
