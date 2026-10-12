/**
 * Main entry point - Phaser game configuration and multiplayer session management
 */

let gameInstance = null;
let multiplayerSession = null;
let currentGameState = null;
const STORAGE_SYNC_INTERVAL = 100; // Check for updates every 100ms for better responsiveness
let syncInterval = null;

// ============================================================================
// Session Management
// ============================================================================

function generateGameId() {
  return 'game_' + Math.random().toString(36).substr(2, 9);
}

function generatePlayerId() {
  let playerId = localStorage.getItem('playerId');
  if (!playerId) {
    playerId = 'player_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('playerId', playerId);
  }
  return playerId;
}

function extractGameIdFromLink(link) {
  try {
    const url = new URL(link, window.location.origin);
    return new URLSearchParams(url.search).get('gameId');
  } catch (e) {
    return null;
  }
}

function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status-message');
  statusEl.textContent = message;
  statusEl.className = `active ${type}`;
  
  // Auto-hide after 5 seconds for success/error
  if (type !== 'info') {
    setTimeout(() => {
      statusEl.classList.remove('active');
    }, 5000);
  }
}

function startNewGameSession() {
  const playerName = document.getElementById('player-name').value.trim();
  const playerCount = parseInt(document.getElementById('player-count').value);

  if (!playerName) {
    showStatus('Please enter your name', 'error');
    return;
  }

  const gameId = generateGameId();
  const playerId = generatePlayerId();

  multiplayerSession = new MultiplayerSession(gameId, playerId, playerName, playerCount);
  const sessionData = multiplayerSession.initializeNewGame();

  showGameInfoSection();
  updateGameLink();
  updatePlayersList();
  setupSessionWatcher();

  showStatus(`Game created! Share the link with ${playerCount - 1} more player(s)`, 'success');
}

function showJoinExistingGame() {
  document.getElementById('join-existing-section').style.display = 'block';
}

function cancelJoinExisting() {
  document.getElementById('join-existing-section').style.display = 'none';
  document.getElementById('game-link-input').value = '';
}

/**
 * Get or create a playerId for joining an existing game.
 * Uses sessionStorage keyed by gameId so each browser tab gets its own identity.
 * This fixes the bug where P2 opens the link in another tab and was reusing P1's
 * localStorage playerId, so they were never actually added to the room.
 */
function getOrCreateJoinPlayerId(gameId) {
  const key = `join_player_${gameId}`;
  let playerId = sessionStorage.getItem(key);
  if (!playerId) {
    playerId = 'player_' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem(key, playerId);
  }
  return playerId;
}

function joinExistingGameSession() {
  const gameLink = document.getElementById('game-link-input').value.trim();
  const gameId = extractGameIdFromLink(gameLink);

  if (!gameId) {
    showStatus('Invalid game link', 'error');
    return;
  }

  const playerName = document.getElementById('player-name').value.trim();
  if (!playerName) {
    showStatus('Please enter your name', 'error');
    return;
  }

  // Use session-scoped playerId so this tab is never mistaken for the host (P1).
  // Otherwise same-browser second tab would reuse localStorage playerId and not be added.
  const playerId = getOrCreateJoinPlayerId(gameId);
  console.log('[joinExistingGameSession] playerId for this tab:', playerId);
  multiplayerSession = new MultiplayerSession(gameId, playerId, playerName, 0);
  console.log('[joinExistingGameSession] gameId:', gameId, 'playerName:', playerName);

  const sessionData = multiplayerSession.getSession();
  if (!sessionData) {
    console.error('[joinExistingGameSession] session not found for gameId:', gameId);
    showStatus('Game not found', 'error');
    return;
  }

  const playersBeforeJoin = sessionData.players.length;
  console.log('[joinExistingGameSession] found session:', sessionData.players.map(p => ({ id: p.id, name: p.name })));

  multiplayerSession.playerCount = sessionData.playerCount;

  const joinResult = multiplayerSession.joinGame();
  if (!joinResult) {
    console.error('[joinExistingGameSession] joinGame() returned null or false');
    showStatus('Game is full or not found', 'error');
    return;
  }

  const playersAfterJoin = joinResult.players.length;
  const wasActuallyAdded = playersAfterJoin > playersBeforeJoin;
  console.log('[joinExistingGameSession] after join:', joinResult.players.map(p => ({ id: p.id, name: p.name })), 'wasActuallyAdded:', wasActuallyAdded);

  document.getElementById('join-existing-section').style.display = 'none';
  showGameInfoSection();
  updateGameLink();
  setupSessionWatcher();

  // Force fresh read from storage and update room list so both tabs see correct state
  const freshSession = multiplayerSession.getSession();
  if (freshSession) {
    multiplayerSession.notifyListeners('session_updated', freshSession);
  }
  updatePlayersList();

  if (wasActuallyAdded) {
    showStatus('Joined game successfully!', 'success');
  } else {
    showStatus("You're already in this game. Share the link with another player.", 'info');
  }
}

function showGameInfoSection() {
  document.getElementById('join-existing-section').style.display = 'none';
  document.getElementById('game-info-section').style.display = 'block';
}

function backToJoinScreen() {
  document.getElementById('game-info-section').style.display = 'none';
  document.getElementById('join-screen').classList.add('active');
  if (multiplayerSession) {
    multiplayerSession.deleteSession();
  }
  multiplayerSession = null;
}

function updateGameLink() {
  if (!multiplayerSession) return;
  
  const gameLink = `${window.location.origin}${window.location.pathname}?gameId=${multiplayerSession.gameId}`;
  document.getElementById('game-link-display').textContent = gameLink;
}

function copyGameLink() {
  try {
    const linkEl = document.getElementById('game-link-display');
    if (!linkEl) {
      console.error('Link element not found');
      showStatus('Link element not found', 'error');
      return;
    }
    
    // Get the text content
    const text = (linkEl.textContent || linkEl.innerText || '').trim();
    if (!text) {
      console.error('No link text found');
      showStatus('No link to copy', 'error');
      return;
    }
    
    console.log('Copying link:', text);
    
    // Try navigator.clipboard first (modern approach)
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text)
        .then(() => {
          console.log('Link copied successfully');
          showStatus('Link copied to clipboard!', 'success');
        })
        .catch((err) => {
          console.error('Clipboard write failed:', err);
          fallbackCopy(text);
        });
    } else {
      // Use fallback for older browsers
      fallbackCopy(text);
    }
  } catch (error) {
    console.error('Copy error:', error);
    showStatus('Failed to copy link', 'error');
  }
}

function fallbackCopy(text) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    
    textarea.focus();
    textarea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    
    if (successful) {
      console.log('Fallback copy successful');
      showStatus('Link copied to clipboard!', 'success');
    } else {
      console.error('execCommand copy returned false');
      showStatus('Failed to copy link', 'error');
    }
  } catch (err) {
    console.error('Fallback copy error:', err);
    showStatus('Failed to copy link', 'error');
  }
}

function updatePlayersList() {
  if (!multiplayerSession) return;

  // Always get fresh data from localStorage
  const players = multiplayerSession.getPlayers();
  const needed = multiplayerSession.getPlayerCountNeeded();
  const playersContainer = document.getElementById('players-joined');
  
  if (!playersContainer) return; // Element not found
  
  playersContainer.innerHTML = '';
  
  console.log('Updating player list:', {
    totalPlayers: players.length,
    playerCount: multiplayerSession.playerCount,
    needed: needed,
    players: players.map(p => ({ name: p.name, id: p.id }))
  });
  
  players.forEach(p => {
    const isMe = p.id === multiplayerSession.playerId;
    const playerEl = document.createElement('div');
    playerEl.className = `player-item ${isMe ? 'self' : ''}`;
    playerEl.textContent = `${p.name}${isMe ? ' (You)' : ''}`;
    playersContainer.appendChild(playerEl);
  });

  const neededEl = document.getElementById('players-needed');
  if (neededEl) {
    neededEl.textContent = needed >= 0 ? needed : 0;
  }
  
  // Enable start button if all players joined
  const startBtn = document.getElementById('start-game-btn');
  if (startBtn) {
    const canStart = needed <= 0 && players.length > 1;
    startBtn.disabled = !canStart;
    console.log('Start button disabled:', startBtn.disabled, 'needed:', needed, 'players:', players.length);
  }
}

function setupSessionWatcher() {
  if (!multiplayerSession) return;

  multiplayerSession.startWatchingSession();
  
  multiplayerSession.onSessionUpdate((event, data) => {
    console.log('Session update event:', event);
    if (event === 'session_changed' || event === 'session_updated' || event === 'player_joined') {
      updatePlayersList();
      startGameIfSessionSaysSo(data);
    }
    if (event === 'game_started') {
      startGameIfSessionSaysSo(data);
    }
  });

  // Poll for updates since storage events don't always fire reliably across tabs
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => {
    const infoSection = document.getElementById('game-info-section');
    if (infoSection && infoSection.style.display === 'block') {
      // Always refresh the session data
      if (multiplayerSession) {
        const freshSession = multiplayerSession.getSession();
        if (freshSession) {
          console.log('Polling: Found session data with', freshSession.players.length, 'players');
          updatePlayersList();
          startGameIfSessionSaysSo(freshSession);
        }
      }
    }
  }, STORAGE_SYNC_INTERVAL);
  
  // Also manually trigger update immediately
  updatePlayersList();
}

function startGameFromSession() {
  if (!multiplayerSession) {
    showStatus('Session not found', 'error');
    return;
  }

  const sessionData = multiplayerSession.getSession();
  if (!sessionData || sessionData.players.length < sessionData.playerCount) {
    showStatus('Not all players have joined yet', 'error');
    return;
  }

  // Switch this tab to the game first, then signal so the other tab(s) start too.
  // (If we signalled first, our own session_updated callback would also run startGameIfSessionSaysSo and we’d double-init.)
  document.getElementById('join-screen').classList.remove('active');
  document.getElementById('phaser-game').style.display = 'block';
  if (syncInterval) clearInterval(syncInterval);
  try {
    const pc = Number(sessionData.playerCount) || 0;
    initGame(pc, multiplayerSession, sessionData.players);
    multiplayerSession.signalGameStarted();
  } catch (err) {
    console.error('[startGameFromSession] Error initializing game:', err);
    showStatus('Failed to start game. See console for details.', 'error');
    // keep lobby visible so user can try again
    document.getElementById('phaser-game').style.display = 'none';
    document.getElementById('join-screen').classList.add('active');
  }
}

/**
 * If the session says the game has started and we're still on the lobby, start the game in this tab.
 * Called when we see session_changed/session_updated with status 'in_progress' (e.g. other player clicked Start).
 */
function startGameIfSessionSaysSo(sessionData) {
  if (!sessionData || sessionData.status !== 'in_progress') return;
  if (!multiplayerSession || sessionData.players.length < sessionData.playerCount) return;
  const phaserEl = document.getElementById('phaser-game');
  if (!phaserEl || phaserEl.style.display === 'block') return; // already in game
  const joinScreen = document.getElementById('join-screen');
  if (!joinScreen || !joinScreen.classList.contains('active')) return; // not on lobby

  console.log('[main] Session says game started – starting game in this tab');
  document.getElementById('join-screen').classList.remove('active');
  phaserEl.style.display = 'block';
  if (syncInterval) clearInterval(syncInterval);
  try {
    const pc = Number(sessionData.playerCount) || 0;
    initGame(pc, multiplayerSession, sessionData.players);
  } catch (err) {
    console.error('[startGameIfSessionSaysSo] Error initializing game:', err);
    showStatus('Failed to start game locally. See console for details.', 'error');
    phaserEl.style.display = 'none';
    document.getElementById('join-screen').classList.add('active');
    return;
  }
}

// ============================================================================
// Game Initialization
// ============================================================================

function initGame(playerCount = 2, session = null, sessionPlayers = null) {
  try {
    // Validate inputs
    if (!playerCount || playerCount < 2 || playerCount > 4) {
      console.error('[initGame] Invalid playerCount:', playerCount);
      showStatus('Invalid player count', 'error');
      return;
    }

    // Initialize game state
    currentGameState = new GameState(playerCount);
    
    if (!currentGameState || !currentGameState.players || currentGameState.players.length === 0) {
      console.error('[initGame] Failed to create game state');
      showStatus('Failed to initialize game', 'error');
      return;
    }

    // Sync player names from session if available
    if (sessionPlayers && Array.isArray(sessionPlayers) && sessionPlayers.length > 0) {
      for (let i = 0; i < sessionPlayers.length && i < currentGameState.players.length; i++) {
        if (sessionPlayers[i] && sessionPlayers[i].name) {
          currentGameState.players[i].name = sessionPlayers[i].name;
        }
      }
    }

    // Phaser config
    const config = {
      type: Phaser.AUTO,
      parent: 'phaser-game',
      width: 1200,
      height: 600,
      backgroundColor: '#1a5f3f',
      // Use an array for scenes to avoid class/instance ambiguity
      scene: [GameScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      }
    };

    // Prevent multiple Phaser instances
    if (gameInstance) {
      try {
        console.warn('[initGame] Existing gameInstance detected, destroying before restart');
        gameInstance.destroy(true);
      } catch (e) {
        console.warn('[initGame] Error destroying previous gameInstance:', e);
      }
      gameInstance = null;
    }

    // Create Phaser instance with error handling
    try {
      gameInstance = new Phaser.Game(config);
      console.info('[initGame] Phaser game instance created');
    } catch (err) {
      console.error('[initGame] Failed to create Phaser game instance:', err);
      showStatus('Failed to initialize game renderer', 'error');
      return;
    }

    // Start scene with game state and session
    try {
      if (!gameInstance.scene || typeof gameInstance.scene.start !== 'function') {
        throw new Error('Phaser scene manager not available');
      }
      gameInstance.scene.start('GameScene', { gameState: currentGameState, session: session });
      console.info('[initGame] GameScene started');
    } catch (err) {
      console.error('[initGame] Failed to start GameScene:', err);
      showStatus('Failed to start game scene', 'error');
      try {
        if (gameInstance) gameInstance.destroy(true);
      } catch (e) {}
      gameInstance = null;
      return;
    }
  } catch (error) {
    console.error('[initGame] Fatal error:', error);
    showStatus(`Game initialization error: ${error.message}`, 'error');
  }
}

function startNewGame() {
  document.getElementById('join-screen').classList.add('active');
  document.getElementById('phaser-game').style.display = 'none';
  document.getElementById('game-info-section').style.display = 'none';
  document.getElementById('join-existing-section').style.display = 'none';
  document.getElementById('player-name').value = '';
  
  if (gameInstance) {
    gameInstance.destroy();
    gameInstance = null;
  }
  if (syncInterval) clearInterval(syncInterval);
}

function resetToMenu() {
  if (gameInstance) {
    gameInstance.destroy();
    gameInstance = null;
  }
  if (syncInterval) clearInterval(syncInterval);
  
  // Reload page
  location.reload();
}

// ============================================================================
// Initialization on Page Load
// ============================================================================

window.addEventListener('load', () => {
  // Check if there's a gameId in URL
  const urlParams = new URLSearchParams(window.location.search);
  const gameId = urlParams.get('gameId');

  if (gameId) {
    // Pre-fill with game ID for easy joining
    document.getElementById('game-link-input').value = window.location.href;
    document.getElementById('join-screen').classList.add('active');
  } else {
    document.getElementById('join-screen').classList.add('active');
  }
});
