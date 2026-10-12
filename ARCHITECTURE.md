# Architecture & Data Flow

## Project Overview

```
Continental Game
│
├─── WEB VERSION (Browser-based)
│    ├─ http://localhost:8000
│    ├─ Fast iteration & testing
│    ├─ Tech: JavaScript + Phaser 3
│    └─ Run: ./start.sh in web/ folder
│
├─── iOS VERSION (App)
│    ├─ Xcode simulator or device
│    ├─ Production-ready
│    ├─ Tech: Swift + SpriteKit
│    └─ Run: Open CardGameV2.xcodeproj
│
└─── SHARED LOGIC (Single Source of Truth)
     ├─ web/src/gameLogic.js (JavaScript)
     ├─ CardGameV2/GameLogic.swift (Swift)
     └─ Must be kept in sync!
```

## Code Organization

### Web Version Structure
```
web/
├── index.html                 ← Main page (open in browser)
├── package.json              ← Project metadata
├── start.sh                  ← Run this to start server
├── src/
│   ├── gameLogic.js         ← ⭐ GAME RULES (primary development)
│   ├── gameScene.js         ← UI rendering with Phaser
│   └── main.js              ← Startup & configuration
└── README.md                ← Web-specific docs
```

### iOS Version Structure
```
CardGameV2/
├── GameLogic.swift          ← ⭐ GAME RULES (mirror from web)
├── GameScene.swift          ← UI rendering with SpriteKit
├── Card.swift               ← Card model (part of logic)
├── GameViewController.swift ← iOS view controller
└── ... (other iOS files)
```

## Game Logic Synchronization

### What Stays in Sync

Both versions must have identical logic for:

```
┌─────────────────────────────────────┐
│    GAME LOGIC (Synchronized)        │
├─────────────────────────────────────┤
│ • Card properties & point values    │
│ • Deck creation & shuffling         │
│ • Hand/Meld validation              │
│ • Player state management           │
│ • Hand progression (1-8/9)          │
│ • Scoring calculations              │
│ • Dealer rotation                   │
│ • Game state management             │
│ • Turn order logic                  │
│ • Win conditions                    │
└─────────────────────────────────────┘
```

### What's Different (UI Only)

Web and iOS have different rendering, but same logic underneath:

```
┌──────────────────────────────────────┬──────────────────────────────────────┐
│         WEB VERSION (UI)             │         iOS VERSION (UI)             │
├──────────────────────────────────────┼──────────────────────────────────────┤
│                                      │                                      │
│ HTML Canvas / Phaser Game Engine     │ Metal Renderer / SpriteKit           │
│                                      │                                      │
│ Components:                          │ Components:                          │
│ - gameScene.js (Phaser Scene)       │ - GameScene.swift (SpriteKit Scene) │
│ - Card rendering                    │ - Card rendering                     │
│ - Button interactions                │ - Touch handling                      │
│ - Layout & positioning               │ - Layout & positioning               │
│                                      │                                      │
│ Input: Mouse clicks                  │ Input: Touch events                  │
│ Output: Browser display              │ Output: iPhone/iPad screen          │
│                                      │                                      │
└──────────────────────────────────────┴──────────────────────────────────────┘
                 ↓                                      ↓
        ┌─────────────────────────────────────────────────────┐
        │      SHARED GAME LOGIC (gameLogic.js/Swift)        │
        │                                                     │
        │  Card, Deck, Player, Meld, GameState classes      │
        │  Game rules, validation, scoring, state mgmt      │
        │                                                     │
        └─────────────────────────────────────────────────────┘
```

## Data Flow During a Game

### Card Selection & Playing

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERACTION                         │
│                  (click/touch cards)                        │
└────┬────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│               UI LAYER (Platform-Specific)                  │
│   gameScene.js (Web) or GameScene.swift (iOS)             │
│   - Detect which card was selected                         │
│   - Toggle selection highlight                            │
└────┬────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│              GAME LOGIC (Shared/Synced)                     │
│   gameLogic.js or GameLogic.swift                          │
│   - Validate meld (is it a set or run?)                    │
│   - Check if meets hand requirement                        │
│   - Update player's melds array                            │
│   - Remove cards from hand                                 │
└────┬────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│              GAME STATE UPDATE                              │
│   - Player's melds updated                                 │
│   - Player's hand count changed                            │
│   - Check if player won hand                               │
│   - Calculate scores if hand over                          │
└────┬────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│               DISPLAY REFRESH (Platform-Specific)           │
│   gameScene.js (Web) or GameScene.swift (iOS)             │
│   - Redraw cards in new positions                          │
│   - Update hand display                                    │
│   - Show melds on table                                    │
│   - Update score displays                                  │
└─────────────────────────────────────────────────────────────┘
```

## File Dependencies

### Web Version
```
index.html
    ├─ Phaser 3 (from CDN)
    ├─ src/gameLogic.js
    ├─ src/gameScene.js
    │   └─ uses GameState, Card, Deck, Meld, Player classes
    └─ src/main.js
        └─ initializes Phaser game
```

### iOS Version
```
GameViewController.swift
    ├─ GameScene.swift (SpriteKit scene)
    │   ├─ GameLogic.swift
    │   │   ├─ Card.swift
    │   │   ├─ Deck class
    │   │   ├─ Player class
    │   │   ├─ Meld class
    │   │   └─ GameState class
    │   └─ Card rendering
    └─ Touch event handling
```

## Development Workflow

```
START
  │
  ▼
Make change in web/src/gameLogic.js
  │
  ▼
Test in browser (http://localhost:8000)
  │
  ├─ Works? ──→ Copy logic to iOS
  │            │
  │            ▼
  │           Edit CardGameV2/GameLogic.swift
  │            │
  │            ▼
  │           Build in Xcode (Cmd+B)
  │            │
  │            ▼
  │           Test in iOS simulator
  │            │
  │            ├─ Works? ──→ SUCCESS! ✅
  │            │
  │            └─ Error? ──→ Fix and rebuild
  │                          │
  │                          └─ Go back to test step
  │
  └─ Error? ──→ Fix in web version
               │
               └─ Refresh browser and test
```

## Keeping Files in Sync

### Manual Sync Checklist

After making changes to `web/src/gameLogic.js`:

- [ ] Class names match (Card, Deck, Player, Meld, GameState)
- [ ] Property names match (rank, suit, hand, melds, etc.)
- [ ] Point values match (aces, face cards, numbers)
- [ ] Game logic matches:
  - [ ] Hand progression sequences
  - [ ] Hand descriptions
  - [ ] Scoring calculations
  - [ ] Dealer chip rotation
  - [ ] Card dealing logic
- [ ] Enums match (Suit, Rank, HandNumber, MeldType)

### Automated Approach (Future)

Could use TypeScript + compilation to ensure both versions use same types:
```typescript
// web/src/gameLogic.ts (TypeScript)
// - Define all types and logic
// - Compile to JavaScript for web
// - Could also generate Swift interface
```

For now, **manual comparison** is the safest approach.

## Performance Considerations

### Web Version
- Runs in browser (no compilation needed)
- Instant feedback (refresh = instant updates)
- Good for rapid testing
- Limited by browser performance

### iOS Version
- Compiled to native code
- Better performance on devices
- Requires Xcode rebuild (5-30 seconds)
- Can test on real device

## Summary

```
┌─────────────────────────────────────────────┐
│  Single Game Logic Source (gameLogic.js)   │
│  Tested quickly in web browser             │
└────────────┬────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
Web Version     iOS Version
(JavaScript)    (Swift)
Browser         iPhone/iPad
Fast testing    Production
```

Both versions work the same way internally because they share the same game logic!
