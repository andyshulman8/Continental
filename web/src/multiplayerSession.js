/**
 * Multiplayer Session Manager
 * Handles local multiplayer synchronization across browser tabs
 */

class MultiplayerSession {
  constructor(gameId, playerId, playerName, playerCount) {
    this.gameId = gameId;
    this.playerId = playerId;
    this.playerName = playerName;
    this.playerCount = playerCount;
    this.storagePrefix = `game_${gameId}`;
    this.initialized = false;
    this.players = [];
    this.gameState = null;
    this.currentViewingPlayerId = playerId;
    this.callbacks = [];
    this.lastKnownData = null;
    this.watchInterval = null;
  }

  /**
   * Initialize a new game session
   */
  initializeNewGame() {
    const sessionData = {
      gameId: this.gameId,
      playerCount: this.playerCount,
      players: [],
      gameState: null,
      messages: [],
      dealerPicks: {},
      dealerResult: null,
      // Cut position (0-based index) for first hand; set by dealer before deal
      dealerCutPosition: null,
      // Same deck order for all tabs: array of { s, r, j } for each card
      dealerCardOrder: null,
      createdAt: Date.now(),
      status: 'waiting' // waiting, in_progress, completed
    };

    // Register this player
    sessionData.players.push({
      id: this.playerId,
      name: this.playerName,
      joinedAt: Date.now(),
      isReady: false
    });

    console.info(`[MultiplayerSession] initializeNewGame: creating session ${this.storagePrefix}`, sessionData);
    this.saveSession(sessionData);
    this.initialized = true;
    return sessionData;
  }

  /**
   * Send a quick message to the session (stored in localStorage)
   */
  sendMessage(text) {
    const sessionData = this.getSession();
    if (!sessionData) return null;
    const msg = {
      fromId: this.playerId,
      fromName: this.playerName,
      text: text,
      timestamp: Date.now()
    };
    sessionData.messages = sessionData.messages || [];
    sessionData.messages.push(msg);
    this.saveSession(sessionData);
    this.notifyListeners('message_sent', msg);
    return msg;
  }

  /**
   * Join an existing game session
   */
  joinGame() {
    const sessionData = this.getSession();
    
    if (!sessionData) {
      console.warn(`[MultiplayerSession] joinGame: no session found for ${this.storagePrefix}`);
      return null;
    }

    // Check if player already joined
    const existingPlayer = sessionData.players.find(p => p.id === this.playerId);
    if (existingPlayer) {
      console.info(`[MultiplayerSession] joinGame: player already in session`, existingPlayer);
      return sessionData;
    }

    // Check if game is full
    if (sessionData.players.length >= sessionData.playerCount) {
      console.warn(`[MultiplayerSession] joinGame: session full (${sessionData.players.length}/${sessionData.playerCount})`);
      return null;
    }

    // Add this player
    sessionData.players.push({
      id: this.playerId,
      name: this.playerName,
      joinedAt: Date.now(),
      isReady: false
    });

    console.info(`[MultiplayerSession] joinGame: adding player ${this.playerId} to ${this.storagePrefix}`, sessionData.players.map(p => p.id));
    this.saveSession(sessionData);
    this.initialized = true;
    
    // Notify listeners immediately after joining
    this.notifyListeners('player_joined', sessionData);
    
    return sessionData;
  }

  /**
   * Get current session data
   */
  getSession() {
    const stored = localStorage.getItem(this.storagePrefix);
    try {
      const parsed = stored ? JSON.parse(stored) : null;
      console.debug(`[MultiplayerSession] getSession: key=${this.storagePrefix} found=${!!parsed}` , parsed ? parsed.players.map(p => p.id) : null);
      return parsed;
    } catch (e) {
      console.error(`[MultiplayerSession] getSession: error parsing session for ${this.storagePrefix}`, e);
      return null;
    }
  }

  /**
   * Save session data
   */
  saveSession(sessionData) {
    try {
      localStorage.setItem(this.storagePrefix, JSON.stringify(sessionData));
      console.debug(`[MultiplayerSession] saveSession: saved ${this.storagePrefix}`, sessionData.players.map(p => p.id));
      this.notifyListeners('session_updated', sessionData);
    } catch (e) {
      console.error(`[MultiplayerSession] saveSession: failed to write session ${this.storagePrefix}`, e);
    }
  }

  /**
   * Update game state in session
   */
  updateGameState(gameState) {
    const sessionData = this.getSession();
    if (sessionData) {
      sessionData.gameState = this.serializeGameState(gameState);
      sessionData.lastUpdated = Date.now();
      sessionData.lastUpdatedByPlayer = this.playerId;
      console.info(`[MultiplayerSession] updateGameState: player=${this.playerId} updating gameState lastUpdated=${sessionData.lastUpdated}`);
      this.saveSession(sessionData);
    }
  }

  /**
   * Serialize game state for storage. Uses GameState.serialize() so the FULL
   * authoritative state (deck order, all hands, melds) is synced — other tabs
   * rebuild their local GameState from this. Hand privacy is a display
   * concern: each tab only renders its own hand.
   */
  serializeGameState(gameState) {
    return gameState.serialize();
  }

  /**
   * Set this player's dealer selection (card index). No turn order - anyone can pick anytime.
   */
  setDealerPick(cardIndex) {
    const sessionData = this.getSession();
    if (!sessionData) return false;
    sessionData.dealerPicks = sessionData.dealerPicks || {};
    sessionData.dealerPicks[this.playerId] = cardIndex;
    this.saveSession(sessionData);
    return true;
  }

  /**
   * Get all dealer picks: { [playerId]: cardIndex }
   */
  getDealerPicks() {
    const sessionData = this.getSession();
    return (sessionData && sessionData.dealerPicks) ? sessionData.dealerPicks : {};
  }

  /**
   * True if this player has already picked a card for dealer selection
   */
  hasDealerPick() {
    const picks = this.getDealerPicks();
    return this.playerId in picks;
  }

  /**
   * True if every player in the session has made a dealer pick
   */
  areAllDealerPicksIn() {
    const sessionData = this.getSession();
    if (!sessionData || sessionData.players.length < sessionData.playerCount) return false;
    const picks = sessionData.dealerPicks || {};
    return sessionData.players.every(p => p.id in picks);
  }

  /**
   * Store dealer result (game state player index) so all tabs can sync and start the hand
   */
  setDealerResult(dealerPlayerIndex) {
    const sessionData = this.getSession();
    if (!sessionData) return false;
    sessionData.dealerResult = dealerPlayerIndex;
    this.saveSession(sessionData);
    return true;
  }

  /**
   * Get dealer result (game state index) if set
   */
  getDealerResult() {
    const sessionData = this.getSession();
    return sessionData && sessionData.dealerResult != null ? sessionData.dealerResult : null;
  }

  /**
   * Set dealer cut position (0-based index) so all tabs use same cut for first hand
   */
  setDealerCutPosition(cutIndex) {
    const sessionData = this.getSession();
    if (!sessionData) return false;
    sessionData.dealerCutPosition = cutIndex;
    this.saveSession(sessionData);
    return true;
  }

  /**
   * Get dealer cut position if set
   */
  getDealerCutPosition() {
    const sessionData = this.getSession();
    return sessionData && sessionData.dealerCutPosition != null ? sessionData.dealerCutPosition : null;
  }

  /**
   * Get this tab's player index (0..playerCount-1) from session order
   */
  getMyPlayerIndex() {
    const sessionData = this.getSession();
    if (!sessionData || !sessionData.players) return 0;
    const idx = sessionData.players.findIndex(p => p.id === this.playerId);
    return idx >= 0 ? idx : 0;
  }

  /**
   * Get or set dealer selection deck order so all tabs use same cards. Each item: { s, r, j }
   */
  getDealerCardOrder() {
    const sessionData = this.getSession();
    return (sessionData && sessionData.dealerCardOrder) || null;
  }

  setDealerCardOrder(order) {
    const sessionData = this.getSession();
    if (!sessionData) return false;
    sessionData.dealerCardOrder = order;
    this.saveSession(sessionData);
    return true;
  }

  /**
   * Check if all players are ready
   */
  areAllPlayersReady() {
    const sessionData = this.getSession();
    if (!sessionData || sessionData.players.length < sessionData.playerCount) {
      return false;
    }
    const everyone = sessionData.players.every(p => p.isReady);
    console.debug(`[MultiplayerSession] areAllPlayersReady: ${everyone} players=${sessionData.players.map(p => ({id:p.id,ready:p.isReady}))}`);
    return everyone;
  }

  /**
   * Mark current player as ready
   */
  markPlayerReady() {
    const sessionData = this.getSession();
    if (sessionData) {
      const player = sessionData.players.find(p => p.id === this.playerId);
      if (player) {
        console.info(`[MultiplayerSession] markPlayerReady: marking ready ${this.playerId}`);
        player.isReady = true;
        this.saveSession(sessionData);
      }
    }
  }

  /**
   * Signal that the game has been started (so other tabs can start too).
   * Sets session status to 'in_progress' and saves.
   */
  signalGameStarted() {
    const sessionData = this.getSession();
    if (!sessionData) return false;
    if (sessionData.players.length < sessionData.playerCount) return false;
    sessionData.status = 'in_progress';
    sessionData.gameStartedAt = Date.now();
    this.saveSession(sessionData);
    this.notifyListeners('game_started', sessionData);
    return true;
  }

  /**
   * Check game session status
   */
  getGameStatus() {
    const sessionData = this.getSession();
    if (!sessionData) {
      return 'not_found';
    }

    if (sessionData.status === 'completed') {
      return 'completed';
    }

    if (sessionData.players.length < sessionData.playerCount) {
      return 'waiting_for_players';
    }

    if (sessionData.gameState === null) {
      if (this.areAllPlayersReady()) {
        return 'ready_to_start';
      }
      return 'not_ready';
    }

    return 'in_progress';
  }

  /**
   * Get all players in session
   */
  getPlayers() {
    const sessionData = this.getSession();
    return sessionData ? sessionData.players : [];
  }

  /**
   * Get player count needed
   */
  getPlayerCountNeeded() {
    const sessionData = this.getSession();
    return sessionData ? sessionData.playerCount - sessionData.players.length : 0;
  }

  /**
   * Listen for session changes
   */
  onSessionUpdate(callback) {
    this.callbacks.push(callback);
  }

  notifyListeners(event, data) {
    // Log and dispatch
    try {
      console.debug(`[MultiplayerSession] notifyListeners: event=${event}`, data && data.players ? data.players.map(p=>p.id) : data);
    } catch(e) {}
    this.callbacks.forEach(cb => cb(event, data));
  }

  /**
   * Clean up session
   */
  deleteSession() {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
    localStorage.removeItem(this.storagePrefix);
    this.notifyListeners('session_deleted', null);
  }

  /**
   * Watch for changes across tabs using storage events
   */
  startWatchingSession() {
    window.addEventListener('storage', (e) => {
      if (e.key === this.storagePrefix) {
        const newData = JSON.parse(e.newValue || '{}');
        console.info(`[MultiplayerSession] startWatchingSession: storage event for ${this.storagePrefix}`, newData.players ? newData.players.map(p => p.id) : null);
        this.notifyListeners('session_changed', newData);
      }
    });
    
    // Also start internal polling as a fallback for same-tab updates
    // More aggressive polling (50ms) to catch changes quickly
    this.watchInterval = setInterval(() => {
      const currentData = this.getSession();
      const asString = currentData ? JSON.stringify(currentData) : null;
      if (asString && asString !== this.lastKnownData) {
        this.lastKnownData = asString;
        console.debug(`[MultiplayerSession] startWatchingSession: polling detected change for ${this.storagePrefix}`);
        this.notifyListeners('session_changed', currentData);
      }
    }, 50);
  }
}
