// Transport interface (shared by UI):
//   connect({onSnap(snap), onStatus(s)}), close()
//   act(action) -> {ok,error}; nextHand(); emote(text); start(); addBot(level); removeBot(id); rematch()
// snap = {room:{code,hostId,started,players:[{id,name,isBot,connected}]}, view, events, chat}
import { eng } from './engine.js';

async function post(path, body) {
  const r = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('json')) throw new Error('no-server');
  return r.json();
}
export async function probeServer() {
  try { await post('join', { code: '----', name: 'probe' }); return true; } catch { return false; }
}
export async function fetchConfig() {
  try { const r = await fetch('/api/config'); return (await r.json()).funnelUrl || null; } catch { return null; }
}
export const serverApi = {
  create: (name, bots, hard, claimPenalty = 1) => post('create', { name, bots, hard, claimPenalty }),
  join: (code, name) => post('join', { code, name }),
};

export class RemoteTransport {
  constructor(session) { this.s = session; this.es = null; }
  connect(h) {
    this.h = h;
    let unloading = false; window.addEventListener('pagehide', () => { unloading = true; }); window.addEventListener('beforeunload', () => { unloading = true; });
    const open = () => {
      const es = this.es = new EventSource(`/api/events?code=${encodeURIComponent(this.s.code)}&token=${encodeURIComponent(this.s.token)}`);
      es.onopen = () => h.onStatus('online');
      es.onmessage = (m) => { try { h.onSnap(JSON.parse(m.data)); } catch (e) { console.error(e); } };
      es.onerror = () => {
        if (unloading) return; // page is being reloaded/closed: keep the saved session
        if (es.readyState === EventSource.CLOSED) {
          // Browser gave up (e.g. 4xx). Check whether the room still exists.
          h.onStatus('lost');
        } else h.onStatus('reconnecting');
      };
    };
    open();
  }
  close() { if (this.es) this.es.close(); this.es = null; }
  _p(path, extra) { return post(path, Object.assign({ code: this.s.code, token: this.s.token }, extra)).catch(() => ({ ok: false, error: 'Network error' })); }
  act(action) { return this._p('act', { action }); }
  nextHand() { return this._p('nexthand'); }
  emote(text) { return this._p('emote', { text }); }
  start() { return this._p('start'); }
  addBot(level) { return this._p('addbot', { level }); }
  removeBot(id) { return this._p('removebot', { id, botId: id, playerId: id }); }
  rematch() { return this._p('rematch'); }
  setReady(ready) { return this._p('ready', { ready }); }
  kick(playerId) { return this._p('kick', { playerId }); }
  leaveRoom() { return this._p('leave'); }
}

// ---------- Solo (offline) ----------
export class SoloTransport {
  constructor(session, opts) {
    this.s = session; // {solo:true, code:'SOLO', playerId:'me'}
    this.opts = opts; // {name, bots:[{name,level}], hard}
    this.chat = [];
    this.started = true;
    this.state = null;
    const saved = null;
    this.state = saved || this._new();
  }
  _new() {
    const players = [{ id: 'me', name: this.opts.name || 'You', isBot: false }];
    this.opts.bots.forEach((b, i) => players.push({ id: 'bot' + (i + 1), name: b.name, isBot: true, botLevel: b.level }));
    return eng.newGame({ players, hard: !!this.opts.hard, claimPenalty: this.opts.claimPenalty == null ? 1 : this.opts.claimPenalty });
  }
  _room() {
    return { code: 'SOLO', hostId: 'me', started: true, players: this.state.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot, connected: true })) };
  }
  _emit(events) {
    this.h && this.h.onSnap({ room: this._room(), view: eng.viewFor(this.state, 'me'), events: events || [], chat: this.chat });
  }
  connect(h) { this.h = h; h.onStatus('online'); this._emit([]); this._schedule(); }
  close() { clearTimeout(this.timer); this.h = null; }
  _schedule() {
    clearTimeout(this.timer);
    const st = this.state;
    if (st.phase !== 'playing') return;
    const p = st.players.find(q => q.id === eng.currentActor(st));
    if (p && p.isBot) this.timer = setTimeout(() => this._botMove(p), 850 + Math.random() * 400);
  }
  _botMove(p) {
    const st = this.state;
    if (st.phase !== 'playing' || eng.currentActor(st) !== p.id) return;
    let r;
    try { r = eng.act(st, p.id, eng.chooseAction(eng.viewFor(st, p.id), p.botLevel || 'normal')); } catch (e) { console.error(e); r = { ok: false }; }
    if (!r.ok) {
      console.warn('bot action failed', r.error);
      const fb = st.pendingClaim ? { type: 'pass' } : st.step === 'draw' ? { type: 'draw', from: 'stock' } : { type: 'discard', cardId: p.hand[0].id };
      r = eng.act(st, p.id, fb);
    }
    if (r.ok) { this.state = r.state; this._emit(r.events); }
    this._schedule();
  }
  async act(action) {
    const r = eng.act(this.state, 'me', action);
    if (!r.ok) return { ok: false, error: r.error };
    this.state = r.state; this._emit(r.events); this._schedule();
    return { ok: true };
  }
  async nextHand() {
    if (this.state.phase !== 'handOver') return { ok: false };
    this.state = eng.nextHand(this.state); this._emit([]); this._schedule(); return { ok: true };
  }
  async emote(text) {
    this.chat = this.chat.concat([{ playerId: 'me', name: this.opts.name, text, t: Date.now() }]).slice(-50);
    this._emit([]); return { ok: true };
  }
  async rematch() { this.chat = []; this.state = this._new(); this._emit([]); this._schedule(); return { ok: true }; }
  async start() { return { ok: true }; }
  async addBot() { return { ok: false }; }
  async removeBot() { return { ok: false }; }
  async setReady() { return { ok: true }; }
  async kick() { return { ok: false }; }
  async leaveRoom() { return { ok: true }; }
}
