const KEY = 'cont2.settings', SKEY = 'cont2.session';
const defaults = { name: '', lang: (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en', large: false, sound: false, botCount: 2, botLevel: 'normal', hard: false };
export const settings = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}'));
export function saveSettings() { localStorage.setItem(KEY, JSON.stringify(settings)); applySettings(); }
export function applySettings() {
  document.documentElement.classList.toggle('large', !!settings.large);
  document.documentElement.lang = settings.lang;
}
export const getSession = () => { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { return null; } };
export const setSession = (s) => s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY);
export const COLORS = ['#ef5350', '#42a5f5', '#ffca28', '#ab7df6'];
