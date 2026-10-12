import { h } from './dom.js';
export const SUIT = { S: '♠︎', H: '♥︎', D: '♦︎', C: '♣︎' };
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export function cardFromId(id) {
  const p = String(id).split('-');
  if (p[1] === 'JK') return { id, rank: 0, suit: null, joker: true };
  return { id, rank: +p[2], suit: p[1], joker: false };
}
export const cardName = (c) => c.joker ? '★' : RANKS[c.rank] + SUIT[c.suit];
export function cardEl(c, opts = {}) {
  const red = c.suit === 'H' || c.suit === 'D';
  const el = h('div', { class: 'card ' + (c.joker ? 'joker' : red ? 'red' : 'black') + (opts.cls ? ' ' + opts.cls : ''), 'data-id': c.id });
  if (c.joker) {
    el.append(h('div', { class: 'corner tl' }, h('span', { class: 'r' }, '★')),
      h('div', { class: 'center' }, h('span', { class: 'jk-star' }, '★'), h('span', { class: 'jk-txt' }, 'JOKER')),
      h('div', { class: 'corner br' }, h('span', { class: 'r' }, '★')));
  } else {
    const r = RANKS[c.rank], s = SUIT[c.suit];
    const face = c.rank >= 11;
    el.append(h('div', { class: 'corner tl' }, h('span', { class: 'r' }, r), h('span', { class: 's' }, s)),
      h('div', { class: 'center' + (face ? ' face' : '') }, face ? h('span', { class: 'fl' }, r) : null, h('span', { class: 'big' }, s)),
      h('div', { class: 'corner br' }, h('span', { class: 'r' }, r), h('span', { class: 's' }, s)));
  }
  const wild = c.joker || (c.rank === 1 && (c.suit === 'H' || c.suit === 'D'));
  if (c.as && wild) el.append(h('div', { class: 'as' }, RANKS[c.as.rank] || "" + (c.as.suit ? SUIT[c.as.suit] : '')));
  if (wild) el.classList.add('wild');
  return el;
}
export const backEl = (cls = '') => h('div', { class: 'card back ' + cls });
