# Code Synchronization Guide

## How Changes Are Synchronized Between iOS and Web

Since you want to "link to one place" to avoid duplicating changes, here's how the game logic is organized:

### The Single Source of Truth: Game Logic

#### Web Version (Primary)
**File**: `web/src/gameLogic.js`
- 🟢 Easiest to test and modify (just refresh browser)
- Full game rules and logic in JavaScript
- Fast iteration cycle

#### iOS Version (Mirror)
**File**: `CardGameV2/GameLogic.swift`
- Same classes and logic as JavaScript version
- Must be manually updated when web version changes
- Compiled/tested in Xcode

### Key Classes to Keep in Sync

Both versions implement these classes:

| Class | Purpose | Web File | iOS File |
|-------|---------|----------|----------|
| Card | Individual playing card | `gameLogic.js` | `Card.swift` |
| Deck | Card deck management | `gameLogic.js` | `GameLogic.swift` |
| Player | Player state and hand | `gameLogic.js` | `GameLogic.swift` |
| Meld | Set/Run validation | `gameLogic.js` | `GameLogic.swift` |
| GameState | Main game logic | `gameLogic.js` | `GameLogic.swift` |

---

## Workflow: Making Changes

### Step 1: Update Web Version (Fastest)
Edit `web/src/gameLogic.js` and test immediately in browser:
```bash
cd web
./start.sh
# Open http://localhost:8000
```

### Step 2: Verify It Works
- Play through several hands
- Check scoring
- Test dealer rotation
- Test hard mode

### Step 3: Mirror to iOS
Copy the same logic to `CardGameV2/GameLogic.swift`:
- Update Swift syntax to match
- Keep class structure identical
- Test in Xcode simulator

---

## Common Changes & Where They Go

### Changing Card Scoring
**Web** - `gameLogic.js`, `Card.pointValue()`:
```javascript
pointValue() {
  if (this.isJoker) return 10;
  if (this.rank === Rank.Ace) {
    return this.isBlack ? 15 : 10;  // ← Change here
  }
  // ... rest of scoring
}
```

**iOS** - `Card.swift`, `pointValue()` method:
```swift
func pointValue() -> Int {
  if isJoker { return 10 }
  return rank.valueFor(suit: suit)  // ← Update valueFor()
}
```

### Changing Deck Size
**Web** - `gameLogic.js`, `GameState.constructor()`:
```javascript
constructor(playerCount = 2) {
  this.numDecksNeeded = Math.ceil((playerCount * 11 + 1) / 52) + 1;
  // ↑ Change this calculation if needed
  this.deck = new Deck(this.numDecksNeeded);
}
```

**iOS** - `GameLogic.swift`, `GameState.init()`:
```swift
init(playerCount: Int = 2) {
  self.numDecksNeeded = ((playerCount * 11 + 1) + 51) / 52 + 1
  // ↑ Update this calculation to match
}
```

### Changing Hand Progression
**Web** - `gameLogic.js`, `GameState.getCurrentHand()`:
```javascript
getCurrentHand() {
  if (this.playerCount === 3) {
    switch (this.currentHandNumber) {
      case 1: return HandNumber.Hand1;  // ← Verify order
      case 2: return HandNumber.Hand2;
      // ... etc
    }
  }
}
```

**iOS** - `GameLogic.swift`, `GameState.getCurrentHand()`:
```swift
func getCurrentHand() -> HandNumber {
  if players.count == 3 {
    switch currentHandNumber {
      case 1: return .hand1  // ← Verify order matches
      case 2: return .hand2
      // ... etc
    }
  }
}
```

---

## Testing Checklist Before Syncing

Before copying changes from web to iOS:

- [ ] Game starts without errors
- [ ] Dealer selection works correctly
- [ ] Cards are dealt properly (11 per player)
- [ ] Players can draw, play melds, and discard
- [ ] Scoring calculates correctly
- [ ] Hard mode toggle works
- [ ] Dealer chip rotates after hand
- [ ] Game ends after correct number of hands
- [ ] Winner is determined (lowest score)

---

## Files That Are NOT Synced

These files are platform-specific and don't need to be synced:

### Web Only
- `web/index.html` - Browser page
- `web/src/gameScene.js` - Phaser rendering
- `web/src/main.js` - Phaser setup
- `web/package.json` - npm configuration

### iOS Only
- `CardGameV2/GameViewController.swift` - iOS view controller
- `CardGameV2/GameScene.swift` - SpriteKit rendering
- `CardGameV2/AppDelegate.swift` - iOS app setup
- `CardGameV2.xcodeproj/` - Xcode project

---

## Quick Sync Checklist

When you finish making changes to web version:

1. **Test thoroughly** in browser
2. **Write down changes made** (what you modified)
3. **Open iOS code** in Xcode
4. **Update** `Card.swift` and `GameLogic.swift` with same logic
5. **Compile** in Xcode (Cmd+B)
6. **Test** in iOS simulator
7. **Verify** both versions behave identically

---

## Example: Changing Black Ace Value

### Current (both versions):
- Black Aces: 15 points
- Red Aces: 10 points

### If you want to change Black Aces to 20 points:

**Step 1** - Update Web (`web/src/gameLogic.js`):
```javascript
// In Card class, pointValue() method
if (this.rank === Rank.Ace) {
  return this.isBlack ? 20 : 10;  // Changed 15 to 20
}
```

**Step 2** - Test in browser (http://localhost:8000):
- Play a hand
- Verify scoring shows black aces as 20 points
- Check final scores are correct

**Step 3** - Update iOS (`CardGameV2/Card.swift`):
```swift
// In Rank enum, valueFor(suit:) method
case .ace:
  return (suit == .clubs || suit == .spades) ? 20 : 10
```

**Step 4** - Build and test in Xcode simulator

**Step 5** - Done! Both versions now have Black Aces = 20 points

---

## Need to Revert a Change?

Git makes this easy:
```bash
# See what changed
git diff web/src/gameLogic.js

# Revert a file
git checkout web/src/gameLogic.js

# Or use version control in your editor
```

---

## Setting Up Version Control (Optional but Recommended)

```bash
cd /Users/andyshulman/Documents/VibeCoding/Continental
git init
git add .
git commit -m "Initial commit with web version"

# Then each time you sync:
git add .
git commit -m "Sync: Updated hand 4 position"
```

This way you can track exactly what changed and when.

---

## Summary

✅ **Web version** (`web/src/gameLogic.js`) = Primary development location
✅ **iOS version** (`CardGameV2/GameLogic.swift`) = Copy logic here after testing
✅ **Keep in sync**: Both should have identical game rules
✅ **Different only**: UI/rendering code (platform-specific)

Happy coding! 🎮
