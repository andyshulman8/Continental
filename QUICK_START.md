# 🃏 Continental - Quick Start Guide

## Start Playing in 30 Seconds

### Web Version (Recommended for Testing)

```bash
cd /Users/andyshulman/Documents/VibeCoding/Continental/web
./start.sh
```

Then open your browser to: **http://localhost:8000**

That's it! The game is now running.

---

## What You Just Created

✅ **Web Version** - Full game playable in any browser
- Same family rules as iOS version
- Dealer selection system
- All 8/9 hands implemented
- Hard mode toggle
- Score tracking

✅ **Shared Game Logic** - Single source of truth
- `web/src/gameLogic.js` - Game rules and logic
- Mirror these changes to `CardGameV2/GameLogic.swift` when you modify rules

---

## Testing the Game

1. **Start a game**: Click "New Game" button
2. **Dealer selection**: Each player picks a card (highest = dealer)
3. **Play**: 
   - Click "Draw Stock" or "Draw Discard"
   - Select cards to form melds
   - Click "Play Melds" to lay down cards
   - Click "Discard" to end your turn
4. **Continue**: Play through all 8 hands (or 9 for 3 players)

---

## Making Changes

### Change Game Rules

1. Edit `web/src/gameLogic.js`
2. Refresh browser (game updates automatically)
3. Once verified, update `CardGameV2/GameLogic.swift` for iOS

### Example Changes
```javascript
// To change scoring (in gameLogic.js):
pointValue() {
  if (this.isJoker) return 10;
  if (this.rank === Rank.Ace) {
    return this.isBlack ? 15 : 10;  // Change these numbers
  }
  // ... rest of scoring
}

// To change deck size:
constructor(numDecks = 1) {  // Change numDecks default
  // ... deck creation code
}
```

---

## Project Structure

```
Continental/
├── web/                    ← Web version (start here!)
│   ├── index.html         ← Open in browser
│   ├── start.sh           ← Run to start server
│   └── src/
│       ├── gameLogic.js   ← Game rules (shared)
│       ├── gameScene.js   ← Game UI (Phaser)
│       └── main.js        ← Startup code
│
├── CardGameV2/            ← iOS version
│   ├── GameLogic.swift    ← Mirror changes here
│   ├── GameScene.swift
│   └── Card.swift
│
└── GAME_DEVELOPMENT.md    ← Full development guide
```

---

## Common Tasks

### Stop the Server
Press `Ctrl+C` in the terminal

### Play with Different Player Counts
Edit `src/main.js`:
```javascript
const gameState = new GameState(2);  // Change 2 to 3 or 4
```

### Debug in Browser
- Open DevTools: `Cmd+Option+I` (Mac) or `F12` (Windows)
- Check Console for errors
- Inspect Elements to see game structure

---

## Need Help?

- **Game rules**: See `GAME_DEVELOPMENT.md`
- **Web version code**: `web/README.md`
- **iOS version**: Open `CardGameV2.xcodeproj` in Xcode

---

## Next Steps

1. ✅ **Verify it works** - Open `http://localhost:8000`
2. **Test gameplay** - Play a few hands
3. **Make changes** - Edit `web/src/gameLogic.js`
4. **Sync to iOS** - Copy changes to `CardGameV2/GameLogic.swift`

Enjoy! 🎉
