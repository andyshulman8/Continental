# Quick Testing Guide - Multiplayer Local Game

## Setup

```bash
cd web
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Test Scenario 1: Single Player (Manual testing)

1. Enter name "Test Player"
2. Select 2 players
3. Click "Create New Game"
4. Copy the link
5. In same or new tab, paste the link
6. Join as "Player 2"
7. Click "Start Game"
8. Play through dealer selection
9. View your hand and make moves

## Test Scenario 2: Multiple Tabs (Recommended)

This is the main use case - each browser tab acts as a separate player:

### Tab 1 (Player 1 - Alice):
1. Open `http://localhost:8000`
2. Name: "Alice"
3. Players: 2
4. Click "Create New Game"
5. **Copy link from the display**

### Tab 2 (Player 2 - Bob):
1. Open `http://localhost:8000`
2. Name: "Bob"
3. Click "Join Existing Game"
4. **Paste the link** from Tab 1
5. Click "Join"
6. See "Waiting for 0 more players" message

### Back to Tab 1:
- Should see Bob in the player list
- "Start Game" button should now be enabled
- Click it!

### Both Tabs:
- Both see dealer selection screen
- Each player picks a card
- Highest card becomes dealer
- Game proceeds with each player managing their own hand

## Test Scenario 3: 3-4 Players

Same flow, but:
- Select 3 or 4 players in creation
- Open that many tabs/windows
- Each tab joins with the copied link
- Start game when all players have joined

## Expected Behavior

✅ **Should see:**
- Join screen on page load
- Game link appears after creating/joining
- Player list updates in real-time across tabs
- "Start Game" button enables when all players joined
- Dealer selection shows 104 cards (2 decks)
- After dealer selection, game board shows with player hands
- Share link button works during gameplay
- Can draw, play melds, and discard cards

❌ **Issues to watch for:**
- JavaScript console errors (press F12)
- Links not working (check URL has ?gameId=...)
- Player list not updating (localStorage issue)
- Cards not displaying (Phaser library issue)

## Debug Tips

Open browser Developer Tools (F12) and check:

**Console tab:**
- Look for any red errors
- Test localStorage: `JSON.parse(localStorage.getItem('game_XXXX'))`

**Storage/Application tab:**
- View localStorage entries starting with `game_`
- Each game session has its own key
- Should contain player list and game state

## Key Endpoints

- Main page: `http://localhost:8000/`
- With game ID: `http://localhost:8000/?gameId=game_abc123def`
- HTML file: `http://localhost:8000/index.html`
- Scripts: Auto-loaded from `src/` folder
