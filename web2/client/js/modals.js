import { h, toast } from './dom.js';
import { t, tr } from './i18n.js';
import { settings, saveSettings, COLORS } from './store.js';
import { eng } from './engine.js';
import { cardEl } from './cards.js';

const stack = new Map();
export function closeModal(id) { const m = stack.get(id); if (m) { m.remove(); stack.delete(id); } }
export function closeAllModals() { for (const id of [...stack.keys()]) closeModal(id); }
export function openModal(id, content, { dismiss = true, cls = '' } = {}) {
  closeModal(id);
  const box = h('div', { class: 'modal ' + cls }, content);
  const back = h('div', { class: 'modal-back', onpointerdown: (e) => { if (dismiss && e.target === back) closeModal(id); } }, box);
  document.body.append(back); stack.set(id, back);
  return { close: () => closeModal(id), box };
}
const head = (title, id, dismiss = true) => h('div', { class: 'modal-head' }, h('h2', {}, title), dismiss ? h('button', { class: 'x-btn', onclick: () => closeModal(id) }, '✕') : null);

export function openRules() {
  const R = tr('rules.body');
  openModal('rules', [head(t('rules'), 'rules'), h('div', { class: 'modal-body rules' }, R.map(([hd, items]) => h('section', {}, h('h3', {}, hd), h('ul', {}, items.map(i => h('li', { html: i }))))))]);
}
export function openSettings(app) {
  const id = 'settings';
  const render = () => {
    const nameIn = h('input', { class: 'input', maxlength: 16, value: settings.name, oninput: (e) => { settings.name = e.target.value; saveSettings(); } });
    const tog = (key, label) => h('label', { class: 'check big' }, h('input', { type: 'checkbox', checked: settings[key] ? '' : null, onchange: (e) => { settings[key] = e.target.checked; saveSettings(); app.rerender(); } }), h('span', {}, h('b', {}, label)));
    return [head(t('settings'), id), h('div', { class: 'modal-body' },
      h('label', {}, t('home.name')), nameIn,
      h('label', {}, t('settings.lang')),
      h('div', { class: 'seg' }, [['en', 'English'], ['es', 'Español']].map(([l, n]) => h('button', { class: settings.lang === l ? 'on' : '', onclick: () => { app.setLang(l); openSettings(app); } }, n))),
      tog('large', t('settings.large')), tog('sound', t('settings.sound')),
      h('button', { class: 'btn primary', onclick: () => closeModal(id) }, t('close')))];
  };
  openModal(id, render());
}

export function openScoreboard(app, view) {
  const me = app.session.playerId;
  const winner = view.players.find(p => p.id === view.winnerId);
  const tbl = scoreSheet(view, me);
  const body = [head(t('score.title', { n: view.handIndex + 1 }), 'sb', false),
    h('div', { class: 'modal-body' },
      winner ? h("div", { class: "winner-banner" }, '🎉 ' + t('score.wentOut', { name: winner.name })) : h("div", { class: "winner-banner" }, "\u{1F91D} " + t("score.stalemate")),
      h('div', { class: 'scroll-x' }, tbl),
      h('p', { class: 'muted' }, t('score.lowest')),
      h('button', { class: 'btn primary xl', onclick: async (e) => { e.target.disabled = true; const r = await app.transport.nextHand(); if (r && r.ok === false) { toast(r.error, 'bad'); e.target.disabled = false; } } }, view.handIndex + 1 >= (view.handCount || 99) ? t('score.final') : t('score.next')))];
  openModal('sb', body, { dismiss: false, cls: 'wide' });
}

export function contractWords(contract) {
  const ns = contract.filter(c => (c.kind || c) === 'set').length, nr = contract.length - ns;
  const part = (n, k) => n + ' ' + t(k + (n > 1 ? 's' : ''));
  return [ns ? part(ns, 'kind.set') : null, nr ? part(nr, 'kind.run') : null].filter(Boolean).join(' + ');
}
export function scoreSheet(view, me) {
  const n = view.players.length, hands = eng.HANDS(n);
  const total = view.handCount || hands.length;
  const done = (p) => (p.handScores || []).length;
  const lead = Math.min(...view.players.map(p => p.score));
  const played = Math.max(...view.players.map(done), 0);
  const cell = (cls, v) => h('td', { class: cls }, v == null ? '' : v);
  const head1 = h('tr', {}, h('th', { rowspan: 2, class: 'hc' }, t('sheet.hand')), view.players.map((p, i) => h('th', { colspan: 2, class: 'pg' + (p.id === me ? ' me' : ''), style: { '--pc': COLORS[i] } }, p.name)));
  const head2 = h('tr', {}, view.players.map(() => [h('th', { class: 'sub' }, t('sheet.score')), h('th', { class: 'sub' }, t('sheet.total'))]));
  const body = Array.from({ length: total }, (_, k) => {
    const cur = k === view.handIndex;
    return h('tr', { class: cur ? 'cur' : '' }, h('td', { class: 'hc' }, h('b', {}, (k + 1) + ' \u00B7 '), hands[k] ? contractWords(hands[k]) : ''),
      view.players.map(p => { const hs = p.handScores || [], v = hs[k]; const run = v == null ? null : hs.slice(0, k + 1).reduce((a, b) => a + b, 0);
        return [cell('sc' + (v === 0 ? ' zero' : ''), v), cell('rt', run)]; }));
  });
  const foot = h('tr', { class: 'totrow' }, h('td', { class: 'hc' }, t('score.total')), view.players.map(p => h('td', { colspan: 2, class: 'tt' + (played && p.score === lead ? ' lead' : '') }, (played && p.score === lead ? '\uD83D\uDC51 ' : '') + p.score)));
  return h('table', { class: 'score sheet' }, h('thead', {}, head1, head2), h('tbody', {}, body), h('tfoot', {}, foot));
}
export function openScoreSheet(app, view) {
  openModal('sheet', [head(t('sheet.title'), 'sheet'), h('div', { class: 'modal-body' }, h('div', { class: 'scroll-x' }, scoreSheet(view, app.session.playerId)), h('p', { class: 'muted' }, t('score.lowest')))], { cls: 'wide' });
}

export function openPodium(app, view) {
  const sorted = [...view.players.map((p, i) => ({ p, i }))].sort((a, b) => a.p.score - b.p.score);
  const medals = ['🥇', '🥈', '🥉', ''];
  const order = sorted.length >= 3 ? [1, 0, 2, 3] : sorted.length === 2 ? [1, 0] : [0];
  const me = app.session.playerId;
  const iWon = sorted[0].p.id === me || sorted.filter(s => s.p.score === sorted[0].p.score).some(s => s.p.id === me);
  const pod = h('div', { class: 'podium' }, order.map(rank => { const { p, i } = sorted[rank]; return h('div', { class: 'pod r' + rank, style: { '--pc': COLORS[i] } },
    h('div', { class: 'avatar lg' }, p.name[0].toUpperCase()), h('div', { class: 'pname' }, p.name), h('div', { class: 'pscore' }, p.score + ' ' + t('score.pts')),
    h('div', { class: 'step' }, medals[rank] || (rank + 1))); }));
  openModal('podium', [h('div', { class: 'modal-body center' },
    h('h2', { class: 'big-title' }, '🏆 ' + t('podium.title', { name: sorted[0].p.name })), iWon ? h('p', { class: 'muted' }, t('podium.congrats')) : null,
    pod,
    h('div', { class: 'row center' },
      h('button', { class: 'btn primary xl', onclick: async () => { const r = await app.transport.rematch(); if (r && r.ok === false) toast(r.error, 'bad'); } }, t('podium.again')),
      h('button', { class: 'btn', onclick: () => app.leave() }, t('leave'))))], { dismiss: false, cls: 'wide podium-modal' });
  if (iWon) confetti();
}
function confetti() {
  const cs = ['#ef5350', '#42a5f5', '#ffca28', '#ab7df6', '#2ecc71'];
  for (let i = 0; i < 60; i++) {
    const el = h('i', { class: 'confetti', style: { left: Math.random() * 100 + 'vw', background: cs[i % 5], animationDelay: Math.random() * 1.5 + 's', animationDuration: 2.5 + Math.random() * 2 + 's' } });
    document.body.append(el); setTimeout(() => el.remove(), 6500);
  }
}

// ---- Lay-down builder ----
export function openBuilder({ hand, contract, hard, onSubmit }) {
  const id = 'builder';
  const byId = new Map(hand.map(c => [c.id, c]));
  const groups = contract.map(() => []);
  let active = 0, err = '';
  const minOf = (c) => c.min || c.size || c.minCards || (c.kind === 'set' ? 3 : 4);
  const validate = (gi) => {
    const ids = groups[gi]; if (ids.length < minOf(contract[gi])) return { ok: false };
    try { const r = eng.validateMeld(ids.map(i => byId.get(i)), contract[gi].kind); return r; } catch (e) { return { ok: false, error: String(e) }; }
  };
  const idsOf = (m) => m.cardIds || (m.cards || []).map(c => c.id || c);
  const suggest = () => {
    let r; try { r = eng.canGoDown(hand, contract); } catch (e) { r = { ok: false }; }
    if (!r || !r.ok || !r.melds) { err = t('lay.nosuggest'); return; }
    err = '';
    const pool = r.melds.slice(); groups.forEach((g, i) => { const k = pool.findIndex(m => m.kind === contract[i].kind); g.length = 0; if (k >= 0) g.push(...idsOf(pool.splice(k, 1)[0])); });
  };
  const render = () => {
    const used = new Set(groups.flat());
    const vs = groups.map((_, i) => validate(i));
    vs.forEach((v, i) => { if (v.ok && v.ordered) groups[i] = v.ordered.map(c => c.id || c); });
    const left = hand.length - used.size;
    const hardBlock = !!hard && left > 1;
    const allOk = vs.every(v => v.ok) && !hardBlock;
    const gEls = groups.map((g, i) => {
      const v = vs[i], need = minOf(contract[i]);
      return h('div', { class: 'bgroup ' + (i === active ? 'active ' : '') + (v.ok ? 'ok' : ''), onclick: () => { active = i; draw(); } },
        h('div', { class: 'bg-head' }, h('b', {}, contract[i].kind === 'set' ? t('kind.set') : t('kind.run')), h('small', {}, contract[i].kind === 'set' ? t('kind.setHint', { n: need }) : t('kind.runHint', { n: need })), h('span', { class: 'bg-state' }, v.ok ? '✓' : (g.length ? (v.error || g.length + '/' + need) : ''))),
        h('div', { class: 'bg-cards' }, g.length ? g.map(cid => { const el = cardEl(byId.get(cid), { cls: 'sm' }); el.addEventListener('click', (e) => { e.stopPropagation(); groups[i] = groups[i].filter(x => x !== cid); active = i; draw(); }); return el; }) : h('span', { class: 'muted' }, t('lay.tapToAdd'))));
    });
    const poolEls = hand.filter(c => !used.has(c.id)).map(c => { const el = cardEl(c, { cls: 'sm' }); el.addEventListener('click', () => { groups[active].push(c.id); err = ''; const nx = groups.findIndex((g, i) => !validate(i).ok); if (validate(active).ok && nx >= 0) active = nx; draw(); }); return el; });
    return [head(t('lay.title'), id),
      h('div', { class: 'modal-body builder' },
        h('p', { class: 'muted' }, t('lay.help')),
        h('div', { class: 'bgroups' }, gEls),
        h('div', { class: 'pool-title' }, t('lay.yourHand'), h('small', {}, ' — ' + t('lay.left', { n: left }))),
        h('div', { class: 'bpool' }, poolEls),
        hard && vs.every(v => v.ok) && hardBlock ? h('div', { class: 'err' }, t('lay.hardLeft', { n: left })) : null,
        err ? h('div', { class: 'err' }, err) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn blue', onclick: () => { suggest(); draw(); } }, '✨ ' + t('lay.suggest')),
          h('button', { class: 'btn', onclick: () => { groups.forEach(g => g.length = 0); active = 0; err = ''; draw(); } }, t('lay.clear')),
          h('span', { class: 'grow' }),
          h('button', { class: 'btn', onclick: () => closeModal(id) }, t('cancel')),
          h('button', { class: 'btn primary', disabled: allOk ? null : '', onclick: async () => { const r = await onSubmit(groups.map((g, i) => ({ kind: contract[i].kind, cardIds: g.slice() }))); if (r && r.ok === false) { err = r.error || ''; draw(); } else closeModal(id); } }, t('lay.go'))))];
  };
  let m;
  const draw = () => { m.box.replaceChildren(...render()); };
  m = openModal(id, [], { cls: 'wide' });
  suggest(); err = '';
  draw();
}
