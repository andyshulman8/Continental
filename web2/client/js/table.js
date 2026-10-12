import { h, $, toast, cnt } from './dom.js';
import { t } from './i18n.js';
import { settings, saveSettings, COLORS } from './store.js';
import { eng } from './engine.js';
import { cardEl, backEl, cardFromId, cardName, RANKS, SUIT } from './cards.js';
import { fly, beep } from './fx.js';
import { openScoreSheet, openRules, openSettings, openBuilder, openScoreboard, openPodium, closeModal } from './modals.js';

const EMOTES = ['👍', '👏', '😂', '😮', '❤️', '😭'];
const PHRASES = ['phrase.gg', 'phrase.hurry', 'phrase.oops', 'phrase.nice'];

const top0 = (v) => (v.discard || [])[(v.discard || []).length - 1];
export class Table {
  constructor(app) {
    this.app = app; this.sel = new Set(); this.meldSel = null; this.order = []; this.logItems = [];
    this.lastHand = null; this.chatSeen = null; this.lastTurnMe = false; this.drag = null; this.pending = null; this.modalKey = null;
    this.root = h('div', { class: 'table-screen' });
    this.fullRender();
    window.addEventListener('resize', () => this.layoutHand());
  }
  get tp() { return this.app.transport; }
  fullRender() {
    this.topbar = h('div', { class: 'topbar' });
    this.arena = h('div', { class: 'arena' });
    this.logEl = h('div', { class: 'log' });
    this.side = h('aside', { class: 'sidebar' + (this.sideOpen ? ' open' : '') },
      h('div', { class: 'side-title' }, t('log.title')), this.logEl,
      h('div', { class: 'emotes' }, EMOTES.map(e => h('button', { class: 'emo', onclick: () => this.tp.emote(e) }, e)),
        PHRASES.map(k => h('button', { class: 'phr', onclick: () => this.tp.emote(t(k)) }, t(k)))));
    this.handbar = h('div', { class: 'handbar' });
    this.root.replaceChildren(this.topbar, h('div', { class: 'main' }, this.arena, this.side), this.handbar);
    this.logItems.forEach(i => this.logEl.append(this.logNode(i)));
    this.logEl.scrollTop = 1e9;
    if (this.v) this.render();
  }
  update(snap) {
    if (this.drag) { this.pending = snap; return; }
    this.snap = snap;
    const v = snap.view; if (!v) return;
    const prev = this.v; this.v = v;
    this.me = v.players.find(p => p.id === this.app.session.playerId);
    this.myIdx = v.players.indexOf(this.me);
    if (this.lastHand !== v.handIndex || (prev && prev.phase !== 'playing' && v.phase === 'playing')) {
      if (this.lastHand !== v.handIndex) { this.multi = false; this.dealing = true; this.sel.clear(); this.order = []; this.meldSel = null; }
      this.lastHand = v.handIndex;
    }
    const ids = this.me.hand.map(c => c.id);
    this.order = this.order.filter(i => ids.includes(i)); ids.forEach(i => { if (!this.order.includes(i)) this.order.push(i); });
    [...this.sel].forEach(i => { if (!ids.includes(i)) this.sel.delete(i); });
    if (this.meldSel && (!v.melds.some(m => m.id === this.meldSel) || !this.myTurn)) this.meldSel = null;
    // chat
    const chat = snap.chat || [];
    if (this.chatSeen == null) this.chatSeen = chat.length;
    const newChat = chat.slice(Math.min(this.chatSeen, chat.length)); this.chatSeen = chat.length;
    newChat.forEach(c => { this.addLog({ pid: c.playerId, text: c.text, chat: true, name: c.name }); this.bubble(c.playerId, c.text); });
    // events -> log
    const evs = snap.events || [];
    evs.forEach(ev => { const l = this.eventText(ev); if (l) this.addLog(l); });
    this.render();
    evs.forEach((ev, i) => setTimeout(() => this.animate(ev), i * 220));
    const myTurn = this.myTurn || this.myClaim;
    if (myTurn && !this.lastTurnMe) beep('turn');
    this.lastTurnMe = myTurn;
    // modals
    const key = v.phase === 'handOver' ? 'h' + v.handIndex : v.phase === 'gameOver' ? 'g' : null;
    if (key !== this.modalKey) {
      closeModal('sb'); closeModal('podium'); closeModal('sheet'); closeModal('builder');
      this.modalKey = key;
      if (key && key[0] === 'h') setTimeout(() => { if (this.modalKey === key) openScoreboard(this.app, this.v); }, 700);
      if (key === 'g') setTimeout(() => { if (this.modalKey === key) openPodium(this.app, this.v); }, 900);
    }
  }
  pname(id) { const p = this.v.players.find(p => p.id === id); return p ? p.name : '?'; }
  pcol(id) { const i = this.v.players.findIndex(p => p.id === id); return COLORS[i] || '#888'; }
  eventText(ev) {
    const n = this.pname(ev.playerId || ev.winnerId || ev.current), pid = ev.playerId;
    switch (ev.type) {
      case 'draw': return { pid, text: t(ev.from === 'discard' ? 'ev.drawDiscard' : 'ev.drawStock', { name: n }) };
      case 'lay': return { pid, text: t('ev.lay', { name: n }) };
      case 'add': return { pid, text: t('ev.add', { name: n, n: ev.n || 1 }) };
      case 'discard': return { pid, text: t('ev.discard', { name: n, card: cardName(cardFromId(ev.cardId)) }) };
      case 'claim': return { pid: ev.playerId, text: t(ev.penalty ? 'ev.claimPen' : 'ev.claim', { name: n, n: ev.penalty }) };
      case 'pass': return { pid: ev.playerId, text: t('ev.pass', { name: n }) };
      case 'dead': return { text: t('ev.dead', { card: cardName(cardFromId(ev.cardId)) }) };
      case 'claimOpen': return null;
      case 'handOver': return { pid: ev.winnerId, text: t('ev.handOver', { name: n }) };
      case 'gameOver': return { pid: ev.winnerId, text: t('ev.gameOver', { name: n }) };
    }
  }
  logNode(i) { return h('div', { class: 'log-item' + (i.chat ? ' chat' : ''), style: { '--pc': i.pid ? this.pcol(i.pid) : '#888' } }, i.chat ? h('b', {}, (i.name || this.pname(i.pid)) + ': ') : null, i.text); }
  addLog(i) { this.logItems.push(i); if (this.logItems.length > 120) this.logItems.shift(); const n = this.logNode(i); this.logEl.append(n); while (this.logEl.children.length > 120) this.logEl.firstChild.remove(); this.logEl.scrollTop = 1e9; }
  bubble(pid, text) {
    const seat = this.root.querySelector(`[data-seat="${pid}"]`); this.bubbles = this.bubbles || {};
    this.bubbles[pid] = { text, until: Date.now() + 4000 };
    this.render();
    setTimeout(() => { if (this.bubbles[pid] && this.bubbles[pid].until <= Date.now()) { delete this.bubbles[pid]; if (!this.drag) this.render(); } }, 4100);
  }
  animate(ev) {
    if (!this.root.isConnected) return;
    const me = this.app.session.playerId;
    const seatEl = (pid) => pid === me ? this.handEl : this.root.querySelector(`[data-seat="${pid}"]`);
    if (ev.type === 'draw') { fly(ev.from === 'discard' ? this.discEl : this.stockEl, seatEl(ev.playerId), backEl('fly'), 480); beep('draw'); }
    else if (ev.type === 'discard') { fly(seatEl(ev.playerId), this.discEl, cardEl(cardFromId(ev.cardId), { cls: 'fly' }), 480); beep('discard'); }
    else if (ev.type === 'lay') { beep('lay'); this.root.querySelectorAll(`.meldgrp[data-owner="${ev.playerId}"] .meld`).forEach(m => m.classList.add('pop')); }
    else if (ev.type === 'add') { const m = this.root.querySelector(`.meld[data-meld-id="${ev.meldId}"]`); if (m) m.classList.add('pop'); beep('lay'); }
    else if (ev.type === 'claim') { const to = seatEl(ev.playerId); fly(this.discEl, to, cardEl(cardFromId(ev.cardId), { cls: 'fly' }), 520); for (let k = 0; k < (ev.penalty || 0); k++) setTimeout(() => fly(this.stockEl, to, backEl('fly'), 480), 260 * (k + 1)); beep('lay'); }
    else if (ev.type === 'handOver' || ev.type === 'gameOver') beep('win');
  }
  // ---------- render ----------
  get actorId() { const v = this.v; return v.phase !== 'playing' ? null : (v.pendingClaim ? v.pendingClaim.current : v.players[v.turn].id); }
  get myTurn() { const v = this.v; return v.phase === 'playing' && !v.pendingClaim && v.players[v.turn] === this.me; }
  get myClaim() { const v = this.v; return v.phase === 'playing' && !!v.pendingClaim && v.pendingClaim.current === this.me.id; }
  get topLive() { const v = this.v, d = v.discard || [], top = d[d.length - 1]; return !!top && v.liveCardId === top.id; }
  get canTakeDisc() { return this.topLive && !this.me.down && this.v.discarderId !== this.me.id; }
  render() {
    if (!this.v || this.drag) return;
    this.renderTop(); this.renderArena(); this.renderHandbar();
  }
  renderTop() {
    const v = this.v, me = this.app;
    const chip = (c) => h('span', { class: 'cchip ' + c.kind }, c.kind === 'set' ? t('kind.set') : t('kind.run'), h('small', {}, c.kind === 'set' ? '3+' : '4+'));
    this.topbar.replaceChildren(
      h('div', { class: 'tb-left' }, h('div', { class: 'handno' }, t('hand.n', { n: v.handIndex + 1, m: v.handCount })),
        h('div', { class: 'contract' }, h('small', {}, t('contract')), v.contract.map(chip)), v.hard ? h('span', { class: 'hardbadge' }, t('home.hardShort')) : null),
      h('div', { class: 'tb-mid' }, this.promptEl()),
      h('div', { class: 'tb-right' },
        h('button', { class: 'ico', title: t('sheet.title'), onclick: () => openScoreSheet(this.app, this.v) }, '\uD83D\uDCCB'),
        h('button', { class: 'ico', title: t('rules'), onclick: () => openRules() }, '❓'),
        h('button', { class: 'ico', title: t('settings'), onclick: () => openSettings(this.app) }, '⚙️'),
        h('button', { class: 'ico side-toggle', onclick: () => { this.sideOpen = !this.sideOpen; this.side.classList.toggle('open', this.sideOpen); } }, '💬'),
        h('button', { class: 'ico', title: t('leave'), onclick: () => { if (confirm(t('leave.confirm'))) this.app.leave(); } }, '✕')));
  }
  promptEl() {
    const v = this.v;
    let text, cls = '';
    const actor = v.players.find(p => p.id === this.actorId) || v.players[v.turn];
    if (v.phase !== 'playing') text = t('prompt.over');
    else if (v.pendingClaim) { text = this.myClaim ? t('prompt.claim') : t('prompt.claimWait', { name: actor.name }); cls = this.myClaim ? 'mine' : ''; }
    else if (this.myTurn) {
      cls = 'mine';
      text = v.step === 'draw' ? t('prompt.draw') : (this.me.down ? t('prompt.down') : t('prompt.play'));
    } else text = t('prompt.wait', { name: actor.name });
    return h('div', { class: 'prompt ' + cls, style: { '--pc': this.pcol(actor.id) } }, text);
  }
  renderArena() {
    const v = this.v, n = v.players.length;
    const rel = []; for (let k = 1; k < n; k++) rel.push(v.players[(this.myIdx + k) % n]);
    const slots = n === 2 ? ['top'] : n === 3 ? ['left', 'right'] : ['left', 'top', 'right'];
    const seats = rel.map((p, i) => this.seatEl(p, slots[i]));
    // melds grouped by owner
    const groups = v.players.map(p => ({ p, melds: v.melds.filter(m => m.ownerId === p.id) })).filter(g => g.melds.length);
    const meldsEl = h('div', { class: 'melds' }, groups.length ? groups.map(g => h('div', { class: 'meldgrp', 'data-owner': g.p.id, style: { '--pc': this.pcol(g.p.id) } },
      h('div', { class: 'owner' }, g.p.name),
      h('div', { class: 'mrow' }, g.melds.map(m => this.meldEl(m))))) : h('div', { class: 'melds-empty' }, ''));
    const canDraw = this.myTurn && v.step === 'draw';
    const live = this.topLive, dead = !!top0(v) && !live;
    const disc = v.discard || [], top = disc[disc.length - 1];
    const stockN = v.stockCount != null ? v.stockCount : cnt(v.stock);
    this.stockEl = h('div', { class: 'pile stock' + (canDraw ? ' can' : ''), onclick: () => canDraw && this.draw('stock') },
      h('div', { class: 'stack' }, backEl('s3'), backEl('s2'), backEl('s1')), h('div', { class: 'plabel' }, t('pile.stock')));
    this.discEl = h('div', { class: 'pile discard drop-discard' + (canDraw && this.canTakeDisc ? ' can' : '') + (canDraw && !this.canTakeDisc ? ' locked' : '') + (dead || (top0(v) && v.discarderId === this.me.id && canDraw) ? ' dead' : ''), title: this.discWhy(), onclick: () => this.discardClick() },
      top ? cardEl(top, { cls: 'dtop' }) : h('div', { class: 'card empty' }), (dead || (top0(v) && v.discarderId === this.me.id && canDraw)) ? h('div', { class: 'deadtag' }, t('pile.dead')) : null, h('div', { class: 'plabel' }, t('pile.discard')));
    const felt = h('div', { class: 'felt' }, meldsEl, h('div', { class: 'piles' }, this.stockEl, this.discEl, this.claimBox()));
    this.arena.className = 'arena n' + n;
    this.arena.replaceChildren(...seats, felt);
    this.fitMelds(meldsEl);
  }
  // shrink meld cards step by step so every meld stays visible without scrolling (min size keeps ranks legible)
  fitMelds(el) {
    const fit = () => {
      if (!el.isConnected) return;
      for (let k = 0; k <= 3; k++) { el.dataset.fit = k; if (el.scrollHeight <= el.clientHeight + 1) break; }
    };
    fit(); requestAnimationFrame(fit);
  }
  discWhy() {
    if (this.me.down) return t('hint.noDiscard');
    if (this.v.discarderId === this.me.id) return t('hint.ownDiscard');
    if (!this.topLive) return t('hint.dead');
    return null;
  }
  claimBox() {
    const v = this.v, pc = v.pendingClaim; if (!pc || v.phase !== 'playing') return null;
    const card = cardFromId(pc.cardId), from = this.pname(pc.fromId), pen = v.claimPenalty || 0;
    if (!this.myClaim) return h('div', { class: 'claimbox wait' }, cardEl((v.discard || []).slice(-1)[0] || card, { cls: 'sm' }), h('div', {}, t('claim.wait', { name: this.pname(pc.current) })));
    return h('div', { class: 'claimbox mine' }, h('div', { class: 'cq' }, pc.fromId ? t('claim.q', { name: from, card: cardName(card) }) : t('claim.q0', { card: cardName(card) }), pen ? h('small', {}, t('claim.pen', { n: pen })) : null),
      h('div', { class: 'row center' }, h('button', { class: 'btn green xl', onclick: () => this.send({ type: 'claim' }) }, t('claim.take')), h('button', { class: 'btn xl', onclick: () => this.send({ type: 'pass' }) }, t('claim.pass'))));
  }
  seatEl(p, pos) {
    const i = this.v.players.indexOf(p), v = this.v, hc = p.cardCount != null ? p.cardCount : cnt(p.hand);
    const b = this.bubbles && this.bubbles[p.id];
    const fan = h('div', { class: 'minifan' }, Array.from({ length: Math.min(hc, 14) }, () => h('i', {})));
    return h('div', { class: 'seat ' + pos + (this.actorId === p.id ? ' turn' : ''), 'data-seat': p.id, style: { '--pc': COLORS[i] } },
      h('div', { class: 'avatar' }, p.name[0].toUpperCase(), v.dealer === i ? h('em', { class: 'dealer', title: t('dealer') }, 'D') : null),
      h('div', { class: 'sinfo' }, h('div', { class: 'sn' }, p.isBot ? '🤖 ' : '', p.name),
        h('div', { class: 'ss' }, h('b', {}, p.score), ' ' + t('score.pts'), p.down ? h('span', { class: 'down' }, t('down')) : null)),
      h('div', { class: 'scards' }, fan, h('span', { class: 'cn' }, hc)),
      b ? h('div', { class: 'bubble' }, b.text) : null);
  }
  meldEl(m) {
    const sel = this.meldSel === m.id;
    const el = h('div', { class: 'meld ' + m.kind + (sel ? ' sel' : ''), 'data-meld-id': m.id, onclick: () => this.pickMeld(m.id) },
      m.cards.map(c => cardEl(c, { cls: 'sm' })));
    return el;
  }
  pickMeld(id) {
    if (!(this.myTurn && this.v.step === 'play' && this.me.down)) { if (this.myTurn && !this.me.down && this.v.step === 'play') toast(t('hint.notDown')); return; }
    this.meldSel = this.meldSel === id ? null : id; this.render();
  }
  isNew(id) { return this.myTurn && this.v.step === 'play' && this.v.drawnCardId === id; }
  renderHandbar() {
    const v = this.v, me = this.me, my = this.myTurn, play = my && v.step === 'play';
    const byId = new Map(me.hand.map(c => [c.id, c]));
    const cards = this.order.map(i => byId.get(i)).filter(Boolean);
    this.handEl = h('div', { class: 'hand' + (this.dealing ? ' dealing' : '') }, cards.map((c, i) => {
      const el = cardEl(c, { cls: (this.sel.has(c.id) ? 'sel' : '') + (this.isNew(c.id) ? ' new' : '') });
      if (this.dealing) el.style.animationDelay = (i * 70) + 'ms';
      el.addEventListener('pointerdown', (e) => this.dragStart(e, c.id, el));
      return el;
    }));
    if (this.dealing) { this.dealing = false; beep('draw'); }
    const sel = [...this.sel];
    const btn = (cls, label, fn, dis) => h('button', { class: 'btn ' + cls, disabled: dis ? '' : null, onclick: fn }, label);
    const acts = [];
    let canLay = false;
    if (play && !me.down) { try { canLay = eng.canGoDown(me.hand, v.contract).ok; } catch { } }
    if (my && v.step === 'draw') {
      acts.push(btn('green', t('act.drawStock'), () => this.draw('stock')), btn('blue', t('act.takeDiscard'), () => this.draw('discard'), !this.canTakeDisc));
    }
    if (play) {
      if (!me.down) acts.push(btn('primary' + (canLay ? ' pulse' : ''), '🃏 ' + t('act.lay') + (canLay ? ' ✓' : ''), () => this.openLay()));
      else {
        const m = v.melds.find(m => m.id === this.meldSel);
        acts.push(btn(this.multi ? 'primary' : '', (this.multi ? '\u2611 ' : '\u2610 ') + t('act.multi'), () => { this.multi = !this.multi; if (!this.multi && this.sel.size > 1) this.sel.clear(); this.render(); }));
        acts.push(btn('blue' + (sel.length && m ? ' pulse' : ''), t('act.add'), () => this.addToMeld(), !(sel.length && m)));
      }
      acts.push(btn('red' + (sel.length === 1 ? ' pulse' : ''), t('act.discard') + (sel.length === 1 ? ' ' + cardName(byId.get(sel[0])) : ''), () => this.discard(sel[0]), sel.length !== 1 || this.isNew(sel[0])));
      if (sel.length === 1 && this.isNew(sel[0])) acts.push(h('span', { class: 'hint' }, t('hint.justDrew')));
      if (sel.length > 1) acts.push(h('span', { class: 'hint' }, t('hint.oneToDiscard')));
    }
    const sorters = h('div', { class: 'sorters' }, h('button', { class: 'btn sm', onclick: () => this.sortHand('rank') }, t('act.sortRank')), h('button', { class: 'btn sm', onclick: () => this.sortHand('suit') }, t('act.sortSuit')));
    const hint = play && sel.length && me.down && !this.meldSel ? h('div', { class: 'hint' }, t('hint.pickMeld')) : null;
    this.handbar.className = 'handbar' + (my ? ' myturn' : '');
    this.handbar.style.setProperty('--pc', COLORS[this.myIdx]);
    this.handbar.replaceChildren(h('div', { class: 'hb-top' }, h('div', { class: 'me-tag' }, h('div', { class: 'avatar sm' }, me.name[0].toUpperCase()), h('b', {}, me.name), h('span', { class: 'ss' }, me.score + ' ' + t('score.pts')), me.down ? h('span', { class: 'down' }, t('down')) : null), hint, h('div', { class: 'acts' }, acts), sorters), this.handEl);
    requestAnimationFrame(() => this.layoutHand());
  }
  layoutHand() {
    const hand = this.handEl; if (!hand || !hand.isConnected) return;
    const cs = [...hand.children]; const n = cs.length; if (!n) return;
    const cw = cs[0].offsetWidth, W = hand.clientWidth - 8, gap = 8;
    let ov = n > 1 ? (n * cw + (n - 1) * gap - W) / (n - 1) : 0;
    const m = ov > 0 ? -ov : gap;
    cs.forEach((c, i) => { c.style.marginLeft = i ? m + 'px' : '0'; });
  }
  sortHand(mode) {
    const byId = new Map(this.me.hand.map(c => [c.id, c]));
    const so = { S: 0, H: 1, C: 2, D: 3 };
    const key = (c) => c.joker ? [99, 99] : mode === 'rank' ? [c.rank, so[c.suit]] : [so[c.suit], c.rank];
    this.order.sort((a, b) => { const x = key(byId.get(a)), y = key(byId.get(b)); return x[0] - y[0] || x[1] - y[1]; });
    this.renderHandbar();
  }
  // ---------- actions ----------
  async send(action) {
    const r = await this.tp.act(action);
    if (r && r.ok === false) { toast(r.error || 'Error', 'bad'); return r; }
    return r;
  }
  draw(from) { this.send({ type: 'draw', from }); }
  discardClick() {
    if (this.myTurn && this.v.step === 'draw') { const w = this.discWhy(); if (w || !this.canTakeDisc) return toast(w || t('hint.dead')); return this.draw('discard'); }
    if (this.myTurn && this.sel.size === 1) this.discard([...this.sel][0]);
  }
  async discard(id) { if (!id) return; if (this.isNew(id)) return toast(t('hint.justDrew'), 'bad'); const r = await this.send({ type: 'discard', cardId: id }); if (r && r.ok) this.sel.delete(id); }
  async addToMeld(meldId, ids) {
    meldId = meldId || this.meldSel;
    const m = this.v.melds.find(m => m.id === meldId); if (!m) return;
    ids = ids || this.order.filter(i => this.sel.has(i));
    if (!ids.length) return;
    let r;
    if (m.kind === 'run') {
      r = await this.tp.act({ type: 'add', meldId, cardIds: ids, position: 'end' });
      if (r && r.ok === false) { const r2 = await this.tp.act({ type: 'add', meldId, cardIds: ids, position: 'start' }); r = r2.ok ? r2 : r; }
    } else r = await this.tp.act({ type: 'add', meldId, cardIds: ids });
    if (r && r.ok === false) toast(r.error || 'Error', 'bad'); else { ids.forEach(i => this.sel.delete(i)); this.multi = false; this.meldSel = null; }
  }
  openLay() {
    const byId = new Map(this.me.hand.map(c => [c.id, c]));
    openBuilder({ hand: this.order.map(i => byId.get(i)).filter(Boolean), contract: this.v.contract, hard: this.v.hard, onSubmit: async (melds) => { const r = await this.tp.act({ type: 'lay', melds }); if (r.ok) this.sel.clear(); return r; } });
  }
  // ---------- drag & drop ----------
  dragStart(e, id, el) {
    if (e.button > 0) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY; let started = false, ghost = null, target = null;
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!started && Math.hypot(dx, dy) > 8) {
        started = true; this.drag = { id }; el.classList.add('dragging');
        ghost = el.cloneNode(true); ghost.classList.add('ghost'); ghost.style.width = el.offsetWidth + 'px'; ghost.style.height = el.offsetHeight + 'px'; document.body.append(ghost);
        if (this.multi && this.sel.has(id) && this.sel.size > 1) ghost.dataset.count = this.sel.size;
      }
      if (!started) return;
      ghost.style.transform = `translate(${ev.clientX - el.offsetWidth / 2}px,${ev.clientY - el.offsetHeight * .7}px) rotate(${Math.max(-12, Math.min(12, dx / 20))}deg)`;
      ghost.style.pointerEvents = 'none';
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      this.root.querySelectorAll('.drop-hot').forEach(x => x.classList.remove('drop-hot', 'before', 'end'));
      target = null;
      if (!under) return;
      const meld = under.closest('.meld'), disc = under.closest('.drop-discard'), hand = under.closest('.hand');
      if (meld && this.myTurn && this.v.step === 'play' && this.me.down) { target = { t: 'meld', id: meld.dataset.meldId }; meld.classList.add('drop-hot'); }
      else if (disc && this.myTurn && this.v.step === 'play') { target = { t: 'disc' }; disc.classList.add('drop-hot'); }
      else if (hand || under.closest('.handbar')) {
        const cs = [...this.handEl.children].filter(c => c !== el); let idx = cs.length;
        for (let k = 0; k < cs.length; k++) { const r = cs[k].getBoundingClientRect(); if (ev.clientX < r.left + r.width / 2) { idx = k; break; } }
        target = { t: 'hand', idx };
        if (idx < cs.length) cs[idx].classList.add('drop-hot', 'before'); else if (cs.length) cs[cs.length - 1].classList.add('drop-hot', 'end');
      }
    };
    const up = (ev) => {
      const cancelled = ev && ev.type === 'pointercancel'; // system gesture interrupted the touch: never treat as a tap or drop
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      if (!started && cancelled) return;
      if (!started) { // tap
        if (this.sel.has(id)) this.sel.delete(id); else { if (!this.multi) this.sel.clear(); this.sel.add(id); }
        this.render(); return;
      }
      ghost.remove(); this.drag = null;
      const tg = cancelled ? null : target; let multi = this.multi && this.sel.has(id) ? this.order.filter(i => this.sel.has(i)) : [id];
      if (tg && tg.t === 'hand') { this.order = this.order.filter(i => i !== id); this.order.splice(tg.idx, 0, id); }
      if (this.pending) { const s = this.pending; this.pending = null; this.update(s); } else this.render();
      if (tg && tg.t === 'meld') this.addToMeld(tg.id, multi);
      else if (tg && tg.t === 'disc') this.discard(id);
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  }
}
