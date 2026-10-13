import { h, toast } from './dom.js';
import { t } from './i18n.js';
import { settings, COLORS } from './store.js';
import { openRules, openSettings } from './modals.js';

export function renderLobby(app) {
  const L = { el: h('div', { class: 'lobby' }), snap: null, level: settings.botLevel };
  L.update = (snap) => { L.snap = snap; L.render(); };
  L.render = () => {
    const snap = L.snap; if (!snap) return;
    const room = snap.room, me = app.session.playerId, host = room.hostId === me;
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    const slots = [];
    for (let i = 0; i < 4; i++) {
      const p = room.players[i];
      const readyBadge = p && (p.isBot || p.id === room.hostId || p.ready)
        ? h('span', { class: 'ready-badge on' }, '✓ ' + t('lobby.ready'))
        : p ? h('span', { class: 'ready-badge' }, t('lobby.notReady')) : null;
      slots.push(p ? h('div', { class: 'slot filled' + (p.connected ? '' : ' away'), style: { '--pc': COLORS[i] } },
        h('div', { class: 'avatar' }, (p.name || '?')[0].toUpperCase()),
        h('div', { class: 'sname' }, p.name, p.id === room.hostId ? h('span', { class: 'tagpill' }, t('lobby.host')) : null, p.id === me ? h('span', { class: 'tagpill you' }, t('lobby.you')) : null, p.isBot ? h('span', { class: 'tagpill' }, '🤖') : null, !p.connected ? h('span', { class: 'tagpill' }, t('lobby.offline')) : null),
        readyBadge,
        host && p.isBot ? h('button', { class: 'x-btn', title: t('lobby.remove'), onclick: () => app.transport.removeBot(p.id) }, '✕') : null,
        host && !p.isBot && p.id !== me ? h('button', { class: 'x-btn', title: t('lobby.kick'), onclick: () => app.transport.kick(p.id) }, '✕') : null)
        : h('div', { class: 'slot empty' }, t('lobby.waiting')));
    }
    const n = room.players.length;
    const mine = room.players.find((p) => p.id === me);
    const waiting = room.players.filter((p) => !p.isBot && p.id !== room.hostId && !p.ready);
    const humans = room.players.filter((p) => !p.isBot && p.id !== room.hostId);
    const canStart = n >= 2 && waiting.length === 0;
    const startLabel = n < 2 ? t('lobby.need2') : waiting.length ? t('lobby.waitingFor', { n: waiting.map((p) => p.name).join(', ') }) : t('lobby.start');
    L.el.replaceChildren(
      h('div', { class: 'home-top' },
        h('button', { class: 'chip-btn', onclick: () => openRules() }, '❓ ' + t('rules')),
        h('button', { class: 'chip-btn', onclick: () => openSettings(app) }, '⚙️ ' + t('settings')),
        h('button', { class: 'chip-btn', onclick: () => app.leave() }, '↩ ' + t('leave'))),
      h('div', { class: 'lobby-card panel' },
        h('div', { class: 'lobby-code' }, h('small', {}, t('lobby.code')), h('div', { class: 'code-big' }, room.code),
          h('button', { class: 'chip-btn', onclick: async () => { try { await navigator.clipboard.writeText(link); toast(t('lobby.copied')); } catch { toast(link); } } }, '🔗 ' + t('lobby.copy')),
          h('small', { class: 'muted' }, t('lobby.share'))),
        h('div', { class: 'slots' }, slots),
        host ? h('div', { class: 'lobby-actions' },
          h('div', { class: 'row' },
            h('select', { class: 'input sel', onchange: (e) => { L.level = e.target.value; } }, ['easy', 'normal', 'hard'].map(l => h('option', { value: l, selected: l === L.level ? '' : null }, t('level.' + l)))),
            h('button', { class: 'btn blue', disabled: n >= 4 ? '' : null, onclick: async () => { const r = await app.transport.addBot(L.level); if (r && r.ok === false) toast(r.error, 'bad'); } }, '🤖 ' + t('lobby.addBot'))),
          h('button', { class: 'btn primary xl' + (canStart ? ' pulse' : ''), disabled: canStart ? null : '', onclick: async () => { const r = await app.transport.start(); if (r && r.ok === false) toast(r.error, 'bad'); } }, startLabel))
          : h('div', { class: 'lobby-actions' },
            h('button', { class: 'btn xl ' + (mine && mine.ready ? 'blue' : 'green pulse'), onclick: async () => { const r = await app.transport.setReady(!(mine && mine.ready)); if (r && r.ok === false) toast(r.error, 'bad'); } }, mine && mine.ready ? t('lobby.cancelReady') : '✓ ' + t('lobby.imReady')),
            h('p', { class: 'muted center' }, t('lobby.waitHost'))),
        humans.length ? h('p', { class: 'muted center ready-count' }, waiting.length ? t('lobby.readyOf', { r: humans.length - waiting.length, n: humans.length }) : '🎉 ' + t('lobby.allReady')) : null)
    );
  };
  return L;
}
