/**
 * Phaser Game Scene - handles all game display and user interaction
 */

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.gameState = null;
    this.multiplayerSession = null;
    this.selectedCards = [];
    this.stagedMelds = []; // melds played toward the go-down requirement, not yet committed
    this._lastAppliedRemoteTs = 0;
    this.cardSprites = new Map();
    this.hasDrawnThisTurn = false;
    this.gameStarted = false;
    this.dealerSelectionCards = [];
    this.dealerPlayerSelections = [];
    this.dealerCurrentPlayerIndex = 0;
    this.dealerCardSprites = [];
    this.dealerSelectionPlayerText = null;
    this.dealerSelectionInstructionText = null;
    this.dealerRevealPhase = false;
    this.currentPlayerId = localStorage.getItem('playerId') || this.generatePlayerId();
    this.gameId = new URLSearchParams(window.location.search).get('gameId') || this.generateGameId();
    // Quick messages - editable by developer
    this.quickMessages = ["¿Vas a ganar?", "¡Buena jugada!", "¡Suerte!", "¡Estás haciendo trampa!"];
    this.lastDisplayedMessageTimestamp = 0;
  }

  create() {
    this.myPlayerIndex = (this.multiplayerSession && typeof this.multiplayerSession.getMyPlayerIndex === 'function')
      ? this.multiplayerSession.getMyPlayerIndex() : 0;
    this.setupUI();

    if (!this.gameStarted && this.gameState.currentHandNumber === 1) {
      this.showDealerSelection();
    } else if (this.gameStarted) {
      this.updateDisplay();
    }
  }

  init(data) {
    this.gameState = data.gameState || new GameState(2);
    this.multiplayerSession = data.session || null;
    if (data.gameStarted != null) this.gameStarted = data.gameStarted;
    if (this.multiplayerSession) {
      this.multiplayerSession.onSessionUpdate((event, sessionData) => {
        if ((event === 'session_changed' || event === 'session_updated' || event === 'message_sent') && sessionData && sessionData.messages && sessionData.messages.length > 0) {
          const last = sessionData.messages[sessionData.messages.length - 1];
          this.displayIncomingMessage(last);
        }
        if ((event === 'session_changed' || event === 'session_updated') && sessionData) {
          this.applyRemoteState(sessionData);
        }
      });
    }
  }

  /**
   * Apply game state written by another player's tab. This is what makes
   * draws/melds/discards visible across tabs — without it each tab only
   * ever sees its own moves.
   */
  applyRemoteState(sessionData) {
    try {
      if (!this.gameStarted || !sessionData || !sessionData.gameState) return;
      if (!this.multiplayerSession) return;
      // Ignore our own writes
      if (sessionData.lastUpdatedByPlayer === this.multiplayerSession.playerId) return;
      const ts = sessionData.gameState.timestamp || 0;
      if (ts <= this._lastAppliedRemoteTs) return; // stale or already applied
      this._lastAppliedRemoteTs = ts;

      const wasMyTurn = this.gameState && this.gameState.currentPlayerIndex === this.myPlayerIndex;
      this.gameState = GameState.deserialize(sessionData.gameState);
      const isMyTurn = this.gameState.currentPlayerIndex === this.myPlayerIndex;
      if (isMyTurn && !wasMyTurn) {
        this.hasDrawnThisTurn = false; // turn just passed to me
      }
      // Card object references from the old state are now stale
      this.selectedCards = [];
      this.stagedMelds = [];

      if (this.gameState.isGameOver()) {
        this.showGameOver();
        return;
      }
      this.updateDisplay();
    } catch (err) {
      console.error('[GameScene] applyRemoteState failed:', err);
    }
  }

  /** Push the full authoritative state to the session after a local move */
  pushState() {
    if (this.multiplayerSession) {
      this.multiplayerSession.updateGameState(this.gameState);
    }
  }

  /** Small fading notice for rule feedback (invalid meld, incomplete go-down, etc.) */
  showTransientMessage(text) {
    try {
      const { playWidth } = this.getTableLayout();
      if (this._transientMsg) this._transientMsg.destroy();
      this._transientMsg = this.add.text(playWidth / 2, 64, text, {
        fontSize: '16px',
        color: '#ffd54f',
        backgroundColor: '#000000aa',
        padding: { x: 12, y: 6 }
      }).setOrigin(0.5).setDepth(200);
      this.time.delayedCall(2500, () => {
        if (this._transientMsg) { this._transientMsg.destroy(); this._transientMsg = null; }
      });
    } catch (e) {
      console.warn(text);
    }
  }

  /** Width reserved for the permanent scorecard on the right */
  static get SCORECARD_WIDTH() { return 200; }

  /** Oval table center and radii (used for drawing table and seats). Table is centered in play area (left of scorecard). */
  getTableLayout() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const playWidth = width - GameScene.SCORECARD_WIDTH;
    const cx = playWidth / 2;
    const cy = height / 2;
    const radiusX = Math.min(playWidth * 0.48, 520);
    const radiusY = Math.min(height * 0.36, 280);
    return { cx, cy, radiusX, radiusY, width, height, playWidth, scorecardLeft: width - GameScene.SCORECARD_WIDTH };
  }

  /** Poker-style seat positions around the oval table: seat 0 = bottom (you), then clockwise. */
  getSeatPositions() {
    const { cx, cy, radiusX, radiusY } = this.getTableLayout();
    const n = this.gameState.players.length;
    // Angle in degrees: 90 = bottom, 0 = right, 180 = left, 270 = top
    const place = (deg) => {
      const rad = (deg * Math.PI) / 180;
      return { x: cx + radiusX * Math.cos(rad), y: cy + radiusY * Math.sin(rad), angle: deg };
    };
    if (n === 2) {
      return [place(90), place(270)];
    }
    if (n === 3) {
      return [place(90), place(210), place(330)];
    }
    if (n === 4) {
      return [place(90), place(270), place(180), place(0)];
    }
    return [place(90)];
  }

  seatToPlayerIndex(seatIndex) {
    const n = this.gameState.players.length;
    return (this.myPlayerIndex + seatIndex) % n;
  }

  setupUI() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillGradientStyle(0x0d4a2e, 0x0d4a2e, 0x1a5f3f, 0x1a5f3f, 1);
    graphics.fillRect(0, 0, width, height);
    graphics.generateTexture('beachGradient', width, height);
    graphics.destroy();
    this.add.image(width / 2, height / 2, 'beachGradient');

    // Oval poker table (Governor of Poker style). Hidden until cards are dealt.
    const layout = this.getTableLayout();
    this.tableGraphic = this.add.graphics();
    this.tableGraphic.fillStyle(0x0a3d1e, 1);
    this.tableGraphic.lineStyle(12, 0x5d4037, 1);
    this.tableGraphic.fillEllipse(layout.cx, layout.cy, layout.radiusX, layout.radiusY);
    this.tableGraphic.strokeEllipse(layout.cx, layout.cy, layout.radiusX, layout.radiusY);
    this.tableGraphic.setDepth(1);
    this.tableGraphic.setVisible(this.gameStarted === true);

    const { playWidth, scorecardLeft } = this.getTableLayout();

    // Title and single status line — no stacking (centered in play area)
    this.add.text(playWidth / 2, 12, 'Continental', {
      fontSize: '22px',
      color: '#FFFFFF',
      align: 'center',
      fontStyle: 'bold',
      fontFamily: 'Arial'
    }).setOrigin(0.5, 0).setDepth(10);

    this.gameStatusText = this.add.text(playWidth / 2, 38, '', {
      fontSize: '13px',
      color: '#E8F5E9',
      align: 'center',
      fontStyle: 'bold',
      backgroundColor: '#00000040',
      padding: { x: 12, y: 4 },
      borderRadius: 8
    }).setOrigin(0.5, 0).setDepth(10);

    this.handRequirementText = this.add.text(playWidth / 2, 60, '', {
      fontSize: '11px',
      color: '#C8E6C9',
      align: 'center',
      fontStyle: 'italic'
    }).setOrigin(0.5, 0).setDepth(10);

    this.playerStatusText = this.add.text(playWidth / 2, 78, '', {
      fontSize: '10px',
      color: '#A5D6A7',
      align: 'center'
    }).setOrigin(0.5, 0).setDepth(10);

    // Dealer and players: just left of scorecard
    this.dealerChipText = this.add.text(scorecardLeft - 14, 38, 'Dealer', {
      fontSize: '11px',
      color: '#FFF59D',
      fontStyle: 'bold',
      backgroundColor: '#00000050',
      padding: { x: 8, y: 4 },
      borderRadius: 6
    }).setOrigin(1, 0).setDepth(10);

    this.playersInRoomText = this.add.text(scorecardLeft - 14, 58, '', {
      fontSize: '10px',
      color: '#C8E6C9',
      align: 'right',
      backgroundColor: '#00000030',
      padding: { x: 6, y: 3 },
      borderRadius: 6,
      wordWrap: { width: 140 }
    }).setOrigin(1, 0).setDepth(10);

    this.handContainer = this.add.container(0, 0);
    this._handDragStart = null;
    this._handDragging = null;
    this.input.on('pointermove', (ptr) => this.handleHandPointerMove(ptr));
    this.input.on('pointerup', (ptr) => this.handleHandPointerUp(ptr));

    this.discardDisplay = this.add.text(playWidth / 2 - 120, height - 28, '', {
      fontSize: '11px',
      color: '#ffffff',
      backgroundColor: '#00000040',
      padding: { x: 6, y: 3 },
      borderRadius: 4
    }).setOrigin(0.5, 0.5).setDepth(10);

    this.stockDisplay = this.add.text(playWidth / 2 + 80, height - 28, '', {
      fontSize: '11px',
      color: '#ffffff',
      backgroundColor: '#00000040',
      padding: { x: 6, y: 3 },
      borderRadius: 4
    }).setOrigin(0.5, 0.5).setDepth(10);

    this.createGameButtons();
    this.updateScorecard();
  }

  createGameButtons() {
    const { playWidth } = this.getTableLayout();
    const height = this.cameras.main.height;
    const buttonY = height - 58;
    const buttonWidth = 82;
    const buttonHeight = 32;
    const step = 88;

    const buttons = [
      { x: playWidth / 2 - 2 * step, text: 'Draw Stock', action: () => this.drawFromStock() },
      { x: playWidth / 2 - step, text: 'Draw Discard', action: () => this.drawFromDiscard() },
      { x: playWidth / 2, text: 'Play Melds', action: () => this.playMelds() },
      { x: playWidth / 2 + step, text: 'Discard', action: () => this.discardCard() },
      { x: playWidth / 2 + 2 * step, text: 'Hard Mode', action: () => this.toggleHardMode() }
    ];

    buttons.forEach(btn => {
      const button = this.add.rectangle(btn.x, buttonY, buttonWidth, buttonHeight, 0x2E7D32);
      button.setInteractive();
      button.on('pointerdown', btn.action);
      button.on('pointerover', () => button.setFillStyle(0x388E3C));
      button.on('pointerout', () => button.setFillStyle(0x2E7D32));
      button.setDepth(10);
      this.add.text(btn.x, buttonY, btn.text, {
        fontSize: '10px',
        color: '#ffffff',
        align: 'center',
        fontStyle: 'bold',
        fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(11);
    });

    // Top-right buttons (left of scorecard)
    const { scorecardLeft } = this.getTableLayout();
    const topButtonY = 15;

    // Share link button with modern theme
    const shareBtn = this.add.rectangle(scorecardLeft - 130, topButtonY, 100, 30, 0x14B8A6);
    shareBtn.setInteractive();
    shareBtn.on('pointerdown', () => this.showGameLinkDialog());
    shareBtn.on('pointerover', () => shareBtn.setFillStyle(0x0D9488));
    shareBtn.on('pointerout', () => shareBtn.setFillStyle(0x14B8A6));
    shareBtn.setDepth(10);
    
    this.add.text(scorecardLeft - 130, topButtonY, '🔗 Share', {
      fontSize: '12px',
      color: '#ffffff',
      align: 'center',
      fontStyle: 'bold',
      fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(11);

    // Chat / quick messages button with beach vibes
    const chatBtn = this.add.rectangle(scorecardLeft - 250, topButtonY, 100, 30, 0x84CC16);
    chatBtn.setInteractive();
    chatBtn.on('pointerdown', () => this.showQuickMessagesMenu());
    chatBtn.on('pointerover', () => chatBtn.setFillStyle(0x65A30D));
    chatBtn.on('pointerout', () => chatBtn.setFillStyle(0x84CC16));
    chatBtn.setDepth(10);
    this.add.text(scorecardLeft - 250, topButtonY, '💬 Mensajes', {
      fontSize: '12px',
      color: '#ffffff',
      align: 'center',
      fontStyle: 'bold',
      fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(11);
  }

  // Show a quick messages menu and let player pick a preset
  showQuickMessagesMenu() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    // Overlay
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000).setAlpha(0.5);
    overlay.setInteractive();
    overlay.on('pointerdown', () => {
      overlay.destroy();
      menuContainer.destroy();
    });

    const menuContainer = this.add.container(width - 200, 120);
    const bg = this.add.rectangle(0, 0, 260, this.quickMessages.length * 46 + 20, 0x14B8A6);
    bg.setStrokeStyle(2, 0xFCD34D);
    menuContainer.add(bg);

    for (let i = 0; i < this.quickMessages.length; i++) {
      const y = -bg.height / 2 + 20 + i * 46 + 23;
      const btn = this.add.rectangle(0, y, 240, 38, 0x06B6D4);
      btn.setInteractive();
      btn.on('pointerdown', () => {
        this.sendQuickMessage(this.quickMessages[i]);
        overlay.destroy();
        menuContainer.destroy();
      });
      btn.on('pointerover', () => btn.setFillStyle(0x0D9488));
      btn.on('pointerout', () => btn.setFillStyle(0x06B6D4));
      menuContainer.add(btn);
      const txt = this.add.text(0, y, this.quickMessages[i], { fontSize: '13px', color: '#FFFFFF', fontFamily: 'Arial', fontStyle: 'bold' }).setOrigin(0.5);
      menuContainer.add(txt);
    }
  }

  sendQuickMessage(text) {
    // Send via session if available
    if (this.multiplayerSession && typeof this.multiplayerSession.sendMessage === 'function') {
      const msg = this.multiplayerSession.sendMessage(text);
      if (msg) this.displayIncomingMessage(msg);
    } else {
      // Local display only
      const msg = { fromId: this.currentPlayerId, fromName: 'You', text: text, timestamp: Date.now() };
      this.displayIncomingMessage(msg);
    }
  }

  displayIncomingMessage(msg) {
    // Only display new messages
    if (msg.timestamp && msg.timestamp <= this.lastDisplayedMessageTimestamp) return;
    this.lastDisplayedMessageTimestamp = msg.timestamp || Date.now();

    const width = this.cameras.main.width;
    const y = 60;
    const label = this.add.text(width / 2, y, `${msg.fromName}: ${msg.text}`, { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
    label.setDepth(1000);
    this.tweens.add({ targets: label, alpha: 0, delay: 2000, duration: 2000, onComplete: () => label.destroy() });
  }

  showDealerSelection() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const session = this.multiplayerSession;

    // Shared deck order: use session so all tabs see same cards
    let order = session && session.getDealerCardOrder ? session.getDealerCardOrder() : null;
    if (!order || order.length === 0) {
      const selectionDeck = new Deck(2);
      this.dealerSelectionCards = selectionDeck.cards.slice();
      order = this.dealerSelectionCards.map(c => ({ s: c.suit, r: c.rank, j: c.isJoker }));
      if (session && session.setDealerCardOrder) session.setDealerCardOrder(order);
    } else {
      this.dealerSelectionCards = order.map(o => new Card(o.s, o.r, o.j));
    }

    // Poker table: seats (names only) around the table
    const seats = this.getSeatPositions();
    seats.forEach((pos, seatIndex) => {
      const playerIndex = this.seatToPlayerIndex(seatIndex);
      const name = this.gameState.players[playerIndex].name;
      const label = this.add.text(pos.x, pos.y, name, {
        fontSize: '14px',
        color: seatIndex === 0 ? '#FFF59D' : '#E0E0E0',
        align: 'center',
        fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(10);
    });

    this.dealerSelectionInstructionText = this.add.text(width / 2, 42, 'Pick a card — highest becomes dealer. Everyone picks at once.', {
      fontSize: '12px',
      color: '#B0BEC5',
      align: 'center'
    }).setOrigin(0.5).setDepth(10);

    // Tight card grid in center (multiple rows so all show)
    const cardWidth = 28;
    const cardHeight = 40;
    const cardSpacing = 4;
    const maxCardsPerRow = Math.floor((width - 60) / (cardWidth + cardSpacing));
    const cardsPerRow = Math.min(maxCardsPerRow, 26);
    const numRows = Math.ceil(this.dealerSelectionCards.length / cardsPerRow);
    const startY = 68;
    const totalWidth = Math.min(cardsPerRow * (cardWidth + cardSpacing), width - 60);
    const startX = (width - totalWidth) / 2 + (cardWidth + cardSpacing) / 2;

    this.dealerCardSprites = [];
    this.dealerSelectionContainer = this.add.container(0, 0);

    this.dealerSelectionCards.forEach((card, index) => {
      const row = Math.floor(index / cardsPerRow);
      const col = index % cardsPerRow;
      const xPos = startX + col * (cardWidth + cardSpacing);
      const yPos = startY + row * (cardHeight + cardSpacing);

      const cardRect = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x1a3a5f);
      cardRect.setStrokeStyle(1, 0x4a6faf).setOrigin(0.5, 0.5);
      const backText = this.add.text(0, 0, '🂠', { fontSize: '14px' }).setOrigin(0.5);
      const faceText = this.add.text(0, 0, `${card.rankName} ${card.suitSymbol}`, {
        fontSize: '10px',
        color: card.isRed ? '#d32f2f' : '#212121',
        align: 'center',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      faceText.setVisible(false);

      const cardContainer = this.add.container(xPos, yPos, [cardRect, backText, faceText]);
      cardContainer.setOrigin(0.5, 0.5);
      cardContainer.setName(`dealerCard_${index}`);
      cardContainer.setInteractive(new Phaser.Geom.Rectangle(-cardWidth/2, -cardHeight/2, cardWidth, cardHeight), Phaser.Geom.Rectangle.Contains);
      cardContainer.on('pointerover', () => { cardRect.setFillStyle(0x2a5aaf); });
      cardContainer.on('pointerout', () => { cardRect.setFillStyle(0x1a3a5f); });
      cardContainer.on('pointerdown', () => this.handleDealerCardPick(index));

      this.dealerCardSprites.push({ container: cardContainer, cardRect, card, backText, faceText, flipped: false });
      this.dealerSelectionContainer.add(cardContainer);
    });

    // Cards-at-seats container (updated when picks change)
    this.dealerPicksAtSeatsContainer = this.add.container(0, 0);
    this.dealerSelectionCheckInterval = this.time.addEvent({
      delay: 200,
      callback: this.pollDealerSelection,
      callbackScope: this,
      loop: true
    });
    this.refreshDealerPicksAtSeats();
  }

  pollDealerSelection() {
    const session = this.multiplayerSession;
    if (!session) return;
    const result = session.getDealerResult && session.getDealerResult();
    if (result != null) {
      if (this.dealerSelectionCheckInterval) this.dealerSelectionCheckInterval.destroy();
      this.dealerSelectionCheckInterval = null;
      this.gameState.dealerChipIndex = result;
      this.showDealerCutPhase();
      return;
    }
    if (session.areAllDealerPicksIn && session.areAllDealerPicksIn()) {
      if (!this.dealerRevealPhase) {
        this.dealerRevealPhase = true;
        if (this.dealerSelectionInstructionText) {
          this.dealerSelectionInstructionText.destroy();
          this.dealerSelectionInstructionText = null;
        }
        // Flip all chosen cards so everyone can see the outcome
        const sessionData = session.getSession();
        const picks = sessionData.dealerPicks || {};
        Object.values(picks).forEach((cardIndex) => {
          if (cardIndex != null) this.flipDealerCardInGrid(cardIndex);
        });
        this.refreshDealerPicksAtSeats();
        // Delay then determine dealer and transition to cut
        this.time.delayedCall(2500, () => {
          this.determineDealerFromSessionPicks();
        });
      }
    }
    this.refreshDealerPicksAtSeats();
  }

  /**
   * After dealer is chosen: dealer cuts the deck for -100 bonus chance, then we deal.
   */
  showDealerCutPhase() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const session = this.multiplayerSession;
    const dealerIndex = this.gameState.dealerChipIndex;
    const iAmDealer = !session || this.myPlayerIndex === dealerIndex;

    // Hide dealer selection UI
    this.dealerRevealPhase = false;
    if (this.dealerSelectionInstructionText) {
      this.dealerSelectionInstructionText.destroy();
      this.dealerSelectionInstructionText = null;
    }
    if (this.dealerSelectionContainer) {
      this.dealerSelectionContainer.removeAll(true);
      this.dealerSelectionContainer.setVisible(false);
    }
    if (this.dealerPicksAtSeatsContainer) {
      this.dealerPicksAtSeatsContainer.removeAll(true);
      this.dealerPicksAtSeatsContainer.setVisible(false);
    }

    if (!iAmDealer && session) {
      // Waiting for dealer to cut
      this.dealerCutWaitingText = this.add.text(width / 2, height / 2, 'Waiting for dealer to cut the deck…', {
        fontSize: '18px',
        color: '#E8F5E9',
        align: 'center'
      }).setOrigin(0.5).setDepth(20);
      this.dealerCutCheckInterval = this.time.addEvent({
        delay: 200,
        callback: this.pollDealerCutDone,
        callbackScope: this,
        loop: true
      });
      return;
    }

    // Dealer: show cut UI — vertical stack of cards (52*2 = 104 visible layers)
    const deckSize = this.gameState.numDecksNeeded * 54;
    const dealerName = this.gameState.players[dealerIndex].name;
    this.dealerCutTitleContainer = this.add.container(width / 2, 0);
    this.dealerCutTitleContainer.add(this.add.text(0, height / 2 - 120, `${dealerName} cuts the deck`, {
      fontSize: '20px',
      color: '#FFD700',
      align: 'center',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(20));
    this.dealerCutTitleContainer.add(this.add.text(0, height / 2 - 90, 'Tap anywhere on the stack to cut. Hit the right size for -100 bonus!', {
      fontSize: '14px',
      color: '#C8E6C9',
      align: 'center'
    }).setOrigin(0.5).setDepth(20));

    const stackCenterX = width / 2;
    const stackCenterY = height / 2 + 30;
    const cardEdgeW = 88;
    const cardEdgeH = 2.2;
    const layersTotal = 104;
    const stackHeight = layersTotal * cardEdgeH;
    const stackHalfH = stackHeight / 2;

    const deckStackContainer = this.add.container(stackCenterX, stackCenterY);
    deckStackContainer.setDepth(19);

    for (let i = 0; i < layersTotal; i++) {
      const y = -stackHalfH + i * cardEdgeH + cardEdgeH / 2;
      const slightX = (i % 4 - 2) * 0.6;
      const rect = this.add.rectangle(slightX, y, cardEdgeW, cardEdgeH, 0x1a3a5f);
      rect.setStrokeStyle(1, i % 2 === 0 ? 0x2a4a7f : 0x1e3a6a);
      deckStackContainer.add(rect);
    }

    const deckLabel = this.add.text(stackCenterX, stackCenterY + stackHalfH + 28, 'Tap stack to cut', {
      fontSize: '14px',
      color: 'rgba(255,255,255,0.9)'
    }).setOrigin(0.5).setDepth(21);

    const hitW = cardEdgeW + 24;
    const hitH = stackHeight + 24;
    const hitRect = this.add.rectangle(stackCenterX, stackCenterY, hitW, hitH, 0x000000);
    hitRect.setAlpha(0).setDepth(22);
    hitRect.setInteractive(new Phaser.Geom.Rectangle(-hitW / 2, -hitH / 2, hitW, hitH), Phaser.Geom.Rectangle.Contains);
    hitRect.on('pointerdown', (pointer, localX, localY) => {
      const fraction = (localY + hitH / 2) / hitH;
      const cutIndex = Math.max(1, Math.min(deckSize - 2, Math.floor(fraction * deckSize)));
      this.finishDealerCut(cutIndex);
    });

    this.dealerCutDeckSprite = deckStackContainer;
    this.dealerCutHitRect = hitRect;
    this.dealerCutLabel = deckLabel;
  }

  pollDealerCutDone() {
    const session = this.multiplayerSession;
    if (!session) return;
    const cutPos = session.getDealerCutPosition && session.getDealerCutPosition();
    if (cutPos == null) return;
    if (this.dealerCutCheckInterval) {
      this.dealerCutCheckInterval.destroy();
      this.dealerCutCheckInterval = null;
    }
    if (this.dealerCutWaitingText) this.dealerCutWaitingText.destroy();
    const cutResult = this.gameState.prepareFirstHandDeckWithCut(cutPos);
    this.gameState.dealCards();
    this.runDealAnimationAndResult(cutResult);
  }

  finishDealerCut(cutIndex) {
    if (this.dealerCutTitleContainer) {
      this.dealerCutTitleContainer.destroy();
      this.dealerCutTitleContainer = null;
    }
    if (this.dealerCutDeckSprite) {
      this.dealerCutDeckSprite.destroy();
      this.dealerCutDeckSprite = null;
    }
    if (this.dealerCutHitRect) {
      this.dealerCutHitRect.destroy();
      this.dealerCutHitRect = null;
    }
    if (this.dealerCutLabel) {
      this.dealerCutLabel.destroy();
      this.dealerCutLabel = null;
    }
    if (this.multiplayerSession && this.multiplayerSession.setDealerCutPosition) {
      this.multiplayerSession.setDealerCutPosition(cutIndex);
    }
    const cutResult = this.gameState.prepareFirstHandDeckWithCut(cutIndex);
    this.gameState.dealCards();
    this.runDealAnimationAndResult(cutResult);
  }

  /** Card destination for deal animation: seat index -> { x, y } (table center for deck). */
  getDealDestinations() {
    const { width, height } = this.cameras.main;
    const { cx, cy } = this.getTableLayout();
    const seats = this.getSeatPositions();
    const n = this.gameState.players.length;
    const cardAreaOffset = 42;
    const dests = [];
    for (let seatIndex = 0; seatIndex < seats.length; seatIndex++) {
      const pos = seats[seatIndex];
      const dx = cx - pos.x;
      const dy = cy - pos.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      if (seatIndex === 0) {
        dests.push({ x: width / 2, y: height - 100 });
      } else {
        dests.push({
          x: pos.x + (dx / len) * cardAreaOffset,
          y: pos.y + (dy / len) * cardAreaOffset
        });
      }
    }
    return dests;
  }

  runDealAnimationAndResult(cutResult) {
    const { gotBonus, offBy, expected } = cutResult;
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const n = this.gameState.players.length;
    const cardsToDeal = 11 * n + 1;
    const dealOrder = [];
    for (let i = 0; i < 11 * n; i++) {
      dealOrder.push({ type: 'player', playerIndex: i % n });
    }
    dealOrder.push({ type: 'discard' });

    const dests = this.getDealDestinations();
    const deckCenterX = width / 2;
    const deckCenterY = height / 2 + 20;
    const discardX = width / 2 - 120;
    const discardY = height - 50;

    const cardW = 24;
    const cardH = 34;
    const dealSprites = [];
    const playerIndexToSeat = (pIdx) => (pIdx - this.myPlayerIndex + n) % n;

    let delay = 0;
    const dealDuration = 120;
    const dealStagger = 70;

    for (let i = 0; i < dealOrder.length; i++) {
      const order = dealOrder[i];
      let toX, toY;
      if (order.type === 'discard') {
        toX = discardX;
        toY = discardY;
      } else {
        const seatIndex = playerIndexToSeat(order.playerIndex);
        toX = dests[seatIndex].x;
        toY = dests[seatIndex].y;
      }
      const card = this.add.rectangle(deckCenterX, deckCenterY, cardW, cardH, 0x1a3a5f);
      card.setStrokeStyle(1, 0x4a6faf);
      card.setDepth(30);
      dealSprites.push(card);

      this.tweens.add({
        targets: card,
        x: toX,
        y: toY,
        duration: dealDuration,
        delay: delay,
        ease: 'Cubic.Out',
        onComplete: i === dealOrder.length - 1 ? () => this.onDealAnimationComplete(dealSprites, cutResult) : undefined
      });
      delay += dealStagger;
    }
  }

  onDealAnimationComplete(dealSprites, cutResult) {
    const { gotBonus, offBy, expected } = cutResult;
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const n = this.gameState.players.length;

    if (dealSprites) dealSprites.forEach((s) => s.destroy());

    const expectedWithDiscard = 11 * n + 1;
    const dealerIndex = this.gameState.dealerChipIndex;
    const dealerSeat = (dealerIndex - this.myPlayerIndex + n) % n;
    const seats = this.getSeatPositions();

    if (gotBonus) {
      const dealerPos = seats[dealerSeat];
      const bonusText = this.add.text(dealerPos.x, dealerPos.y - 48, '-100', {
        fontSize: '22px',
        color: '#FFD700',
        fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(35);
      this.tweens.add({ targets: bonusText, y: dealerPos.y - 70, alpha: 0.9, duration: 400, ease: 'Cubic.Out' });
      this.tweens.add({ targets: bonusText, scale: 1.3, duration: 200, yoyo: true, ease: 'Back.Out' });
      this.add.text(width / 2, height / 2 - 40, 'Perfect cut! -100 bonus!', {
        fontSize: '24px',
        color: '#FFD700',
        align: 'center',
        fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(34);
      const confetti = this.add.text(width / 2, height / 2, '★ ★ ★', {
        fontSize: '36px',
        color: '#FFF59D'
      }).setOrigin(0.5).setDepth(33);
      this.tweens.add({ targets: confetti, scale: 1.5, alpha: 0, duration: 800, ease: 'Cubic.Out' });
    } else {
      const absOff = Math.abs(offBy);
      const offText = this.add.text(width / 2, height / 2 - 20, `Off by ${absOff}`, {
        fontSize: '20px',
        color: '#FFAB91',
        align: 'center',
        fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(34);
      let stockMsg = '';
      if (offBy > 0) {
        stockMsg = `${offBy} extra card${offBy !== 1 ? 's' : ''} placed on stock`;
      } else if (offBy < 0) {
        stockMsg = `${absOff} card${absOff !== 1 ? 's' : ''} taken from stock to complete deal`;
      }
      this.add.text(width / 2, height / 2 + 18, stockMsg, {
        fontSize: '14px',
        color: '#C8E6C9',
        align: 'center'
      }).setOrigin(0.5).setDepth(34);
    }

    this.time.delayedCall(gotBonus ? 2200 : 1800, () => {
      this.gameStarted = true;
      this.scene.restart({ gameState: this.gameState, session: this.multiplayerSession });
    });
  }

  refreshDealerPicksAtSeats() {
    if (!this.dealerPicksAtSeatsContainer) return;
    this.dealerPicksAtSeatsContainer.removeAll(true);
    // Only show card faces at seats during reveal phase (after everyone has picked)
    if (!this.dealerRevealPhase) return;
    const session = this.multiplayerSession;
    if (!session || !session.getSession) return;
    const sessionData = session.getSession();
    const picks = sessionData.dealerPicks || {};
    const players = sessionData.players || [];
    const seats = this.getSeatPositions();

    for (let seatIndex = 0; seatIndex < seats.length; seatIndex++) {
      const playerIndex = this.seatToPlayerIndex(seatIndex);
      if (playerIndex >= players.length) continue;
      const pid = players[playerIndex].id;
      const cardIndex = picks[pid];
      if (cardIndex == null || !this.dealerSelectionCards || !this.dealerSelectionCards[cardIndex]) continue;
      const card = this.dealerSelectionCards[cardIndex];
      const pos = seats[seatIndex];
      const cardY = pos.y + (seatIndex === 0 ? -45 : 35);
      const face = this.add.text(pos.x, cardY, `${card.rankName} ${card.suitSymbol}`, {
        fontSize: '16px',
        color: card.isRed ? '#d32f2f' : '#212121',
        align: 'center',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      this.dealerPicksAtSeatsContainer.add(face);
    }
  }

  /**
   * Flip a dealer-selection card in the grid to show its face (with animation).
   */
  flipDealerCardInGrid(cardIndex) {
    const sprite = this.dealerCardSprites && this.dealerCardSprites[cardIndex];
    if (!sprite || sprite.flipped) return;
    sprite.flipped = true;
    const container = sprite.container;
    const backText = sprite.backText;
    const faceText = sprite.faceText;
    const flipDuration = 120;
    this.tweens.add({
      targets: container,
      scaleX: 0,
      duration: flipDuration,
      ease: 'Power2.In',
      onComplete: () => {
        backText.setVisible(false);
        faceText.setVisible(true);
        this.tweens.add({
          targets: container,
          scaleX: 1,
          duration: flipDuration,
          ease: 'Power2.Out'
        });
      }
    });
  }

  handleDealerCardPick(cardIndex) {
    const session = this.multiplayerSession;
    if (session && session.hasDealerPick && session.hasDealerPick()) return;
    const taken = session && session.getDealerPicks ? Object.values(session.getDealerPicks()) : [];
    if (taken.indexOf(cardIndex) >= 0) return;

    if (session && session.setDealerPick) session.setDealerPick(cardIndex);
    const sprite = this.dealerCardSprites[cardIndex];
    if (sprite) {
      sprite.cardRect.setStrokeStyle(2, 0xFFD700);
      sprite.cardRect.setFillStyle(0x2a5a8f);
    }
    this.flipDealerCardInGrid(cardIndex);
    this.refreshDealerPicksAtSeats();
  }

  determineDealerFromSessionPicks() {
    const session = this.multiplayerSession;
    if (!session || !session.getSession || session.getDealerResult()) return;
    const sessionData = session.getSession();
    const picks = sessionData.dealerPicks || {};
    const players = sessionData.players || [];
    if (players.length === 0 || !this.dealerSelectionCards) return;

    const selectedCards = players.map((_, idx) => {
      const cardIndex = picks[players[idx].id];
      return cardIndex != null ? this.dealerSelectionCards[cardIndex] : null;
    });
    if (selectedCards.some(c => c == null)) return;

    let highestIndex = 0;
    let highestValue = selectedCards[0].pointValue();
    for (let i = 1; i < selectedCards.length; i++) {
      const v = selectedCards[i].pointValue();
      if (v > highestValue) {
        highestValue = v;
        highestIndex = i;
      }
    }
    session.setDealerResult(highestIndex);
  }

  drawFromStock() {
    if (!this.gameStarted) return;
    if (this.gameState.currentPlayerIndex !== this.myPlayerIndex) return;
    const player = this.gameState.getCurrentPlayer();
    if (!this.hasDrawnThisTurn) {
      const card = this.gameState.deck.drawCard();
      if (card) {
        player.addCard(card);
        this.hasDrawnThisTurn = true;
        this.pushState();
        this.updateDisplay();
      }
    }
  }

  drawFromDiscard() {
    if (!this.gameStarted) return;
    if (this.gameState.currentPlayerIndex !== this.myPlayerIndex) return;

    const player = this.gameState.getCurrentPlayer();
    if (!this.hasDrawnThisTurn && this.gameState.discardPile.length > 0) {
      const card = this.gameState.discardPile.pop();
      if (card) {
        player.addCard(card);
        this.hasDrawnThisTurn = true;
        this.pushState();
        this.updateDisplay();
      }
    }
  }

  playMelds() {
    if (!this.gameStarted || this.gameState.currentPlayerIndex !== this.myPlayerIndex) return;
    if (this.selectedCards.length === 0 || !this.hasDrawnThisTurn) return;
    const player = this.gameState.getCurrentPlayer();
    const meld = new Meld(this.selectedCards.slice());

    if (player.hasGoneDown) {
      // Already down: play any additional valid meld, or add the selected
      // cards to an existing meld (own or opponents') — family rule.
      if (meld.type()) {
        player.addMeld(meld);
        this.selectedCards.forEach(card => player.removeCard(card));
        this.selectedCards = [];
        this.pushState();
        this.updateDisplay();
      } else if (this.tryAddToExistingMeld(this.selectedCards.slice())) {
        this.selectedCards = [];
        this.pushState();
        this.updateDisplay();
      } else {
        this.showTransientMessage('Not a valid meld or addition');
      }
      return;
    }

    // Not down yet: melds are staged against this hand's requirement and
    // only committed once the full requirement is met.
    if (!meld.type()) {
      this.showTransientMessage('Not a valid meld');
      return;
    }

    const req = this.gameState.getHandRequirement(this.gameState.getCurrentHand());
    const stagedSets = this.stagedMelds.filter(m => m.type() === MeldType.Set).length;
    const stagedRuns = this.stagedMelds.filter(m => m.type() === MeldType.Run).length;

    let slot = null;
    if (meld.type() === MeldType.Set && stagedSets < req.sets) slot = 'set';
    else if (meld.type() === MeldType.Run && stagedRuns < req.runs) slot = 'run';

    if (!slot) {
      const desc = this.gameState.getHandDescription(this.gameState.getCurrentHand());
      this.showTransientMessage(`This hand needs: ${desc}`);
      return;
    }

    this.stagedMelds.push(meld);
    this.selectedCards.forEach(card => player.removeCard(card));
    this.selectedCards = [];

    const doneSets = stagedSets + (slot === 'set' ? 1 : 0);
    const doneRuns = stagedRuns + (slot === 'run' ? 1 : 0);
    if (doneSets === req.sets && doneRuns === req.runs) {
      // Requirement complete — commit the go-down
      player.hasGoneDown = true;
      this.stagedMelds.forEach(m => player.addMeld(m));
      this.stagedMelds = [];
      this.pushState();
      this.showTransientMessage('You went down!');
    } else {
      this.showTransientMessage(`Staged ${doneSets + doneRuns}/${req.sets + req.runs} melds — keep going`);
    }
    this.updateDisplay();
  }

  /**
   * Try to add the selected cards to an existing meld on the table
   * (any player who has gone down). Returns true if they fit.
   */
  tryAddToExistingMeld(cards) {
    const player = this.gameState.getCurrentPlayer();
    for (const owner of this.gameState.players) {
      if (!owner.hasGoneDown) continue;
      for (const existing of owner.melds) {
        const combined = new Meld(existing.cards.concat(cards));
        if (combined.type()) {
          existing.cards = existing.cards.concat(cards);
          cards.forEach(c => player.removeCard(c));
          return true;
        }
      }
    }
    return false;
  }

  /** Return any staged (uncommitted) go-down cards to the player's hand */
  recallStagedMelds() {
    const player = this.gameState.players[this.myPlayerIndex];
    this.stagedMelds.forEach(m => m.cards.forEach(c => player.hand.push(c)));
    this.stagedMelds = [];
  }

  discardCard() {
    if (!this.gameStarted || this.gameState.currentPlayerIndex !== this.myPlayerIndex) return;
    if (!this.hasDrawnThisTurn || this.selectedCards.length === 0) return;

    const player = this.gameState.getCurrentPlayer();

    // Incomplete go-down: you can't end your turn mid-requirement.
    // Return staged cards to hand; the player can discard on the next click.
    if (!player.hasGoneDown && this.stagedMelds.length > 0) {
      this.recallStagedMelds();
      this.selectedCards = [];
      this.showTransientMessage('Go-down incomplete — staged cards returned to your hand');
      this.updateDisplay();
      return;
    }

    const card = this.selectedCards[0];

    if (player.hand.includes(card)) {
      player.removeCard(card);
      this.gameState.discardPile.push(card);
      this.selectedCards = [];
      this.hasDrawnThisTurn = false;

      // Check for win
      if (player.hand.length === 0) {
        this.gameState.endCurrentHand();
        this.pushState();
        if (this.gameState.isGameOver()) {
          this.showGameOver();
        } else {
          this.updateDisplay();
        }
      } else {
        this.gameState.nextPlayer();
        this.pushState();
        this.updateDisplay();
      }
    }
  }

  toggleHardMode() {
    if (this.gameState.currentPlayerIndex !== this.myPlayerIndex) return;
    const player = this.gameState.getCurrentPlayer();
    player.toggleHardMode();
    this.pushState();
    this.updateDisplay();
  }

  updateDisplay() {
    if (this.tableGraphic) this.tableGraphic.setVisible(this.gameStarted === true);
    const player = this.gameState.getCurrentPlayer();
    const hand = this.gameState.getCurrentHand();
    const handDesc = this.gameState.getHandDescription(hand);

    this.gameStatusText.setText(`Hand ${this.gameState.currentHandNumber}: ${handDesc}`);
    this.handRequirementText.setText(`${player.name} • ${player.hand.length} cards`);
    let statusLine = `Hard: ${player.hardModeEnabled ? 'ON' : 'OFF'}`;
    if (this.stagedMelds.length > 0) {
      const req = this.gameState.getHandRequirement(hand);
      statusLine += ` • Going down: ${this.stagedMelds.length}/${req.sets + req.runs} melds`;
    }
    this.playerStatusText.setText(statusLine);

    const dealer = this.gameState.players[this.gameState.dealerChipIndex];
    this.dealerChipText.setText(`Dealer: ${dealer.name}`);

    const playersList = this.gameState.players
      .map((p, idx) => (idx === this.gameState.currentPlayerIndex ? '→ ' : '  ') + p.name)
      .join('\n');
    this.playersInRoomText.setText('Players:\n' + playersList);

    if (this.gameState.discardPile.length > 0) {
      const topCard = this.gameState.discardPile[this.gameState.discardPile.length - 1];
      this.discardDisplay.setText('Discard: ' + topCard.toString());
    } else {
      this.discardDisplay.setText('Discard: —');
    }
    // this.stockDisplay.setText('Stock: ' + this.gameState.deck.cardsRemaining());

    this.drawPokerSeatsAndMelds();
    this.displayHand();
    this.updateScorecard();
  }

  /** Permanent scorecard on the right: hands as rows, each player has subtotal (hand) and total (running). Winning = 0 shown as 'x'. */
  updateScorecard() {
    if (this.scorecardContainer) this.scorecardContainer.destroy();
    const { width, height, scorecardLeft } = this.getTableLayout();
    const W = GameScene.SCORECARD_WIDTH;
    const cx = scorecardLeft + W / 2;
    this.scorecardContainer = this.add.container(cx, height / 2);
    this.scorecardContainer.setDepth(5);

    const bg = this.add.rectangle(0, 0, W - 4, height - 8, 0x1a472a, 0.95);
    bg.setStrokeStyle(2, 0x2e7d32);
    this.scorecardContainer.add(bg);

    const fs = 10;
    const rowH = 18;
    const colW = 26;
    const handColW = 20;
    const players = this.gameState.players;
    const numHands = this.gameState.totalHands;
    const handScores = this.gameState.handScores || [];

    const getHandScore = (h, pi) => (handScores[h] && handScores[h].hand ? handScores[h].hand[pi] : undefined);
    const getRunningScore = (h, pi) => (handScores[h] && handScores[h].running ? handScores[h].running[pi] : undefined);

    let y = -height / 2 + 20;
    // Header row
    this.scorecardContainer.add(this.add.text(-W / 2 + 10, y, 'Hand', { fontSize: fs, color: '#FFF59D', fontStyle: 'bold' }).setOrigin(0, 0));
    let x = -W / 2 + handColW + 4;
    for (const p of players) {
      const shortName = p.name.length > 6 ? p.name.slice(0, 5) + '…' : p.name;
      this.scorecardContainer.add(this.add.text(x, y, shortName, { fontSize: fs - 1, color: '#C8E6C9', fontStyle: 'bold' }).setOrigin(0, 0));
      this.scorecardContainer.add(this.add.text(x + colW, y, 'Tot', { fontSize: fs - 2, color: '#A5D6A7' }).setOrigin(0, 0));
      x += colW * 2 + 2;
    }
    y += rowH;

    for (let h = 0; h < numHands; h++) {
      const handNum = h + 1;
      const isCurrentHand = h === handScores.length && this.gameStarted;
      const isPastHand = h < handScores.length;

      this.scorecardContainer.add(this.add.text(-W / 2 + 4, y, String(handNum), { fontSize: fs, color: '#E8F5E9' }).setOrigin(0, 0));
      x = -W / 2 + handColW + 4;

      for (let pi = 0; pi < players.length; pi++) {
        let handVal;
        let runningVal;
        if (isPastHand) {
          handVal = getHandScore(h, pi);
          runningVal = getRunningScore(h, pi);
        } else if (isCurrentHand) {
          const liveHand = players[pi].calculateScore ? players[pi].calculateScore() : players[pi].score;
          handVal = liveHand;
          runningVal = (players[pi].totalScore || 0) + liveHand;
        } else {
          handVal = '—';
          runningVal = '—';
        }

        const handStr = (typeof handVal === 'number' && handVal === 0) ? 'x' : (typeof handVal === 'number' ? String(handVal) : handVal);
        const runStr = typeof runningVal === 'number' ? String(runningVal) : runningVal;
        this.scorecardContainer.add(this.add.text(x, y, handStr, { fontSize: fs, color: handStr === 'x' ? '#90ee90' : '#ffffff' }).setOrigin(0, 0));
        this.scorecardContainer.add(this.add.text(x + colW, y, runStr, { fontSize: fs - 1, color: '#B0BEC5' }).setOrigin(0, 0));
        x += colW * 2 + 2;
      }
      y += rowH;
    }

    this.scorecardContainer.setPosition(cx, height / 2);
  }

  /** Draw poker-style seats: name at each seat, dedicated card area for hand (face-down) and melds when gone down */
  drawPokerSeatsAndMelds() {
    if (this.pokerSeatsContainer) this.pokerSeatsContainer.destroy();
    this.pokerSeatsContainer = this.add.container(0, 0);
    const { cx, cy, width, height } = this.getTableLayout();
    const seats = this.getSeatPositions();
    const cardAreaOffset = 42;  // card area toward table center from name
    const cardZoneW = 160;
    const cardZoneH = 56;
    const cardW = 20;
    const cardH = 28;
    const cardGap = 4;
    const maxCardsPerRow = Math.floor((cardZoneW + cardGap) / (cardW + cardGap));
    const maxMeldRows = 2;

    for (let seatIndex = 0; seatIndex < seats.length; seatIndex++) {
      const playerIndex = this.seatToPlayerIndex(seatIndex);
      const p = this.gameState.players[playerIndex];
      const pos = seats[seatIndex];
      const isMe = seatIndex === 0;
      const dx = cx - pos.x;
      const dy = cy - pos.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const cardCenterX = pos.x + (dx / len) * cardAreaOffset;
      const cardCenterY = pos.y + (dy / len) * cardAreaOffset;

      // Seat label: name + (D) for dealer, above/below card area depending on side
      const nameY = pos.y + (dy / len) * -18;
      const nameText = this.add.text(pos.x, nameY, p.name + (this.gameState.dealerChipIndex === playerIndex ? ' (D)' : ''), {
        fontSize: '14px',
        color: isMe ? '#FFF59D' : '#E8E8E8',
        align: 'center',
        fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(10);
      this.pokerSeatsContainer.add(nameText);

      // Current turn indicator
      if (this.gameState.currentPlayerIndex === playerIndex) {
        const turnRing = this.add.ellipse(pos.x, nameY, nameText.width + 16, 24, 0x000000, 0);
        turnRing.setStrokeStyle(2, 0xFFD700);
        this.pokerSeatsContainer.add(turnRing);
      }

      if (isMe) {
        // My cards are in handContainer at bottom; still show name and turn ring at seat
        continue;
      }

      // Reserved card zone (subtle border) so melds and hand have a clear area
      const zoneRect = this.add.rectangle(cardCenterX, cardCenterY, cardZoneW, cardZoneH, 0x0d3d1a, 0.4);
      zoneRect.setStrokeStyle(1, 0x2e7d32);
      this.pokerSeatsContainer.add(zoneRect);

      if (!p.hasGoneDown) {
        // Face-down hand: card backs in a row, or count if too many
        const count = p.hand.length;
        const showBacks = Math.min(count, 8);
        const startX = cardCenterX - (showBacks * (cardW + cardGap) - cardGap) / 2 + (cardW + cardGap) / 2;
        const backY = cardCenterY;
        for (let i = 0; i < showBacks; i++) {
          const bx = startX + i * (cardW + cardGap);
          const back = this.add.rectangle(bx, backY, cardW, cardH, 0x1a3a5f);
          back.setStrokeStyle(1, 0x4a6faf);
          this.pokerSeatsContainer.add(back);
        }
        if (count > 8) {
          const countTxt = this.add.text(cardCenterX + (cardZoneW / 2) - 14, backY, '+' + (count - 8), {
            fontSize: '10px',
            color: '#fff'
          }).setOrigin(0.5);
          this.pokerSeatsContainer.add(countTxt);
        }
      } else {
        // Gone down: show melds in rows inside the card zone (no overflow)
        let cardIndex = 0;
        let row = 0;
        let meldStartX = cardCenterX - cardZoneW / 2 + (cardW + cardGap) / 2;
        let x = meldStartX;
        let y = cardCenterY - (cardH + cardGap) * 0.5 + (row * (cardH + cardGap));
        for (const meld of p.melds) {
          for (const card of meld.cards) {
            if (cardIndex > 0 && cardIndex % maxCardsPerRow === 0) {
              row++;
              if (row >= maxMeldRows) break;
              x = meldStartX;
              y = cardCenterY - (cardH + cardGap) * 0.5 + (row * (cardH + cardGap));
            }
            const miniCard = this.add.rectangle(x, y, cardW, cardH, 0xf5f5dc);
            miniCard.setStrokeStyle(1, 0x333333);
            this.pokerSeatsContainer.add(miniCard);
            const t = this.add.text(x, y, card.rankName + card.suitSymbol, {
              fontSize: '9px',
              color: card.isRed ? '#c62828' : '#1b5e20',
              align: 'center'
            }).setOrigin(0.5);
            this.pokerSeatsContainer.add(t);
            x += cardW + cardGap;
            cardIndex++;
          }
          x += cardGap;
          if (row >= maxMeldRows) break;
        }
      }
    }
  }

  displayHand() {
    const player = this.gameState.players[this.myPlayerIndex];
    this.handContainer.removeAll();
    this._handDragging = null;
    this._handDragStart = null;

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const cardW = 36;
    const cardH = 52;
    const spacing = 6;
    this.handCardW = cardW;
    this.handSpacing = spacing;
    const totalW = player.hand.length * (cardW + spacing) - spacing;
    const { playWidth } = this.getTableLayout();
    this.handContainer.setPosition(playWidth / 2 - totalW / 2 + (cardW + spacing) / 2, height - 100);
    let xOffset = 0;

    player.hand.forEach((card, index) => {
      const cardContainer = this.add.container(xOffset, 0);
      const cardRect = this.add.rectangle(0, 0, cardW, cardH, 0xffffff);
      cardRect.setStrokeStyle(2, this.selectedCards.indexOf(card) >= 0 ? 0xFFD700 : 0x333333);

      const cardText = this.add.text(0, 0, `${card.rankName} ${card.suitSymbol}`, {
        fontSize: '11px',
        color: card.isRed ? '#c62828' : '#1b5e20',
        align: 'center',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      cardContainer.add([cardRect, cardText]);
      cardContainer.setInteractive(new Phaser.Geom.Rectangle(-cardW/2, -cardH/2, cardW, cardH), Phaser.Geom.Rectangle.Contains);
      cardContainer.setData('index', index);
      cardContainer.setData('card', card);
      cardContainer.on('pointerdown', (ptr) => {
        this._handDragStart = { x: ptr.worldX, y: ptr.worldY, index, cardContainer, card };
      });

      this.handContainer.add(cardContainer);
      xOffset += cardW + spacing;
    });
  }

  handleHandPointerMove(ptr) {
    if (!this._handDragStart && !this._handDragging) return;
    if (this._handDragging) {
      const localX = ptr.worldX - this.handContainer.x;
      this._handDragging.container.x = localX;
      return;
    }
    const dx = ptr.worldX - this._handDragStart.x;
    const dy = ptr.worldY - this._handDragStart.y;
    if (dx * dx + dy * dy > 64) {
      this._handDragging = { container: this._handDragStart.cardContainer, fromIndex: this._handDragStart.index };
      this._handDragStart = null;
      this.handContainer.remove(this._handDragging.container);
      this.handContainer.add(this._handDragging.container);
      const localX = ptr.worldX - this.handContainer.x;
      this._handDragging.container.x = localX;
    }
  }

  handleHandPointerUp(ptr) {
    if (this._handDragging) {
      const player = this.gameState.players[this.myPlayerIndex];
      const cardW = this.handCardW || 36;
      const spacing = this.handSpacing || 6;
      const fromIndex = this._handDragging.fromIndex;
      const localX = ptr.worldX - this.handContainer.x;
      const slotWidth = cardW + spacing;
      let toIndex = Math.round(localX / slotWidth);
      toIndex = Math.max(0, Math.min(toIndex, player.hand.length - 1));
      if (toIndex !== fromIndex) {
        const card = player.hand[fromIndex];
        player.hand.splice(fromIndex, 1);
        player.hand.splice(toIndex, 0, card);
        if (this.multiplayerSession) this.multiplayerSession.updateGameState(this.gameState);
      }
      this._handDragging = null;
      this.updateDisplay();
      return;
    }
    if (this._handDragStart) {
      const { card, index } = this._handDragStart;
      this.toggleCardSelection(card, index);
      this._handDragStart = null;
      this.updateDisplay();
    }
  }

  toggleCardSelection(card, index) {
    const selectedIndex = this.selectedCards.indexOf(card);
    if (selectedIndex > -1) {
      this.selectedCards.splice(selectedIndex, 1);
    } else {
      this.selectedCards.push(card);
    }
  }

  showGameOver() {
    const winner = this.gameState.getGameWinner();
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000).setAlpha(0.7);
    this.add.text(width / 2, height / 2 - 40, 'Game Over!', {
      fontSize: '32px',
      color: '#FFD700',
      align: 'center',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 20, `${winner.name} Wins!`, {
      fontSize: '24px',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5);

    // Show scores
    let scoreY = height / 2 + 80;
    for (const player of this.gameState.players) {
      this.add.text(width / 2, scoreY, `${player.name}: ${player.totalScore}`, {
        fontSize: '16px',
        color: '#ffffff',
        align: 'center'
      }).setOrigin(0.5);
      scoreY += 30;
    }
  }

  generatePlayerId() {
    const id = 'player_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('playerId', id);
    return id;
  }

  generateGameId() {
    return 'game_' + Math.random().toString(36).substr(2, 9);
  }

  getShareableLink() {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?gameId=${this.gameId}`;
  }

  showGameLinkDialog() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Overlay
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000).setAlpha(0.7);

    // Dialog box
    const dialogWidth = 500;
    const dialogHeight = 200;
    const dialogX = width / 2;
    const dialogY = height / 2;

    this.add.rectangle(dialogX, dialogY, dialogWidth, dialogHeight, 0x2a4a6f)
      .setStrokeStyle(2, 0xFFD700);

    this.add.text(dialogX, dialogY - 70, 'Share Game Link', {
      fontSize: '18px',
      color: '#FFD700',
      align: 'center',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Use session link if available, otherwise generate one
    let shareLink;
    if (this.multiplayerSession) {
      shareLink = `${window.location.origin}${window.location.pathname}?gameId=${this.multiplayerSession.gameId}`;
    } else {
      shareLink = this.getShareableLink();
    }
    
    const linkText = this.add.text(dialogX, dialogY - 20, shareLink, {
      fontSize: '12px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 450 }
    }).setOrigin(0.5);

    // Copy button
    const copyBtn = this.add.rectangle(dialogX - 80, dialogY + 50, 150, 35, 0x667eea);
    copyBtn.setInteractive();
    copyBtn.on('pointerdown', () => {
      navigator.clipboard.writeText(shareLink);
      copyBtn.setFillStyle(0x90ee90);
    });
    this.add.text(dialogX - 80, dialogY + 50, 'Copy Link', {
      fontSize: '14px',
      color: '#ffffff',
      align: 'center',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Close button
    const closeBtn = this.add.rectangle(dialogX + 80, dialogY + 50, 150, 35, 0x764ba2);
    closeBtn.setInteractive();
    closeBtn.on('pointerdown', () => {
      linkText.destroy();
      copyBtn.destroy();
      closeBtn.destroy();
      this.scene.restart({ gameState: this.gameState, session: this.multiplayerSession, gameStarted: this.gameStarted });
    });
    this.add.text(dialogX + 80, dialogY + 50, 'Close', {
      fontSize: '14px',
      color: '#ffffff',
      align: 'center',
      fontStyle: 'bold'
    }).setOrigin(0.5);
  }

}
