import { settings } from './store.js';
export function fly(from, to, node, dur = 520) {
  if (!from || !to || !node) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  node.classList.add('flying');
  const w = node.offsetWidth || 60;
  Object.assign(node.style, { position: 'fixed', left: '0', top: '0', zIndex: 900, pointerEvents: 'none', margin: 0 });
  document.body.append(node);
  const x1 = a.left + a.width / 2 - node.offsetWidth / 2, y1 = a.top + a.height / 2 - node.offsetHeight / 2;
  const x2 = b.left + b.width / 2 - node.offsetWidth / 2, y2 = b.top + b.height / 2 - node.offsetHeight / 2;
  const an = node.animate([
    { transform: `translate(${x1}px,${y1}px) scale(.9) rotate(-6deg)` },
    { transform: `translate(${x2}px,${y2}px) scale(1) rotate(0)` }], { duration: dur, easing: 'cubic-bezier(.2,.8,.2,1)' });
  an.onfinish = () => node.remove();
  setTimeout(() => node.remove(), dur + 300);
}
let ac;
export function beep(kind) {
  if (!settings.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const f = { draw: 520, discard: 340, turn: 660, lay: 780, win: 880 }[kind] || 440;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = f; g.gain.value = .06;
    o.connect(g); g.connect(ac.destination); o.start();
    g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + .18); o.stop(ac.currentTime + .2);
  } catch { /* ignore */ }
}
