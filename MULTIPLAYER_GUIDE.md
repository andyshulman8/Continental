# Continental - Multiplayer Game Guide

## How to Play with Local Links (2-4 Players)

Your game is now fully multiplayer-enabled! You can open the game in different browser tabs and have 2-4 players join the same game session using local links.

### Quick Start

1. **Start the server** (if not already running):
   ```bash
   cd web
   ./start.sh
   # or
   python3 -m http.server 8000
   ```

2. **Open your browser** to `http://localhost:8000`

### For Player 1 (Game Creator):

1. Enter your name (e.g., "Alice")
2. Select the number of players (2-4)
3. Click **"Create New Game"**
4. You'll see a **shareable game link** on the screen
5. **Copy the link** using the copy button

### For Players 2-4 (Joining):

1. Open a **new browser tab** 
2. Go to `http://localhost:8000`
3. Enter your name (e.g., "Bob")
4. Click **"Join Existing Game"**
5. **Paste the game link** that Player 1 shared
6. Click **"Join"**

### Starting the Game

Once all players have joined:
- The **"Start Game"** button will become enabled
- **Any player** can click it to begin the game
- The dealer will be determined by drawing cards
- Play proceeds normally from there!

## Game Features

### Session Management
- **Automatic synchronization** across tabs using browser localStorage
- **Real-time player list** showing who has joined
- **Share link** can be copied and pasted to other tabs/windows

### During Gameplay
- Each player can view the game from their own perspective
- All players see the same game state
- Click the **"Share Game"** button anytime to get the link again
- Click **"Scores"** to view the score sheet

### Hand Requirements (8 or 9 hands)

**2 or 4 Players (8 hands):**
1. Two Sets
2. One Set + One Run
3. Two Runs
4. Two Sets + One Run
5. Two Runs + One Set
6. Three Sets
7. Three Runs
8. Four Runs

**3 Players (9 hands):**
Same as above, plus "Two Sets + Two Runs"

## Technical Details

### How It Works
- Game sessions are stored in browser **localStorage** with a unique game ID
- Each player has a unique player ID (persists in browser)
- When multiple tabs/windows access the same game ID, they sync automatically
- Changes in one tab appear in others within ~500ms

### File Structure
- `multiplayerSession.js` - Handles session management and synchronization
- `main.js` - Updated with session initialization and UI control
- `gameScene.js` - Updated to support multiplayer sessions
- `index.html` - New join/creation interface

## Testing Tips

To test locally with multiple "players":
1. Open Tab 1: `http://localhost:8000`
2. Open Tab 2: `http://localhost:8000` 
3. Open Tab 3: `http://localhost:8000` (if 3-4 player game)
4. Each tab is an independent player!

## Troubleshooting

**Game link not working?**
- Make sure all tabs are on the same device
- Check that both tabs have the full URL including the gameId parameter
- Refresh the page if join doesn't work

**Not seeing other players?**
- The player list updates every 500ms
- Try refreshing the page
- Make sure all players are using the same game link

**Game state not syncing?**
- localStorage requires same domain/port
- Make sure you're using `http://localhost:8000`, not just `localhost`
- Check browser console for errors (F12)

## Future Enhancements

Possible improvements (WebSockets, database, etc.):
- Real multiplayer over the internet with WebSockets
- Database persistence
- Chat between players
- Game replay functionality
- Mobile app version
