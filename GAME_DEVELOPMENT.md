# Continental - Game Development Guide

This project contains both iOS and Web versions of Continental with family rules.

## Project Structure

```
Continental/
├── CardGameV2/                 # iOS version (Swift + SpriteKit)
│   ├── Card.swift
│   ├── GameLogic.swift
│   ├── GameScene.swift
│   ├── GameViewController.swift
│   └── ... (other iOS files)
│
├── web/                        # Web version (JavaScript + Phaser 3)
│   ├── index.html
│   ├── package.json
│   ├── start.sh
│   ├── src/
│   │   ├── gameLogic.js       # Shared game rules (mirrors GameLogic.swift)
│   │   ├── gameScene.js       # Phaser game scene
│   │   └── main.js            # Entry point
│   └── README.md
│
└── README.md                   # This file
```

## Running Each Version

### iOS Version
```bash
# Open in Xcode
open CardGameV2.xcodeproj
# Then build and run on simulator or device
```

### Web Version
```bash
# Navigate to web directory
cd web

# Option 1: Using the startup script
./start.sh

# Option 2: Using Python directly
python3 -m http.server 8000

# Then open http://localhost:8000 in your browser
```

## Shared Game Logic

The core game logic is intentionally designed to be platform-independent:

### iOS Implementation
- **File**: `CardGameV2/GameLogic.swift`
- **Classes**: Card, Suit, Rank, Deck, Player, Meld, GameState
- **Language**: Swift

### Web Implementation  
- **File**: `web/src/gameLogic.js`
- **Classes**: Card, Deck, Meld, Player, GameState
- **Language**: JavaScript

### Keeping Them In Sync

When you modify game rules:

1. **Update the shared logic** in BOTH files:
   - `CardGameV2/GameLogic.swift` (iOS)
   - `web/src/gameLogic.js` (Web)

2. **Key areas to keep synchronized**:
   - Card point values and suit-aware scoring
   - Hand progression (8 vs 9 hands based on player count)
   - Hand descriptions and requirements
   - Deck creation (number of decks)
   - Player scoring calculations
   - Dealer chip rotation logic

3. **Areas that differ** (UI only):
   - Visual rendering (SpriteKit vs Phaser)
   - Button handling (touch vs mouse)
   - Screen layouts

## Game Rules Summary

### Setup
- 2-4 players
- Dealer selected by highest card dealt
- 11 cards dealt to each player
- 1 card placed in discard pile

### Hand Progression (8-Hand Games: 2 or 4 Players)
1. Two Sets (6 cards)
2. One Set + One Run (7 cards)
3. Two Runs (8 cards)
4. Two Sets + One Run (9 cards)
5. Two Runs + One Set (10 cards)
6. Three Sets (9 cards)
7. Three Runs (11 cards)
8. Four Runs (13 cards)

### Hand Progression (9-Hand Games: 3 Players)
1. Two Sets (6 cards)
2. One Set + One Run (7 cards)
3. Two Runs (8 cards)
4. Two Sets + One Run (9 cards)
5. Two Runs + One Set (10 cards)
6. Three Sets (9 cards)
7. Two Sets + Two Runs (12 cards)
8. Three Runs (11 cards)
9. Four Runs (13 cards)

### Scoring
- Black Aces (♠♣): 15 points
- Red Aces (♥♦): 10 points (wild)
- Face Cards (J, Q, K): 10 points each
- Number Cards (2-9): Face value
- Jokers: 10 points (wild)
- **Winner**: Lowest cumulative score after all hands

### Special Rules
- **Hard Mode**: Players can toggle per hand to require complete hand melds
- **Adding to Melds**: Once down, players can add cards to any melds
- **Dealer Rotation**: Clockwise after each hand
- **Dealer Bonus**: -100 points if dealer correctly cuts deck at start

## Development Workflow

### Testing Changes
1. Make changes to `web/src/gameLogic.js`
2. Refresh browser at `http://localhost:8000` to see updates
3. Once verified, mirror changes to `CardGameV2/GameLogic.swift`
4. Test iOS version in Xcode simulator

### Adding Features
1. Implement in Web version first (faster iteration)
2. Test thoroughly
3. Port to iOS with SpriteKit equivalents
4. Ensure both versions behave identically

### Debugging
- **Web**: Use browser DevTools (F12 or Cmd+Option+I)
- **iOS**: Use Xcode debugger

## File Synchronization Checklist

When modifying game logic, verify these files are in sync:

- [ ] Card point values (especially aces)
- [ ] Deck generation (number of cards dealt)
- [ ] Hand sequences for 8-hand games
- [ ] Hand sequences for 9-hand games
- [ ] Hand descriptions
- [ ] Player scoring calculation
- [ ] Dealer chip rotation
- [ ] Game over determination
- [ ] Winner calculation

## Quick Reference

### Point Values
```
Black Aces: 15 pts
Red Aces: 10 pts (wild)
Face Cards: 10 pts
Number Cards: 2-9 = face value
Jokers: 10 pts (wild)
```

### Deck Composition
- 1-2 decks for 2 players
- 2-3 decks for 3 players  
- 2-3 decks for 4 players
(Always includes jokers)

### Starting Hand Size
- 11 cards per player
- +1 card in discard pile

## Future Enhancements

Both versions should eventually support:
- [ ] Network multiplayer
- [ ] Undo/redo functionality
- [ ] Game replay/statistics
- [ ] Custom rule presets
- [ ] Animation and visual feedback
- [ ] Sound effects
- [ ] Tournament mode

## License

All rights reserved. Created for family game nights.
