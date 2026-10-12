import { h, $, toast } from './dom.js';
import { t } from './i18n.js';
import { settings, saveSettings, applySettings, getSession, setSession } from './store.js';
import { loadEngine } from './engine.js';
import { RemoteTransport, SoloTransport, probeServer, serverApi } from './transport.js';
import { renderHome } from './home.js';
import { renderLobby } from './lobby.js';
import { Table } from './table.js';
import { closeAllModals } from './modals.js';

export const app = {
  root: null, transport: null, session: null, snap: null, view: null, status: 'online', table: null, serverUp: null, lobby: null,
  async init() {
    applySettings();
    this.root = $('#app');
    this.showLoading();
    try { await loadEngine(); } catch (e) {
      this.root.replaceChildren(h('div', { class: 'center-msg' }, h('h2', {}, 'Could not load game engine'), h('pre', {}, String(e))));
      return;
    }
    this.serverUp = await probeServer();
    const qs = new URLSearchParams(location.search);
    const sess = getSession();
    if (sess && (sess.solo || this.serverUp)) {
      if (qs.get('room') && sess.code !== qs.get('room').toUpperCase()) { setSession(null); }
      else { this.resume(sess); return; }
    }
    this.goHome({ joinCode: (qs.get('room') || '').toUpperCase() });
  },
  showLoading() { this.root.replaceChildren(h('div', { class: 'center-msg' }, h('div', { class: 'spinner' }), t('loading'))); },
  rerender() { // language / size change
    if (this.screen === 'home') this.goHome(this.homeOpts);
    else if (this.screen === 'lobby') this.lobby && this.lobby.render();
    else if (this.screen === 'table' && this.table) this.table.fullRender();
  },
  goHome(opts = {}) {
    this.leaveTransport();
    this.screen = 'home'; this.homeOpts = opts;
    closeAllModals();
    this.root.replaceChildren(renderHome(this, opts));
  },
  leaveTransport() {
    if (this.transport) this.transport.close();
    this.transport = null; this.snap = null; this.table = null; this.lobby = null;
  },
  leave() { setSession(null); history.replaceState(null, '', location.pathname); this.goHome(); },
  async startSolo({ name, bots, hard }) {
    const session = { solo: true, code: 'SOLO', playerId: 'me' };
    if (this.serverUp) {
      try {
        const r = await serverApi.create(name, bots, hard);
        if (!r.ok) throw new Error(r.error);
        const s = { code: r.code, playerId: r.playerId, token: r.token };
        const sr = await new RemoteTransport(s).start(); if (!sr.ok) throw new Error(sr.error);
        setSession(s); this.resume(s); return;
      } catch (e) { console.warn('server solo failed, falling back', e); }
    }
    setSession(session);
    this.resume(session, { name, bots, hard });
  },
  resume(session, soloOpts) {
    this.leaveTransport();
    this.session = session; this.status = 'online';
    if (session.solo) this.transport = new SoloTransport(session, soloOpts || { name: settings.name || 'You', bots: [{ name: 'Rosa', level: 'normal' }, { name: 'Max', level: 'normal' }], hard: false });
    else this.transport = new RemoteTransport(session);
    this.showLoading();
    this.transport.connect({ onSnap: (s) => this.onSnap(s), onStatus: (s) => this.onStatus(s) });
  },
  onStatus(s) {
    this.status = s;
    if (s === 'lost') { toast(t('err.lost'), 'bad'); this.leave(); return; }
    document.body.classList.toggle('offline', s !== 'online');
  },
  onSnap(snap) {
    this.snap = snap;
    const started = snap.room.started && snap.view;
    if (!started) {
      if (this.screen !== 'lobby') { this.screen = 'lobby'; closeAllModals(); this.lobby = renderLobby(this); this.root.replaceChildren(this.lobby.el); }
      this.lobby.update(snap);
    } else {
      if (this.screen !== 'table') { this.screen = 'table'; closeAllModals(); this.table = new Table(this); this.root.replaceChildren(this.table.root); }
      this.table.update(snap);
    }
  },
  async createRoom({ name, hard }) {
    try {
      const r = await serverApi.create(name, [], hard);
      if (!r.ok) return toast(r.error || 'Error', 'bad');
      const s = { code: r.code, playerId: r.playerId, token: r.token };
      setSession(s); this.resume(s);
    } catch { toast(t('err.noServer'), 'bad'); }
  },
  async joinRoom({ name, code }) {
    try {
      const prev = getSession();
      const r = await serverApi.join(code, name);
      if (!r.ok) return toast(r.error || 'Error', 'bad');
      const s = { code: r.code || code, playerId: r.playerId, token: r.token };
      setSession(s); this.resume(s);
    } catch { toast(t('err.noServer'), 'bad'); }
  },
  setLang(l) { settings.lang = l; saveSettings(); this.rerender(); },
};
window.addEventListener('DOMContentLoaded', () => app.init());
