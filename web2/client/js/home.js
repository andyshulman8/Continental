import { h, toast } from './dom.js';
import { t } from './i18n.js';
import { settings, saveSettings } from './store.js';
import { openRules, openSettings } from './modals.js';
import { cardEl } from './cards.js';

function seg(options, value, onPick) {
  const el = h('div', { class: 'seg' });
  options.forEach(([v, label]) => el.append(h('button', { type: 'button', class: v === value ? 'on' : '', onclick: () => { onPick(v); [...el.children].forEach((c, i) => c.classList.toggle('on', options[i][0] === v)); } }, label)));
  return el;
}
export function renderHome(app, opts = {}) {
  const nameIn = h('input', { class: 'input', maxlength: 16, placeholder: t('home.namePh'), value: settings.name || '', autocomplete: 'off', oninput: (e) => { settings.name = e.target.value; saveSettings(); } });
  const getName = () => { const n = (nameIn.value || '').trim(); if (!n) { nameIn.focus(); nameIn.classList.add('shake'); setTimeout(() => nameIn.classList.remove('shake'), 500); toast(t('home.needName'), 'bad'); return null; } return n; };
  const codeIn = h('input', { class: 'input code', maxlength: 4, placeholder: 'ABCD', value: opts.joinCode || '', autocapitalize: 'characters', autocomplete: 'off', oninput: (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); } });
  const hardChk = (id) => h('label', { class: 'check' }, h('input', { type: 'checkbox', id, checked: settings.hard ? '' : null, onchange: (e) => { settings.hard = e.target.checked; saveSettings(); } }), h('span', {}, h('b', {}, t('home.hard')), h('small', {}, t('home.hardDesc'))));
  const botNames = ['Rosa', 'Max', 'Lola', 'Sam', 'Abuelo', 'Nico'];
  const play = () => {
    const name = getName(); if (!name) return;
    const pool = botNames.filter(n => n !== name).sort(() => Math.random() - .5);
    const bots = Array.from({ length: settings.botCount }, (_, i) => ({ name: pool[i], level: settings.botLevel }));
    app.startSolo({ name, bots, hard: settings.hard });
  };
  const serverOk = app.serverUp;
  return h('div', { class: 'home' },
    h('div', { class: 'home-top' },
      h('button', { class: 'chip-btn', onclick: () => openRules() }, '❓ ' + t('rules')),
      h('button', { class: 'chip-btn', onclick: () => openSettings(app) }, '⚙️ ' + t('settings'))),
    h('div', { class: 'hero' },
      h('div', { class: 'hero-cards' }, ...[{ id: 'x-S-1', rank: 1, suit: 'S' }, { id: 'x-H-12', rank: 12, suit: 'H' }, { id: 'x-JK-1', rank: 0, suit: null, joker: true }, { id: 'x-D-7', rank: 7, suit: 'D' }, { id: 'x-C-10', rank: 10, suit: 'C' }].map((c, i) => h('div', { class: 'hc', style: { '--i': i } }, cardEl(c)))),
      h('h1', {}, 'Continental'), h('p', { class: 'tag' }, t('home.tagline'))),
    h('div', { class: 'home-grid' },
      h('div', { class: 'panel name-panel' }, h('label', {}, t('home.name')), nameIn),
      h('div', { class: 'panel play-panel' },
        h('h2', {}, '🤖 ' + t('home.solo')), h('p', { class: 'muted' }, t('home.soloDesc') + (serverOk ? '' : ' ' + t('home.offline'))),
        h('label', {}, t('home.bots')), seg([[1, '1'], [2, '2'], [3, '3']], settings.botCount, v => { settings.botCount = v; saveSettings(); }),
        h('label', {}, t('home.level')), seg([['easy', t('level.easy')], ['normal', t('level.normal')], ['hard', t('level.hard')]], settings.botLevel, v => { settings.botLevel = v; saveSettings(); }),
        hardChk('hard1'),
        h('button', { class: 'btn primary xl', onclick: play }, t('home.play'))),
      h('div', { class: 'panel' + (serverOk ? '' : ' disabled') },
        h('h2', {}, '🏠 ' + t('home.create')), h('p', { class: 'muted' }, serverOk ? t('home.createDesc') : t('home.needServer')),
        hardChk('hard2'),
        h('button', { class: 'btn green xl', disabled: serverOk ? null : '', onclick: () => { const name = getName(); if (name) app.createRoom({ name, hard: settings.hard }); } }, t('home.createBtn'))),
      h('div', { class: 'panel' + (serverOk ? '' : ' disabled') },
        h('h2', {}, '🔑 ' + t('home.join')), h('p', { class: 'muted' }, serverOk ? t('home.joinDesc') : t('home.needServer')),
        codeIn,
        h('button', { class: 'btn blue xl', disabled: serverOk ? null : '', onclick: () => { const name = getName(); if (!name) return; if (codeIn.value.length < 4) { toast(t('home.needCode'), 'bad'); return; } app.joinRoom({ name, code: codeIn.value }); } }, t('home.joinBtn')))));
}
