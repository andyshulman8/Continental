# Continental - Web Version

A browser-based implementation of the Continental card game with the same family rules as the iOS version.

## How to Run

### Quick Start
```bash
cd web
python3 -m http.server 8000
```

Then open your browser to `http://localhost:8000`

### Requirements
- Python 3 (for the local web server)
- Modern web browser (Chrome, Firefox, Safari, Edge)
- No additional dependencies needed (Phaser 3 is loaded from CDN)

## Game Features

- **Dealer Selection**: Players select cards to determine the initial dealer
- **8 or 9 Hand Progression**: Based on player count (2-4 players)
- **Family Rules**:
  - 11 card deals per hand
  - Players can add to any melds once they've gone down
  - Hard mode toggle for increased difficulty
  - Dealer chip rotation
  - Special scoring for black aces (15 pts) vs red aces (10 pts)

- **Complete Game Flow**:
  - Draw from stock or discard pile
  - Play melds matching the hand requirement
  - Discard to complete your turn
  - Track scores across all hands
  - Winner determination after all hands

## Architecture

### Shared Game Logic (`src/gameLogic.js`)
Contains the core game rules and logic that could be shared with the iOS version:
- Card and Deck classes
- Player and GameState management
- Meld validation (Sets and Runs)
- Hand requirements and progression
- Scoring calculations

### Game Scene (`src/gameScene.js`)
Phaser 3 scene handling all game display and user interaction:
- Card rendering and selection
- UI elements and buttons
- Game state updates
- Player hand display

### Main Entry (`src/main.js`)
Initializes the Phaser game configuration and manages game lifecycle.

## Sharing Code Between iOS and Web

The `gameLogic.js` file contains logic that mirrors the Swift `GameLogic.swift` in the iOS version. When changes are made to game rules:

1. Update the shared logic in `src/gameLogic.js` (or `src/gameLogic.ts` if using TypeScript)
2. Manually update the corresponding Swift code in `CardGameV2/GameLogic.swift`

Both files follow the same structure for:
- Card, Deck, Player classes
- Meld validation rules
- Hand progression and descriptions
- Scoring calculations
- Game state management

## Development

### Making Changes
1. Edit game logic in `src/gameLogic.js`
2. Edit UI/rendering in `src/gameScene.js`
3. Refresh the browser to see changes (server auto-serves updated files)

### Testing
- Test with 2 players first (simpler game flow)
- Test with 3 players to verify 9-hand progression
- Test with 4 players for additional player interactions

### Files Modified vs iOS
All changes to game rules should be reflected in both:
- Web: `web/src/gameLogic.js`
- iOS: `CardGameV2/GameLogic.swift`

## Future Enhancements

- [ ] Multi-player network support
- [ ] Implement hand requirement validation for initial melds
- [ ] Add undo functionality
- [ ] Persist game state between sessions
- [ ] Add animated card movements
- [ ] Sound effects and visual feedback
- [ ] Tournament mode with multiple rounds
