// Public invite URL (e.g. the Tailscale funnel) helpers. Pure, no DOM: used by server and client.

/** Returns a normalized http(s) URL string, or null if raw is empty/invalid/not http(s). */
export function normalizeFunnelUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let u;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  return u.href;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** HTML for the invite box. url = normalized URL or null. labels = {title, copy, hint}. All values escaped. */
export function inviteHtml(url, labels) {
  const u = normalizeFunnelUrl(url);
  if (!u) return `<small class="muted">${escapeHtml(labels.hint)}</small>`;
  return `<small>${escapeHtml(labels.title)}</small>`
    + `<code class="funnel-url" tabindex="0">${escapeHtml(u)}</code>`
    + `<button type="button" class="chip-btn funnel-copy">${escapeHtml(labels.copy)}</button>`;
}
