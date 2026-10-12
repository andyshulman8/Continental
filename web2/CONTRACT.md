# Continental v2 (web2/) — build contract

Goal: a polished, no-build-step web game of Continental (Family Rules) for a grandma + family. Zero npm deps except none (pure Node 24 + browser ES modules). Colonist.io-inspired UI/UX. Run: `./run-lan.sh` → `node web2/server/server.js` serving on 0.0.0.0:5190.

## Layout (each agent owns ONLY its files)
- `web2/shared/engine.js`  (ENGINE agent) pure ES module, no DOM/Node APIs, used by both browser and server.
- `web2/shared/bots.js`    (ENGINE agent) `chooseAction(view, level)`.
- `web2/shared/engine.test.js` (ENGINE agent) run with `node --test web2/shared/`.
- `web2/server/server.js`  (SERVER agent) zero-dep Node: static files from `web2/client/` + `/shared/` + JSON/SSE API.
- `web2/client/*`          (UI agent) index.html, css, ES modules. Imports engine via `/shared/engine.js`.

## Rules (Family Rules, from README.md)
- 11 cards dealt per hand. Decks: 2 players → 2 decks, 3 players → 3 decks, 4 players → 3 decks; each deck 52 + 2 jokers.
- Wilds: jokers and red aces (♥A ♦A). Wilds can't outnumber naturals in any meld. A red ace placed as an ace in an ace-set/run-ending-A counts natural.
- Hands: 2 or 4 players = 8 hands: [2S],[1S+1R],[2R],[3S],[2S+1R],[2R+1S],[3R],[4R]. 3 players = 9 hands, inserting [2S+2R] as hand 7 (then 3R, 4R). S=set (3+ same rank), R=run (4+ same suit consecutive; Ace low or high, no wrap; max 13 cards).
- Turn: draw (stock or top discard) → if not yet down and holding the contract, may lay down exactly the required melds (extra cards not allowed beyond what forms the melds, except extra cards in melds are fine; layout is chosen by player) → once down, may add cards to ANY meld on table (own or opponents') and may add wilds subject to the wild rule → discard one card to end turn.
- Going down is allowed only with the exact contract melds in one action (`lay`). Cards added to melds the same turn after going down are allowed.
- Hand ends the moment a player's hand becomes empty (by discarding, or by laying/adding all cards). Normal mode: discarding your last card is allowed. Hard mode (`hard` flag): you may NOT discard your last card — you must meld/add every card (incl. the drawn one); engine rejects a discard that would empty the hand. If going down leaves exactly 1 card in a non-hard game, discard it to go out.
- Scoring: 2–9 face, 10/J/Q/K =10, black A=15, red A=10, joker=10 (in-hand penalty). Winner of hand scores 0. Lowest cumulative total after last hand wins.
- Stock empties → reshuffle discard pile (keep top) into stock.
- Dealer rotates left each hand; player left of dealer goes first. Dealer for hand 1 chosen randomly.

## Engine API (`shared/engine.js`, all pure; state is plain JSON)
```
newGame({players:[{id,name,isBot,botLevel}], hard=false, seed?}) -> state
act(state, playerId, action) -> {ok:true, state, events:[...]} | {ok:false, error:"human readable"}
viewFor(state, playerId) -> redacted state (other hands replaced by counts; stock by count)
nextHand(state) -> state   // call after phase==="handOver"
validateMeld(cards, kind /*'set'|'run'*/) -> {ok, error?, ordered?}  // for UI hints
canGoDown(hand, contract) -> {ok, melds?}   // finds a layout if one exists (used by bots + "Suggest" hint)
cardPoints(card), HANDS(n)
```
Card: `{id:"d0-H-7"|"d1-JK-1", rank:1..13 (0 for joker), suit:"S"|"H"|"D"|"C"|null, joker:bool}`; id unique.
State: `{phase:"playing"|"handOver"|"gameOver", handIndex, handCount, contract:[{kind,..}], dealer, turn (player index), step:"draw"|"play" , players:[{id,name,isBot,hand:[cards],down:bool,score,handScores:[]}], stock:[], discard:[], melds:[{id,kind,ownerId,cards:[ordered cards w/ for wilds a `as:{rank,suit}`]}], hard, log:[...], winnerId?}`
Actions: `{type:"draw", from:"stock"|"discard"}`, `{type:"lay", melds:[{kind,cardIds:[...]}]}` (order of cardIds = order in meld; wilds get position-determined substitute; engine infers `as`), `{type:"add", meldId, cardIds:[...], position?:"start"|"end"}`, `{type:"discard", cardId}`.
Events (for animation/log): `{type:"draw",playerId,from}`, `{type:"lay",playerId,meldIds}`, `{type:"add",playerId,meldId,n}`, `{type:"discard",playerId,cardId}`, `{type:"handOver",winnerId,scores}`, `{type:"gameOver",winnerId}`.

## Bots (`shared/bots.js`)
`chooseAction(view, level)` where view = viewFor(state, botId); returns one valid action for the bot's current step. level: "easy"|"normal"|"hard". Must always return a legal action (fallback: draw stock / discard highest-point card). Server calls it repeatedly with ~900ms delays.

## Server API (`server/server.js`)
Rooms in memory, 4-letter codes. All JSON. Server holds authoritative engine state.
- `POST /api/create {name, bots:[{name,level}], hard}` → `{code, playerId, token}`
- `POST /api/join {code, name}` → `{playerId, token}` (re-join by same name+token allowed, for reconnect)
- `POST /api/addbot {code, token, level}` / `POST /api/removebot` / `POST /api/start {code, token}` (host only; 2–4 players)
- `POST /api/act {code, token, action}` → `{ok, error?}`; `POST /api/nexthand {code, token}` (any player once handOver); `POST /api/emote {code,token,text}`; `POST /api/rematch`.
- `GET /api/events?code=&token=` → SSE; each message `data: {room:{code,hostId,started,players:[{id,name,isBot,connected}]}, view: viewFor(...)|null, events:[...], chat:[...]}`. Send full snapshot on connect + after every change; heartbeat comment every 15s.
- Solo play = create room with bots and start immediately; same code path. Prints LAN URLs on boot (all non-internal IPv4).

## UI (`client/`) — Colonist.io-inspired
Look/feel: bright friendly flat UI, rounded panels, coloured per-player accents, bold avatars/initials, right sidebar with event log + emote/chat buttons, top bar with hand number & contract, big clear primary action button, smooth card animations, sound-free by default (optional toggle), responsive (works on iPad/phone landscape + desktop), big tap targets and a large-text option for abuela. Felt-green table centre with stock + discard; opponents around edges with card-back fans + score/“DOWN” badges; melds laid in front of owners, droppable. Hand at bottom, drag to reorder, tap to select, drag onto meld to add. “Lay down” builder: auto-suggest via canGoDown with a manual override. Clear turn prompts ("Your turn: draw a card"). Home screen: Play vs computers (pick # bots + difficulty), Create room, Join with code. Rules/help modal. Scoreboard modal between hands + final podium. Spanish/English toggle (abuela) for all UI strings. Persist name/lang/settings in localStorage; reconnect to room on refresh.
