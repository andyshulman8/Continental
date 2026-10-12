# Continental - Family Rules
An iOS and Web game implementation of Continental (Family Rules variant) for 2-4 players

## 🚀 Quick Start

### Play in Web Browser (Fastest!)
```bash
cd web
./start.sh
# Open http://localhost:8000
```

### Or Open iOS App
```bash
open CardGameV2.xcodeproj
# Build and run in Xcode
```

**Full documentation**: See [INDEX.md](INDEX.md) or [QUICK_START.md](QUICK_START.md)

## About Continental - Family Rules

This is a family-friendly variant of Continental with streamlined rules. Players compete over 8 hands (or 9 if playing with 3 players) with different meld requirements each hand. The player with the lowest cumulative score wins!

### Key Family Rules Differences
- **11 card deals** (instead of 12)
- **Players can add to melds** once they've gone down - both their own and opponents' melds on their turn
- **8 hands** for 2 or 4 players
- **9 hands** for 3 players (adds an extra hand: Two Sets & Two Runs)

### Game Components
- **Decks**: Uses 2 base decks plus additional decks based on player count
- **Jokers**: 2 jokers per deck (wild cards)
- **Wild Cards**: Red Aces and all Jokers
- **Deal**: Each player gets 11 cards per hand

### The Hands

#### 8-Hand Games (2 or 4 players)
| Hand | Requirement |
|------|-------------|
| 1 | Two Sets |
| 2 | One Set & One Run |
| 3 | Two Runs |
| 4 | Three Sets |
| 5 | Two Sets & One Run |
| 6 | Two Runs & One Set |
| 7 | Three Runs |
| 8 | Four Runs |

#### 9-Hand Games (3 players)
| Hand | Requirement |
|------|-------------|
| 1 | Two Sets |
| 2 | One Set & One Run |
| 3 | Two Runs |
| 4 | Three Sets |
| 5 | Two Sets & One Run |
| 6 | Two Runs & One Set |
| 7 | Two Sets & Two Runs |
| 8 | Three Runs |
| 9 | Four Runs |

### Sets and Runs
- **Set**: 3 or more cards of the same rank (e.g., 7♥, 7♦, 7♣)
- **Run**: 4 or more cards of the same suit in sequence (e.g., 5♠, 6♠, 7♠, 8♠)
- **Wild Cards**: Can represent any card but cannot outnumber standard cards in a meld

### Scoring
- Cards 2-9: Face value points
- Cards 10-K: 10 points each
- Black Aces (♠ ♣): 15 points
- Red Aces (♥ ♦): 10 points (wild)
- Jokers: 10 points (wild)

Lower scores are better! The player with the lowest total score wins.

## How to Play

### Hard Mode
- **Hard Mode**: Toggle with the "Hard: OFF/ON" button in the top-left
- In Hard Mode, you must play your entire hand (including the card you drew) to win the hand
- In Normal Mode, you only need to discard one card to end the hand

### On Your Turn:
1. **Draw**: Tap "Draw Stock" to draw from the deck or "Draw Discard" to draw the top discard card
2. **Play Melds** (first time only): Select cards and tap "Play Melds" to lay down your initial melds
   - Must satisfy the current hand's requirements to go down
3. **Add to Melds** (once down): After going down, you can add cards to any melds on the table (yours or opponents')
4. **Discard**: Select a card and tap "Discard" to end your turn

### Game Flow:
- Players take turns drawing and discarding cards
- First time going "down"? Must satisfy the current hand's requirements
- Already down? Can add any valid cards to melds on the table on your turn
- One player runs out of cards → hand ends
- Remaining cards in your hand count as penalty points
- All players move to the next hand together
- After 8 or 9 hands, lowest total score wins

## Implementation

### File Structure
- **Card.swift**: Standard playing card class
- **GameLogic.swift**: Game mechanics (Deck, Player, GameState, Meld validation)
- **GameScene.swift**: UI and interaction
- **GameViewController.swift**: View controller
- **AppDelegate.swift**: App lifecycle

### Key Features
- ✅ 8 or 9 hand progressive gameplay
- ✅ 11 card deals (family rules)
- ✅ Set and run validation with wild card rules
- ✅ Players can add to any melds once down
- ✅ Score calculation
- ✅ Multi-player support (2-4 players)

## Rules Reference

Family Rules variant of Continental designed for casual family play.
