# Continental - Complete Project Index

## 🚀 Quick Links

### START HERE
- [QUICK_START.md](QUICK_START.md) - 5-minute setup guide
- [WEB_VERSION_CREATED.txt](WEB_VERSION_CREATED.txt) - What was just created

### Main Documentation
- [SYNC_GUIDE.md](SYNC_GUIDE.md) - Keep iOS and Web versions in sync
- [ARCHITECTURE.md](ARCHITECTURE.md) - How the code is organized
- [GAME_DEVELOPMENT.md](GAME_DEVELOPMENT.md) - Full development guide

### Platform-Specific
- [web/README.md](web/README.md) - Web version documentation
- [CardGameV2/README.md](CardGameV2/README.md) - iOS version (if exists)

---

## 📁 Project Structure

```
Continental/
│
├── 🌐 WEB VERSION (Browser-based)
│   └── web/
│       ├── index.html              ← Open this in browser
│       ├── start.sh                ← Run this to start server
│       ├── package.json
│       └── src/
│           ├── gameLogic.js        ⭐ PRIMARY game logic
│           ├── gameScene.js        Game UI (Phaser)
│           └── main.js             Startup code
│
├── 📱 iOS VERSION (Native App)
│   └── CardGameV2/
│       ├── GameLogic.swift         ⭐ MIRROR game logic
│       ├── GameScene.swift         Game UI (SpriteKit)
│       ├── Card.swift              Card model
│       └── ... (other iOS files)
│
├── 📚 DOCUMENTATION
│   ├── QUICK_START.md              ← START HERE!
│   ├── SYNC_GUIDE.md               Keep both versions in sync
│   ├── ARCHITECTURE.md             Code organization
│   ├── GAME_DEVELOPMENT.md         Full dev guide
│   └── README.md                   Project overview
│
└── 🔧 PROJECT FILES
    └── CardGameV2.xcodeproj        Xcode project
```

---

## ⚡ Getting Started (30 seconds)

### 1. Start Web Server
```bash
cd web
./start.sh
```

### 2. Open Browser
```
http://localhost:8000
```

### 3. Play!
- Click "New Game"
- Select highest card for dealer
- Draw → Play melds → Discard → Repeat
- Lowest score wins!

---

## 📝 Key Files to Know

### Game Logic (Both Versions Must Stay In Sync)
| File | Purpose | When to Edit |
|------|---------|--------------|
| `web/src/gameLogic.js` | Game rules in JavaScript | When testing changes |
| `CardGameV2/GameLogic.swift` | Game rules in Swift | After testing in web |

### UI Files (Platform-Specific)
| File | Purpose | When to Edit |
|------|---------|--------------|
| `web/src/gameScene.js` | Web UI (Phaser) | Change web display |
| `CardGameV2/GameScene.swift` | iOS UI (SpriteKit) | Change iOS display |

### Configuration
| File | Purpose | When to Edit |
|------|---------|--------------|
| `web/package.json` | Web project metadata | Project management |
| `web/start.sh` | Server startup script | Change server port |
| `CardGameV2.xcodeproj` | iOS project | iOS build settings |

---

## 🎮 Game Rules Reference

### Setup
- 2-4 players
- Dealer selected by highest card
- 11 cards dealt per player
- 1 initial discard

### Hands (8-Hand for 2-4 players)
1. Two Sets (6 cards)
2. One Set + One Run (7 cards)
3. Two Runs (8 cards)
4. Two Sets + One Run (9 cards)
5. Two Runs + One Set (10 cards)
6. Three Sets (9 cards)
7. Three Runs (11 cards)
8. Four Runs (13 cards)

### Hands (9-Hand for 3 players)
Same as above, but adds:
- Hand 8a: Two Sets + Two Runs (12 cards) - between hand 7 and 8

### Scoring
- Black Aces: 15 points
- Red Aces: 10 points (wild)
- Face Cards: 10 points
- Number Cards: Face value
- Jokers: 10 points (wild)
- **Winner**: Lowest total score

---

## 🔄 Workflow: Making Changes

### Quick Changes (Easiest)
```
1. Edit web/src/gameLogic.js
2. Refresh browser at http://localhost:8000
3. Test and verify
4. Copy logic to CardGameV2/GameLogic.swift
5. Build in Xcode (Cmd+B)
6. Done!
```

### Example: Change Ace Points
1. Edit `web/src/gameLogic.js`:
   ```javascript
   // In Card.pointValue():
   if (this.rank === Rank.Ace) {
     return this.isBlack ? 20 : 10;  // Change 15 to 20
   }
   ```

2. Refresh browser → Test

3. Edit `CardGameV2/GameLogic.swift`:
   ```swift
   // In Rank.valueFor(suit:):
   case .ace:
     return (suit == .clubs || suit == .spades) ? 20 : 10
   ```

4. Build in Xcode → Test

---

## 📚 Documentation Guide

### For Quick Start
→ Read [QUICK_START.md](QUICK_START.md)

### For Understanding Code Organization
→ Read [ARCHITECTURE.md](ARCHITECTURE.md)

### For Keeping Files in Sync
→ Read [SYNC_GUIDE.md](SYNC_GUIDE.md)

### For Full Development Guide
→ Read [GAME_DEVELOPMENT.md](GAME_DEVELOPMENT.md)

### For Web-Specific Details
→ Read [web/README.md](web/README.md)

---

## ✅ Verification Checklist

After creating web version, verify:

- [ ] `cd web` works
- [ ] `./start.sh` starts server
- [ ] http://localhost:8000 opens in browser
- [ ] Game loads without errors
- [ ] Dealer selection works
- [ ] Can play cards
- [ ] Scoring calculates correctly
- [ ] All hands are available
- [ ] Hard mode toggle works
- [ ] Dealer rotates after each hand

---

## 🔗 The Key Concept

```
┌──────────────────────────────────┐
│   Single Source of Truth         │
│   web/src/gameLogic.js (primary) │
└──────────────────────────────────┘
            ↙          ↖
    Test in Web     Mirror to iOS
  (Fast iteration)  (Production)
            ↙          ↖
  Refresh browser  Xcode Build
    (Instant)       (5-30 sec)

Both versions use IDENTICAL game logic
but DIFFERENT UI rendering
```

When rules change:
1. Update web version (test quickly)
2. Copy logic to iOS version
3. Both automatically have same rules!

---

## 🚀 Next Steps

### Immediate
1. Open terminal: `cd web && ./start.sh`
2. Open http://localhost:8000
3. Play a game to verify everything works

### Short Term
- Test with different player counts
- Try different hands
- Verify scoring

### Medium Term
- Make rule adjustments as needed
- Keep web/iOS versions in sync
- Test on iOS device

### Future Enhancements
- Network multiplayer
- Undo/redo
- Better graphics
- Sound effects
- Tournament mode

---

## 🆘 Troubleshooting

### Server Won't Start
```bash
# Make sure Python 3 is installed
python3 --version

# Try running server directly
cd web
python3 -m http.server 8000
```

### Browser Shows 404
- Make sure `index.html` exists in `web/` folder
- Make sure server is running
- Try `http://localhost:8000/index.html`

### Game Won't Load
- Open browser console (F12)
- Check for JavaScript errors
- Verify Phaser 3 CDN is accessible

### Changes Not Showing
- Refresh browser (Cmd+R or F5)
- Clear browser cache if needed
- Check console for errors

---

## 📞 Files Quick Reference

| Document | Purpose | Read Time |
|----------|---------|-----------|
| QUICK_START.md | Get running in 5 minutes | 5 min |
| SYNC_GUIDE.md | Keep iOS & Web in sync | 10 min |
| ARCHITECTURE.md | Understand code structure | 10 min |
| GAME_DEVELOPMENT.md | Full development guide | 15 min |
| WEB_VERSION_CREATED.txt | What was just created | 2 min |

---

## 🎯 Summary

You now have:
- ✅ Web version (browser-playable)
- ✅ Shared game logic (single source)
- ✅ Complete documentation
- ✅ Clear sync workflow

Ready to test and make changes without duplication!

---

**Questions?** See the relevant documentation file above.

**Ready to play?** Run `cd web && ./start.sh` and open http://localhost:8000

Enjoy! 🎮
