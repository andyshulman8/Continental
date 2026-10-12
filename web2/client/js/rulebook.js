import { h } from './dom.js';
import { t } from './i18n.js';
import { settings } from './store.js';
import { eng } from './engine.js';
import { cardEl, cardFromId } from './cards.js';
import { openModal, closeModal } from './modals.js';

// Block types: ['p', text] ['ul', [text...]] ['cards', [ids], caption] ['note', text] ['hands'] ['points']
const C = (...ids) => ids;
const BOOK = {
  en: [
    ['goal', 'Goal', [
      ['p', 'Continental is played over several <b>hands</b>. In each hand you try to get rid of all your cards. When a hand ends, every other player counts the points left in their hand. <b>The lowest total score after the last hand wins.</b>'],
      ['p', 'Going out first scores <b>0</b> for that hand, so every hand is a race.']]],
    ['cards', 'Cards & points', [
      ['p', 'The game uses <b>2 decks of 54 cards</b> (52 cards plus 2 jokers each), for any number of players (2 to 4). Each hand, everyone is dealt <b>11 cards</b>.'],
      ['points'],
      ['p', '<b>Wild cards:</b> Jokers and the two red aces (♥A and ♦A) can stand in for any card. They are shown with a golden edge.'],
      ['cards', C('d0-JK-1', 'd0-H-1', 'd0-D-1'), 'Wild cards: joker, red aces'],
      ['note', 'In any set or run, wild cards may <b>never outnumber</b> the natural (real) cards. A red ace used as an ace counts as a natural card.']]],
    ['melds', 'Sets & runs', [
      ['p', 'A <b>meld</b> is a group of cards laid on the table. There are two kinds.'],
      ['p', '<b>Set</b> — 3 or more cards of the <b>same rank</b>, any suits.'],
      ['cards', C('d0-S-7-1', 'd0-H-7-2', 'd0-D-7-3', 'd0-C-7-4'), 'A set of sevens'],
      ['p', '<b>Run</b> — 4 or more cards of the <b>same suit in order</b>. The ace can be low (A-2-3-4) or high (Q-K-A), but a run cannot wrap around (K-A-2). A run can be up to 13 cards.'],
      ['cards', C('d0-S-8-1', 'd0-S-9-2', 'd0-S-10-3', 'd0-S-11-4', 'd0-S-12-5'), 'A run of spades, 8 to Queen'],
      ['p', 'A wild card takes the place of the card it fills.'],
      ['cards', C('d0-C-4-1', 'd0-C-5-2', 'd0-JK-1', 'd0-C-7-4'), 'The joker stands in for the 6♣']]],
    ['hands', 'The hands', [
      ['p', 'Every hand has a different <b>contract</b>: the melds you must lay down to go down. They get harder as the game goes on.'],
      ['hands'],
      ['p', 'With 2 or 4 players there are <b>8 hands</b> (skip the highlighted row). With 3 players there are <b>9</b> (an extra hand is added) so that every player deals the same number of times.'],
      ['p', 'The dealer changes every hand, moving to the left. The player to the dealer’s left goes first.']]],
    ['turn', 'Your turn', [
      ['ul', ['<b>1. Draw</b> one card: the top of the draw pile, or the top discard.',
        '<b>2. Go down</b> (optional): if you can make <b>all</b> the melds of the contract, lay them on the table in one go. You cannot lay down part of a contract. You may have extra cards in your melds.',
        '<b>3. Add cards</b> (only once you are down): add cards to <b>any</b> meld on the table, yours or anyone else’s. Remember the wild-card rule.',
        '<b>4. Discard</b> one card to finish your turn.']],
      ['note', 'You <b>cannot discard the card you just drew</b> this turn.'],
      ['note', 'Once you are down you can <b>no longer draw from the discard pile</b>, only from the draw pile.'],
      ['p', 'You can only go down on your own turn, after drawing. If you are not down, you can still just draw and discard.']]],
    ['claim', 'Claiming discards', [
      ['p', 'A discarded card can be <b>claimed</b> by other players, in turn order:'],
      ['ul', ['The player after the discarder gets first choice. They may simply draw it on their normal turn.',
        'If they instead draw from the draw pile, the next player (in turn order) may <b>claim</b> the discard. They take it <b>plus a penalty card</b> from the draw pile (if the game is set to a 1-card penalty). Then it is their choice again later, and so on around the table.',
        'You can <b>never take your own discard</b>. Players who are already down cannot take or claim discards.',
        'If everybody passes, the card is <b>dead</b>: nobody can take it any more. Dead discards look greyed out with a “Dead” tag.',
        'With only 2 players there is no claiming: the other player simply takes it or not.']],
      ['p', 'When it is your turn to decide you will see <b>Take</b> and <b>No thanks</b> buttons next to the discard pile.']]],
    ['out', 'Going out', [
      ['p', 'The hand ends the moment a player has <b>no cards left</b>: either by laying down or adding their last cards, or by <b>discarding their last card</b>.'],
      ['p', '<b>Normal mode:</b> you can go down at any time you have the contract.'],
      ['p', '<b>Hard mode:</b> when you go down you must be left with <b>0 or 1 cards</b>. In other words you go down and out in the same turn.'],
      ['p', 'The hand’s winner scores 0. Everyone else adds the points of their remaining cards to their total.']]],
    ['special', 'Special cases', [
      ['ul', ['<b>Draw pile runs out:</b> the discard pile (keeping the top card) is shuffled to make a new draw pile. This can only happen a limited number of times.',
        '<b>Stalemate:</b> if the draw pile runs out and cannot be refilled, the hand ends with no winner and everyone scores the cards in their hand.',
        '<b>Scores:</b> open the score sheet (clipboard button) any time to see every hand and the running totals.']]]],
    ['example', 'Example', [
      ['p', 'Hand 1 asks for <b>two sets</b>. You hold these cards after drawing:'],
      ['cards', C('d0-H-7-1', 'd0-S-7-2', 'd0-D-7-3', 'd0-C-13-4', 'd0-D-13-5', 'd0-JK-2', 'd0-C-2-6', 'd0-H-9-7'), 'Your hand'],
      ['p', 'You can lay down <b>7♥ 7♠ 7♦</b> and <b>K♣ K♦ + joker</b>. Two sets, so you may go down. You keep 2♣ and 9♥. Discard one of them (not the card you just drew) and your turn is over.'],
      ['cards', C('d0-H-7-1', 'd0-S-7-2', 'd0-D-7-3'), 'First set'], ['cards', C('d0-C-13-4', 'd0-D-13-5', 'd0-JK-2'), 'Second set (joker is a King)'],
      ['p', 'On your next turns, you can add cards such as another 7 or King to these sets, or to anyone’s melds.']]],
  ],
  es: [
    ['goal', 'Objetivo', [
      ['p', 'Continental se juega en varias <b>manos</b>. En cada mano intentas quedarte sin cartas. Al terminar la mano, los demás cuentan los puntos de las cartas que les quedan. <b>Gana quien tenga el menor puntaje total después de la última mano.</b>'],
      ['p', 'Quien termina primero anota <b>0</b> en esa mano, así que cada mano es una carrera.']]],
    ['cards', 'Cartas y puntos', [
      ['p', 'Se usan <b>2 mazos de 54 cartas</b> (52 más 2 jokers cada uno), con cualquier número de jugadores (2 a 4). En cada mano se reparten <b>11 cartas</b> a cada uno.'],
      ['points'],
      ['p', '<b>Comodines:</b> los Jokers y los dos Ases rojos (♥A y ♦A) pueden sustituir cualquier carta. Se ven con un borde dorado.'],
      ['cards', C('d0-JK-1', 'd0-H-1', 'd0-D-1'), 'Comodines: joker y ases rojos'],
      ['note', 'En un trío o escalera, los comodines <b>nunca pueden ser más</b> que las cartas naturales (reales). Un as rojo usado como as cuenta como natural.']]],
    ['melds', 'Tríos y escaleras', [
      ['p', 'Una <b>combinación</b> es un grupo de cartas puesto en la mesa. Hay dos tipos.'],
      ['p', '<b>Trío</b>: 3 o más cartas del <b>mismo número</b>, de cualquier palo.'],
      ['cards', C('d0-S-7-1', 'd0-H-7-2', 'd0-D-7-3', 'd0-C-7-4'), 'Un trío de sietes'],
      ['p', '<b>Escalera</b>: 4 o más cartas del <b>mismo palo en orden</b>. El as puede ser bajo (A-2-3-4) o alto (Q-K-A), pero no se puede dar la vuelta (K-A-2). Puede tener hasta 13 cartas.'],
      ['cards', C('d0-S-8-1', 'd0-S-9-2', 'd0-S-10-3', 'd0-S-11-4', 'd0-S-12-5'), 'Escalera de picas, del 8 a la Q'],
      ['p', 'Un comodín ocupa el lugar de la carta que falta.'],
      ['cards', C('d0-C-4-1', 'd0-C-5-2', 'd0-JK-1', 'd0-C-7-4'), 'El joker hace de 6♣']]],
    ['hands', 'Las manos', [
      ['p', 'Cada mano tiene un <b>contrato</b> distinto: las combinaciones que debes bajar para "bajar". Se van haciendo más difíciles.'],
      ['hands'],
      ['p', 'Con 2 o 4 jugadores hay <b>8 manos</b> (sin la fila resaltada). Con 3 jugadores hay <b>9</b> (se añade una mano) para que todos repartan el mismo número de veces.'],
      ['p', 'El que reparte cambia en cada mano hacia la izquierda. Empieza el jugador a la izquierda del que reparte.']]],
    ['turn', 'Tu turno', [
      ['ul', ['<b>1. Roba</b> una carta: la de arriba del mazo o la de arriba del descarte.',
        '<b>2. Baja</b> (opcional): si puedes formar <b>todas</b> las combinaciones del contrato, ponlas en la mesa de una vez. No se puede bajar solo una parte. Puedes poner cartas extra en tus combinaciones.',
        '<b>3. Añade cartas</b> (solo después de bajar): a <b>cualquier</b> combinación de la mesa, tuya o de otros. Recuerda la regla de los comodines.',
        '<b>4. Descarta</b> una carta para terminar tu turno.']],
      ['note', '<b>No puedes descartar la carta que acabas de robar</b> en ese turno.'],
      ['note', 'Una vez que has bajado <b>ya no puedes robar del descarte</b>, solo del mazo.'],
      ['p', 'Solo puedes bajar en tu turno, después de robar. Si no has bajado, puedes simplemente robar y descartar.']]],
    ['claim', 'Reclamar descartes', [
      ['p', 'Los demás jugadores pueden <b>reclamar</b> una carta descartada, por orden de turno:'],
      ['ul', ['El jugador siguiente al que descartó elige primero. Puede tomarla en su turno normal.',
        'Si en cambio roba del mazo, el siguiente jugador puede <b>reclamar</b> el descarte. La toma <b>más una carta de castigo</b> del mazo (si el juego tiene 1 carta de castigo). Y así sucesivamente por la mesa.',
        '<b>Nunca puedes tomar tu propio descarte</b>. Los jugadores que ya bajaron no pueden tomar ni reclamar descartes.',
        'Si todos pasan, la carta queda <b>muerta</b>: nadie puede tomarla. Se ve en gris con la etiqueta "Muerta".',
        'Con solo 2 jugadores no hay reclamos: el otro jugador la toma o no.']],
      ['p', 'Cuando te toque decidir verás los botones <b>Tomar</b> y <b>No, gracias</b> junto al descarte.']]],
    ['out', 'Terminar la mano', [
      ['p', 'La mano termina en cuanto un jugador se queda <b>sin cartas</b>: al bajar o añadir sus últimas cartas, o al <b>descartar su última carta</b>.'],
      ['p', '<b>Modo normal:</b> puedes bajar en cualquier momento en que tengas el contrato.'],
      ['p', '<b>Modo difícil:</b> al bajar debes quedarte con <b>0 o 1 cartas</b>. Es decir, bajas y terminas en el mismo turno.'],
      ['p', 'El ganador de la mano anota 0. Los demás suman los puntos de las cartas que les quedan.']]],
    ['special', 'Casos especiales', [
      ['ul', ['<b>Se acaba el mazo:</b> el descarte (menos la carta de arriba) se baraja y forma un mazo nuevo. Solo puede ocurrir un número limitado de veces.',
        '<b>Empate (sin salida):</b> si el mazo se acaba y no se puede rellenar, la mano termina sin ganador y todos anotan sus cartas.',
        '<b>Puntos:</b> abre la hoja de puntos (botón del portapapeles) en cualquier momento.']]]],
    ['example', 'Ejemplo', [
      ['p', 'La mano 1 pide <b>dos tríos</b>. Después de robar tienes estas cartas:'],
      ['cards', C('d0-H-7-1', 'd0-S-7-2', 'd0-D-7-3', 'd0-C-13-4', 'd0-D-13-5', 'd0-JK-2', 'd0-C-2-6', 'd0-H-9-7'), 'Tu mano'],
      ['p', 'Puedes bajar <b>7♥ 7♠ 7♦</b> y <b>K♣ K♦ + joker</b>. Son dos tríos, así que puedes bajar. Te quedan 2♣ y 9♥. Descarta una (no la que acabas de robar) y termina tu turno.'],
      ['cards', C('d0-H-7-1', 'd0-S-7-2', 'd0-D-7-3'), 'Primer trío'], ['cards', C('d0-C-13-4', 'd0-D-13-5', 'd0-JK-2'), 'Segundo trío (el joker es un Rey)'],
      ['p', 'En tus siguientes turnos puedes añadir otro 7 o Rey a estos tríos, o a las combinaciones de otros.']]],
  ],
};
const POINTS = {
  en: [['2 – 9', 'Face value'], ['10, J, Q, K', '10'], ['Black ace (♠A ♣A)', '15'], ['Red ace (♥A ♦A)', '10'], ['Joker', '10']],
  es: [['2 – 9', 'Su valor'], ['10, J, Q, K', '10'], ['As negro (♠A ♣A)', '15'], ['As rojo (♥A ♦A)', '10'], ['Joker', '10']],
};
const L = { en: { s: 'Set', r: 'Run', ss: 'Sets', rs: 'Runs', hand: 'Hand', contract: 'Contract', p3: '3 players only' }, es: { s: 'Trío', r: 'Escalera', ss: 'Tríos', rs: 'Escaleras', hand: 'Mano', contract: 'Contrato', p3: 'solo 3 jugadores' } };

function cardFor(id) {
  const c = cardFromId(id.replace(/^(d\d)-(S|H|D|C)-(\d+)-\d+$/, '$1-$2-$3'));
  c.id = id; if (!c.joker) { /* ensure unique ids for rendering only */ }
  return c;
}
function words(contract, l) {
  const ns = contract.filter(c => c.kind === 'set').length, nr = contract.length - ns;
  return [ns ? ns + ' ' + (ns > 1 ? l.ss : l.s) : null, nr ? nr + ' ' + (nr > 1 ? l.rs : l.r) : null].filter(Boolean).join(' + ');
}
function handsTable(l) {
  const base = eng.HANDS(2), three = eng.HANDS(3);
  return h('table', { class: 'score rbtable' }, h('thead', {}, h('tr', {}, h('th', {}, l.hand), h('th', {}, l.contract))),
    h('tbody', {}, three.map((c, i) => { const extra = !base.some(b => b.length === c.length && words(b, l) === words(c, l)); return h('tr', { class: extra ? 'cur' : '' }, h('td', {}, i + 1), h('td', { class: 'pn' }, words(c, l), extra ? h('small', { class: 'muted' }, '  (' + l.p3 + ')') : null)); })));
}
function render(block, lang) {
  const [k, a, b] = block, l = L[lang];
  if (k === 'p') return h('p', { html: a });
  if (k === 'note') return h('div', { class: 'rb-note', html: a });
  if (k === 'ul') return h('ul', {}, a.map(i => h('li', { html: i })));
  if (k === 'cards') return h('figure', { class: 'rb-cards' }, h('div', { class: 'rb-row' }, a.map(id => cardEl(cardFor(id), { cls: 'sm rb' }))), b ? h('figcaption', {}, b) : null);
  if (k === 'hands') return handsTable(l);
  if (k === 'points') return h('table', { class: 'score rbtable' }, h('tbody', {}, POINTS[lang].map(([x, y]) => h('tr', {}, h('td', { class: 'pn' }, x), h('td', {}, y)))));
  return null;
}
export function openRules(startId) {
  const lang = settings.lang === 'es' ? 'es' : 'en', secs = BOOK[lang];
  let cur = Math.max(0, secs.findIndex(s => s[0] === startId));
  const box = openModal('rules', [], { cls: 'wide rulebook' });
  const draw = () => {
    const [, title, blocks] = secs[cur];
    box.box.replaceChildren(
      h('div', { class: 'modal-head' }, h('h2', {}, '📖 ' + t('rules')), h('button', { class: 'x-btn', onclick: () => closeModal('rules') }, '✕')),
      h('div', { class: 'rb-tabs' }, secs.map(([id, ti], i) => h('button', { class: i === cur ? 'on' : '', onclick: () => { cur = i; draw(); } }, (i + 1) + '. ' + ti))),
      h('div', { class: 'modal-body rb-body' }, h('h3', {}, title), blocks.map(b => render(b, lang)),
        h('div', { class: 'row rb-nav' }, h('button', { class: 'btn', disabled: cur === 0 ? '' : null, onclick: () => { cur--; draw(); } }, '◀ ' + t('rb.prev')), h('span', { class: 'grow' }),
          h('button', { class: 'btn primary', onclick: () => { if (cur < secs.length - 1) { cur++; draw(); } else closeModal('rules'); } }, cur < secs.length - 1 ? t('rb.next') + ' ▶' : t('close')))));
    box.box.querySelector('.rb-body').scrollTop = 0;
  };
  draw();
}
