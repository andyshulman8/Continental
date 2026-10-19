// Funnel invite link test: URL set, URL unset, HTML escaping, scheme filtering, /api/config.
// Run: node web2/server/funnel.test.js
import { spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { normalizeFunnelUrl, inviteHtml, escapeHtml } from '../shared/funnel.js';

const labels = { title: 'Public invite link', copy: 'Copy', hint: 'Set FUNNEL_URL to show the public invite link' };

// URL set
assert.equal(normalizeFunnelUrl(' https://mac.tail1234.ts.net/ '), 'https://mac.tail1234.ts.net/');
let html = inviteHtml('https://mac.tail1234.ts.net/', labels);
assert.match(html, /funnel-url/); assert.match(html, /funnel-copy/); assert.match(html, /https:\/\/mac\.tail1234\.ts\.net\//);
assert.doesNotMatch(html, /Set FUNNEL_URL/);

// URL unset / invalid -> no link, hint shown
for (const bad of [undefined, null, '', '   ', 'not a url', 'javascript:alert(1)', 'ftp://x.example/', 'data:text/html,hi', 'https://user:pw@x.example/']) {
  assert.equal(normalizeFunnelUrl(bad), null, String(bad));
  html = inviteHtml(bad, labels);
  assert.doesNotMatch(html, /funnel-url|funnel-copy|<code/); assert.match(html, /Set FUNNEL_URL to show the public invite link/);
}

// HTML escaping: markup in URL and labels must not survive unescaped
html = inviteHtml("https://x.example/?a=1&b='\"<script>alert(1)</script>", { ...labels, title: '<b>t</b>', copy: '"><img src=x>' });
assert.doesNotMatch(html, /<script|<img|<b>/);
assert.match(html, /a=1&amp;b=/); // URL() percent-encodes quotes/angle brackets; & is HTML-escaped
assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
assert.doesNotMatch(inviteHtml(null, { ...labels, hint: '<script>x</script>' }), /<script/);

// Server: GET /api/config reflects FUNNEL_URL
const dir = path.dirname(fileURLToPath(import.meta.url));
async function config(env) {
  const port = 5200 + Math.floor(Math.random() * 700);
  const e = { ...process.env, PORT: String(port) }; delete e.FUNNEL_URL; Object.assign(e, env);
  const srv = spawn(process.execPath, [path.join(dir, 'server.js')], { env: e, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((res, rej) => { srv.stdout.on('data', (d) => /port/.test(String(d)) && res()); srv.on('exit', () => rej(new Error('server exited'))); setTimeout(() => rej(new Error('start timeout')), 5000); });
    return (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
  } finally { srv.kill(); }
}
assert.deepEqual(await config({ FUNNEL_URL: 'https://mac.tail1234.ts.net' }), { ok: true, funnelUrl: 'https://mac.tail1234.ts.net/' });
assert.deepEqual(await config({}), { ok: true, funnelUrl: null });
assert.deepEqual(await config({ FUNNEL_URL: 'javascript:alert(1)' }), { ok: true, funnelUrl: null });
console.log('funnel tests passed');
