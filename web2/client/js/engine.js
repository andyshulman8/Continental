// Lazy loader for shared engine + bots (served from /shared/).
export const eng = {};
export async function loadEngine() {
  if (eng.act) return eng;
  const E = await import('/shared/engine.js');
  Object.assign(eng, E);
  try { const B = await import('/shared/bots.js'); eng.chooseAction = B.chooseAction; } catch (e) { console.warn('bots missing', e); }
  return eng;
}
